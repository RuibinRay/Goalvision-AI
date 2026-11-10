/** Clubs directory: all 96 clubs, searchable, filterable by league, sortable by name, position or Elo. */
import { $, esc, html, fmt, seg, segmented, debounce } from '../core/dom.js';
import { allClubs, leagues, league, currentSeasons, modelState } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, formDots, favBtn } from '../components/ui.js';
import { table } from '../models/standings.js';

export const title = 'Clubs';
export async function render(el, _p, q) {
  const [seasons, state] = await Promise.all([currentSeasons(), modelState()]);
  const row = {}; seasons.forEach((s) => table(s).forEach((r) => (row[r.id] = r)));
  const ranked = Object.entries(state.clubs).sort((a, b) => b[1].elo - a[1].elo).map(([id], i) => [id, i + 1]), eloRank = Object.fromEntries(ranked);
  let lg = q.league || 'all', sort = q.sort || 'elo', text = q.q || '';
  el.innerHTML = html`<div class="container">
    <header class="page-head"><h1>Clubs</h1><p class="lead">Ninety-six clubs, one dashboard each. Ratings are GOALVISION Elo, computed from every league result since 2010 and not an official ranking.</p></header>
    <div class="toolbar"><label class="field grow">Search<input class="input" id="q" type="search" placeholder="Club, short name or code" value="${esc(text)}"></label>
      <div class="field">League<div id="lg">${seg([['all', 'All'], ...leagues().map((l) => [l.id, l.name])], lg)}</div></div>
      <div class="field">Sort<div id="sort">${seg([['elo', 'Elo rating'], ['pos', 'League position'], ['name', 'Name']], sort, 'green')}</div></div></div>
    <div class="club-grid" id="grid" aria-live="polite"></div></div>`;
  const draw = () => {
    const needle = text.trim().toLowerCase();
    let list = allClubs().filter((c) => (lg === 'all' || c.league === lg) && (!needle || [c.name, c.short, c.tla, ...c.aliases].join(' ').toLowerCase().includes(needle)));
    list.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'pos' ? (a, b) => row[a.id].pos - row[b.id].pos || state.clubs[b.id].elo - state.clubs[a.id].elo : (a, b) => state.clubs[b.id].elo - state.clubs[a.id].elo);
    $('#grid', el).innerHTML = list.length ? list.map((c) => { const r = row[c.id];
      return `<a class="card clubcard" href="#/club/${c.id}" style="--c:${c.colors[0]}"><div class="cc-top">${crest(c.id, 64)}${favBtn('clubs', c.id, c.name)}</div><h3>${esc(c.name)}</h3><span class="muted small">${esc(league(c.league).name)} · ${fmt.ord(r.pos)}</span>
        <div class="cc-stats"><span><b class="num">${Math.round(state.clubs[c.id].elo)}</b>Elo · #${eloRank[c.id]}</span><span><b class="num">${r.pts}</b>points</span><span><b class="num">${fmt.signed(r.gd)}</b>goal diff</span></div>${formDots(r.form.slice(-5).map((f) => f.res), 'sm')}</a>`; }).join('')
      : `<div class="empty span-all"><h4>No club matches “${esc(text)}”</h4>Try a shorter name or switch the league filter back to All.</div>`;
  };
  draw();
  segmented($('#lg .seg', el), (v) => { lg = v; setQuery({ league: v === 'all' ? null : v }); draw(); });
  segmented($('#sort .seg', el), (v) => { sort = v; setQuery({ sort: v === 'elo' ? null : v }); draw(); });
  $('#q', el).addEventListener('input', debounce((e) => { text = e.target.value; setQuery({ q: text || null }); draw(); }, 120));
}
