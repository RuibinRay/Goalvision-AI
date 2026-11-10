/**
 * Elo ratings for football (World Football Elo conventions) and an ordered-logit link from rating gap to 1X2.
 *   expected = 1 / (1 + 10^(-(Rh + HFA - Ra) / 400))
 *   R' = R + K * G * (result - expected),   G = 1 (1 goal), 1.5 (2 goals), (11 + n) / 8 (n >= 3)
 */
export const eloExpected = (rh, ra, hfa = 0) => 1 / (1 + Math.pow(10, -(rh + hfa - ra) / 400));
export const goalMultiplier = (diff) => { const n = Math.abs(diff); return n <= 1 ? 1 : n === 2 ? 1.5 : (11 + n) / 8; };

export class Elo {
  constructor({ k = 20, hfa = 60, base = 1500 } = {}) { this.k = k; this.hfa = hfa; this.base = base; this.r = new Map(); }
  get(id) { return this.r.has(id) ? this.r.get(id) : this.base; }
  set(id, v) { this.r.set(id, v); }
  /** Rating gap in 400-point units, home advantage included unless neutral. */
  gap(home, away, neutral = false) { return (this.get(home) + (neutral ? 0 : this.hfa) - this.get(away)) / 400; }
  update(home, away, hg, ag, { neutral = false, k = this.k } = {}) {
    const exp = eloExpected(this.get(home), this.get(away), neutral ? 0 : this.hfa);
    const res = hg > ag ? 1 : hg === ag ? 0.5 : 0;
    const d = k * goalMultiplier(hg - ag) * (res - exp);
    this.set(home, this.get(home) + d); this.set(away, this.get(away) - d);
    return d;
  }
}

const sig = (x) => 1 / (1 + Math.exp(-x));
/** Ordered logit: P(away) = s(c1 - b d), P(draw) = s(c2 - b d) - s(c1 - b d), P(home) = 1 - s(c2 - b d). */
export function orderedProbs(d, { c1, c2, b }) {
  const pa = sig(c1 - b * d), pad = sig(c2 - b * d);
  return { home: 1 - pad, draw: pad - pa, away: pa };
}
/** Fit {c1, c2, b} by gradient ascent on the log-likelihood. rows: [{d, y}] with y = 0 home, 1 draw, 2 away. */
export function fitOrdered(rows, iters = 600, lr = 0.5) {
  let c1 = -0.6, c2 = 0.5, b = 1.5; const n = rows.length;
  for (let it = 0; it < iters; it++) {
    let g1 = 0, g2 = 0, gb = 0;
    for (const { d, y } of rows) {
      const s1 = sig(c1 - b * d), s2 = sig(c2 - b * d), d1 = s1 * (1 - s1), d2 = s2 * (1 - s2);
      if (y === 2) { g1 += d1 / s1; gb += -d * d1 / s1; }
      else if (y === 1) { const p = Math.max(1e-9, s2 - s1); g1 += -d1 / p; g2 += d2 / p; gb += (-d * d2 + d * d1) / p; }
      else { const p = Math.max(1e-9, 1 - s2); g2 += -d2 / p; gb += d * d2 / p; }
    }
    c1 += lr * g1 / n; c2 += lr * g2 / n; b += lr * gb / n;
    if (c2 < c1 + 0.05) c2 = c1 + 0.05;
  }
  return { c1, c2, b };
}
