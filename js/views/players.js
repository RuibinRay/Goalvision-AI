/** Player database: every player with event data, by tournament. Totals or per 90, position filter, minutes floor. */
import { $, esc, html, fmt, seg, segmented, sortable, debounce, setRangeFill, downloadCSV, ICON } from '../core/dom.js';
import { sbPlayers, SB_COMPS } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { flag, favBtn, note, source } from '../components/ui.js';
import { GROUPS, COL_LABEL, M, show, POS_LABEL, MIN_SAMPLE } from '../models/playerMetrics.js';

export const title = 'Players';
export async function render(el, _p, q) {
  let comp = SB_COMPS.some((c) => c[0] === q.comp) ? q.comp : 'wc2022', pos = q.pos || 'all', grp = q.view || 'attack', mode = q.mode || 'per90', minMin = Number(q.min ?? MIN_SAMPLE), text = '';
  el.innerHTML = html`<div class="container">
    <header class="page-head"><h1>Player database</h1><p class="lead">Every player from three international tournaments with full event data: 1,500 player-tournaments, 3,500 shots. Counting statistics are normalised per 90 minutes, and playing time is always shown so thin samples are obvious.</p></header>
    <div class="toolbar"><div class="field">Tournament<div id="comp">${seg(SB_COMPS, comp, 'green')}</div></div><div class="field">Position<div id="pos">${seg([['all', 'All'], ['FW', 'Forwards'], ['MF', 'Midfielders'], ['DF', 'Defenders'], ['GK', 'Goalkeepers']], pos)}</div></div></div>
    <div class="toolbar"><div class="field">Statistics<div id="grp">${seg(Object.entries(GROUPS).map(([k, g]) => [k, g.label]), grp)}</div></div><div class="field">Values<div id="mode">${seg([['per90', 'Per 90'], ['total', 'Totals']], mode)}</div></div>
      <label class="field" style="min-width:220px"><span>Minimum minutes: <b class="num" id="minv">${minMin}</b></span><input type="range" id="min" min="0" max="540" step="30" value="${minMin}"></label>
      <label class="field grow">Search<input class="input" id="q" type="search" placeholder="Player or team"></label><button class="btn sm" id="csv" type="button">${ICON.download} CSV</button></div>
    <div class="table-wrap" id="tbl" aria-live="polite"></div><div id="foot" style="margin-top:12px"></div></div>`;
  let data = null, rowsOut = [];
  const draw = () => {
    const g = GROUPS[grp], cols = g.cols, per = mode === 'per90', needle = text.trim().toLowerCase();
    let list = data.players.filter((p) => (pos === 'all' || p.pos === pos) && p.min >= minMin && (grp !== 'keeper' || p.pos === 'GK') && (!needle || (p.n + ' ' + p.t).toLowerCase().includes(needle)));
    const val = (p, k) => (per && !['xgd'].includes(k) ? (p.min ? p[k] / p.min * 90 : 0) : p[k]);
    const sortKey = cols[0]; list = [...list].sort((a, b) => val(b, sortKey) - val(a, sortKey));
    rowsOut = [['Player', 'Team', 'Position', 'Minutes', 'Matches', ...cols.map((k) => COL_LABEL[k] + (per ? ' per 90' : '')), ...g.extra.map((k) => M[k].label)], ...list.map((p) => [p.n, p.t, p.pos, p.min, p.mp, ...cols.map((k) => val(p, k).toFixed(per || ['xg', 'npxg', 'xa'].includes(k) ? 2 : 0)), ...g.extra.map((k) => show(k, p))])];
    $('#tbl', el).innerHTML = list.length ? html`<table class="t"><thead><tr><th></th><th data-sort="name">Player</th><th data-sort="team">Team</th><th data-sort="pos">Pos</th><th class="n" data-sort="min">Min</th><th class="n" data-sort="mp">MP</th>${cols.map((k) => `<th class="n" data-sort="${k}"${k === sortKey ? ' aria-sort="descending"' : ''} title="${COL_LABEL[k]}${per ? ' per 90 minutes' : ''}">${COL_LABEL[k]}</th>`)}${g.extra.map((k) => `<th class="n" data-sort="${k}" title="${M[k].label}">${M[k].short}</th>`)}</tr></thead><tbody>
      ${list.slice(0, 400).map((p) => `<tr data-href="#/player/${comp}/${p.id}" data-name="${esc(p.n)}" data-team="${esc(p.t)}" data-pos="${p.pos}" data-min="${p.min}" data-mp="${p.mp}" ${cols.map((k) => `data-${k}="${val(p, k).toFixed(4)}"`).join(' ')} ${g.extra.map((k) => `data-${k.toLowerCase()}="${M[k].fn(p).toFixed(4)}"`).join(' ')}>
        <td>${favBtn('players', comp + '/' + p.id, p.n).replace('<button', `<button data-name="${esc(p.n)}" data-comp="${comp}"`)}</td><td><a href="#/player/${comp}/${p.id}"><b>${esc(p.n)}</b></a></td><td><span class="team">${flag(p.t, 20)}<span>${esc(p.t)}</span></span></td><td>${p.pos}</td><td class="n ${p.min < MIN_SAMPLE ? 'dim' : ''}">${p.min}</td><td class="n">${p.mp}</td>
        ${cols.map((k) => `<td class="n">${val(p, k).toFixed(per || ['xg', 'npxg', 'xa'].includes(k) ? 2 : 0)}</td>`).join('')}${g.extra.map((k) => `<td class="n">${show(k, p)}</td>`).join('')}</tr>`)}</tbody></table>` : `<div class="empty" style="border:0"><h4>No player matches these filters</h4>Lower the minutes floor or clear the search.</div>`;
    const t = $('#tbl table', el); if (t) { sortable(t); t.querySelectorAll('th[data-sort]').forEach((th) => (th.dataset.sort = th.dataset.sort.toLowerCase())); }
    $('#foot', el).innerHTML = `<p class="src">${list.length} players${list.length > 400 ? ' (first 400 shown)' : ''} · ${minMin < MIN_SAMPLE ? `<span class="sample">Small samples included: per-90 figures under ${MIN_SAMPLE} minutes swing wildly</span>` : `minutes floor ${minMin}`}</p>` + (grp === 'keeper' ? note('Post-shot expected goals (PSxG) is not part of StatsBomb Open Data, so goalkeepers are described by saves, save percentage, goals conceded and clean sheets only.') : note('xA here is the xG of the shots a player\'s passes created (“xG assisted”). Providers define xA differently, so do not compare it with numbers from another site.')) + source('StatsBomb Open Data', data.generatedAt, 'https://github.com/statsbomb/open-data');
  };
  const load = async () => { $('#tbl', el).innerHTML = '<div class="skeleton" style="height:300px"></div>'; data = await sbPlayers(comp); if (el.isConnected) draw(); };
  const sync = () => setQuery({ comp: comp === 'wc2022' ? null : comp, pos: pos === 'all' ? null : pos, view: grp === 'attack' ? null : grp, mode: mode === 'per90' ? null : mode, min: minMin === MIN_SAMPLE ? null : minMin });
  segmented($('#comp .seg', el), (v) => { comp = v; sync(); load(); }); segmented($('#pos .seg', el), (v) => { pos = v; sync(); draw(); });
  segmented($('#grp .seg', el), (v) => { grp = v; if (v === 'keeper') pos = 'GK'; sync(); draw(); }); segmented($('#mode .seg', el), (v) => { mode = v; sync(); draw(); });
  const r = $('#min', el); setRangeFill(r); r.addEventListener('input', () => { minMin = Number(r.value); $('#minv', el).textContent = minMin; setRangeFill(r); sync(); draw(); });
  $('#q', el).addEventListener('input', debounce((e) => { text = e.target.value; draw(); }, 120));
  $('#csv', el).addEventListener('click', () => downloadCSV(`goalvision-players-${comp}-${grp}.csv`, rowsOut));
  await load();
}
