/** App chrome: navigation bar, footer and the search palette (clubs, players, competitions, pages). */
import { $, $$, esc, html, ICON, fmt } from '../core/dom.js';
import { NAV, CONFIG } from '../core/config.js';
import { allClubs, leagues, registry, getPrefs, setPref, sbPlayers, SB_COMPS, league, SEASON } from '../core/store.js';
import { isLive, hasBackend, backendHealth } from '../services/live.js';
import { crest } from './ui.js';

export function mountNav(el) {
  el.innerHTML = html`
    <a class="brand" href="#/" aria-label="GOALVISION AI home">${ICON.ball}<span>GOALVISION <b>AI</b></span></a>
    <nav class="nav-links" id="nav-links" aria-label="Primary">${NAV.map(([p, l]) => `<a href="#${p}" data-path="${p}">${l}</a>`)}</nav>
    <div class="nav-tools">
      <button class="status-chip" id="status-chip" type="button" title="Data connection"><i></i><span>DEMO</span></button>
      <button class="icon-btn" id="btn-search" type="button" aria-label="Search clubs, players and pages" title="Search ( / )">${ICON.search}</button>
      <button class="icon-btn" id="btn-theme" type="button" aria-label="Switch between dark and light theme" title="Theme">${ICON.sun}</button>
      <button class="icon-btn nav-burger" id="btn-menu" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">${ICON.menu}</button>
    </div>`;
  const setActive = (path) => {
    const top = '/' + (path.split('/')[1] || '');
    const map = { '/club': '/clubs', '/league': '/leagues', '/player': '/players', '/match': '/live', '/worldcup': '/leagues', '/ucl': '/leagues', '/competition': '/leagues' };
    const cur = map[top] || top;
    $$('a', $('#nav-links')).forEach((a) => (a.dataset.path === cur ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  };
  document.addEventListener('route', (e) => { setActive(e.detail.path); el.classList.remove('open'); $('#btn-menu').setAttribute('aria-expanded', 'false'); onScroll(); });
  const onScroll = () => el.classList.toggle('solid', scrollY > 24 || document.body.dataset.route !== 'home');
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('#btn-menu').addEventListener('click', () => { const o = el.classList.toggle('open'); $('#btn-menu').setAttribute('aria-expanded', o); });
  $('#btn-theme').addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(next); setPref('theme', next); document.dispatchEvent(new CustomEvent('theme-change')); });
  $('#btn-search').addEventListener('click', openPalette);
  $('#status-chip').addEventListener('click', () => (location.hash = '#/dashboard?tab=data'));
  addEventListener('keydown', (ev) => {
    if ((ev.key === '/' || (ev.key === 'k' && (ev.metaKey || ev.ctrlKey))) && !/input|textarea|select/i.test(document.activeElement.tagName)) { ev.preventDefault(); openPalette(); }
    if (ev.key === 'Escape') { closePalette(); el.classList.remove('open'); }
  });
  refreshStatus(); document.addEventListener('prefs', (e) => { if (e.detail.key === 'backend') refreshStatus(true); });
}
export const applyTheme = (t) => { document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#070B16' : '#EDF1F6'); };
async function refreshStatus(force = false) {
  const chip = $('#status-chip'); if (!chip) return;
  const was = isLive(), h = hasBackend() ? await backendHealth(force) : null, label = chip.querySelector('span');
  chip.classList.toggle('live', !!h?.ok);
  if (h?.ok) { label.textContent = 'LIVE'; chip.title = `Live data via ${h.provider}`; }
  else if (h) { label.textContent = h.noKey ? 'DEMO · no API key' : 'DEMO · backend offline'; chip.title = `${h.error}. The site is using the dated snapshot.`; }
  else { label.textContent = 'DEMO'; chip.title = `DEMO mode: dated data snapshot (league results to ${fmt.date(registry().leagues[0].seasons.at(-1).lastResult)}). Connect a backend for live data.`; }
  if (was !== isLive()) document.dispatchEvent(new CustomEvent('live-change'));   // pages drawn under the old mode redraw
}

export function mountFooter(el) {
  const reg = registry();
  el.innerHTML = html`<div class="footer-in">
    <div><div class="wordmark">Goalvision <b>AI</b></div><p class="muted small" style="max-width:44ch">Beyond the final whistle. An independent, educational football analytics project: not affiliated with FIFA, UEFA, any league or any club. Forecasts are statistical estimates, never guarantees, and are not betting advice.</p></div>
    <div><h4>Explore</h4><ul>${NAV.slice(1, 7).map(([p, l]) => `<li><a href="#${p}">${l}</a></li>`)}</ul></div>
    <div><h4>Analyse</h4><ul>${NAV.slice(7).map(([p, l]) => `<li><a href="#${p}">${l}</a></li>`)}<li><a href="#/predictions?tab=validation">Model validation</a></li></ul></div>
    <div><h4>Data and credits</h4><ul>
      <li><a href="https://github.com/openfootball" target="_blank" rel="noopener">openfootball</a> · results, fixtures (CC0)</li>
      <li><a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener">StatsBomb Open Data</a> · event data</li>
      <li><a href="https://www.thesportsdb.com" target="_blank" rel="noopener">TheSportsDB</a> · player cut-outs</li>
      <li><a href="https://flagcdn.com" target="_blank" rel="noopener">Flagcdn</a> · national flags</li>
      <li>Club crests are trademarks of their owners, shown for identification only.</li></ul></div>
    <div class="legal"><span>Data refreshed ${fmt.stamp(reg.generatedAt)} · season ${fmt.season(SEASON)}</span><span>Built with HTML, CSS, JavaScript, Three.js, GSAP and ECharts${CONFIG.repo && ` · <a class="link" href="${esc(CONFIG.repo)}" target="_blank" rel="noopener">Source on GitHub</a>`}</span></div>
  </div>`;
}

/* ── search palette ── */
let index = null, sel = 0;
async function buildIndex() {
  const items = [];
  for (const [p, l] of NAV) items.push({ t: l, s: 'Page', h: '#' + p, k: l.toLowerCase() });
  for (const l of leagues()) items.push({ t: l.name, s: l.country, h: '#/league/' + l.id, k: (l.name + ' ' + l.country).toLowerCase() });
  items.push({ t: 'UEFA Champions League', s: 'Competition', h: '#/ucl', k: 'uefa champions league ucl' }, { t: 'FIFA World Cup', s: 'Competition', h: '#/worldcup', k: 'fifa world cup' });
  for (const c of allClubs()) items.push({ t: c.name, s: league(c.league).name, h: '#/club/' + c.id, k: [c.name, c.short, c.tla, ...c.aliases].join(' ').toLowerCase(), club: c.id });
  index = items;
  for (const [comp, name] of SB_COMPS) sbPlayers(comp).then((d) => { for (const p of d.players) index.push({ t: p.n, s: `${p.t} · ${name}`, h: `#/player/${comp}/${p.id}`, k: (p.n + ' ' + p.full + ' ' + p.t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase() }); }).catch(() => {});
}
function openPalette() {
  const p = $('#palette'); if (!p.hidden) return;
  if (!index) buildIndex();
  p.hidden = false;
  p.innerHTML = `<div class="palette-box" role="dialog" aria-label="Search"><input type="search" placeholder="Search clubs, players, competitions, pages" aria-label="Search" autocomplete="off"><div class="palette-list" role="listbox"></div></div>`;
  const input = $('input', p), list = $('.palette-list', p);
  const run = () => {
    const q = input.value.trim().normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const hits = (q ? index.filter((i) => i.k.includes(q)) : index.filter((i) => i.s === 'Page')).slice(0, 40); sel = 0;
    list.innerHTML = hits.length ? hits.map((i, n) => `<a href="${i.h}" role="option" class="${n === 0 ? 'sel' : ''}">${i.club ? crest(i.club, 24) : ''}<span>${esc(i.t)}</span><small>${esc(i.s)}</small></a>`).join('') : `<div class="empty" style="border:0">No match for “${esc(input.value)}”.</div>`;
  };
  input.addEventListener('input', run); run(); input.focus();
  input.addEventListener('keydown', (ev) => {
    const links = $$('a', list); if (!links.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); links[sel]?.classList.remove('sel'); sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links[sel].classList.add('sel'); links[sel].scrollIntoView({ block: 'nearest' }); }
    if (ev.key === 'Enter') { ev.preventDefault(); location.hash = links[sel].getAttribute('href'); closePalette(); }
  });
  p.onclick = (ev) => { if (ev.target === p || ev.target.closest('a')) closePalette(); };
}
function closePalette() { const p = $('#palette'); if (p) { p.hidden = true; p.innerHTML = ''; } }
