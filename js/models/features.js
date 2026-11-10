/**
 * Pre-match feature construction. The tracker only ever knows what happened BEFORE the match it is asked about:
 * call features() first, update() after the final whistle. The same code builds features in training and in the browser.
 */
export const FEATURES = [
  { key: 'eloGap', label: 'Elo rating gap', help: 'Home Elo minus away Elo, in 400-point units (home advantage not included).' },
  { key: 'attGap', label: 'Home attack vs away defence', help: 'Poisson attack rating of the home side minus defence rating of the visitors (log scale).' },
  { key: 'defGap', label: 'Away attack vs home defence', help: 'Poisson attack rating of the visitors minus defence rating of the home side (log scale).' },
  { key: 'formDiff', label: 'Form, last 5', help: 'Points per game over the last five league matches, home minus away.' },
  { key: 'gdDiff', label: 'Goal difference, last 10', help: 'Goal difference per game over the last ten league matches, home minus away.' },
  { key: 'homeVenue', label: 'Home record at home', help: 'Home side points per game in its last eight home matches.' },
  { key: 'awayVenue', label: 'Away record on the road', help: 'Away side points per game in its last eight away matches.' },
  { key: 'restDiff', label: 'Rest days', help: 'Days since the previous league match, home minus away (each capped at 14, difference at ±7).' },
  { key: 'h2h', label: 'Head-to-head', help: 'Home side points per game in the last five meetings, centred on the league average of 1.37.' },
  { key: 'leagueHfa', label: 'League home advantage', help: 'Current log home-goal multiplier of the competition.' },
];
const DAY = 86400000;
const pts = (gf, ga) => (gf > ga ? 3 : gf === ga ? 1 : 0);
const mean = (a, f, dflt) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : dflt);
export const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

export class FeatureState {
  constructor(seed) {
    this.recent = new Map();     // club -> [[date, isHome, gf, ga, opp]] newest last, max 20
    this.h2h = new Map();        // 'a|b' -> { p, w:[a wins, draws, b wins], g:[a goals, b goals], last:[[date, home, hg, ag]] }
    if (seed) { for (const [k, v] of Object.entries(seed.recent || {})) this.recent.set(k, v); for (const [k, v] of Object.entries(seed.h2h || {})) this.h2h.set(k, v); }
  }
  list(id) { return this.recent.get(id) || []; }
  static rolling(list) {
    const l5 = list.slice(-5), l10 = list.slice(-10);
    const home = list.filter(m => m[1]).slice(-8), away = list.filter(m => !m[1]).slice(-8);
    return {
      form: mean(l5, m => pts(m[2], m[3]), 1.37), gd: mean(l10, m => m[2] - m[3], 0),
      homePpg: mean(home, m => pts(m[2], m[3]), 1.6), awayPpg: mean(away, m => pts(m[2], m[3]), 1.15),
      gf: mean(l10, m => m[2], 1.35), ga: mean(l10, m => m[3], 1.35), last: list.length ? list[list.length - 1][0] : null, n: list.length,
    };
  }
  rest(id, date) { const l = this.list(id); if (!l.length || !date) return 7; return Math.max(2, Math.min(14, Math.round((Date.parse(date) - Date.parse(l[l.length - 1][0])) / DAY))); }
  h2hPpg(home, away) {
    const h = this.h2h.get(pairKey(home, away)); if (!h || !h.last.length) return 0;
    const last = h.last.slice(-5); let s = 0;
    for (const [, hm, hg, ag] of last) s += hm === home ? pts(hg, ag) : pts(ag, hg);
    return s / last.length - 1.37;
  }
  /** ctx: { eloGap, attH, defH, attA, defA, leagueHfa } from the rating models, read before the match. */
  features(home, away, date, ctx, rest) {
    const H = FeatureState.rolling(this.list(home)), A = FeatureState.rolling(this.list(away));
    const rh = rest?.home ?? this.rest(home, date), ra = rest?.away ?? this.rest(away, date);
    return [ctx.eloGap, ctx.attH - ctx.defA, ctx.attA - ctx.defH, H.form - A.form, H.gd - A.gd, H.homePpg, A.awayPpg,
      Math.max(-7, Math.min(7, rh - ra)), this.h2hPpg(home, away), ctx.leagueHfa];
  }
  update(home, away, date, hg, ag) {
    const push = (id, row) => { const l = this.recent.get(id) || []; l.push(row); if (l.length > 20) l.shift(); this.recent.set(id, l); };
    push(home, [date, 1, hg, ag, away]); push(away, [date, 0, ag, hg, home]);
    const k = pairKey(home, away), first = home < away ? home : away;
    const h = this.h2h.get(k) || { p: 0, w: [0, 0, 0], g: [0, 0], last: [] };
    h.p++; const fg = first === home ? hg : ag, sg = first === home ? ag : hg;
    h.w[fg > sg ? 0 : fg === sg ? 1 : 2]++; h.g[0] += fg; h.g[1] += sg;
    h.last.push([date, home, hg, ag]); if (h.last.length > 8) h.last.shift();
    this.h2h.set(k, h);
  }
}
