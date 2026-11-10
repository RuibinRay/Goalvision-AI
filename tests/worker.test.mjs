// Backend worker, exercised with a mocked provider and a mocked edge cache: caching, stale-on-error, validation, CORS, secrets.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map(); let calls = [], fail = false, payload = null;
globalThis.caches = { default: { async match(req) { const v = store.get(req.url); return v ? new Response(v) : undefined; }, async put(req, res) { store.set(req.url, await res.text()); } } };
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), headers: init?.headers || {} }); if (fail) return new Response('down', { status: 503 }); return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }); };
const worker = (await import('../backend/worker/src/index.js')).default;
const cf = { waitUntil: (p) => p }, env = { FOOTBALL_DATA_KEY: 'secret-fd-key', ALLOWED_ORIGINS: 'https://example.github.io' };
const get = async (path, e = env, headers = {}) => { const r = await worker.fetch(new Request('https://api.test' + path, { headers: { origin: 'https://example.github.io', 'cf-connecting-ip': '1.2.3.' + Math.floor(Math.random() * 250), ...headers } }), e, cf); return { status: r.status, body: await r.json(), headers: r.headers }; };
const MATCH = { id: 1, utcDate: '2026-11-21T15:00:00Z', status: 'FINISHED', competition: { code: 'PL', name: 'Premier League' }, homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal' }, awayTeam: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool' }, score: { duration: 'REGULAR', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } } };

test('health reports configured providers and never echoes a key', async () => {
  const r = await get('/v1/health'); assert.equal(r.status, 200); assert.equal(r.body.provider, 'football-data.org'); assert.deepEqual(r.body.providers, { footballData: true, apiFootball: false }); assert.ok(!JSON.stringify(r.body).includes('secret'));
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://example.github.io');
  assert.equal((await get('/v1/health', {})).body.provider, null); assert.equal((await get('/v1/matches?date=2026-11-21', {})).status, 503);
});
test('matches: normalised, validated, cached so visitors share one upstream call', async () => {
  calls = []; payload = { matches: [MATCH, { id: 2 }] };
  const a = await get('/v1/matches?date=2026-11-21&competition=eng.1'); assert.equal(a.status, 200); assert.equal(a.body.matches.length, 1, 'the malformed row is dropped'); assert.equal(a.body.matches[0].home.club, 'arsenal'); assert.equal(a.body.cached, false); assert.ok(a.body.fetchedAt);
  assert.equal(calls.length, 1); assert.equal(calls[0].headers['X-Auth-Token'], 'secret-fd-key'); assert.ok(calls[0].url.includes('/competitions/PL/matches?dateFrom=2026-11-21'));
  const b = await get('/v1/matches?date=2026-11-21&competition=eng.1'); assert.equal(b.body.cached, true); assert.equal(calls.length, 1, 'second visitor is served from cache');
});
test('stale data is served, and labelled, when the provider is down', async () => {
  const key = [...store.keys()].find((k) => k.includes('matches')), old = JSON.parse(store.get(key)); old.fetchedAt = new Date(Date.now() - 3600e3).toISOString(); store.set(key, JSON.stringify(old));
  fail = true; const r = await get('/v1/matches?date=2026-11-21&competition=eng.1'); fail = false;
  assert.equal(r.status, 200); assert.equal(r.body.stale, true); assert.equal(r.body.cached, true); assert.equal(r.body.matches.length, 1); assert.equal(r.body.fetchedAt, old.fetchedAt, 'the last successful refresh time is preserved');
});
test('errors are explicit: bad input, unknown routes, upstream failure without cache', async () => {
  assert.equal((await get('/v1/matches?date=yesterday')).status, 400); assert.equal((await get('/v1/standings?competition=nope')).status, 400); assert.equal((await get('/v1/unknown')).status, 404); assert.equal((await get('/v1/standings?competition=uel')).status, 404);
  fail = true; const r = await get('/v1/standings?competition=esp.1'); fail = false; assert.ok(r.status >= 500 || r.status === 429); assert.ok(r.body.error);
  const post = await worker.fetch(new Request('https://api.test/v1/health', { method: 'POST' }), env, cf); assert.equal(post.status, 405);
});
test('standings: normalised table with canonical clubs; malformed payload is rejected', async () => {
  payload = { standings: [{ type: 'TOTAL', table: [{ position: 1, team: { name: 'FC Bayern München', shortName: 'Bayern' }, playedGames: 10, won: 9, draw: 1, lost: 0, points: 28, goalsFor: 33, goalsAgainst: 7, goalDifference: 26 }] }] };
  const r = await get('/v1/standings?competition=ger.1'); assert.equal(r.body.table[0].club, 'bayern'); assert.equal(r.body.competition, 'ger.1');
  payload = { message: 'unexpected' }; assert.equal((await get('/v1/standings?competition=ita.1')).status, 502);
});
test('a single visitor cannot exhaust the backend', async () => {
  payload = { matches: [] }; let limited = 0; for (let i = 0; i < 80; i++) { const r = await worker.fetch(new Request('https://api.test/v1/health', { headers: { 'cf-connecting-ip': '9.9.9.9' } }), env, cf); if (r.status === 429) limited++; } assert.ok(limited > 0);
});
