/**
 * Hash router: works on GitHub Pages with no server rewrites and keeps native back/forward.
 * Views export { render(el, params, query), destroy?, title?, fullBleed? }.
 */
import { disposeCharts } from '../charts/charts.js';
import { observeReveals } from './dom.js';

const routes = [];
let current = null, currentModule = null, seq = 0;

/* Which way a page enters. Sections follow the navigation order; a detail page belongs to its section. */
const ORDER = ['', 'live', 'leagues', 'clubs', 'players', 'predictions', 'compare', 'tactics', 'datalab', 'learn', 'history', 'dashboard'];
const SECTION = { match: 'live', league: 'leagues', ucl: 'leagues', worldcup: 'leagues', competition: 'leagues', club: 'clubs', player: 'players' };
function direction(from, to) {
  if (!from) return 'fade';
  const seg = (p) => p.split('/').filter(Boolean), a = seg(from.path), b = seg(to.path), sa = SECTION[a[0]] || a[0] || '', sb = SECTION[b[0]] || b[0] || '';
  if (!b.length) return 'fade';                                   // home has its own entrance
  if (sa === sb) { const da = a.length + (SECTION[a[0]] ? 1 : 0), db = b.length + (SECTION[b[0]] ? 1 : 0); return db > da ? 'in' : db < da ? 'out' : 'fade'; }
  return ORDER.indexOf(sb) >= ORDER.indexOf(sa) ? 'fwd' : 'back';
}

export function route(pattern, loader) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ pattern, re, keys, loader });
}
const safeDecode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
export function parse(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { const params = {}; r.keys.forEach((k, i) => (params[k] = safeDecode(m[i + 1]))); return { path, params, query, route: r }; }
  }
  return { path, params: {}, query, route: routes.find((r) => r.pattern === '/404') };
}
/** Update the query string of the current route without re-rendering (deep links for filters). */
export function setQuery(patch, { replace = true } = {}) {
  const info = parse(); const q = { ...info.query, ...patch };
  for (const k of Object.keys(q)) if (q[k] == null || q[k] === '') delete q[k];
  const qs = new URLSearchParams(q).toString(); const next = '#' + info.path + (qs ? '?' + qs : '');
  if (next === location.hash) return;
  silent = true;
  if (replace) history.replaceState(null, '', next); else location.hash = next;
  setTimeout(() => (silent = false), 0);
}
let silent = false;
export const navigate = (hash) => { if (location.hash === hash) handle(); else location.hash = hash; };
export const currentRoute = () => current;

async function handle() {
  if (silent) return;
  const main = document.getElementById('main'), info = parse(), mine = ++seq, enter = direction(current, info);
  const settled = () => document.dispatchEvent(new CustomEvent('route:done', { detail: info }));   // the page is drawn (or failed): transitions may lift
  if (currentModule?.destroy) { try { currentModule.destroy(); } catch (e) { console.warn(e); } }
  currentModule = null; disposeCharts();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.body.dataset.route = info.path.split('/')[1] || 'home';
  main.innerHTML = '<div class="loading" aria-busy="true"><div class="skeleton" style="height:54px;width:min(520px,80%)"></div><div class="skeleton" style="height:220px"></div><div class="skeleton" style="height:160px"></div></div>';
  let mod;
  try { mod = await info.route.loader(); } catch (e) { console.error(e); main.innerHTML = `<div class="container section"><div class="error">This page failed to load: ${e.message}. <a class="link" href="#/">Back to the pitch</a></div></div>`; settled(); return; }
  if (mine !== seq) return;
  currentModule = mod; current = info;
  main.classList.toggle('no-pad', !!mod.fullBleed);
  const view = document.createElement('div'); view.className = 'view'; view.dataset.enter = enter;
  document.title = (mod.title ? (typeof mod.title === 'function' ? mod.title(info.params) : mod.title) + ' · ' : '') + 'GOALVISION AI';
  document.dispatchEvent(new CustomEvent('route', { detail: info }));
  try {
    main.replaceChildren(view);            // attached first: charts and canvases need real dimensions
    await mod.render(view, info.params, info.query);
    if (mine !== seq) return;
    observeReveals(view);
  } catch (e) { console.error(e); main.innerHTML = `<div class="container section"><div class="error">This view hit an error: ${e.message}</div></div>`; }
  if (mine === seq) settled();
}
export function start() { window.addEventListener('hashchange', handle); handle(); }
export const rerender = () => handle();
