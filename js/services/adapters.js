/**
 * Provider adapters: football-data.org v4 and API-Football v3 → one normalised shape.
 * Pure functions with no I/O, shared by the backend worker and the unit tests.
 *
 * Normalised match:
 *   { id, provider, competition, competitionName, utcDate, status, minute,
 *     home: { name, providerId, club }, away: {…},            club = canonical GOALVISION id or null
 *     score: { home, away, ht, et, pen }, goals[], cards[], subs[], var[], venue, referee, stats, lineups }
 * A field the provider does not send is null. Nothing is defaulted to a plausible-looking value.
 */
export const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SUFFIX = /\s+(fc|afc|cf|cfc|bc|sc)$/;

/** Build name → canonical club id from the registry's alias lists. Ambiguous or unknown names resolve to null. */
export function clubResolver(registry) {
  const map = new Map();
  for (const c of Object.values(registry.clubs)) for (const a of [c.name, c.short, ...c.aliases, c.name + ' FC']) { const k = fold(a); if (!map.has(k)) map.set(k, c.id); const k2 = k.replace(SUFFIX, ''); if (!map.has(k2)) map.set(k2, c.id); }
  return (name) => { const k = fold(name); return map.get(k) ?? map.get(k.replace(SUFFIX, '')) ?? null; };
}
/** Canonical competition id ↔ provider codes, straight from the registry. */
export function competitionMaps(registry) {
  const all = [...registry.leagues.map((l) => ({ id: l.id, name: l.name, fd: l.fd, af: l.af })), ...registry.competitions.map((c) => ({ id: c.id, name: c.name, fd: c.fd, af: c.af }))];
  return { byId: Object.fromEntries(all.map((c) => [c.id, c])), byFd: Object.fromEntries(all.filter((c) => c.fd).map((c) => [c.fd, c])), byAf: Object.fromEntries(all.filter((c) => c.af).map((c) => [String(c.af), c])) };
}
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const pair = (o) => (o && num(o.home) !== null && num(o.away) !== null ? [num(o.home), num(o.away)] : null);

/* ───────── football-data.org ───────── */
const FD_STATUS = { SCHEDULED: 'SCHEDULED', TIMED: 'SCHEDULED', IN_PLAY: 'LIVE', PAUSED: 'HT', EXTRA_TIME: 'ET', PENALTY_SHOOTOUT: 'PENS', FINISHED: 'FT', AWARDED: 'FT', POSTPONED: 'POSTPONED', SUSPENDED: 'SUSPENDED', CANCELLED: 'CANCELLED' };
export function fdMatch(m, ctx) {
  if (!m || !m.id || !m.homeTeam || !m.awayTeam) return null;
  const comp = ctx.comps.byFd[m.competition?.code], side = (teamId) => (teamId === m.homeTeam.id ? 'home' : 'away');
  let status = FD_STATUS[m.status] || 'SCHEDULED';
  if (status === 'LIVE') status = m.score?.halfTime?.home == null ? 'LIVE_1H' : 'LIVE_2H';
  if (status === 'FT' && m.score?.duration === 'EXTRA_TIME') status = 'AET';
  if (status === 'FT' && m.score?.duration === 'PENALTY_SHOOTOUT') status = 'FT_PEN';
  const team = (t) => ({ name: t.shortName || t.name || null, providerId: t.id ?? null, club: ctx.resolve(t.name) || ctx.resolve(t.shortName) });
  const ref = (m.referees || []).find((r) => r.type === 'REFEREE') || (m.referees || [])[0];
  return {
    id: 'fd:' + m.id, provider: 'football-data.org', competition: comp?.id || m.competition?.code || null, competitionName: m.competition?.name || comp?.name || null, utcDate: m.utcDate || null, status, minute: num(m.minute),
    home: team(m.homeTeam), away: team(m.awayTeam),
    score: { home: num(m.score?.fullTime?.home), away: num(m.score?.fullTime?.away), ht: pair(m.score?.halfTime), et: pair(m.score?.extraTime), pen: pair(m.score?.penalties) },
    goals: (m.goals || []).map((g) => ({ minute: num(g.minute), side: side(g.team?.id), player: g.scorer?.name || null, assist: g.assist?.name || null, kind: g.type === 'OWN' ? 'own' : g.type === 'PENALTY' ? 'penalty' : 'goal' })),
    cards: (m.bookings || []).map((b) => ({ minute: num(b.minute), side: side(b.team?.id), player: b.player?.name || null, kind: b.card === 'RED' ? 'red' : b.card === 'YELLOW_RED' ? 'second-yellow' : 'yellow' })),
    subs: (m.substitutions || []).map((s) => ({ minute: num(s.minute), side: side(s.team?.id), off: s.playerOut?.name || null, on: s.playerIn?.name || null })),
    var: [], venue: m.venue || null, referee: ref?.name || null, stats: null,
    lineups: m.homeTeam.lineup?.length ? { home: fdLineup(m.homeTeam), away: fdLineup(m.awayTeam) } : null,
  };
}
const fdLineup = (t) => ({ formation: t.formation || null, coach: t.coach?.name || null, start: (t.lineup || []).map((p) => ({ name: p.name, number: num(p.shirtNumber), position: p.position || null })), bench: (t.bench || []).map((p) => ({ name: p.name, number: num(p.shirtNumber), position: p.position || null })) });
/** The five leagues' own time zones: season files carry local kick-off dates and times, as the open archive does. */
const LEAGUE_TZ = { 'eng.1': 'Europe/London', 'esp.1': 'Europe/Madrid', 'ita.1': 'Europe/Rome', 'ger.1': 'Europe/Berlin', 'fra.1': 'Europe/Paris' };
function localKickoff(utc, tz) {
  const d = new Date(utc); if (!utc || Number.isNaN(+d)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return [`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`];
}
/**
 * A whole league season (GET /competitions/{code}/matches?season=YYYY) in the shape of data/leagues/<id>/<season>.json,
 * so every table, fixture list and club page can run on live results unchanged. Scores are taken only from finished
 * matches. One unknown club or malformed row rejects the whole season: a partial table would be worse than none.
 */
export function fdSeason(body, ctx, { league, season }) {
  const list = body?.matches; if (!Array.isArray(list) || !list.length) return null;
  const teams = [], index = new Map(), rows = [];
  const team = (t) => { const id = ctx.resolve(t?.name) ?? ctx.resolve(t?.shortName); if (!id) return -1; if (!index.has(id)) { index.set(id, teams.length); teams.push(id); } return index.get(id); };
  for (const m of list) {
    const when = localKickoff(m?.utcDate, LEAGUE_TZ[league]), h = team(m?.homeTeam), a = team(m?.awayTeam), md = num(m?.matchday);
    if (!when || h < 0 || a < 0 || h === a || md === null) return null;
    const done = m.status === 'FINISHED' || m.status === 'AWARDED', ft = done ? pair(m.score?.fullTime) : null, ht = ft ? pair(m.score?.halfTime) : null;
    rows.push([md, when[0], when[1], h, a, ft ? ft[0] : null, ft ? ft[1] : null, ht ? ht[0] : null, ht ? ht[1] : null]);
  }
  const key = (r) => `${String(r[0]).padStart(3, '0')} ${r[1]} ${r[2]}`;
  rows.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  const played = rows.filter((r) => r[5] !== null);
  return { league, season, source: 'football-data.org', sourceUrl: 'https://www.football-data.org/', live: true, lastResult: played.map((r) => r[1]).sort().at(-1) ?? null, played: played.length, teams, cols: ['md', 'date', 'time', 'home', 'away', 'hg', 'ag', 'hth', 'hta'], matches: rows };
}
export function fdStandings(body, ctx) {
  const total = (body?.standings || []).find((s) => s.type === 'TOTAL') || (body?.standings || [])[0];
  if (!total || !Array.isArray(total.table)) return null;
  return total.table.filter((r) => r.team && num(r.position) !== null).map((r) => ({ pos: r.position, name: r.team.shortName || r.team.name, club: ctx.resolve(r.team.name), p: num(r.playedGames), w: num(r.won), d: num(r.draw), l: num(r.lost), gf: num(r.goalsFor), ga: num(r.goalsAgainst), gd: num(r.goalDifference), pts: num(r.points) }));
}
export const fdScorers = (body) => (Array.isArray(body?.scorers) ? body.scorers.filter((s) => s.player?.name).map((s) => ({ name: s.player.name, team: s.team?.shortName || s.team?.name || null, goals: num(s.goals), assists: num(s.assists), penalties: num(s.penalties) })) : null);

/* ───────── API-Football ───────── */
const AF_STATUS = { TBD: 'SCHEDULED', NS: 'SCHEDULED', '1H': 'LIVE_1H', HT: 'HT', '2H': 'LIVE_2H', ET: 'ET', BT: 'ET', P: 'PENS', FT: 'FT', AET: 'AET', PEN: 'FT_PEN', PST: 'POSTPONED', CANC: 'CANCELLED', ABD: 'CANCELLED', SUSP: 'SUSPENDED', INT: 'SUSPENDED', LIVE: 'LIVE_1H', AWD: 'FT', WO: 'FT' };
const AF_STAT = { 'Ball Possession': 'possession', 'Total Shots': 'shots', 'Shots on Goal': 'shotsOnTarget', 'Corner Kicks': 'corners', Fouls: 'fouls', Offsides: 'offsides', 'Total passes': 'passes', 'Passes %': 'passAccuracy', 'Goalkeeper Saves': 'saves', expected_goals: 'xg', 'Yellow Cards': 'yellow', 'Red Cards': 'red' };
export function afMatch(f, ctx) {
  if (!f?.fixture?.id || !f.teams?.home || !f.teams?.away) return null;
  const comp = ctx.comps.byAf[String(f.league?.id)], side = (teamId) => (teamId === f.teams.home.id ? 'home' : 'away'), ev = f.events || [];
  const team = (t) => ({ name: t.name || null, providerId: t.id ?? null, club: ctx.resolve(t.name) });
  const stats = Array.isArray(f.statistics) && f.statistics.length === 2 ? Object.fromEntries(f.statistics.map((s) => [side(s.team?.id), Object.fromEntries((s.statistics || []).filter((x) => AF_STAT[x.type]).map((x) => [AF_STAT[x.type], x.value === null ? null : num(String(x.value).replace('%', ''))]))])) : null;
  const lu = (l) => ({ formation: l.formation || null, coach: l.coach?.name || null, start: (l.startXI || []).map((p) => ({ name: p.player?.name, number: num(p.player?.number), position: p.player?.pos || null })), bench: (l.substitutes || []).map((p) => ({ name: p.player?.name, number: num(p.player?.number), position: p.player?.pos || null })) });
  const lineups = Array.isArray(f.lineups) && f.lineups.length === 2 ? Object.fromEntries(f.lineups.map((l) => [side(l.team?.id), lu(l)])) : null;
  return {
    id: 'af:' + f.fixture.id, provider: 'API-Football', competition: comp?.id || (f.league?.id != null ? 'af-' + f.league.id : null), competitionName: f.league?.name || comp?.name || null, utcDate: f.fixture.date || null,
    status: AF_STATUS[f.fixture.status?.short] || 'SCHEDULED', minute: num(f.fixture.status?.elapsed), home: team(f.teams.home), away: team(f.teams.away),
    score: { home: num(f.goals?.home), away: num(f.goals?.away), ht: pair(f.score?.halftime), et: pair(f.score?.extratime), pen: pair(f.score?.penalty) },
    goals: ev.filter((e) => e.type === 'Goal' && e.detail !== 'Missed Penalty').map((e) => ({ minute: num(e.time?.elapsed), side: side(e.team?.id), player: e.player?.name || null, assist: e.assist?.name || null, kind: e.detail === 'Own Goal' ? 'own' : e.detail === 'Penalty' ? 'penalty' : 'goal' })),
    cards: ev.filter((e) => e.type === 'Card').map((e) => ({ minute: num(e.time?.elapsed), side: side(e.team?.id), player: e.player?.name || null, kind: /red/i.test(e.detail) ? (/second/i.test(e.detail) ? 'second-yellow' : 'red') : 'yellow' })),
    subs: ev.filter((e) => e.type === 'subst').map((e) => ({ minute: num(e.time?.elapsed), side: side(e.team?.id), off: e.player?.name || null, on: e.assist?.name || null })),
    var: ev.filter((e) => e.type === 'Var').map((e) => ({ minute: num(e.time?.elapsed), side: side(e.team?.id), detail: e.detail || null })),
    venue: f.fixture.venue?.name || null, referee: f.fixture.referee || null, stats: stats && stats.home && stats.away ? stats : null, lineups: lineups && lineups.home && lineups.away ? lineups : null,
  };
}
export function afStandings(body, ctx) {
  const t = body?.response?.[0]?.league?.standings?.[0];
  if (!Array.isArray(t)) return null;
  return t.filter((r) => r.team && num(r.rank) !== null).map((r) => ({ pos: r.rank, name: r.team.name, club: ctx.resolve(r.team.name), p: num(r.all?.played), w: num(r.all?.win), d: num(r.all?.draw), l: num(r.all?.lose), gf: num(r.all?.goals?.for), ga: num(r.all?.goals?.against), gd: num(r.goalsDiff), pts: num(r.points) }));
}
export const afScorers = (body) => (Array.isArray(body?.response) ? body.response.filter((r) => r.player?.name).map((r) => ({ name: r.player.name, team: r.statistics?.[0]?.team?.name || null, goals: num(r.statistics?.[0]?.goals?.total), assists: num(r.statistics?.[0]?.goals?.assists), penalties: num(r.statistics?.[0]?.penalty?.scored) })) : null);

/** Final gate before anything leaves the backend: reject payloads that are not what the UI expects. */
export function validMatch(m) {
  return !!m && typeof m.id === 'string' && typeof m.status === 'string' && m.home && m.away && typeof m.home.name === 'string' && typeof m.away.name === 'string'
    && (m.score.home === null || Number.isInteger(m.score.home)) && (m.score.away === null || Number.isInteger(m.score.away)) && Array.isArray(m.goals) && Array.isArray(m.cards);
}
