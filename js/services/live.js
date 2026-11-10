/**
 * Live data service. The static site never holds an API key: when a backend URL is configured the browser calls
 * the GOALVISION worker (backend/worker), which holds the key, caches upstream responses and rate-limits.
 * Without a backend the site runs in DEMO mode on the dated snapshot and says so.
 *
 * Normalised match shape (identical for football-data.org and API-Football, see services/adapters/*):
 *   { id, provider, competition, utcDate, status, minute, home:{name, club}, away:{…}, score:{home, away, ht, et, pen},
 *     goals:[…], cards:[…], subs:[…], venue, referee, stats, lineups }
 */
import { getPrefs } from '../core/store.js';
import { CONFIG } from '../core/config.js';

export const backendUrl = () => (getPrefs().backend || CONFIG.backend || '').replace(/\/+$/, '');
export const hasBackend = () => !!backendUrl();
let health = null, ready = false;
/**
 * LIVE means more than "a URL is configured": the backend must have answered and report a provider key.
 * A backend that is unreachable, or deployed without a key, leaves the whole site in DEMO mode.
 */
export const isLive = () => hasBackend() && ready;

async function call(path, { timeout = 9000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(backendUrl() + path, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.error || `Backend returned HTTP ${r.status}`);
    return body;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'The live backend did not answer in time' : e.message); } finally { clearTimeout(t); }
}
/** { ok, provider, refreshSeconds } or { ok:false, error, noKey? }. Cached for the session; also sets what isLive() reports. */
export async function backendHealth(force = false) {
  if (!hasBackend()) { ready = false; health = null; return { ok: false, error: 'No backend configured' }; }
  if (!health || force) {
    const mine = health = call('/v1/health')
      .then((h) => (h.provider ? { ok: true, ...h } : { ok: false, noKey: true, error: 'The backend is running but has no provider API key yet' }), (e) => ({ ok: false, error: e.message }))
      .then((h) => { if (health === mine) ready = h.ok; return h; });   // a newer check wins over a slow older one
  }
  return health;
}
export const liveMatches = (date, competition) => call(`/v1/matches?date=${date}${competition ? '&competition=' + encodeURIComponent(competition) : ''}`);
export const liveMatch = (id) => call('/v1/match/' + encodeURIComponent(id));
export const liveStandings = (competition) => call('/v1/standings?competition=' + encodeURIComponent(competition));
export const liveScorers = (competition) => call('/v1/scorers?competition=' + encodeURIComponent(competition));
export const liveSquad = (clubId) => call('/v1/club/' + encodeURIComponent(clubId));

export const STATUS_LABEL = { SCHEDULED: 'Scheduled', LIVE_1H: 'First half', HT: 'Half-time', LIVE_2H: 'Second half', ET: 'Extra time', PENS: 'Penalties', FT: 'Full time', AET: 'After extra time', FT_PEN: 'Full time (pens)', POSTPONED: 'Postponed', SUSPENDED: 'Suspended', CANCELLED: 'Cancelled' };
export const isInPlay = (s) => ['LIVE_1H', 'HT', 'LIVE_2H', 'ET', 'PENS'].includes(s);
