/** League page: standings (all / home / away, season or rolling form), fixtures by matchday, clubs, leaders, title race. */
import { $, $$, esc, html, fmt, seg, segmented, options, sortable, todayISO, ICON } from '../core/dom.js';
import { league, season as loadSeason, club, SEASON, modelState } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, teamLink, formDots, fixtureRow, note, source, tabs, favBtn } from '../components/ui.js';
import { table, played, positionsByMatchday, zoneOf, ZONE_LABEL } from '../models/standings.js';
import { chart, lineSeries, palette, bars, css } from '../charts/charts.js';
import { isLive, liveScorers } from '../services/live.js';

export const title = (p) => league(p.id)?.name || 'League';
export async function render(el, { id }, q) {
  const lg = league(id);
  if (!lg) { el.innerHTML = `<div class="container page-head"><h1>Unknown league</h1><p class="lead"><a class="link" href="#/leagues">All competitions</a></p></div>`; return; }
  const sKey = lg.seasons.some((s) => s.season === q.season) ? q.season : SEASON;
  const [s, state] = await Promise.all([loadSeason(id, sKey), modelState()]);
  const current = sKey === SEASON, n = s.teams.length;
  let venue = q.venue || 'all', win = q.form || 'season';
  const mds = [...new Set(s.matches.map((m) => m[0]))].filter((v) => v != null).sort((a, b) => a - b);
  const today = todayISO();
  const nextMd = s.matches.find((m) => !played(m) && m[1] >= today)?.[0], lastMd = [...s.matches].reverse().find(played)?.[0];
  let md = Number(q.md) || (current ? nextMd || lastMd : lastMd) || mds[0];

  el.innerHTML = html`<div class="container">
    <header class="page-head lg-head"><div class="row" style="gap:18px;flex-wrap:nowrap"><img class="flag" style="--s:64px" src="https://flagcdn.com/${lg.flag}.svg" alt="${esc(lg.country)}"><div><h1>${esc(lg.name)}</h1><p class="lead" style="margin-top:8px">${esc(lg.country)} · ${n} clubs · ${s.played} of ${s.matches.length} matches played${s.lastResult ? ` · results to ${fmt.date(s.lastResult)}` : ''}</p></div></div>
      <div class="row">${favBtn('leagues', id, lg.name)}<label class="field" style="min-width:150px">Season<select class="select" id="season">${options(lg.seasons.map((x) => [x.season, fmt.season(x.season)]).reverse(), sKey)}</select></label></div></header>
    <div class="tabs" role="tablist">${[['table', 'Table'], ['fixtures', 'Fixtures and results'], ['clubs', 'Clubs'], ['leaders', 'Leaders'], ['race', 'Season race']].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`)}</div>
    <section data-pane="table"><div class="row between" style="margin-bottom:14px"><div class="row" id="venue">${seg([['all', 'Overall'], ['home', 'Home'], ['away', 'Away']], venue)}</div><div class="row" id="win">${seg([['season', 'Season'], ['5', 'Last 5'], ['10', 'Last 10']], win, 'green')}</div></div>
      <div class="table-wrap" id="tbl"></div><div class="legend" id="legend"></div>${source(s.source, s.fetchedAt, s.sourceUrl)}</section>
    <section data-pane="fixtures" hidden><div class="row between" style="margin-bottom:14px"><div class="row"><button class="btn sm" id="md-prev" type="button" aria-label="Previous matchday">‹</button><label class="field"><span class="sr">Matchday</span><select class="select" id="md" style="width:170px">${options(mds.map((m) => [m, 'Matchday ' + m]), md)}</select></label><button class="btn sm" id="md-next" type="button" aria-label="Next matchday">›</button></div><span class="src">Kick-off times as published (local time).</span></div><div class="panel flush" id="fx"></div></section>
    <section data-pane="clubs" hidden><div class="crestwall" id="wall"></div></section>
    <section data-pane="leaders" hidden><div class="grid g3" id="leaders"></div><div style="margin-top:18px" id="scorers"></div></section>
    <section data-pane="race" hidden><div class="panel"><div class="panel-head"><h3>League position after each matchday</h3><div id="race-mode">${seg([['pos', 'Position'], ['pts', 'Points']], 'pos')}</div></div><div class="chart" id="race" style="--h:460px"></div><p class="src">Select names in the legend to show or hide clubs. The six current leaders are shown first.</p></div></section>
  </div>`;

  const drawTable = () => {
    const t = table(s, { venue, last: win === 'season' ? null : Number(win) }), zones = current && venue === 'all' && win === 'season';
    $('#tbl', el).innerHTML = html`<table class="t"><thead><tr><th data-sort="pos">#</th><th data-sort="name">Club</th><th class="n" data-sort="p">P</th><th class="n" data-sort="w">W</th><th class="n" data-sort="d">D</th><th class="n" data-sort="l">L</th><th class="n" data-sort="gf">GF</th><th class="n" data-sort="ga">GA</th><th class="n" data-sort="gd">GD</th><th class="n" data-sort="pts" aria-sort="descending">Pts</th><th class="n" data-sort="ppg">PPG</th><th>Form</th></tr></thead><tbody>
      ${t.map((r) => { const z = zones ? zoneOf(r.pos, n, lg.zones) : null, c = club(r.id);
        return `<tr data-href="#/club/${r.id}" data-pos="${r.pos}" data-name="${esc(c.name)}" data-p="${r.p}" data-w="${r.w}" data-d="${r.d}" data-l="${r.l}" data-gf="${r.gf}" data-ga="${r.ga}" data-gd="${r.gd}" data-pts="${r.pts}" data-ppg="${r.ppg.toFixed(3)}"><td class="pos num ${z ? 'z-' + z : ''}">${r.pos}</td><td>${teamLink(r.id, { short: false, link: !c.past })}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gf}</td><td class="n">${r.ga}</td><td class="n">${fmt.signed(r.gd)}</td><td class="n pts">${r.pts}</td><td class="n">${r.ppg.toFixed(2)}</td><td>${formDots(r.form.slice(-5).map((f) => f.res))}</td></tr>`; })}</tbody></table>`;
    sortable($('#tbl table', el));
    $('#legend', el).innerHTML = zones ? [...new Set(t.map((r) => zoneOf(r.pos, n, lg.zones)).filter(Boolean))].map((z) => `<span class="z-${z}"><i></i>${ZONE_LABEL[z]}</span>`).join('') : `<span>${current ? 'Qualification colours apply to the overall season table.' : 'Final table for ' + fmt.season(sKey) + '.'}</span>`;
  };
  const drawFx = () => { const list = s.matches.filter((m) => m[0] === md); let day = '';
    $('#fx', el).innerHTML = `<div class="fx-list">${list.map((m) => { const head = m[1] !== day ? `<div class="fx-day">${fmt.day(m[1])}</div>` : ''; day = m[1]; return head + fixtureRow(s, m, { showDate: false }); }).join('')}</div>`;
    $('#md', el).value = md; setQuery({ md }); };
  const drawClubs = () => { const t = table(s); $('#wall', el).innerHTML = t.map((r) => { const c = club(r.id);
    return `<a class="cw" ${c.past ? '' : `href="#/club/${r.id}" data-club="${r.id}"`} style="--c:${c.colors[0]}">${crest(r.id, 74)}<b>${esc(c.short)}</b><span class="small muted">${fmt.ord(r.pos)} · ${r.pts} pts</span>${formDots(r.form.slice(-5).map((f) => f.res), 'sm')}</a>`; }).join(''); };
  const drawLeaders = () => {
    const t = table(s), h = table(s, { venue: 'home' }), a = table(s, { venue: 'away' }), f = table(s, { last: 5 });
    const board = (title, rows, val, unit) => `<div class="panel"><div class="panel-head"><h3>${title}</h3></div><ol class="board">${rows.slice(0, 5).map((r, i) => `<li><span class="num dim">${i + 1}</span>${teamLink(r.id, { size: 26 })}<b class="num">${val(r)}<small> ${unit}</small></b></li>`).join('')}</ol></div>`;
    const by = (rows, fn) => [...rows].filter((r) => r.p).sort((x, y) => fn(y) - fn(x));
    $('#leaders', el).innerHTML = [
      board('Best attack', by(t, (r) => r.gf / r.p), (r) => (r.gf / r.p).toFixed(2), 'goals / match'), board('Best defence', by(t, (r) => -r.ga / r.p), (r) => (r.ga / r.p).toFixed(2), 'conceded / match'),
      board('Clean sheets', by(t, (r) => r.cs), (r) => r.cs, 'shut-outs'), board('Strongest at home', by(h, (r) => r.ppg), (r) => r.ppg.toFixed(2), 'pts / home match'),
      board('Strongest away', by(a, (r) => r.ppg), (r) => r.ppg.toFixed(2), 'pts / away match'), board('Form table, last five', by(f, (r) => r.pts * 100 + r.gd), (r) => r.pts, 'pts of 15'),
    ].join('');
    const sc = $('#scorers', el);
    if (current && isLive()) liveScorers(id).then((d) => { sc.innerHTML = `<div class="panel"><div class="panel-head"><h3>Top scorers</h3><span class="chip live">LIVE</span></div><ol class="board">${d.scorers.slice(0, 10).map((p, i) => `<li><span class="num dim">${i + 1}</span><span class="team"><span>${esc(p.name)}</span><small class="muted">${esc(p.team)}</small></span><b class="num">${p.goals}<small> goals</small></b></li>`).join('')}</ol><p class="src">${esc(d.provider)} · ${fmt.stamp(d.fetchedAt)}</p></div>`; }).catch((e) => { sc.innerHTML = note('Top scorers could not be loaded from the backend: ' + esc(e.message), 'warn'); });
    else sc.innerHTML = note('Player scoring leaders are not part of the open results archive. They load here from the live backend when one is connected. Team leaders above are computed from match results.');
  };
  let raceMode = 'pos';
  const drawRace = () => {
    const r = positionsByMatchday(s), t = table(s), cols = palette(), topSix = new Set(t.slice(0, 6).map((x) => x.id));
    chart($('#race', el), { aria: `${lg.name} ${raceMode === 'pos' ? 'position' : 'points'} by matchday`,
      legend: { type: 'scroll', top: 0, left: 0, right: 0, selected: Object.fromEntries(t.map((x) => [club(x.id).short, topSix.has(x.id)])) }, grid: { top: 44 },
      xAxis: { type: 'category', data: r.matchdays, name: 'Matchday', nameLocation: 'middle', nameGap: 26 }, yAxis: raceMode === 'pos' ? { type: 'value', inverse: true, min: 1, max: n, interval: 1, axisLabel: { formatter: (v) => (v % 2 || v === 1 ? v : '') } } : { type: 'value' },
      tooltip: { trigger: 'axis', order: raceMode === 'pos' ? 'valueAsc' : 'valueDesc' },
      series: t.map((x, i) => lineSeries(club(x.id).short, (raceMode === 'pos' ? r.positions : r.points)[x.id], i < 6 ? cols[i] : css('--text-3'), { showSymbol: false, smooth: false, lineStyle: { width: i < 6 ? 3 : 1.5, color: i < 6 ? cols[i] : undefined }, itemStyle: { color: i < 6 ? cols[i] : undefined }, emphasis: { focus: 'series' } })) });
  };
  const drawn = new Set();
  const show = tabs(el, (name) => { setQuery({ tab: name === 'table' ? null : name }); if (drawn.has(name)) return; drawn.add(name); ({ table: drawTable, fixtures: drawFx, clubs: drawClubs, leaders: drawLeaders, race: drawRace })[name](); });
  show(['table', 'fixtures', 'clubs', 'leaders', 'race'].includes(q.tab) ? q.tab : 'table');
  segmented($('#venue .seg', el), (v) => { venue = v; setQuery({ venue: v === 'all' ? null : v }); drawTable(); });
  segmented($('#win .seg', el), (v) => { win = v; setQuery({ form: v === 'season' ? null : v }); drawTable(); });
  segmented($('#race-mode .seg', el), (v) => { raceMode = v; $('#race', el).__chart?.dispose(); drawRace(); });
  $('#season', el).addEventListener('change', (e) => (location.hash = `#/league/${id}${e.target.value === SEASON ? '' : '?season=' + e.target.value}`));
  $('#md', el).addEventListener('change', (e) => { md = Number(e.target.value); drawFx(); });
  const step = (d) => { const i = mds.indexOf(md) + d; if (i >= 0 && i < mds.length) { md = mds[i]; drawFx(); } };
  $('#md-prev', el).addEventListener('click', () => step(-1)); $('#md-next', el).addEventListener('click', () => step(1));
}
