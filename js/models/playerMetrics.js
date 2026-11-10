/**
 * Player metrics: one definition per statistic, per-90 normalisation, position-aware peer groups, percentiles,
 * similarity and clustering. Comparisons are always inside a position group with a minutes floor; there is no single
 * "overall rating".
 */
const p90 = (k) => (p) => (p.min ? p[k] / p.min * 90 : 0);
const ratio = (a, b) => (p) => (p[b] ? p[a] / p[b] : 0);
export const POS_LABEL = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };
export const MIN_SAMPLE = 180;         // two full matches: below this, per-90 numbers are noise

/** key: { label, short, fn, d (decimals), pct (show as %), low (lower is better), per90 } */
export const M = {
  g90: { label: 'Goals per 90', short: 'G/90', fn: p90('g'), d: 2 }, npg90: { label: 'Non-penalty goals per 90', short: 'npG/90', fn: p90('npg'), d: 2 },
  a90: { label: 'Assists per 90', short: 'A/90', fn: p90('a'), d: 2 }, sh90: { label: 'Shots per 90', short: 'Sh/90', fn: p90('sh'), d: 2 },
  sot90: { label: 'Shots on target per 90', short: 'SoT/90', fn: p90('sot'), d: 2 }, conv: { label: 'Shot conversion', short: 'Conv', fn: ratio('g', 'sh'), d: 1, pct: true },
  xg90: { label: 'xG per 90', short: 'xG/90', fn: p90('xg'), d: 2 }, npxg90: { label: 'Non-penalty xG per 90', short: 'npxG/90', fn: p90('npxg'), d: 2 },
  xa90: { label: 'xA per 90 (xG assisted)', short: 'xA/90', fn: p90('xa'), d: 2 }, gxg: { label: 'Goals minus xG', short: 'G−xG', fn: (p) => p.g - p.xg, d: 2 },
  kp90: { label: 'Key passes per 90', short: 'KP/90', fn: p90('kp'), d: 2 }, passPct: { label: 'Pass completion', short: 'Pass%', fn: ratio('pc', 'pa'), d: 1, pct: true },
  prp90: { label: 'Progressive passes per 90', short: 'PrgP/90', fn: p90('prp'), d: 2 }, prc90: { label: 'Progressive carries per 90', short: 'PrgC/90', fn: p90('prc'), d: 2 },
  tb90: { label: 'Through balls per 90', short: 'TB/90', fn: p90('tb'), d: 2 }, plen: { label: 'Average completed pass length (yd)', short: 'PassLen', fn: ratio('pdist', 'pc'), d: 1 },
  pc90: { label: 'Passes completed per 90', short: 'Cmp/90', fn: p90('pc'), d: 1 }, drb90: { label: 'Dribbles completed per 90', short: 'Drb/90', fn: p90('drc'), d: 2 },
  tkl90: { label: 'Tackles per 90', short: 'Tkl/90', fn: p90('tkl'), d: 2 }, int90: { label: 'Interceptions per 90', short: 'Int/90', fn: p90('int'), d: 2 },
  blk90: { label: 'Blocks per 90', short: 'Blk/90', fn: p90('blk'), d: 2 }, clr90: { label: 'Clearances per 90', short: 'Clr/90', fn: p90('clr'), d: 2 },
  aerPct: { label: 'Aerial duels won', short: 'Aer%', fn: (p) => (p.aw + p.al ? p.aw / (p.aw + p.al) : 0), d: 1, pct: true }, aw90: { label: 'Aerials won per 90', short: 'AerW/90', fn: p90('aw'), d: 2 },
  rec90: { label: 'Possession recoveries per 90', short: 'Rec/90', fn: p90('rec'), d: 2 }, prs90: { label: 'Pressures per 90', short: 'Prs/90', fn: p90('prs'), d: 1 },
  da90: { label: 'Defensive actions per 90', short: 'DefAct/90', fn: (p) => (p.min ? (p.tkl + p.int + p.blk + p.clr) / p.min * 90 : 0), d: 2 },
  sv90: { label: 'Saves per 90', short: 'Sv/90', fn: p90('sv'), d: 2 }, svPct: { label: 'Save percentage', short: 'Sv%', fn: ratio('sv', 'sota'), d: 1, pct: true },
  ga90: { label: 'Goals conceded per 90', short: 'GA/90', fn: p90('ga'), d: 2, low: true }, csPct: { label: 'Clean-sheet rate', short: 'CS%', fn: ratio('cs', 'st'), d: 1, pct: true },
};
export const show = (key, p) => { const m = M[key], v = m.fn(p); return m.pct ? (v * 100).toFixed(m.d) + '%' : v.toFixed(m.d); };

export const GROUPS = {
  attack: { label: 'Attacking', cols: ['g', 'npg', 'a', 'sh', 'sot', 'xg', 'npxg', 'xa'], extra: ['conv', 'gxg'] },
  passing: { label: 'Midfield and passing', cols: ['kp', 'prp', 'prc', 'tb', 'drc'], extra: ['passPct', 'plen'] },
  defence: { label: 'Defending', cols: ['tkl', 'int', 'blk', 'clr', 'rec', 'prs'], extra: ['aerPct'] },
  keeper: { label: 'Goalkeeping', cols: ['sv', 'sota', 'ga', 'cs'], extra: ['svPct'] },
};
export const COL_LABEL = { g: 'Goals', npg: 'Non-pen goals', a: 'Assists', sh: 'Shots', sot: 'On target', xg: 'xG', npxg: 'npxG', xa: 'xA', kp: 'Key passes', prp: 'Prog passes', prc: 'Prog carries', tb: 'Through balls', drc: 'Dribbles',
  tkl: 'Tackles', int: 'Interceptions', blk: 'Blocks', clr: 'Clearances', rec: 'Recoveries', prs: 'Pressures', sv: 'Saves', sota: 'Shots on target faced', ga: 'Goals conceded', cs: 'Clean sheets' };

/** Radar axes per position group: what matters for that role. */
export const RADAR = {
  FW: ['npxg90', 'sh90', 'npg90', 'xa90', 'kp90', 'drb90', 'prc90', 'aw90'],
  MF: ['xa90', 'kp90', 'prp90', 'prc90', 'passPct', 'da90', 'rec90', 'npxg90'],
  DF: ['tkl90', 'int90', 'clr90', 'blk90', 'aerPct', 'prp90', 'passPct', 'rec90'],
  GK: ['svPct', 'sv90', 'ga90', 'csPct', 'passPct', 'plen'],
};
export const peers = (players, pos, minMin = MIN_SAMPLE) => players.filter((p) => p.pos === pos && p.min >= minMin);
/** Percentile (0-100) of a player on a metric inside a peer list. Lower-is-better metrics are flipped. */
export function percentile(list, player, key) {
  const m = M[key], v = m.fn(player), vals = list.map(m.fn); if (vals.length < 2) return 50;
  const below = vals.filter((x) => (m.low ? x > v : x < v)).length, same = vals.filter((x) => x === v).length;
  return Math.round(100 * (below + Math.max(0, same - 1) / 2) / (vals.length - 1));
}
/** z-score matrix over the radar metrics of a position group. */
export function zMatrix(list, keys) {
  const cols = keys.map((k) => list.map(M[k].fn)), mu = cols.map((c) => c.reduce((a, b) => a + b, 0) / c.length), sd = cols.map((c, j) => Math.sqrt(c.reduce((a, b) => a + (b - mu[j]) ** 2, 0) / c.length) || 1);
  return list.map((_, i) => keys.map((k, j) => (cols[j][i] - mu[j]) / sd[j] * (M[k].low ? -1 : 1)));
}
/** Nearest neighbours in standardised metric space (Euclidean). Same position group only. */
export function similar(players, target, n = 8, minMin = MIN_SAMPLE) {
  const list = peers(players, target.pos, minMin); if (!list.includes(target)) list.push(target);
  const keys = RADAR[target.pos], Z = zMatrix(list, keys), ti = list.indexOf(target);
  return list.map((p, i) => ({ p, d: Math.sqrt(Z[i].reduce((s, v, j) => s + (v - Z[ti][j]) ** 2, 0)) })).filter((x) => x.p !== target).sort((a, b) => a.d - b.d).slice(0, n)
    .map((x) => ({ ...x, score: Math.round(100 / (1 + x.d / Math.sqrt(keys.length))) }));
}
/** Deterministic k-means (k-means++ style seeding from a fixed PRNG) on a z-score matrix. */
export function kmeans(Z, k = 4, iters = 40, seed = 3) {
  let t = seed; const rnd = () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
  const d2 = (a, b) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);
  const cent = [Z[Math.floor(rnd() * Z.length)].slice()];
  while (cent.length < k) { const w = Z.map((z) => Math.min(...cent.map((c) => d2(z, c)))), tot = w.reduce((a, b) => a + b, 0); let r = rnd() * tot, i = 0; while (r > w[i] && i < Z.length - 1) r -= w[i++]; cent.push(Z[i].slice()); }
  let lab = new Array(Z.length).fill(0);
  for (let it = 0; it < iters; it++) {
    lab = Z.map((z) => { let b = 0, bd = Infinity; cent.forEach((c, j) => { const d = d2(z, c); if (d < bd) { bd = d; b = j; } }); return b; });
    cent.forEach((c, j) => { const m = Z.filter((_, i) => lab[i] === j); if (m.length) c.forEach((_, q) => (c[q] = m.reduce((s, z) => s + z[q], 0) / m.length)); });
  }
  return { labels: lab, centroids: cent };
}
/** First two principal components by power iteration (enough for a 2-D map). */
export function pca2(Z) {
  const n = Z.length, k = Z[0].length, C = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const z of Z) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) C[i][j] += z[i] * z[j] / n;
  const power = (A) => { let v = new Array(k).fill(0).map((_, i) => 1 / (i + 1)); for (let it = 0; it < 200; it++) { const w = A.map((r) => r.reduce((s, x, j) => s + x * v[j], 0)), nrm = Math.hypot(...w) || 1; v = w.map((x) => x / nrm); } const lam = v.reduce((s, x, i) => s + x * A[i].reduce((q, y, j) => q + y * v[j], 0), 0); return { v, lam }; };
  const a = power(C), D = C.map((r, i) => r.map((x, j) => x - a.lam * a.v[i] * a.v[j])), b = power(D), tot = C.reduce((s, r, i) => s + r[i], 0);
  return { points: Z.map((z) => [z.reduce((s, x, j) => s + x * a.v[j], 0), z.reduce((s, x, j) => s + x * b.v[j], 0)]), explained: [a.lam / tot, b.lam / tot], axes: [a.v, b.v] };
}
