/**
 * Fit the teaching xG model used by the Learn section's shot calculator:  node scripts/train_xg.mjs
 * Logistic regression on distance to goal, goal-mouth angle and a header flag, trained on every non-penalty shot in the
 * bundled StatsBomb Open Data tournaments. It is deliberately simple: provider models (including StatsBomb's own xG,
 * reported alongside for reference) also know about defenders, the goalkeeper and the pass before the shot.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
for (const c of ['wc2022', 'euro2024', 'copa2024']) {
  const d = JSON.parse(readFileSync(join(ROOT, `data/sb/${c}/shots.json`), 'utf8'));
  for (const list of Object.values(d.shots)) for (const [x, y, xg, out, , , pen, body] of list) {
    if (pen) continue;
    const dx = 120 - x, dy = 40 - y, dist = Math.hypot(dx, dy);
    const a = Math.atan2(8 * dx, dx * dx + dy * dy - 16);                 // angle subtended by the 8-yard goal
    rows.push({ f: [dist, a < 0 ? a + Math.PI : a, body === 'H' ? 1 : 0], y: out === 'G' ? 1 : 0, sb: xg });
  }
}
const k = 3, mean = [0, 0, 0], sd = [0, 0, 0];
rows.forEach((r) => r.f.forEach((v, j) => (mean[j] += v / rows.length)));
rows.forEach((r) => r.f.forEach((v, j) => (sd[j] += (v - mean[j]) ** 2 / rows.length)));
sd.forEach((v, j) => (sd[j] = Math.sqrt(v)));
const w = [0, 0, 0, 0], sig = (z) => 1 / (1 + Math.exp(-z));
// 5-fold cross-validated log loss, then a final fit on everything
const fit = (train) => { const W = [0, 0, 0, 0]; for (let it = 0; it < 800; it++) { const g = [0, 0, 0, 0]; for (const r of train) { const z = r.f.map((v, j) => (v - mean[j]) / sd[j]), e = sig(W[3] + z[0] * W[0] + z[1] * W[1] + z[2] * W[2]) - r.y; z.forEach((v, j) => (g[j] += e * v)); g[3] += e; } for (let j = 0; j < 4; j++) W[j] -= 0.5 * g[j] / train.length; } return W; };
const pred = (W, r) => { const z = r.f.map((v, j) => (v - mean[j]) / sd[j]); return sig(W[3] + z[0] * W[0] + z[1] * W[1] + z[2] * W[2]); };
const ll = (p, y) => -(y ? Math.log(Math.max(1e-9, p)) : Math.log(Math.max(1e-9, 1 - p)));
let cv = 0, sbll = 0, basell = 0; const rate = rows.filter((r) => r.y).length / rows.length;
for (let f = 0; f < 5; f++) { const W = fit(rows.filter((_, i) => i % 5 !== f)); rows.forEach((r, i) => { if (i % 5 === f) cv += ll(pred(W, r), r.y); }); }
rows.forEach((r) => { sbll += ll(Math.min(.999, Math.max(.001, r.sb)), r.y); basell += ll(rate, r.y); });
const W = fit(rows);
const out = { generatedAt: new Date().toISOString(), note: 'Teaching model: logistic regression on distance, goal angle and header flag. Not a provider xG model.', features: ['distance (yd)', 'goal angle (rad)', 'header'],
  mean: mean.map((v) => +v.toFixed(4)), sd: sd.map((v) => +v.toFixed(4)), w: W.map((v) => +v.toFixed(4)), shots: rows.length, goals: rows.filter((r) => r.y).length,
  logLoss: { model5FoldCV: +(cv / rows.length).toFixed(4), statsbombXg: +(sbll / rows.length).toFixed(4), baseRate: +(basell / rows.length).toFixed(4) }, source: 'StatsBomb Open Data: FIFA World Cup 2022, UEFA Euro 2024, Copa América 2024 (non-penalty shots)' };
writeFileSync(join(ROOT, 'data/models/xg_simple.json'), JSON.stringify(out));
console.log(out);
