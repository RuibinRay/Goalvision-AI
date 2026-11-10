/**
 * Poisson goal model + Dixon-Coles low-score adjustment. Pure functions (browser and Node).
 *   lambdaH = exp(mu + hfa + attH - defA)      lambdaA = exp(mu + attA - defH)
 * Dixon & Coles (1997): tau rescales the four low scorelines by a dependence parameter rho.
 */
const LOGFACT = [0]; for (let i = 1; i < 40; i++) LOGFACT[i] = LOGFACT[i - 1] + Math.log(i);

export const poissonPmf = (k, lam) => (lam <= 0 ? (k === 0 ? 1 : 0) : Math.exp(k * Math.log(lam) - lam - LOGFACT[k]));

export function dcTau(h, a, lh, la, rho) {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

/** P[h][a] for h, a in 0..max. rho = 0 gives independent Poisson. Always renormalised to sum to 1. */
export function scoreMatrix(lh, la, { rho = 0, max = 8 } = {}) {
  const ph = [], pa = [];
  for (let k = 0; k <= max; k++) { ph.push(poissonPmf(k, lh)); pa.push(poissonPmf(k, la)); }
  const m = []; let sum = 0;
  for (let h = 0; h <= max; h++) {
    m.push(new Array(max + 1));
    for (let a = 0; a <= max; a++) { const v = Math.max(0, ph[h] * pa[a] * dcTau(h, a, lh, la, rho)); m[h][a] = v; sum += v; }
  }
  for (let h = 0; h <= max; h++) for (let a = 0; a <= max; a++) m[h][a] /= sum;
  return m;
}

/** Collapse a score matrix into the markets the UI shows. home + draw + away === 1. */
export function outcomes(m) {
  let home = 0, draw = 0, away = 0, btts = 0, over25 = 0, eh = 0, ea = 0;
  const totals = new Array(m.length * 2 - 1).fill(0);
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m.length; a++) {
    const p = m[h][a];
    if (h > a) home += p; else if (h === a) draw += p; else away += p;
    if (h > 0 && a > 0) btts += p;
    if (h + a > 2) over25 += p;
    eh += h * p; ea += a * p; totals[h + a] += p;
  }
  const s = home + draw + away;
  return { home: home / s, draw: draw / s, away: away / s, btts, over25, expHome: eh, expAway: ea, totals };
}

export function topScores(m, n = 6) {
  const out = [];
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m.length; a++) out.push({ h, a, p: m[h][a] });
  return out.sort((x, y) => y.p - x.p).slice(0, n);
}

/** Marginal goal distributions for the bar chart. */
export function marginals(m) {
  const home = m.map(r => r.reduce((s, v) => s + v, 0));
  const away = m[0].map((_, a) => m.reduce((s, r) => s + r[a], 0));
  return { home, away };
}

/** Online (walk-forward) attack/defence ratings: one stochastic-gradient step of the Poisson log-likelihood per match. */
export class PoissonRatings {
  constructor({ eta = 0.035, etaLeague = 0.004, mu = Math.log(1.35), hfa = 0.25 } = {}) {
    this.eta = eta; this.etaLeague = etaLeague; this.mu0 = mu; this.hfa0 = hfa;
    this.team = new Map(); this.league = new Map();
  }
  lg(id) { if (!this.league.has(id)) this.league.set(id, { mu: this.mu0, hfa: this.hfa0, n: 0 }); return this.league.get(id); }
  tm(id) { if (!this.team.has(id)) this.team.set(id, { att: 0, def: 0, n: 0 }); return this.team.get(id); }
  seed(id, att, def) { this.team.set(id, { att, def, n: 0 }); }
  lambdas(league, home, away, { neutral = false } = {}) {
    const L = this.lg(league), H = this.tm(home), A = this.tm(away);
    return [Math.exp(L.mu + (neutral ? 0 : L.hfa) + H.att - A.def), Math.exp(L.mu + A.att - H.def)];
  }
  update(league, home, away, hg, ag) {
    const L = this.lg(league), H = this.tm(home), A = this.tm(away);
    const [lh, la] = this.lambdas(league, home, away);
    const eh = Math.max(-3, Math.min(3, hg - lh)), ea = Math.max(-3, Math.min(3, ag - la));   // clip blow-outs
    H.att += this.eta * eh; A.def -= this.eta * eh; A.att += this.eta * ea; H.def -= this.eta * ea;
    L.mu += this.etaLeague * (eh + ea) / 2; L.hfa += this.etaLeague * eh;
    H.n++; A.n++; L.n++;
  }
}

/** Maximum-likelihood rho on a set of {lh, la, hg, ag} by golden-section search (the likelihood is unimodal in rho). */
export function fitRho(rows, lo = -0.2, hi = 0.2) {
  const ll = (rho) => { let s = 0; for (const r of rows) if (r.hg < 2 && r.ag < 2) s += Math.log(Math.max(1e-9, dcTau(r.hg, r.ag, r.lh, r.la, rho))); return s; };
  const g = (Math.sqrt(5) - 1) / 2; let a = lo, b = hi, c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < 40; i++) { if (ll(c) > ll(d)) b = d; else a = c; c = b - g * (b - a); d = a + g * (b - a); }
  return (a + b) / 2;
}

/** Seeded Monte Carlo over a score matrix (mulberry32 PRNG so runs are reproducible). */
export function monteCarlo(m, n = 10000, seed = 7) {
  let t = seed >>> 0;
  const rnd = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const flat = [], cum = []; let c = 0;
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m.length; a++) { c += m[h][a]; flat.push([h, a]); cum.push(c); }
  const res = { home: 0, draw: 0, away: 0, n, goals: new Array(12).fill(0), scores: new Map(), margin: new Map() };
  for (let i = 0; i < n; i++) {
    const u = rnd() * c; let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
    const [h, a] = flat[lo];
    if (h > a) res.home++; else if (h === a) res.draw++; else res.away++;
    res.goals[Math.min(11, h + a)]++;
    const k = h + '-' + a; res.scores.set(k, (res.scores.get(k) || 0) + 1);
    res.margin.set(h - a, (res.margin.get(h - a) || 0) + 1);
  }
  // binomial standard error of each simulated share
  res.se = (p) => Math.sqrt(p * (1 - p) / n);
  return res;
}
