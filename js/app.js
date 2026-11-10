import { route, start, rerender } from './core/router.js';
import { loadRegistry, getPrefs, setPref } from './core/store.js';
import { mountNav, mountFooter, applyTheme } from './components/chrome.js';
import { hasBackend, backendHealth } from './services/live.js';
import './components/ui.js';

// Preferences that must apply before first paint: theme and motion.
const prefs = getPrefs();
applyTheme(prefs.theme === 'light' ? 'light' : 'dark');
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const applyMotion = () => document.body.classList.toggle('reduced-motion', getPrefs().motion === 'reduced' || (getPrefs().motion === 'auto' && osReduced));
applyMotion();
export const motionReduced = () => document.body.classList.contains('reduced-motion');
document.addEventListener('prefs', (e) => { if (e.detail.key === 'motion') { applyMotion(); rerender(); } });
document.addEventListener('theme-change', () => rerender());        // charts read their colours from the tokens
window.goalvision = { setBackend: (url) => setPref('backend', url), prefs: getPrefs };

route('/',                    () => import('./views/home.js'));
route('/live',                () => import('./views/live.js'));
route('/match/:id',           () => import('./views/match.js'));
route('/leagues',             () => import('./views/leagues.js'));
route('/league/:id',          () => import('./views/league.js'));
route('/ucl',                 () => import('./views/ucl.js'));
route('/worldcup',            () => import('./views/worldcup.js'));
route('/worldcup/:year',      () => import('./views/worldcup.js'));
route('/competition/:id',     () => import('./views/competition.js'));
route('/clubs',               () => import('./views/clubs.js'));
route('/club/:id',            () => import('./views/club.js'));
route('/players',             () => import('./views/players.js'));
route('/player/:comp/:id',    () => import('./views/player.js'));
route('/predictions',         () => import('./views/predictions.js'));
route('/compare',             () => import('./views/compare.js'));
route('/tactics',             () => import('./views/tactics.js'));
route('/datalab',             () => import('./views/datalab.js'));
route('/learn',               () => import('./views/learn.js'));
route('/learn/:topic',        () => import('./views/learn.js'));
route('/history',             () => import('./views/history.js'));
route('/dashboard',           () => import('./views/dashboard.js'));
route('/404',                 () => Promise.resolve({ title: 'Not found', render: (el) => { el.innerHTML = '<div class="container page-head"><h1>Offside</h1><p class="lead">That page does not exist. <a class="link" href="#/">Back to the centre circle</a>.</p></div>'; } }));

document.addEventListener('live-change', () => rerender());         // DEMO ↔ LIVE: pages drawn under the old mode redraw

try {
  // A configured backend counts as LIVE only once it answers with a provider. Give it a moment so the first
  // paint is in the right mode; if it is slower, the site starts in DEMO and redraws when the answer arrives.
  await Promise.all([loadRegistry(), hasBackend() && Promise.race([backendHealth(), new Promise((r) => setTimeout(r, 2500))])]);
  mountNav(document.getElementById('nav'));
  mountFooter(document.getElementById('footer'));
  start();
} catch (e) {
  console.error(e);
  document.getElementById('main').innerHTML = `<div class="container page-head"><h1>Data unavailable</h1><p class="lead">The data snapshot could not be loaded (${e.message}). If you opened this file directly from disk, serve the folder with a static server instead, for example <code>python3 -m http.server</code>.</p></div>`;
}
