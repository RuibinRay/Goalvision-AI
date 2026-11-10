// Analytics and prediction maths.   node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poissonPmf, scoreMatrix, outcomes, dcTau, monteCarlo, PoissonRatings, fitRho, topScores } from '../js/models/poisson.js';
import { Elo, eloExpected, goalMultiplier, orderedProbs, fitOrdered } from '../js/models/elo.js';
import { fitLogistic, predictLogistic, fitGBT, predictGBT, fitEnsemble, blend, score, calibration, softmax } from '../js/models/learners.js';
import { FeatureState, FEATURES } from '../js/models/features.js';
import { table, zoneOf, uclLeaguePhase, ties, positionsByMatchday, clubMatches } from '../js/models/standings.js';
import { predictMatch } from '../js/models/predict.js';
import { M, percentile, similar, kmeans, zMatrix, pca2, RADAR, peers } from '../js/models/playerMetrics.js';

const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('Poisson pmf is a distribution with the right mean', () => {
  for (const lam of [0.3, 1.4, 3.2]) { const p = Array.from({ length: 30 }, (_, k) => poissonPmf(k, lam)); near(sum(p), 1, 1e-9); near(sum(p.map((v, k) => v * k)), lam, 1e-6); }
  near(poissonPmf(2, 1.5), 1.5 ** 2 * Math.exp(-1.5) / 2);
});
test('score matrix sums to 1 and outcome probabilities sum to 1', () => {
  for (const rho of [0, -0.08, 0.1]) { const m = scoreMatrix(1.7, 1.1, { rho }), o = outcomes(m); near(sum(m.flat()), 1, 1e-12); near(o.home + o.draw + o.away, 1, 1e-12); assert.ok(o.home > o.away); }
});
test('Dixon-Coles: negative rho adds draws, tau only touches the four low scores', () => {
  const a = outcomes(scoreMatrix(1.3, 1.3)), b = outcomes(scoreMatrix(1.3, 1.3, { rho: -0.1 })); assert.ok(b.draw > a.draw);
  assert.equal(dcTau(2, 0, 1.3, 1.1, -0.1), 1); assert.equal(dcTau(3, 3, 1.3, 1.1, -0.1), 1); near(dcTau(1, 1, 1.3, 1.1, -0.1), 1.1);
});
test('Monte Carlo agrees with the analytic matrix', () => {
  const m = scoreMatrix(1.6, 1.2, { rho: -0.05 }), o = outcomes(m), mc = monteCarlo(m, 40000, 3);
  near(mc.home / 40000, o.home, 0.012); near(mc.draw / 40000, o.draw, 0.012); assert.equal(mc.home + mc.draw + mc.away, 40000);
  assert.deepEqual(monteCarlo(m, 500, 9).home, monteCarlo(m, 500, 9).home, 'seeded runs are reproducible');
});
test('online Poisson ratings move the right way and fitRho recovers the sign', () => {
  const r = new PoissonRatings(); const before = r.lambdas('x', 'a', 'b')[0]; for (let i = 0; i < 10; i++) r.update('x', 'a', 'b', 4, 0);
  assert.ok(r.lambdas('x', 'a', 'b')[0] > before); assert.ok(r.tm('a').att > 0 && r.tm('b').def < 0 && r.tm('a').def > 0);
  const rows = []; for (let i = 0; i < 400; i++) rows.push({ lh: 1.3, la: 1.1, hg: i % 4 === 0 ? 1 : 0, ag: i % 4 === 0 ? 1 : i % 4 === 1 ? 0 : i % 2, }); assert.ok(Number.isFinite(fitRho(rows)));
});
test('Elo: expectations mirror, updates are zero-sum, margin multiplier grows', () => {
  near(eloExpected(1600, 1500) + eloExpected(1500, 1600), 1); assert.ok(eloExpected(1500, 1500, 60) > 0.5);
  const e = new Elo({ k: 20, hfa: 60 }); e.set('a', 1600); e.set('b', 1500); const d = e.update('a', 'b', 0, 1); near(e.get('a') + e.get('b'), 3100); assert.ok(d < 0);
  assert.ok(goalMultiplier(1) < goalMultiplier(2) && goalMultiplier(2) < goalMultiplier(4));
});
test('ordered logit gives a proper, monotone distribution and can be fitted', () => {
  const P = { c1: -0.75, c2: 0.44, b: 1.9 }; let prev = 0;
  for (let d = -1.5; d <= 1.5; d += 0.25) { const o = orderedProbs(d, P); near(o.home + o.draw + o.away, 1); assert.ok(o.home > prev && o.draw > 0); prev = o.home; }
  const rows = []; for (let i = 0; i < 600; i++) { const d = (i % 21 - 10) / 8, u = (i * 0.61803) % 1, o = orderedProbs(d, P); rows.push({ d, y: u < o.home ? 0 : u < o.home + o.draw ? 1 : 2 }); }
  const f = fitOrdered(rows); assert.ok(f.b > 1 && f.c1 < f.c2);
});
test('logistic regression and boosted trees learn a separable signal and output probabilities', () => {
  const X = [], y = []; for (let i = 0; i < 900; i++) { const a = (i * 0.37) % 2 - 1, b = (i * 0.73) % 2 - 1; X.push([a, b]); y.push(a > 0.33 ? 0 : a < -0.33 ? 2 : 1); }
  const lg = fitLogistic(X, y, { iters: 300 }), gb = fitGBT(X, y, { rounds: 40, minLeaf: 10 });
  for (const predict of [(x) => predictLogistic(lg, x), (x) => predictGBT(gb, x)]) { const p = X.map(predict); p.forEach((v) => near(sum(v), 1, 1e-9)); assert.ok(score(p, y).accuracy > 0.85); assert.ok(score(p, y).logLoss < Math.log(3)); }
  assert.ok(gb.importance[0] > gb.importance[1], 'the informative feature gets the gain'); near(sum(gb.importance), 1, 1e-9);
});
test('ensemble weights live on the simplex and favour the better model', () => {
  const y = [], preds = []; for (let i = 0; i < 300; i++) { const c = i % 3; y.push(c); const good = [0.15, 0.15, 0.15]; good[c] = 0.7; preds.push({ good, bad: [1 / 3, 1 / 3, 1 / 3] }); }
  const w = fitEnsemble(preds, y, ['good', 'bad']); near(w.good + w.bad, 1, 1e-9); assert.ok(w.good > 0.9);
  near(sum(blend({ good: [0.7, 0.2, 0.1], bad: [0.2, 0.3, 0.5] }, w)), 1, 1e-9);
});
test('scoring rules: perfect, uniform and calibration bins', () => {
  near(score([[1, 0, 0]], [0]).logLoss, 0, 1e-9); near(score([[1 / 3, 1 / 3, 1 / 3]], [1]).logLoss, Math.log(3), 1e-9); near(score([[1 / 3, 1 / 3, 1 / 3]], [1]).brier, 2 / 3, 1e-9);
  const cal = calibration([[0.5, 0.3, 0.2], [0.5, 0.3, 0.2]], [0, 1]); assert.equal(sum(cal.map((b) => b.n)), 6); near(sum(softmax([1, 2, 3])), 1);
});
test('feature tracker never sees the match it is describing', () => {
  const fs = new FeatureState(), ctx = { eloGap: 0, attH: 0, defH: 0, attA: 0, defA: 0, leagueHfa: 0.25 };
  fs.update('a', 'b', '2026-08-01', 2, 0); fs.update('c', 'a', '2026-08-08', 1, 1);
  const before = fs.features('a', 'b', '2026-08-15', ctx); fs.update('a', 'b', '2026-08-15', 5, 0); const after = fs.features('a', 'b', '2026-08-22', ctx);
  assert.equal(before.length, FEATURES.length); assert.notDeepEqual(before, after); assert.equal(before[7], -7, 'a rested 7 days, b 14: difference capped at -7'); assert.ok(after[3] > before[3], 'form improves only after the result');
});
test('league table: points, ordering, zones, rolling window', () => {
  const s = { teams: ['a', 'b', 'c'], matches: [[1, '2026-08-01', '15:00', 0, 1, 2, 0, 1, 0], [1, '2026-08-02', '15:00', 2, 0, 1, 1, 0, 0], [2, '2026-08-09', '15:00', 1, 2, 3, 0, 1, 0], [3, '2026-08-16', '15:00', 0, 2, null, null, null, null]] };
  const t = table(s); assert.deepEqual(t.map((r) => r.id), ['a', 'b', 'c']); assert.equal(t[0].pts, 4); assert.equal(t[0].p, 2); assert.equal(t[1].gd, 1);
  assert.equal(table(s, { venue: 'home' }).find((r) => r.id === 'a').p, 1); assert.equal(table(s, { until: 1 }).find((r) => r.id === 'b').p, 1); assert.equal(table(s, { last: 1 }).find((r) => r.id === 'a').p, 1);
  assert.equal(positionsByMatchday(s).matchdays.length, 2); assert.equal(clubMatches(s, 'c').length, 2);
  const z = { ucl: 4, uel: 1, uecl: 1, relegation: 3 }; assert.equal(zoneOf(1, 20, z), 'ucl'); assert.equal(zoneOf(5, 20, z), 'uel'); assert.equal(zoneOf(6, 20, z), 'uecl'); assert.equal(zoneOf(10, 20, z), null); assert.equal(zoneOf(18, 20, z), 'rel');
});
test('Champions League league phase: 36 clubs, 8 matches each, 8 / 16 / 12 split, bracket winners', () => {
  const d = read('data/tournaments/ucl/2025-26.json'), t = uclLeaguePhase(d);
  assert.equal(t.length, 36); assert.ok(t.every((r) => r.p === 8)); assert.equal(t.filter((r) => r.zone === 'r16').length, 8); assert.equal(t.filter((r) => r.zone === 'playoff').length, 16); assert.equal(t.filter((r) => r.zone === 'out').length, 12);
  assert.equal(sum(t.map((r) => r.gf)), sum(t.map((r) => r.ga))); assert.equal(ties(d, 'playoff').length, 8); assert.equal(ties(d, 'r16').length, 8); assert.equal(ties(d, 'final').length, 1); assert.ok(ties(d, 'qf').every((x) => x.winner));
});
test('Prediction Lab: every forecast is a probability distribution', () => {
  const st = read('data/models/state.json');
  const f = predictMatch(st, { home: 'arsenal', away: 'liverpool', date: '2026-11-21' });
  assert.deepEqual(Object.keys(f.models).sort(), ['dixonColes', 'elo', 'gbt', 'logistic', 'poisson']); for (const p of [...Object.values(f.models), f.ensemble]) { near(sum(p), 1, 1e-9); assert.ok(p.every((v) => v > 0 && v < 1)); }
  near(sum(f.matrix.flat()), 1, 1e-9); assert.equal(f.features.length, FEATURES.length); assert.ok(f.top[0].p >= f.top[1].p);
  const neutral = predictMatch(st, { home: 'arsenal', away: 'liverpool', neutral: true }); assert.ok(neutral.ensemble[0] < f.ensemble[0], 'removing home advantage lowers the home win');
  const boosted = predictMatch(st, { home: 'arsenal', away: 'liverpool', adj: { attH: 1.2 } }); assert.ok(boosted.ensemble[0] > f.ensemble[0] && boosted.lambdas[0] > f.lambdas[0]);
  const cross = predictMatch(st, { home: 'arsenal', away: 'real-madrid' }); assert.equal(cross.sameLeague, false); near(sum(cross.ensemble), 1, 1e-9); assert.ok(cross.notes.length); assert.ok(!cross.models.gbt);
  const nat = predictMatch(st, { kind: 'nation', home: 'Spain', away: 'Argentina', neutral: true }); near(sum(nat.ensemble), 1, 1e-9); assert.ok(nat.notes[0].includes('not separately backtested'));
  assert.throws(() => predictMatch(st, { home: 'arsenal', away: 'nobody' }));
});
test('validation report: the ensemble beats both baselines out of sample', () => {
  const ev = read('data/models/eval.json');
  assert.ok(ev.window.matches > 15000); assert.ok(ev.models.ensemble.logLoss < ev.models.baseRate.logLoss && ev.models.baseRate.logLoss < ev.models.uniform.logLoss + 1e-9);
  assert.ok(ev.models.ensemble.brier < ev.models.baseRate.brier); assert.ok(ev.goals.maeTotal < ev.goals.baselineTotal); near(sum(ev.outcomeRates), 1, 1e-3);
  assert.ok(ev.hyperParameters.tunedOn < ev.window.from, 'hyper-parameters were tuned before the reported window');
});
test('player metrics: per 90, percentiles, similarity, clustering', () => {
  const players = read('data/sb/wc2022/players.json').players, messi = players.find((p) => p.n === 'Lionel Messi');
  near(M.g90.fn(messi), messi.g / messi.min * 90); assert.ok(M.passPct.fn(messi) > 0 && M.passPct.fn(messi) <= 1);
  const fw = peers(players, 'FW'); const pc = percentile(fw, messi, 'xa90'); assert.ok(pc >= 0 && pc <= 100 && pc > 80);
  const sim = similar(players, messi, 5); assert.equal(sim.length, 5); assert.ok(sim.every((s) => s.p.pos === 'FW' && s.p !== messi)); assert.ok(sim[0].d <= sim[4].d);
  const Z = zMatrix(fw, RADAR.FW), a = kmeans(Z, 4), b = kmeans(Z, 4); assert.deepEqual(a.labels, b.labels); assert.equal(new Set(a.labels).size, 4);
  const pc2 = pca2(Z); assert.ok(pc2.explained[0] >= pc2.explained[1] && pc2.explained[0] + pc2.explained[1] <= 1.0001);
});
