/**
 * GOALVISION AI data backend (Cloudflare Worker).
 *
 *   Football API  →  this worker (key in env, cache, rate limit, retry, validate)  →  static frontend
 *
 * Routes (all GET, JSON, CORS):
 *   /v1/health                       which providers are configured
 *   /v1/matches?date=YYYY-MM-DD[&competition=eng.1]
 *   /v1/match/:id                    id = "fd:<n>" (football-data.org) or "af:<n>" (API-Football)
 *   /v1/standings?competition=eng.1
 *   /v1/scorers?competition=eng.1
 *   /v1/club/:clubId                 coach + squad (football-data.org)
 *
 * Secrets (wrangler secret put …): FOOTBALL_DATA_KEY, API_FOOTBALL_KEY (either or both).
 * Vars (wrangler.toml): ALLOWED_ORIGINS (comma separated, default "*"), SEASON (API-Football season year).
 * No key ever reaches the browser; every visitor shares one cached upstream response.
 */
import registry from '../../../data/registry.json' with { type: 'json' };
import { clubResolver, competitionMaps, fdMatch, fdStandings, fdScorers, afMatch, afStandings, afScorers, validMatch } from '../../../js/services/adapters.js';

const ctx = { resolve: clubResolver(registry), comps: competitionMaps(registry) };
const TTL = { live: 30, matches: 300, match: 60, standings: 600, scorers: 1800, club: 86400, teams: 86400 };
const IN_PLAY = new Set(['LIVE_1H', 'HT', 'LIVE_2H', 'ET', 'PENS']);

/* ── per-visitor rate limit: token bucket per IP (best effort, per isolate) ── */
const buckets = new Map();
function allow(ip, rate = 60, perSeconds = 60) {
  const now = Date.now(), b = buckets.get(ip) || { tokens: rate, at: now };
  b.tokens = Math.min(rate, b.tokens + (now - b.at) / 1000 * (rate / perSeconds)); b.at = now;
  if (b.tokens < 1) { buckets.set(ip, b); return false; }
  b.tokens -= 1; buckets.set(ip, b); if (buckets.size > 5000) buckets.clear();
  return true;
}
/* ── upstream budget: stay inside the provider's own limit (football-data.org free tier: 10 requests / minute) ── */
const budget = { fd: { max: 9, used: [], window: 60000 }, af: { max: 9, used: [], window: 60000 } };
function spend(p) { const b = budget[p], now = Date.now(); b.used = b.used.filter((t) => now - t < b.window); if (b.used.length >= b.max) return false; b.used.push(now); return true; }

async function upstream(provider, path, env) {
  const base = provider === 'fd' ? 'https://api.football-data.org/v4' : 'https://v3.football.api-sports.io';
  const headers = provider === 'fd' ? { 'X-Auth-Token': env.FOOTBALL_DATA_KEY } : { 'x-apisports-key': env.API_FOOTBALL_KEY };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!spend(provider)) throw Object.assign(new Error('Upstream request budget exhausted; serving cache where possible'), { status: 429 });
    try {
      const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(8000) });
      if (r.status === 429 || r.status >= 500) { lastErr = Object.assign(new Error(`Provider returned HTTP ${r.status}`), { status: 502 }); const ra = Number(r.headers.get('retry-after')); await new Promise((res) => setTimeout(res, Math.min(4000, (ra > 0 ? ra * 1000 : 400 * 2 ** attempt)))); continue; }
      if (!r.ok) throw Object.assign(new Error(`Provider returned HTTP ${r.status}`), { status: r.status === 403 ? 403 : 502 });
      const body = await r.json();
      if (provider === 'af' && body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length) throw Object.assign(new Error('API-Football: ' + Object.values(body.errors).join('; ')), { status: 502 });
      return body;
    } catch (e) { lastErr = e; if (e.status && e.status !== 502) throw e; await new Promise((res) => setTimeout(res, 300 * 2 ** attempt)); }
  }
  throw lastErr;
}

/** Cache wrapper: fresh → cached; stale → refetch; refetch fails → serve stale and say so. */
async function cached(request, key, ttl, produce, cfctx) {
  const cache = caches.default, ck = new Request(new URL('/__cache/' + key, request.url).toString());
  const hit = await cache.match(ck), old = hit ? await hit.json() : null;
  if (old && Date.now() - Date.parse(old.fetchedAt) < ttl * 1000) return { ...old, cached: true };
  try {
    const fresh = { ...(await produce()), fetchedAt: new Date().toISOString(), cached: false };
    cfctx.waitUntil(cache.put(ck, new Response(JSON.stringify(fresh), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=604800' } })));
    return fresh;
  } catch (e) { if (old) return { ...old, cached: true, stale: true, staleReason: e.message }; throw e; }
}
const pick = (env) => (env.API_FOOTBALL_KEY ? 'af' : env.FOOTBALL_DATA_KEY ? 'fd' : null);
const label = (p) => (p === 'af' ? 'API-Football' : 'football-data.org');
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

async function route(request, env, cfctx) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, ''), q = url.searchParams, season = env.SEASON || '2026';
  if (path === '/v1/health') return { ok: true, provider: pick(env) ? label(pick(env)) : null, providers: { footballData: !!env.FOOTBALL_DATA_KEY, apiFootball: !!env.API_FOOTBALL_KEY }, refreshSeconds: TTL.live, season };
  const p = pick(env); if (!p) throw bad('No provider key configured on the backend', 503);

  if (path === '/v1/matches') {
    const date = q.get('date'); if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw bad('date must be YYYY-MM-DD');
    const comp = q.get('competition') ? ctx.comps.byId[q.get('competition')] : null; if (q.get('competition') && !comp) throw bad('Unknown competition');
    const produce = async () => {
      let ms;
      if (p === 'af') ms = ((await upstream('af', `/fixtures?date=${date}${comp ? `&league=${comp.af}&season=${season}` : ''}`, env)).response || []).map((f) => afMatch(f, ctx));
      else { if (comp && !comp.fd) throw bad('That competition is not offered by football-data.org', 404); ms = ((await upstream('fd', comp ? `/competitions/${comp.fd}/matches?dateFrom=${date}&dateTo=${date}` : `/matches?date=${date}`, env)).matches || []).map((m) => fdMatch(m, ctx)); }
      ms = ms.filter(validMatch); if (p === 'af' && !comp) ms = ms.filter((m) => ctx.comps.byId[m.competition]);     // only supported competitions
      return { provider: label(p), date, refreshSeconds: TTL.live, matches: ms.sort((a, b) => String(a.utcDate).localeCompare(String(b.utcDate))) };
    };
    const key = `matches:${p}:${date}:${comp?.id || 'all'}`, first = await cached(request, key, TTL.live, produce, cfctx);
    return first;
  }
  let m;
  if ((m = path.match(/^\/v1\/match\/(fd|af):(\d+)$/))) {
    const [, prov, id] = m; if (prov === 'fd' ? !env.FOOTBALL_DATA_KEY : !env.API_FOOTBALL_KEY) throw bad('That provider is not configured', 503);
    return cached(request, `match:${prov}:${id}`, TTL.live, async () => {
      const match = prov === 'af' ? afMatch(((await upstream('af', `/fixtures?id=${id}`, env)).response || [])[0], ctx) : fdMatch(await upstream('fd', `/matches/${id}`, env), ctx);
      if (!validMatch(match)) throw bad('The provider returned a match in an unexpected shape', 502);
      return { provider: label(prov), refreshSeconds: IN_PLAY.has(match.status) ? TTL.live : TTL.match, match };
    }, cfctx);
  }
  if (path === '/v1/standings' || path === '/v1/scorers') {
    const comp = ctx.comps.byId[q.get('competition')]; if (!comp) throw bad('Unknown competition');
    const what = path.endsWith('standings') ? 'standings' : 'scorers';
    return cached(request, `${what}:${p}:${comp.id}`, TTL[what], async () => {
      let rows;
      if (p === 'af') { const body = await upstream('af', what === 'standings' ? `/standings?league=${comp.af}&season=${season}` : `/players/topscorers?league=${comp.af}&season=${season}`, env); rows = what === 'standings' ? afStandings(body, ctx) : afScorers(body); }
      else { if (!comp.fd) throw bad('That competition is not offered by football-data.org', 404); const body = await upstream('fd', `/competitions/${comp.fd}/${what}`, env); rows = what === 'standings' ? fdStandings(body, ctx) : fdScorers(body); }
      if (!rows) throw bad('The provider returned an unexpected shape', 502);
      return { provider: label(p), competition: comp.id, [what === 'standings' ? 'table' : 'scorers']: rows };
    }, cfctx);
  }
  if ((m = path.match(/^\/v1\/club\/([a-z0-9-]+)$/))) {
    const club = registry.clubs[m[1]]; if (!club) throw bad('Unknown club', 404); if (!env.FOOTBALL_DATA_KEY) throw bad('Squads need the football-data.org key', 503);
    const fdCode = ctx.comps.byId[club.league].fd;
    return cached(request, `club:${club.id}`, TTL.club, async () => {
      const teams = await cached(request, `teams:${fdCode}`, TTL.teams, async () => ({ teams: (await upstream('fd', `/competitions/${fdCode}/teams`, env)).teams || [] }), cfctx);
      const t = teams.teams.find((x) => ctx.resolve(x.name) === club.id || ctx.resolve(x.shortName) === club.id); if (!t) throw bad('The provider has no team matching this club', 404);
      return { provider: 'football-data.org', club: club.id, providerId: t.id, coach: t.coach?.name || null, venue: t.venue || null, founded: t.founded || null, squad: (t.squad || []).map((s) => ({ name: s.name, position: s.position || null, nationality: s.nationality || null, dateOfBirth: s.dateOfBirth || null })) };
    }, cfctx);
  }
  throw bad('Not found', 404);
}

export default {
  async fetch(request, env, cfctx) {
    const origin = request.headers.get('origin') || '', allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
    const cors = { 'access-control-allow-origin': allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0], 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'accept, content-type', vary: 'origin' };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!allow(request.headers.get('cf-connecting-ip') || 'anon')) return json({ error: 'Too many requests; slow down' }, 429);
    try { return json(await route(request, env, cfctx)); }
    catch (e) { return json({ error: e.message || 'Internal error' }, e.status && e.status >= 400 && e.status < 600 ? e.status : 500); }
  },
};
