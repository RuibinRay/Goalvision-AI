// Daily refresh safeguards: a season from the backend replaces the bundled file only when it is complete and no older.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSeason, toSnapshot, sameData } from '../scripts/refresh_daily.mjs';

const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const registry = read('data/registry.json'), current = read(`data/leagues/eng.1/${registry.season}.json`);
const clubs = Object.values(registry.clubs).filter((c) => c.league === 'eng.1').map((c) => c.id);
const copy = (o) => JSON.parse(JSON.stringify(o)), TODAY = '2099-01-01';

test('the bundled season passes its own refresh check, for every league', () => {
  for (const lg of registry.leagues) {
    const s = read(`data/leagues/${lg.id}/${registry.season}.json`), ids = Object.values(registry.clubs).filter((c) => c.league === lg.id).map((c) => c.id);
    assert.deepEqual(checkSeason(s, s, ids, TODAY), [], lg.id);
    const entry = lg.seasons.find((x) => x.season === registry.season);
    assert.deepEqual([entry.matches, entry.played, entry.lastResult, entry.teams], [s.matches.length, s.played, s.lastResult, s.teams.length], `${lg.id}: registry summary matches the season file`);
  }
});

test('a refresh is refused when it would lose results, clubs or fixtures, or is malformed', () => {
  const refused = (mutate, re) => { const next = copy(current); mutate(next); const p = checkSeason(next, current, clubs, TODAY); assert.ok(p.length && re.test(p.join(' | ')), `expected ${re}, got ${JSON.stringify(p)}`); };
  refused((s) => { const m = s.matches.find((x) => x[5] !== null); m[5] = m[6] = m[7] = m[8] = null; }, /fewer results/);
  refused((s) => { s.teams[0] = 'real-madrid'; }, /clubs do not match/);
  refused((s) => { s.teams.pop(); }, /clubs do not match/);
  refused((s) => { s.matches.pop(); }, /fixtures/);
  refused((s) => { s.matches[0][1] = '21/08/2026'; }, /malformed row/);
  refused((s) => { s.matches[0][4] = s.matches[0][3]; }, /malformed row/);
  refused((s) => { const m = s.matches.find((x) => x[5] !== null); m[7] = m[5] + 1; }, /bad score/);
  refused((s) => { const m = s.matches.find((x) => x[5] === null); m[7] = 1; m[8] = 0; }, /half-time score without a result/);
  refused((s) => { s.matches[1][3] = s.matches[0][3]; s.matches[1][4] = s.matches[0][4]; }, /same fixture twice/);
  assert.match(checkSeason(current, current, clubs, '2026-08-01').join(' | '), /dated in the future/);
  assert.deepEqual(checkSeason(null, current, clubs), ['the backend did not return a season']);
});

test('new results are accepted, stored in the snapshot shape, and detected as a change', () => {
  const next = copy(current), m = next.matches.find((x) => x[5] === null);
  Object.assign(next, { live: true, cached: true, provider: 'football-data.org', fetchedAt: '2098-12-31T05:40:00Z' });
  m[1] = '2098-12-30'; m[5] = 2; m[6] = 1; m[7] = 1; m[8] = 0;
  assert.deepEqual(checkSeason(next, current, clubs, TODAY), []);
  const snap = toSnapshot(next, 'eng.1', registry.season);
  assert.deepEqual(Object.keys(snap), ['league', 'season', 'source', 'sourceUrl', 'fetchedAt', 'lastResult', 'played', 'teams', 'cols', 'matches']);
  assert.equal(snap.played, current.played + 1); assert.equal(snap.lastResult, '2098-12-30'); assert.ok(!('live' in snap) && !('cached' in snap));
  assert.equal(sameData(current, snap), false); assert.equal(sameData(current, toSnapshot(copy(current), 'eng.1', registry.season)), true);
});
