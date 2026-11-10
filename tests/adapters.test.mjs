// Provider adapters: football-data.org and API-Football payloads → the normalised GOALVISION shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clubResolver, competitionMaps, fdMatch, fdStandings, fdScorers, afMatch, afStandings, afScorers, validMatch } from '../js/services/adapters.js';

const registry = JSON.parse(readFileSync(new URL('../data/registry.json', import.meta.url), 'utf8'));
const ctx = { resolve: clubResolver(registry), comps: competitionMaps(registry) };

test('club names from any provider resolve to one canonical id, never to the wrong club', () => {
  const cases = { 'Arsenal FC': 'arsenal', 'Manchester United FC': 'man-united', 'Manchester City': 'man-city', 'FC Internazionale Milano': 'inter', 'Inter': 'inter', 'AC Milan': 'milan', 'Club Atlético de Madrid': 'atletico', 'Athletic Club': 'athletic',
    'Real Madrid CF': 'real-madrid', 'Real Sociedad de Fútbol': 'real-sociedad', 'Real Betis Balompié': 'betis', '1. FC Köln': 'koln', 'FC Bayern München': 'bayern', 'Bayern Munich': 'bayern', 'Borussia Mönchengladbach': 'gladbach', 'Borussia Dortmund': 'dortmund',
    'Paris Saint-Germain FC': 'psg', 'Paris FC': 'paris-fc', 'Olympique de Marseille': 'marseille', 'Olympique Lyonnais': 'lyon', 'Tottenham': 'tottenham', 'Brighton & Hove Albion FC': 'brighton', 'SV 07 Elversberg': 'elversberg', 'RC Deportivo La Coruña': 'deportivo', 'Deportivo Alavés': 'alaves' };
  for (const [name, id] of Object.entries(cases)) assert.equal(ctx.resolve(name), id, name);
  for (const unknown of ['Qarabağ Ağdam FK', 'Real', 'Manchester', 'Sporting CP', '']) assert.equal(ctx.resolve(unknown), null, unknown);
});
test('every registry club resolves to itself by name, short name and aliases', () => {
  for (const c of Object.values(registry.clubs)) for (const a of [c.name, ...c.aliases]) assert.equal(ctx.resolve(a), c.id, `${a} → ${c.id}`);
});
test('competition codes map both ways', () => {
  assert.equal(ctx.comps.byFd.PL.id, 'eng.1'); assert.equal(ctx.comps.byAf['140'].id, 'esp.1'); assert.equal(ctx.comps.byId.ucl.af, 2); assert.equal(ctx.comps.byFd.CL.id, 'ucl'); assert.equal(ctx.comps.byId['ger.1'].fd, 'BL1');
});

const FD = { id: 497410, utcDate: '2026-11-21T15:00:00Z', status: 'IN_PLAY', minute: 67, matchday: 12, competition: { id: 2021, name: 'Premier League', code: 'PL' },
  homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' }, awayTeam: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV' },
  score: { winner: null, duration: 'REGULAR', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 1 } }, referees: [{ name: 'Fourth Official', type: 'FOURTH_OFFICIAL' }, { name: 'Michael Oliver', type: 'REFEREE' }], venue: 'Emirates Stadium',
  goals: [{ minute: 12, team: { id: 57 }, scorer: { name: 'B. Saka' }, assist: { name: 'M. Ødegaard' }, type: 'REGULAR' }, { minute: 40, team: { id: 64 }, scorer: { name: 'M. Salah' }, assist: null, type: 'PENALTY' }, { minute: 58, team: { id: 64 }, scorer: { name: 'V. van Dijk' }, type: 'OWN' }],
  bookings: [{ minute: 33, team: { id: 64 }, player: { name: 'A. Mac Allister' }, card: 'YELLOW' }, { minute: 61, team: { id: 64 }, player: { name: 'A. Mac Allister' }, card: 'YELLOW_RED' }], substitutions: [{ minute: 60, team: { id: 57 }, playerOut: { name: 'K. Havertz' }, playerIn: { name: 'G. Jesus' } }] };
test('football-data.org match → normalised match', () => {
  const m = fdMatch(FD, ctx); assert.ok(validMatch(m));
  assert.equal(m.id, 'fd:497410'); assert.equal(m.competition, 'eng.1'); assert.equal(m.status, 'LIVE_2H'); assert.equal(m.minute, 67); assert.equal(m.home.club, 'arsenal'); assert.equal(m.away.club, 'liverpool');
  assert.deepEqual(m.score, { home: 2, away: 1, ht: [1, 1], et: null, pen: null }); assert.equal(m.referee, 'Michael Oliver'); assert.equal(m.venue, 'Emirates Stadium');
  assert.deepEqual(m.goals.map((g) => [g.minute, g.side, g.kind]), [[12, 'home', 'goal'], [40, 'away', 'penalty'], [58, 'away', 'own']]);
  assert.deepEqual(m.cards.map((c) => c.kind), ['yellow', 'second-yellow']); assert.deepEqual(m.subs[0], { minute: 60, side: 'home', off: 'K. Havertz', on: 'G. Jesus' });
  assert.equal(m.stats, null, 'statistics the provider did not send stay null'); assert.equal(m.lineups, null);
});
test('football-data.org statuses: first half, finished, extra time, penalties, postponed, missing scores', () => {
  const st = (patch) => fdMatch({ ...FD, ...patch }, ctx).status;
  assert.equal(st({ score: { fullTime: { home: 0, away: 0 }, halfTime: { home: null, away: null } } }), 'LIVE_1H'); assert.equal(st({ status: 'PAUSED' }), 'HT'); assert.equal(st({ status: 'FINISHED' }), 'FT');
  assert.equal(st({ status: 'FINISHED', score: { ...FD.score, duration: 'EXTRA_TIME' } }), 'AET'); assert.equal(st({ status: 'FINISHED', score: { ...FD.score, duration: 'PENALTY_SHOOTOUT', penalties: { home: 4, away: 3 } } }), 'FT_PEN'); assert.equal(st({ status: 'POSTPONED' }), 'POSTPONED'); assert.equal(st({ status: 'TIMED' }), 'SCHEDULED');
  const sched = fdMatch({ ...FD, status: 'TIMED', minute: undefined, score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } }, goals: undefined, bookings: undefined }, ctx);
  assert.equal(sched.score.home, null); assert.equal(sched.minute, null); assert.deepEqual(sched.goals, []); assert.ok(validMatch(sched));
  assert.equal(fdMatch({ id: 1 }, ctx), null); assert.equal(fdMatch(null, ctx), null);
});
test('football-data.org standings and scorers', () => {
  const t = fdStandings({ standings: [{ type: 'HOME', table: [] }, { type: 'TOTAL', table: [{ position: 1, team: { name: 'Arsenal FC', shortName: 'Arsenal' }, playedGames: 11, won: 8, draw: 2, lost: 1, points: 26, goalsFor: 24, goalsAgainst: 8, goalDifference: 16 }, { position: 2, team: { name: 'Unknown Town', shortName: 'Unknown' }, playedGames: 11, won: 7, draw: 3, lost: 1, points: 24, goalsFor: 20, goalsAgainst: 9, goalDifference: 11 }] }] }, ctx);
  assert.deepEqual(t[0], { pos: 1, name: 'Arsenal', club: 'arsenal', p: 11, w: 8, d: 2, l: 1, gf: 24, ga: 8, gd: 16, pts: 26 }); assert.equal(t[1].club, null); assert.equal(fdStandings({}, ctx), null);
  assert.deepEqual(fdScorers({ scorers: [{ player: { name: 'E. Haaland' }, team: { shortName: 'Man City' }, goals: 14, assists: 2, penalties: 3 }, { player: {} }] }), [{ name: 'E. Haaland', team: 'Man City', goals: 14, assists: 2, penalties: 3 }]); assert.equal(fdScorers({}), null);
});

const AF = { fixture: { id: 1208021, date: '2026-11-21T15:00:00+00:00', status: { long: 'Second Half', short: '2H', elapsed: 67 }, venue: { name: 'Estadio Santiago Bernabéu', city: 'Madrid' }, referee: 'J. Gil Manzano' }, league: { id: 140, name: 'La Liga', season: 2026 },
  teams: { home: { id: 541, name: 'Real Madrid' }, away: { id: 529, name: 'Barcelona' } }, goals: { home: 1, away: 2 }, score: { halftime: { home: 1, away: 0 }, fulltime: { home: null, away: null }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
  events: [{ time: { elapsed: 9 }, team: { id: 541 }, player: { name: 'K. Mbappé' }, assist: { name: 'J. Bellingham' }, type: 'Goal', detail: 'Normal Goal' }, { time: { elapsed: 30 }, team: { id: 529 }, player: { name: 'R. Lewandowski' }, assist: {}, type: 'Goal', detail: 'Missed Penalty' }, { time: { elapsed: 52 }, team: { id: 529 }, player: { name: 'L. Yamal' }, assist: {}, type: 'Goal', detail: 'Penalty' },
    { time: { elapsed: 55 }, team: { id: 541 }, player: { name: 'A. Rüdiger' }, type: 'Card', detail: 'Red Card' }, { time: { elapsed: 56 }, team: { id: 541 }, player: { name: 'Goal cancelled' }, type: 'Var', detail: 'Goal Disallowed - offside' }, { time: { elapsed: 60 }, team: { id: 529 }, player: { name: 'Pedri' }, assist: { name: 'Gavi' }, type: 'subst', detail: 'Substitution 1' }, { time: { elapsed: 64 }, team: { id: 541 }, player: { name: 'D. Huijsen' }, assist: {}, type: 'Goal', detail: 'Own Goal' }],
  statistics: [{ team: { id: 541 }, statistics: [{ type: 'Ball Possession', value: '44%' }, { type: 'Total Shots', value: 9 }, { type: 'Shots on Goal', value: 3 }, { type: 'expected_goals', value: '0.87' }, { type: 'Passes %', value: '86%' }, { type: 'Offsides', value: null }] }, { team: { id: 529 }, statistics: [{ type: 'Ball Possession', value: '56%' }, { type: 'Total Shots', value: 14 }, { type: 'Shots on Goal', value: 6 }, { type: 'expected_goals', value: '1.92' }, { type: 'Passes %', value: '90%' }, { type: 'Offsides', value: 2 }] }],
  lineups: [{ team: { id: 541 }, coach: { name: 'X. Alonso' }, formation: '4-3-3', startXI: [{ player: { name: 'T. Courtois', number: 1, pos: 'G' } }], substitutes: [{ player: { name: 'A. Lunin', number: 13, pos: 'G' } }] }, { team: { id: 529 }, coach: { name: 'H. Flick' }, formation: '4-2-3-1', startXI: [{ player: { name: 'J. García', number: 13, pos: 'G' } }], substitutes: [] }] };
test('API-Football fixture → normalised match with events, statistics and line-ups', () => {
  const m = afMatch(AF, ctx); assert.ok(validMatch(m));
  assert.equal(m.id, 'af:1208021'); assert.equal(m.competition, 'esp.1'); assert.equal(m.status, 'LIVE_2H'); assert.equal(m.home.club, 'real-madrid'); assert.equal(m.away.club, 'barcelona'); assert.deepEqual(m.score, { home: 1, away: 2, ht: [1, 0], et: null, pen: null });
  assert.deepEqual(m.goals.map((g) => [g.minute, g.side, g.kind, g.player]), [[9, 'home', 'goal', 'K. Mbappé'], [52, 'away', 'penalty', 'L. Yamal'], [64, 'home', 'own', 'D. Huijsen']], 'a missed penalty is not a goal');
  assert.deepEqual(m.cards, [{ minute: 55, side: 'home', player: 'A. Rüdiger', kind: 'red' }]); assert.equal(m.var.length, 1); assert.deepEqual(m.subs[0], { minute: 60, side: 'away', off: 'Pedri', on: 'Gavi' });
  assert.deepEqual(m.stats.home, { possession: 44, shots: 9, shotsOnTarget: 3, xg: 0.87, passAccuracy: 86, offsides: null }); assert.equal(m.stats.away.xg, 1.92); assert.equal(m.stats.home.corners, undefined, 'a statistic that was not sent is absent, not zero');
  assert.equal(m.lineups.home.formation, '4-3-3'); assert.equal(m.lineups.away.coach, 'H. Flick'); assert.equal(m.lineups.home.bench[0].name, 'A. Lunin'); assert.equal(m.venue, 'Estadio Santiago Bernabéu');
});
test('API-Football statuses and missing sections', () => {
  const st = (short) => afMatch({ ...AF, fixture: { ...AF.fixture, status: { short, elapsed: null } } }, ctx).status;
  assert.deepEqual(['NS', '1H', 'HT', 'ET', 'P', 'FT', 'AET', 'PEN', 'PST', 'CANC'].map(st), ['SCHEDULED', 'LIVE_1H', 'HT', 'ET', 'PENS', 'FT', 'AET', 'FT_PEN', 'POSTPONED', 'CANCELLED']);
  const bare = afMatch({ ...AF, events: undefined, statistics: undefined, lineups: undefined, league: { id: 99999, name: 'Unmapped Cup' } }, ctx); assert.equal(bare.stats, null); assert.equal(bare.lineups, null); assert.deepEqual(bare.goals, []); assert.equal(bare.competition, 'af-99999'); assert.equal(afMatch({}, ctx), null);
});
test('API-Football standings and scorers', () => {
  const t = afStandings({ response: [{ league: { standings: [[{ rank: 1, team: { id: 541, name: 'Real Madrid' }, points: 30, goalsDiff: 18, all: { played: 12, win: 9, draw: 3, lose: 0, goals: { for: 28, against: 10 } } }]] } }] }, ctx);
  assert.deepEqual(t, [{ pos: 1, name: 'Real Madrid', club: 'real-madrid', p: 12, w: 9, d: 3, l: 0, gf: 28, ga: 10, gd: 18, pts: 30 }]); assert.equal(afStandings({ response: [] }, ctx), null);
  assert.deepEqual(afScorers({ response: [{ player: { name: 'K. Mbappé' }, statistics: [{ team: { name: 'Real Madrid' }, goals: { total: 13, assists: 4 }, penalty: { scored: 2 } }] }] }), [{ name: 'K. Mbappé', team: 'Real Madrid', goals: 13, assists: 4, penalties: 2 }]);
});
test('validMatch rejects malformed payloads', () => {
  const ok = fdMatch(FD, ctx); assert.ok(validMatch(ok)); assert.ok(!validMatch(null)); assert.ok(!validMatch({ ...ok, score: { ...ok.score, home: 1.5 } })); assert.ok(!validMatch({ ...ok, home: { name: null } })); assert.ok(!validMatch({ ...ok, goals: 'none' }));
});
