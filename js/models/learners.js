/**
 * Supervised learners for the 1X2 problem (classes: 0 home, 1 draw, 2 away). Pure JS, deterministic.
 *   - multinomial logistic regression (softmax, L2, full-batch gradient descent on standardised features)
 *   - gradient-boosted trees with XGBoost's second-order objective, histogram splits and shrinkage.
 *     The exported JSON has the same shape backend/ml/train_xgboost.py writes, so either engine can serve the site.
 */
export const softmax = (z) => { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };

export function standardiser(X) {
  const k = X[0].length, mean = new Array(k).fill(0), sd = new Array(k).fill(0);
  for (const r of X) for (let j = 0; j < k; j++) mean[j] += r[j];
  for (let j = 0; j < k; j++) mean[j] /= X.length;
  for (const r of X) for (let j = 0; j < k; j++) sd[j] += (r[j] - mean[j]) ** 2;
  for (let j = 0; j < k; j++) sd[j] = Math.sqrt(sd[j] / X.length) || 1;
  return { mean, sd };
}
const scale = (r, s) => r.map((v, j) => (v - s.mean[j]) / s.sd[j]);

export function fitLogistic(X, y, { iters = 500, lr = 0.6, l2 = 1e-3 } = {}) {
  const sc = standardiser(X), Z = X.map(r => scale(r, sc)), k = Z[0].length, n = Z.length;
  const W = [0, 1, 2].map(() => new Array(k + 1).fill(0));
  for (let it = 0; it < iters; it++) {
    const G = [0, 1, 2].map(() => new Array(k + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const z = Z[i], p = softmax(W.map(w => { let s = w[k]; for (let j = 0; j < k; j++) s += w[j] * z[j]; return s; }));
      for (let c = 0; c < 3; c++) { const e = p[c] - (y[i] === c ? 1 : 0); for (let j = 0; j < k; j++) G[c][j] += e * z[j]; G[c][k] += e; }
    }
    for (let c = 0; c < 3; c++) for (let j = 0; j <= k; j++) W[c][j] -= lr * (G[c][j] / n + (j < k ? l2 * W[c][j] : 0));
  }
  return { mean: sc.mean, sd: sc.sd, W };
}
export function predictLogistic(model, x) {
  const k = x.length, z = x.map((v, j) => (v - model.mean[j]) / model.sd[j]);
  return softmax(model.W.map(w => { let s = w[k]; for (let j = 0; j < k; j++) s += w[j] * z[j]; return s; }));
}
/** Standardised coefficients: |w_home - w_away| per feature = how strongly it separates a home win from an away win. */
export const logisticImportance = (model) => model.W[0].slice(0, -1).map((w, j) => Math.abs(w - model.W[2][j]));

/* ───────────── gradient-boosted trees ───────────── */
function binEdges(X, j, bins) {
  const v = X.map(r => r[j]).sort((a, b) => a - b), out = [];
  for (let b = 1; b < bins; b++) { const q = v[Math.floor(b * v.length / bins)]; if (!out.length || q > out[out.length - 1]) out.push(q); }
  return out;
}
const binOf = (edges, v) => { let lo = 0, hi = edges.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v < edges[m]) hi = m; else lo = m + 1; } return lo; };

function buildTree(B, g, h, idx, edges, depth, P, gain) {
  let G = 0, H = 0; for (const i of idx) { G += g[i]; H += h[i]; }
  const leaf = () => ({ v: P.lr * G / (H + P.lambda) });
  if (depth === 0 || idx.length < 2 * P.minLeaf) return leaf();
  const k = edges.length; let best = null;
  const parent = G * G / (H + P.lambda);
  for (let j = 0; j < k; j++) {
    const nb = edges[j].length + 1, hg = new Float64Array(nb), hh = new Float64Array(nb), hc = new Int32Array(nb);
    for (const i of idx) { const b = B[i][j]; hg[b] += g[i]; hh[b] += h[i]; hc[b]++; }
    let gl = 0, hl = 0, cl = 0;
    for (let b = 0; b < nb - 1; b++) {
      gl += hg[b]; hl += hh[b]; cl += hc[b];
      if (cl < P.minLeaf || idx.length - cl < P.minLeaf) continue;
      const gn = gl * gl / (hl + P.lambda) + (G - gl) ** 2 / (H - hl + P.lambda) - parent;
      if (gn > P.gamma && (!best || gn > best.gn)) best = { gn, j, b };
    }
  }
  if (!best) return leaf();
  gain[best.j] += best.gn;
  const L = [], R = [];
  for (const i of idx) (B[i][best.j] <= best.b ? L : R).push(i);
  return { f: best.j, t: edges[best.j][best.b], l: buildTree(B, g, h, L, edges, depth - 1, P, gain), r: buildTree(B, g, h, R, edges, depth - 1, P, gain) };
}
const treeValue = (t, x) => { while (t.v === undefined) t = x[t.f] < t.t ? t.l : t.r; return t.v; };

export function fitGBT(X, y, opts = {}) {
  const P = { rounds: 120, depth: 3, lr: 0.06, lambda: 1, gamma: 0, minLeaf: 40, bins: 32, subsample: 0.8, seed: 11, ...opts };
  const n = X.length, k = X[0].length;
  const edges = Array.from({ length: k }, (_, j) => binEdges(X, j, P.bins));
  const B = X.map(r => r.map((v, j) => binOf(edges[j], v)));
  const prior = [0, 1, 2].map(c => Math.log(Math.max(1e-6, y.filter(v => v === c).length / n)));
  const F = Array.from({ length: n }, () => prior.slice());
  const trees = [], gain = new Array(k).fill(0);
  let t = P.seed >>> 0; const rnd = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const g = new Float64Array(n), h = new Float64Array(n);
  for (let m = 0; m < P.rounds; m++) {
    const idx = []; for (let i = 0; i < n; i++) if (rnd() < P.subsample) idx.push(i);
    const probs = F.map(softmax), round = [];
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) { const p = probs[i][c]; g[i] = (y[i] === c ? 1 : 0) - p; h[i] = Math.max(1e-6, p * (1 - p)); }
      const tree = buildTree(B, g, h, idx, edges, P.depth, P, gain);
      round.push(tree);
      for (let i = 0; i < n; i++) F[i][c] += treeValue(tree, X[i]);
    }
    trees.push(round);
  }
  const tot = gain.reduce((a, b) => a + b, 0) || 1;
  return { engine: 'js-gbt', prior, trees, importance: gain.map(v => v / tot), params: P };
}
export function predictGBT(model, x) {
  const f = model.prior.slice();
  for (const round of model.trees) for (let c = 0; c < 3; c++) f[c] += treeValue(round[c], x);
  return softmax(f);
}

/* ───────────── ensemble: linear opinion pool, weights on the simplex ───────────── */
/** preds: [{model: [pH,pD,pA], ...}], y: outcomes. Exponentiated-gradient descent on log loss keeps weights >= 0, sum 1. */
export function fitEnsemble(preds, y, names, iters = 400, lr = 0.5) {
  let w = names.map(() => 1 / names.length);
  for (let it = 0; it < iters; it++) {
    const grad = names.map(() => 0);
    for (let i = 0; i < preds.length; i++) {
      let mix = 0; for (let m = 0; m < names.length; m++) mix += w[m] * preds[i][names[m]][y[i]];
      for (let m = 0; m < names.length; m++) grad[m] -= preds[i][names[m]][y[i]] / Math.max(1e-9, mix);
    }
    w = w.map((v, m) => v * Math.exp(-lr * grad[m] / preds.length));
    const s = w.reduce((a, b) => a + b, 0); w = w.map(v => v / s);
  }
  return Object.fromEntries(names.map((n, m) => [n, w[m]]));
}
export function blend(parts, weights) {
  const out = [0, 0, 0]; let s = 0;
  for (const [name, w] of Object.entries(weights)) { if (!parts[name]) continue; s += w; for (let c = 0; c < 3; c++) out[c] += w * parts[name][c]; }
  return out.map(v => v / (s || 1));
}

/* ───────────── scoring rules ───────────── */
export function score(preds, y) {
  let ll = 0, br = 0, acc = 0, rps = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], o = [0, 0, 0]; o[y[i]] = 1;
    ll -= Math.log(Math.max(1e-12, p[y[i]]));
    br += (p[0] - o[0]) ** 2 + (p[1] - o[1]) ** 2 + (p[2] - o[2]) ** 2;
    const c1 = p[0] - o[0], c2 = p[0] + p[1] - o[0] - o[1]; rps += (c1 * c1 + c2 * c2) / 2;
    const top = p[0] >= p[1] && p[0] >= p[2] ? 0 : p[1] >= p[2] ? 1 : 2; if (top === y[i]) acc++;
  }
  const n = preds.length || 1;
  return { n: preds.length, logLoss: ll / n, brier: br / n, rps: rps / n, accuracy: acc / n };
}
/** Reliability table over all three outcome probabilities, 10 equal-width bins. */
export function calibration(preds, y, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, p: 0, o: 0 }));
  for (let i = 0; i < preds.length; i++) for (let c = 0; c < 3; c++) {
    const k = Math.min(bins - 1, Math.floor(preds[i][c] * bins)); b[k].n++; b[k].p += preds[i][c]; b[k].o += y[i] === c ? 1 : 0;
  }
  return b.map((x, i) => ({ bin: [i / bins, (i + 1) / bins], n: x.n, predicted: x.n ? x.p / x.n : null, observed: x.n ? x.o / x.n : null }));
}
