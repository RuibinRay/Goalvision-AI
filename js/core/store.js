/**
 * Data access. Everything the static site shows comes from dated JSON snapshots in /data (built by scripts/).
 * A view never talks to a provider directly: live data goes through services/live.js and the backend.
 */
const cache = new Map();
export const BASE = new URL('../../', import.meta.url).href;
export async function getJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(BASE + path).then((r) => { if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); }).catch((e) => { cache.delete(path); throw e; }));
  return cache.get(path);
}
export const asset = (p) => BASE + p;

export const SEASON = '2026-27';
let REG = null;
export async function loadRegistry() { REG ||= await getJSON('data/registry.json'); return REG; }
export const registry = () => REG;
export const leagues = () => REG.leagues;
export const league = (id) => REG.leagues.find((l) => l.id === id);
export const isLeague = (id) => !!league(id);
/** Canonical club record. Former top-flight clubs have a name but no crest; unknown ids fall back to the id. */
export function club(id) {
  const c = REG.clubs[id]; if (c) return c;
  const name = REG.pastClubs[id] || id;
  return { id, name, short: name, tla: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), past: true, colors: ['#8492A6', '#1B2430'] };
}
export const clubsOf = (lid) => Object.values(REG.clubs).filter((c) => c.league === lid);
export const allClubs = () => Object.values(REG.clubs);
export const flagCode = (country) => REG.flags[country] ?? null;

export const season = (lid, s = SEASON) => getJSON(`data/leagues/${lid}/${s}.json`);
export const currentSeasons = () => Promise.all(REG.leagues.map((l) => season(l.id)));
export const modelState = () => getJSON('data/models/state.json');
export const modelEval = () => getJSON('data/models/eval.json');
export const eloHistory = () => getJSON('data/models/elo_history.json');
export const SB_COMPS = [['wc2022', 'FIFA World Cup 2022'], ['euro2024', 'UEFA Euro 2024'], ['copa2024', 'Copa América 2024']];
export const sbIndex = (c) => getJSON(`data/sb/${c}/index.json`);
export const sbPlayers = (c) => getJSON(`data/sb/${c}/players.json`);
export const sbShots = (c) => getJSON(`data/sb/${c}/shots.json`);
export const sbLogs = (c) => getJSON(`data/sb/${c}/logs.json`);
export const sbMatch = (id) => getJSON(`data/sb/matches/${id}.json`);
export const worldCup = (y) => getJSON(`data/tournaments/worldcup/${y}.json`);
export const worldCupIndex = () => getJSON('data/tournaments/worldcup/index.json');
export const ucl = (s = '2025-26') => getJSON(`data/tournaments/ucl/${s}.json`);
export const playersArt = () => getJSON('data/players_art.json');

/* ── preferences (local only) ── */
const KEY = 'gv.prefs.v1';
const DEFAULTS = { clubs: [], players: [], leagues: [], watch: [], saved: [], theme: 'dark', motion: 'auto', backend: '' };
let prefs = null;
export function getPrefs() {
  if (!prefs) { try { prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { prefs = { ...DEFAULTS }; } }
  return prefs;
}
export function setPref(k, v) { getPrefs()[k] = v; try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode: keep in memory */ } document.dispatchEvent(new CustomEvent('prefs', { detail: { key: k } })); }
export function toggleIn(k, id) { const list = getPrefs()[k].slice(); const i = list.findIndex((x) => (x.id ?? x) === (id.id ?? id)); if (i >= 0) list.splice(i, 1); else list.push(id); setPref(k, list); return i < 0; }
export const isFav = (k, id) => getPrefs()[k].some((x) => (x.id ?? x) === id);

/* ── player artwork: bundled cut-outs first, then TheSportsDB lookup cached in the browser ── */
let artIndex = null; const artMem = new Map();
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
export async function playerArt(name) {
  if (!name) return null;
  artIndex ||= Object.fromEntries((await playersArt()).players.map((p) => [fold(p.name), { img: asset(p.img), team: p.team, born: p.born, nationality: p.nationality, position: p.position, source: 'TheSportsDB' }]));
  const k = fold(name);
  if (artIndex[k]) return artIndex[k];
  if (artMem.has(k)) return artMem.get(k);
  let hit = null;
  try { const s = sessionStorage.getItem('gv.art.' + k); if (s) hit = JSON.parse(s); } catch { /* ignore */ }
  if (!hit) {
    const p = fetch('https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=' + encodeURIComponent(name)).then((r) => r.json()).then((d) => {
      const m = (d.player || []).find((x) => x.strSport === 'Soccer' && fold(x.strPlayer) === k) || null;
      const out = m ? { img: m.strCutout || m.strThumb || null, cutout: !!m.strCutout, team: m.strTeam, born: m.dateBorn, nationality: m.strNationality, position: m.strPosition, source: 'TheSportsDB' } : { img: null };
      try { sessionStorage.setItem('gv.art.' + k, JSON.stringify(out)); } catch { /* ignore */ }
      return out;
    }).catch(() => ({ img: null }));
    artMem.set(k, p); return p;
  }
  artMem.set(k, hit); return hit;
}
