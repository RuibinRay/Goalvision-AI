/**
 * League-table maths. A season file stores matches as rows [md, date, time, home, away, hg, ag, hth, hta] with club
 * indexes into `teams`; unplayed fixtures have null scores and are never counted.
 */
export const played = (m) => m[5] != null && m[6] != null;

/** @param venue 'all' | 'home' | 'away'   @param until ISO date (inclusive) or matchday number */
export function table(season, { venue = 'all', until = null, last = null } = {}) {
  const rows = season.teams.map((id, i) => ({ id, i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [], cs: 0, fts: 0 }));
  let ms = season.matches.filter(played);
  if (until != null) ms = ms.filter(m => (typeof until === 'number' ? m[0] <= until : m[1] <= until));
  const add = (r, gf, ga, m) => {
    r.p++; r.gf += gf; r.ga += ga; if (ga === 0) r.cs++; if (gf === 0) r.fts++;
    const res = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    r[res.toLowerCase()]++; r.pts += res === 'W' ? 3 : res === 'D' ? 1 : 0; r.form.push({ res, m });
  };
  if (last) {                                    // rolling window: each club's most recent N matches
    const per = season.teams.map(() => []);
    for (const m of ms) { if (venue !== 'away') per[m[3]].push(m); if (venue !== 'home') per[m[4]].push(m); }
    per.forEach((list, i) => list.slice(-last).forEach(m => (m[3] === i ? add(rows[i], m[5], m[6], m) : add(rows[i], m[6], m[5], m))));
  } else {
    for (const m of ms) { if (venue !== 'away') add(rows[m[3]], m[5], m[6], m); if (venue !== 'home') add(rows[m[4]], m[6], m[5], m); }
  }
  for (const r of rows) { r.gd = r.gf - r.ga; r.ppg = r.p ? r.pts / r.p : 0; }
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.id.localeCompare(b.id));
  rows.forEach((r, k) => (r.pos = k + 1));
  return rows;
}

/** Position after every completed matchday -> { clubId: [pos...] } for the season race chart. */
export function positionsByMatchday(season) {
  const mds = [...new Set(season.matches.filter(played).map(m => m[0]))].filter(v => v != null).sort((a, b) => a - b);
  const out = Object.fromEntries(season.teams.map(t => [t, []])), points = Object.fromEntries(season.teams.map(t => [t, []]));
  for (const md of mds) for (const r of table(season, { until: md })) { out[r.id].push(r.pos); points[r.id].push(r.pts); }
  return { matchdays: mds, positions: out, points };
}

/** Every played match of one club, oldest first, from that club's point of view. */
export function clubMatches(season, clubId) {
  const i = season.teams.indexOf(clubId); if (i < 0) return [];
  return season.matches.filter(m => played(m) && (m[3] === i || m[4] === i)).map(m => {
    const home = m[3] === i, gf = home ? m[5] : m[6], ga = home ? m[6] : m[5];
    return { md: m[0], date: m[1], home, opp: season.teams[home ? m[4] : m[3]], gf, ga, res: gf > ga ? 'W' : gf === ga ? 'D' : 'L', pts: gf > ga ? 3 : gf === ga ? 1 : 0 };
  });
}
export function clubFixtures(season, clubId, n = 6) {
  const i = season.teams.indexOf(clubId);
  return season.matches.filter(m => !played(m) && (m[3] === i || m[4] === i)).slice(0, n)
    .map(m => ({ md: m[0], date: m[1], time: m[2], home: m[3] === i, opp: season.teams[m[3] === i ? m[4] : m[3]] }));
}
/** Qualification / relegation zone for a 1-based position. */
export function zoneOf(pos, n, z) {
  if (!z) return null;
  let k = z.ucl || 0; if (pos <= k) return 'ucl';
  k += z.uclq || 0; if (pos <= k) return 'uclq';
  k += z.uel || 0; if (pos <= k) return 'uel';
  k += z.uecl || 0; if (pos <= k) return 'uecl';
  if (pos > n - (z.relegation || 0)) return 'rel';
  if (pos > n - (z.relegation || 0) - (z.playoff || 0)) return 'playoff';
  return null;
}
export const ZONE_LABEL = { ucl: 'Champions League', uclq: 'Champions League qualifying', uel: 'Europa League', uecl: 'Conference League', playoff: 'Relegation play-off', rel: 'Relegation' };

/** Champions League league phase: 36 clubs, eight matches, top 8 to the round of 16, 9-24 to the play-offs. */
export function uclLeaguePhase(data) {
  const rows = new Map(data.teams.map(t => [t.id, { ...t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, awayGf: 0, wins: 0, awayWins: 0, form: [] }]));
  for (const m of data.matches) {
    if (m.stage !== 'league' || !m.ft) continue;
    const h = rows.get(m.home), a = rows.get(m.away), [hg, ag] = m.ft;
    h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg; a.awayGf += ag;
    if (hg > ag) { h.w++; h.pts += 3; a.l++; h.form.push('W'); a.form.push('L'); }
    else if (hg < ag) { a.w++; a.pts += 3; h.l++; a.awayWins++; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  }
  const out = [...rows.values()];
  for (const r of out) r.gd = r.gf - r.ga;
  // UEFA order: points, goal difference, goals scored, away goals scored, wins, away wins
  out.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.awayGf - x.awayGf || y.w - x.w || y.awayWins - x.awayWins || x.name.localeCompare(y.name));
  out.forEach((r, i) => { r.pos = i + 1; r.zone = i < 8 ? 'r16' : i < 24 ? 'playoff' : 'out'; });
  return out;
}
/** Two-legged ties of a knockout stage -> [{ a, b, legs, agg:[a,b], winner }]. */
export function ties(data, stage) {
  const map = new Map();
  for (const m of data.matches.filter(x => x.stage === stage)) {
    const k = [m.home, m.away].sort().join('|');
    if (!map.has(k)) map.set(k, { a: m.home, b: m.away, legs: [], agg: [0, 0], winner: null });
    const t = map.get(k); t.legs.push(m);
    const s = m.et || m.ft; if (!s) continue;
    t.agg[m.home === t.a ? 0 : 1] += s[0]; t.agg[m.home === t.a ? 1 : 0] += s[1];
    if (m.pen) t.pen = m.home === t.a ? m.pen : [m.pen[1], m.pen[0]];
  }
  for (const t of map.values()) {
    if (t.legs.some(l => !l.ft)) continue;
    t.winner = t.agg[0] !== t.agg[1] ? (t.agg[0] > t.agg[1] ? t.a : t.b) : t.pen ? (t.pen[0] > t.pen[1] ? t.a : t.b) : null;
  }
  return [...map.values()];
}
