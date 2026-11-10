/**
 * The Prediction Lab engine. Takes the trained artefact (data/models/state.json) and returns every model's forecast
 * for one fixture. Same-league club fixtures get all six models; cross-league and national-team fixtures only have a
 * rating-based forecast, and say so. Probabilities always sum to 1; nothing here claims certainty.
 */
import { scoreMatrix, outcomes, topScores, marginals } from './poisson.js';
import { orderedProbs } from './elo.js';
import { predictLogistic, predictGBT, blend, logisticImportance } from './learners.js';
import { FeatureState, FEATURES } from './features.js';

export const MODEL_INFO = {
  poisson: { name: 'Poisson goals', short: 'Poisson', blurb: 'Independent Poisson goals from online attack, defence and home-advantage ratings.' },
  dixonColes: { name: 'Dixon-Coles', short: 'Dixon-Coles', blurb: 'Poisson with the low-score dependence correction (rho) fitted on past matches.' },
  elo: { name: 'Elo ratings', short: 'Elo', blurb: 'Rating gap plus home advantage, mapped to win/draw/loss by an ordered logit.' },
  logistic: { name: 'Multinomial logistic', short: 'Logistic', blurb: 'Softmax regression on ten pre-match features.' },
  gbt: { name: 'Gradient-boosted trees', short: 'Boosted trees', blurb: 'XGBoost-style second-order boosting on the same ten features.' },
  ensemble: { name: 'Ensemble', short: 'Ensemble', blurb: 'Weighted average of the models; weights learned from earlier out-of-sample forecasts.' },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const arr = (o) => [o.home, o.draw, o.away];

/**
 * @param state  trained artefact
 * @param opts   { home, away, kind: 'club'|'nation', date, neutral, adj: { homeAdv, attH, defH, attA, defA, restH, restA } }
 *               adj multipliers default to 1 (what-if simulator); defH/defA > 1 means a stronger defence.
 */
export function predictMatch(state, opts) {
  const { home, away, kind = 'club', date = null, neutral = false } = opts;
  const adj = { homeAdv: 1, attH: 1, defH: 1, attA: 1, defA: 1, ...(opts.adj || {}) };
  const P = state.params, notes = [];
  const models = {}; let lh, la, features = null, sameLeague = false, league = null;

  if (kind === 'nation') {
    const H = state.nations[home], A = state.nations[away];
    if (!H || !A) throw new Error('Unknown national team');
    const d = (H.elo - A.elo) / 400 + (neutral ? 0 : 0.25 * adj.homeAdv);
    const sup = P.eloGoals.slope * d, tot = P.eloGoals.totalNations;
    lh = clamp((tot + sup) / 2, 0.15, 6) * adj.attH / adj.defA; la = clamp((tot - sup) / 2, 0.15, 6) * adj.attA / adj.defH;
    models.elo = arr(orderedProbs(d, P.ordered));
    notes.push('National-team forecast uses Elo from World Cup finals, Euro 2024 and Copa América 2024 matches only. It is not separately backtested.');
  } else {
    const H = state.clubs[home], A = state.clubs[away];
    if (!H || !A) throw new Error('Unknown club');
    sameLeague = H.league === A.league; league = H.league;
    const hfaElo = neutral ? 0 : P.elo.hfa * adj.homeAdv;
    const d = (H.elo + hfaElo - A.elo) / 400;
    models.elo = arr(orderedProbs(d, P.ordered));
    if (sameLeague) {
      const L = state.leagues[league];
      const hfa = neutral ? 0 : L.hfa * adj.homeAdv;
      const attH = H.att + Math.log(adj.attH), defH = H.def + Math.log(adj.defH), attA = A.att + Math.log(adj.attA), defA = A.def + Math.log(adj.defA);
      lh = Math.exp(L.mu + hfa + attH - defA); la = Math.exp(L.mu + attA - defH);
      const fs = new FeatureState({ recent: { [home]: H.recent, [away]: A.recent }, h2h: state.h2h });
      const rest = { home: adj.restH ?? undefined, away: adj.restA ?? undefined };
      features = fs.features(home, away, date, { eloGap: (H.elo - A.elo) / 400, attH, defH, attA, defA, leagueHfa: hfa }, rest);
      models.poisson = arr(outcomes(scoreMatrix(lh, la)));
      models.dixonColes = arr(outcomes(scoreMatrix(lh, la, { rho: P.rho })));
      models.logistic = predictLogistic(P.logistic, features);
      models.gbt = predictGBT(P.gbt, features);
    } else {
      const sup = P.eloGoals.slope * d, tot = P.eloGoals.total;
      lh = clamp((tot + sup) / 2, 0.15, 6) * adj.attH / adj.defA; la = clamp((tot - sup) / 2, 0.15, 6) * adj.attA / adj.defH;
      notes.push('Clubs from different leagues: attack/defence ratings are league-relative, so only the Elo-based forecast applies. Cross-league Elo is linked through 2025/26 Champions League results only.');
    }
  }
  const matrix = scoreMatrix(lh, la, { rho: sameLeague ? P.rho : 0 });
  const market = outcomes(matrix);
  if (!sameLeague) models.ratingPoisson = arr(market);
  const weights = sameLeague ? P.ensemble : { elo: 0.5, ratingPoisson: 0.5 };
  const ensemble = blend(models, weights);
  // disagreement: largest spread between any two models on any outcome
  const ps = Object.values(models);
  const spread = Math.max(...[0, 1, 2].map(c => Math.max(...ps.map(p => p[c])) - Math.min(...ps.map(p => p[c]))));
  return {
    home, away, kind, league, sameLeague, neutral, lambdas: [lh, la], matrix, market, top: topScores(matrix, 8), marginals: marginals(matrix),
    models, ensemble, weights, spread, features, featureNames: FEATURES, notes, asOf: state.asOf,
  };
}

/** Local explanation for the logistic model: contribution of each standardised feature to (home - away) log-odds. */
export function logisticContributions(state, features) {
  const m = state.params.logistic;
  return FEATURES.map((f, j) => ({ ...f, value: features[j], contribution: (m.W[0][j] - m.W[2][j]) * (features[j] - m.mean[j]) / m.sd[j] }));
}
export function globalImportance(state) {
  const lg = logisticImportance(state.params.logistic), gb = state.params.gbt.importance, s = lg.reduce((a, b) => a + b, 0) || 1;
  return FEATURES.map((f, j) => ({ ...f, logistic: lg[j] / s, gbt: gb[j] }));
}
