/**
 * Train and backtest the Prediction Lab models.   node scripts/train_models.mjs
 *
 * Leakage controls
 *   - matches are replayed strictly in date order; every rating / feature is read BEFORE the match and updated after it
 *   - walk-forward: to forecast season S the fitted parts (Elo link, rho, logistic, boosted trees) see seasons < S only
 *   - ensemble weights for season S come from out-of-sample forecasts of seasons < S
 *   - hyper-parameters (Elo K / home advantage, Poisson learning rate) are chosen on seasons before the reported window
 * Outputs: data/models/state.json (artefact the browser uses), data/models/eval.json (validation report),
 *          data/models/elo_history.json (end-of-season ratings for the Time Machine and rankings)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PoissonRatings, scoreMatrix, outcomes, fitRho } from '../js/models/poisson.js';
import { Elo, orderedProbs, fitOrdered } from '../js/models/elo.js';
import { fitLogistic, predictLogistic, fitGBT, predictGBT, fitEnsemble, blend, score, calibration } from '../js/models/learners.js';
import { FeatureState, FEATURES, pairKey } from '../js/models/features.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const registry = read('data/registry.json');
const REPORT_FROM = '2016-17', WARMUP_FROM = '2014-15';
const NAMES = ['poisson', 'dixonColes', 'elo', 'logistic', 'gbt'];

/* ── load every league season, in order ── */
const seasons = {};                 // league -> [{season, teams, matches}]
const all = [];
for (const lg of registry.leagues) {
  seasons[lg.id] = readdirSync(join(ROOT, 'data/leagues', lg.id)).filter(f => f.endsWith('.json')).sort().map(f => read(`data/leagues/${lg.id}/${f}`));
  seasons[lg.id].forEach((s, si) => {
    const prev = si ? new Set(seasons[lg.id][si - 1].teams) : null;
    const cur = new Set(s.teams);
    s.promoted = prev ? s.teams.filter(t => !prev.has(t)) : [];
    s.relegated = prev ? [...prev].filter(t => !cur.has(t)) : [];
    for (const m of s.matches) if (m[5] != null) all.push({ kind: 'league', league: lg.id, season: s.season, date: m[1], time: m[2] || '', home: s.teams[m[3]], away: s.teams[m[4]], hg: m[5], ag: m[6], first: null, s });
  });
}
const ucl = read('data/tournaments/ucl/2025-26.json');
for (const m of ucl.matches) if (m.ft) { const sc = m.et || m.ft; all.push({ kind: 'ucl', season: '2025-26', date: m.date, time: m.time || '', home: m.home, away: m.away, hg: sc[0], ag: sc[1], neutral: m.stage === 'final' }); }
all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

/* ── one chronological replay → pre-match rows ── */
function replay({ k = 20, hfa = 60, eta = 0.035 } = {}, keep = true) {
  const elo = new Elo({ k, hfa }), pr = new PoissonRatings({ eta }), fs = new FeatureState();
  const seeded = new Set(), rows = [], eloHist = {};
  let lastSeasonSeen = {};
  for (const m of all) {
    if (m.kind === 'league') {
      const tag = m.league + m.season;
      if (!seeded.has(tag)) {                      // season start: promoted clubs inherit the relegated clubs' average level
        seeded.add(tag);
        const prevSeason = lastSeasonSeen[m.league];
        if (prevSeason) for (const t of prevSeason.teams) (eloHist[t] ||= []).push([prevSeason.season, Math.round(elo.get(t))]);
        lastSeasonSeen[m.league] = m.s;
        const rel = m.s.relegated;
        if (rel.length) {
          const avg = (f) => rel.reduce((s, t) => s + f(t), 0) / rel.length;
          const e = avg(t => elo.get(t)), a = avg(t => pr.tm(t).att), d = avg(t => pr.tm(t).def);
          for (const t of m.s.promoted) { elo.set(t, e); pr.seed(t, a, d); }
        }
      }
      const [lh, la] = pr.lambdas(m.league, m.home, m.away);
      const H = pr.tm(m.home), A = pr.tm(m.away), L = pr.lg(m.league);
      const eloGap = (elo.get(m.home) - elo.get(m.away)) / 400;
      const x = fs.features(m.home, m.away, m.date, { eloGap, attH: H.att, defH: H.def, attA: A.att, defA: A.def, leagueHfa: L.hfa });
      if (keep) rows.push({ league: m.league, season: m.season, date: m.date, home: m.home, away: m.away, hg: m.hg, ag: m.ag, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, lh, la, d: elo.gap(m.home, m.away), x, mu: L.mu, hfa: L.hfa });
      else rows.push({ season: m.season, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, lh, la, d: elo.gap(m.home, m.away) });
      elo.update(m.home, m.away, m.hg, m.ag); pr.update(m.league, m.home, m.away, m.hg, m.ag); fs.update(m.home, m.away, m.date, m.hg, m.ag);
    } else {
      elo.update(m.home, m.away, m.hg, m.ag, { neutral: !!m.neutral });
    }
  }
  for (const [lg, s] of Object.entries(lastSeasonSeen)) for (const t of s.teams) (eloHist[t] ||= []).push([s.season, Math.round(elo.get(t))]);
  return { elo, pr, fs, rows, eloHist };
}

/* ── hyper-parameters: chosen on seasons before the reported window only ── */
const tuneRows = (r) => r.filter(x => x.season < REPORT_FROM && x.season >= '2012-13');
let best = { ll: Infinity }; const tuning = [];
for (const k of [14, 18, 22, 26]) for (const hfa of [40, 60, 80]) {
  const r = tuneRows(replay({ k, hfa }, false).rows), link = fitOrdered(r, 300);
  const ll = score(r.map(x => { const p = orderedProbs(x.d, link); return [p.home, p.draw, p.away]; }), r.map(x => x.y)).logLoss;
  tuning.push({ k, hfa, logLoss: +ll.toFixed(5) }); if (ll < best.ll) best = { ll, k, hfa };
}
let bestEta = { ll: Infinity };
for (const eta of [0.02, 0.03, 0.04, 0.05]) {
  const r = tuneRows(replay({ k: best.k, hfa: best.hfa, eta }, false).rows);
  const ll = score(r.map(x => { const o = outcomes(scoreMatrix(x.lh, x.la)); return [o.home, o.draw, o.away]; }), r.map(x => x.y)).logLoss;
  tuning.push({ eta, logLoss: +ll.toFixed(5) }); if (ll < bestEta.ll) bestEta = { ll, eta };
}
const HP = { k: best.k, hfa: best.hfa, eta: bestEta.eta };
console.log('hyper-parameters (tuned on < ' + REPORT_FROM + '):', HP);

const { elo, pr, fs, rows, eloHist } = replay(HP);
console.log('league matches replayed:', rows.length, '· first', rows[0].date, '· last', rows.at(-1).date);
if (process.argv.includes('--export-rows')) {            // feature table for backend/ml/train_xgboost.py (same rows, same order)
  const head = ['season', 'league', 'date', 'home', 'away', 'y', ...FEATURES.map((f) => f.key)];
  writeFileSync(join(ROOT, 'backend/ml/rows.csv'), [head.join(','), ...rows.map((r) => [r.season, r.league, r.date, r.home, r.away, r.y, ...r.x.map((v) => +v.toFixed(5))].join(','))].join('\n'));
  console.log('wrote backend/ml/rows.csv');
}

/* ── walk-forward ── */
const seasonList = [...new Set(rows.map(r => r.season))].sort();
const oos = [];                                  // out-of-sample forecasts, all models
const weightsBySeason = {};
const t0 = Date.now();
for (const S of seasonList.filter(s => s >= WARMUP_FROM)) {
  const train = rows.filter(r => r.season < S), test = rows.filter(r => r.season === S);
  const link = fitOrdered(train), rho = fitRho(train);
  const logit = fitLogistic(train.map(r => r.x), train.map(r => r.y));
  const gbt = fitGBT(train.map(r => r.x), train.map(r => r.y));
  const freq = [0, 1, 2].map(c => train.filter(r => r.y === c).length / train.length);
  const prior = oos.filter(o => o.season < S);
  const w = prior.length ? fitEnsemble(prior.map(o => o.p), prior.map(o => o.y), NAMES) : Object.fromEntries(NAMES.map(n => [n, 1 / NAMES.length]));
  weightsBySeason[S] = w;
  const mean = (f) => train.reduce((s, r) => s + f(r), 0) / train.length;
  const base = { h: mean(r => r.hg), a: mean(r => r.ag) };
  for (const r of test) {
    const o1 = outcomes(scoreMatrix(r.lh, r.la)), o2 = outcomes(scoreMatrix(r.lh, r.la, { rho })), e = orderedProbs(r.d, link);
    const p = { poisson: [o1.home, o1.draw, o1.away], dixonColes: [o2.home, o2.draw, o2.away], elo: [e.home, e.draw, e.away], logistic: predictLogistic(logit, r.x), gbt: predictGBT(gbt, r.x) };
    p.ensemble = blend(p, w); p.baseRate = freq; p.uniform = [1 / 3, 1 / 3, 1 / 3];
    oos.push({ season: S, league: r.league, y: r.y, p, hg: r.hg, ag: r.ag, lh: r.lh, la: r.la, base });
  }
  console.log(S, 'train', train.length, 'test', test.length, 'rho', rho.toFixed(3), 'w', NAMES.map(n => w[n].toFixed(2)).join(' '), ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

/* ── report ── */
const rep = oos.filter(o => o.season >= REPORT_FROM);
const ALLN = [...NAMES, 'ensemble', 'baseRate', 'uniform'];
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v]));
const scoreSet = (set) => Object.fromEntries(ALLN.map(n => [n, round(score(set.map(o => o.p[n]), set.map(o => o.y)))]));
const abs = (f) => rep.reduce((s, o) => s + Math.abs(f(o)), 0) / rep.length;
const evalOut = {
  generatedAt: new Date().toISOString(),
  method: 'Walk-forward by season: each season is forecast with models fitted on earlier seasons only; ratings and features are read before kick-off.',
  window: { from: REPORT_FROM, to: seasonList.at(-1), firstDate: rep[0] && rows.find(r => r.season === REPORT_FROM).date, lastDate: rows.at(-1).date, matches: rep.length, seasons: [...new Set(rep.map(o => o.season))].length, leagues: registry.leagues.map(l => l.id) },
  trainingFrom: rows[0].date, totalMatches: rows.length,
  hyperParameters: { ...HP, tunedOn: `2012-13 … ${seasonList[seasonList.indexOf(REPORT_FROM) - 1]}`, grid: tuning },
  outcomeRates: [0, 1, 2].map(c => +(rep.filter(o => o.y === c).length / rep.length).toFixed(4)),
  models: scoreSet(rep),
  bySeason: [...new Set(rep.map(o => o.season))].map(s => ({ season: s, n: rep.filter(o => o.season === s).length, models: scoreSet(rep.filter(o => o.season === s)) })),
  byLeague: registry.leagues.map(l => ({ league: l.id, n: rep.filter(o => o.league === l.id).length, models: scoreSet(rep.filter(o => o.league === l.id)) })),
  calibration: Object.fromEntries([...NAMES, 'ensemble'].map(n => [n, calibration(rep.map(o => o.p[n]), rep.map(o => o.y)).map(b => ({ ...b, predicted: b.predicted && +b.predicted.toFixed(4), observed: b.observed != null ? +b.observed.toFixed(4) : null }))])),
  goals: {
    note: 'Mean absolute error of expected goals (Poisson ratings) against goals scored, versus predicting the training-set average.',
    maeHome: +abs(o => o.hg - o.lh).toFixed(4), maeAway: +abs(o => o.ag - o.la).toFixed(4), maeTotal: +abs(o => o.hg + o.ag - o.lh - o.la).toFixed(4),
    baselineHome: +abs(o => o.hg - o.base.h).toFixed(4), baselineAway: +abs(o => o.ag - o.base.a).toFixed(4), baselineTotal: +abs(o => o.hg + o.ag - o.base.h - o.base.a).toFixed(4),
  },
  ensembleWeightsBySeason: Object.fromEntries(Object.entries(weightsBySeason).map(([s, w]) => [s, round(w)])),
};
console.table(Object.fromEntries(Object.entries(evalOut.models).map(([k, v]) => [k, { logLoss: v.logLoss, brier: v.brier, rps: v.rps, acc: v.accuracy }])));
console.log('goals MAE', evalOut.goals);

/* ── final fit on everything → browser artefact ── */
const link = fitOrdered(rows), rho = fitRho(rows);
const logit = fitLogistic(rows.map(r => r.x), rows.map(r => r.y));
const gbt = fitGBT(rows.map(r => r.x), rows.map(r => r.y));
const wFinal = fitEnsemble(oos.map(o => o.p), oos.map(o => o.y), NAMES);
// goal supremacy per unit of Elo gap (least squares through the origin) for rating-only fixtures
let sxy = 0, sxx = 0, tot = 0; for (const r of rows) { sxy += r.d * (r.hg - r.ag); sxx += r.d * r.d; tot += r.hg + r.ag; }

/* national teams: Elo from World Cup finals (1930 →) + Euro 2024 + Copa América 2024, K by competition weight */
const ALIAS = { 'USA': 'United States', 'West Germany': 'Germany', 'Korea Republic': 'South Korea', 'Türkiye': 'Turkey', 'Czechia': 'Czech Republic', 'Bosnia and Herzegovina': 'Bosnia-Herzegovina', "Côte d'Ivoire": 'Ivory Coast', 'China PR': 'China', 'Republic of Ireland': 'Ireland' };
const canon = (n) => ALIAS[n] || n;
const nat = [];
for (const f of readdirSync(join(ROOT, 'data/tournaments/worldcup')).filter(f => /^\d{4}\.json$/.test(f))) {
  const d = read('data/tournaments/worldcup/' + f);
  for (const m of d.matches) { const sc = m.score.et || m.score.ft; if (sc) nat.push({ date: m.date, a: canon(m.team1), b: canon(m.team2), ga: sc[0], gb: sc[1], k: 60, comp: 'FIFA World Cup ' + d.year }); }
}
for (const c of ['euro2024', 'copa2024']) for (const m of read(`data/sb/${c}/index.json`).matches) nat.push({ date: m.date, a: canon(m.home.name), b: canon(m.away.name), ga: m.home.score, gb: m.away.score, k: 50, comp: m.compName });
nat.sort((x, y) => x.date.localeCompare(y.date));
const nelo = new Elo({ k: 60, hfa: 0 }), nstat = {}; let natGoals = 0, natN = 0;
for (const m of nat) {
  nelo.update(m.a, m.b, m.ga, m.gb, { neutral: true, k: m.k });
  for (const t of [m.a, m.b]) { nstat[t] ||= { n: 0 }; nstat[t].n++; nstat[t].last = m.date; nstat[t].lastComp = m.comp; }
  if (m.date >= '2010') { natGoals += m.ga + m.gb; natN++; }
}
const nations = Object.fromEntries(Object.entries(nstat).filter(([, v]) => v.last >= '2018').map(([t, v]) => [t, { elo: Math.round(nelo.get(t)), n: v.n, last: v.last, lastComp: v.lastComp }]).sort((a, b) => b[1].elo - a[1].elo));

const current = new Set(Object.keys(registry.clubs));
const clubs = {};
for (const id of current) {
  const t = pr.tm(id);
  clubs[id] = { league: registry.clubs[id].league, elo: Math.round(elo.get(id) * 10) / 10, att: +t.att.toFixed(4), def: +t.def.toFixed(4), n: t.n, recent: fs.list(id) };
}
const h2h = {};
for (const [k, v] of fs.h2h) { const [a, b] = k.split('|'); if (current.has(a) && current.has(b)) h2h[k] = v; }
// every club that ever appeared keeps an Elo so the Time Machine and UCL pages can rank them
const allElo = Object.fromEntries([...elo.r].map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]));

const trim = (t) => (t.v !== undefined ? { v: +t.v.toFixed(5) } : { f: t.f, t: +t.t.toFixed(5), l: trim(t.l), r: trim(t.r) });
const state = {
  generatedAt: new Date().toISOString(), asOf: rows.at(-1).date, trainedOn: { matches: rows.length, from: rows[0].date, to: rows.at(-1).date },
  featureNames: FEATURES.map(f => f.key),
  params: {
    elo: { k: HP.k, hfa: HP.hfa }, poisson: { eta: HP.eta }, ordered: round(link), rho: +rho.toFixed(4),
    logistic: { mean: logit.mean.map(v => +v.toFixed(5)), sd: logit.sd.map(v => +v.toFixed(5)), W: logit.W.map(w => w.map(v => +v.toFixed(5))) },
    gbt: { engine: gbt.engine, prior: gbt.prior.map(v => +v.toFixed(5)), importance: gbt.importance.map(v => +v.toFixed(4)), params: gbt.params, trees: gbt.trees.map(r => r.map(trim)) },
    ensemble: round(wFinal),
    eloGoals: { slope: +(sxy / sxx).toFixed(4), total: +(tot / rows.length).toFixed(4), totalNations: +(natGoals / natN).toFixed(4) },
  },
  leagues: Object.fromEntries([...pr.league].map(([k, v]) => [k, { mu: +v.mu.toFixed(4), hfa: +v.hfa.toFixed(4) }])),
  clubs, h2h, nations,
};
mkdirSync(join(ROOT, 'data/models'), { recursive: true });
writeFileSync(join(ROOT, 'data/models/state.json'), JSON.stringify(state));
writeFileSync(join(ROOT, 'data/models/eval.json'), JSON.stringify(evalOut));
writeFileSync(join(ROOT, 'data/models/elo_history.json'), JSON.stringify({ generatedAt: state.generatedAt, note: 'Elo at the end of each season (current season: as of the snapshot).', history: eloHist, current: allElo }));
console.log('final weights', round(wFinal), 'rho', rho.toFixed(3), 'link', round(link), 'eloGoals', state.params.eloGoals);
console.log('top clubs', Object.entries(allElo).slice(0, 8), '\ntop nations', Object.entries(nations).slice(0, 8).map(([k, v]) => k + ' ' + v.elo));
