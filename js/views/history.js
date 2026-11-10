/** HISTORY: the Football Time Machine. Rewind any season to any matchday, follow clubs across 17 seasons, replay rivalries, and see how each league has changed. */
import { $, $$, esc, html, fmt, seg, segmented, options, setRangeFill, mean, ICON } from '../core/dom.js';
import { leagues, league, club, season as loadSeason, eloHistory, clubsOf, SEASON, sbPlayers, SB_COMPS } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, teamLink, formDots, note, source, tabs, flag } from '../components/ui.js';
import { table, played, positionsByMatchday } from '../models/standings.js';
import { chart, lineSeries, css, palette, bars } from '../charts/charts.js';
import { M } from '../models/playerMetrics.js';

export const title = 'History';
const RIVALRIES = [['real-madrid', 'barcelona', 'El Clásico'], ['arsenal', 'tottenham', 'North London derby'], ['man-united', 'man-city', 'Manchester derby'], ['liverpool', 'everton', 'Merseyside derby'], ['liverpool', 'man-united', 'North-West derby'], ['bayern', 'dortmund', 'Der Klassiker'], ['milan', 'inter', 'Derby della Madonnina'], ['roma', 'lazio', 'Derby della Capitale'], ['juventus', 'inter', "Derby d'Italia"], ['psg', 'marseille', 'Le Classique'], ['atletico', 'real-madrid', 'Madrid derby'], ['sevilla', 'betis', 'Seville derby'], ['schalke', 'dortmund', 'Revierderby'], ['lyon', 'marseille', 'Choc des Olympiques']];
const allSeasons = (lid) => Promise.all(league(lid).seasons.map((s) => loadSeason(lid, s.season)));

export async function render(el, _p, q) {
  el.innerHTML = html`<div class="container"><header class="page-head"><h1>Football time machine</h1><p class="lead">More than 25,000 league matches since 2010. Rewind a title race to any matchday, trace a club through promotions and relegations, replay a rivalry, or watch how the leagues themselves have changed.</p></header>
    <div class="tabs" role="tablist">${[['season', 'Season explorer'], ['clubs', 'Club journeys'], ['rivalry', 'Rivalries'], ['eras', 'League eras'], ['players', 'Player development']].map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`)}</div>
    <section data-pane="season"></section><section data-pane="clubs" hidden></section><section data-pane="rivalry" hidden></section><section data-pane="eras" hidden></section><section data-pane="players" hidden></section></div>`;
  const drawn = new Set(), pane = (n) => $(`[data-pane="${n}"]`, el);
  const show = tabs(el, (n) => { setQuery({ tab: n === 'season' ? null : n }); if (drawn.has(n)) return; drawn.add(n); ({ season: seasonTab, clubs: clubsTab, rivalry: rivalryTab, eras: erasTab, players: playersTab })[n](pane(n), q); });
  show(['clubs', 'rivalry', 'eras', 'players'].includes(q.tab) ? q.tab : 'season');
}

async function seasonTab(box, q) {
  let lid = league(q.league) ? q.league : 'eng.1', sKey = q.season || '2015-16';
  const run = async () => {
    const lg = league(lid); if (!lg.seasons.some((s) => s.season === sKey)) sKey = lg.seasons.at(-2).season;
    const s = await loadSeason(lid, sKey), mds = [...new Set(s.matches.filter(played).map((m) => m[0]))].filter((v) => v != null).sort((a, b) => a - b), last = mds.at(-1); let md = Number(q.md) && mds.includes(Number(q.md)) ? Number(q.md) : last;
    const final = table(s), champ = final[0], pm = positionsByMatchday(s);
    box.innerHTML = html`<div class="toolbar"><label class="field">League<select class="select" id="lg" style="min-width:190px">${options(leagues().map((l) => [l.id, l.name]), lid)}</select></label><label class="field">Season<select class="select" id="ss" style="min-width:150px">${options(lg.seasons.map((x) => [x.season, fmt.season(x.season)]).reverse(), sKey)}</select></label>
        <label class="field grow" style="max-width:520px"><span>Rewind to matchday <b class="num" id="mdv">${md}</b> of ${last}</span><input type="range" id="md" min="${mds[0]}" max="${last}" value="${md}"></label><button class="btn sm" id="play" type="button">▶ Play the season</button></div>
      <div class="grid g-side"><div><div class="table-wrap" id="tbl"></div><p class="src" style="margin-top:8px">Table after the selected matchday. Postponed matches are counted on the matchday they belonged to.</p></div>
        <aside class="stack"><div class="panel" style="--c:${club(champ.id).colors[0]}"><div class="panel-head"><h3>${sKey === SEASON ? 'Current leaders' : 'Champions'}</h3><span class="chip gold">${ICON.trophy} ${fmt.season(sKey)}</span></div><div class="row" style="gap:16px;flex-wrap:nowrap">${crest(champ.id, 84)}<div><h2 style="font-size:26px">${esc(club(champ.id).name)}</h2><p class="muted small" style="margin-top:6px">${champ.pts} points · ${champ.w}-${champ.d}-${champ.l} · ${fmt.signed(champ.gd)} goal difference${final[1] ? ` · ${champ.pts - final[1].pts} clear of ${esc(club(final[1].id).short)}` : ''}</p></div></div></div>
          <div class="panel"><div class="panel-head"><h3>Title race</h3></div><div class="chart" id="race" style="--h:300px"></div></div></aside></div>`;
    const pal = palette(), top = final.slice(0, 5);
    chart($('#race', box), { aria: 'Points by matchday for the top five', legend: { type: 'scroll' }, xAxis: { type: 'category', data: pm.matchdays }, yAxis: { type: 'value', name: 'Points' }, series: top.map((r, i) => lineSeries(club(r.id).short, pm.points[r.id], pal[i], { showSymbol: false })) });
    const draw = () => { const t = table(s, { until: md }); $('#mdv', box).textContent = md; setRangeFill($('#md', box));
      $('#tbl', box).innerHTML = `<table class="t"><thead><tr><th>#</th><th>Club</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GF</th><th class="n">GA</th><th class="n">GD</th><th class="n">Pts</th><th>Form</th></tr></thead><tbody>${t.map((r) => `<tr><td class="pos num ${r.pos === 1 ? 'z-uel' : ''}">${r.pos}</td><td>${teamLink(r.id, { short: false, link: !club(r.id).past })}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gf}</td><td class="n">${r.ga}</td><td class="n">${fmt.signed(r.gd)}</td><td class="n pts">${r.pts}</td><td>${formDots(r.form.slice(-5).map((f) => f.res), 'sm')}</td></tr>`).join('')}</tbody></table>`;
      setQuery({ league: lid === 'eng.1' ? null : lid, season: sKey, md: md === last ? null : md }); };
    draw(); let timer = null; const stop = () => { clearInterval(timer); timer = null; const b = $('#play', box); if (b) b.textContent = '▶ Play the season'; };
    $('#md', box).addEventListener('input', (e) => { md = mds.reduce((a, b) => (Math.abs(b - e.target.value) < Math.abs(a - e.target.value) ? b : a)); draw(); });
    $('#play', box).addEventListener('click', (e) => { if (timer) return stop(); let i = md >= last ? 0 : mds.indexOf(md); e.currentTarget.textContent = '❚❚ Pause'; timer = setInterval(() => { if (!box.isConnected || i >= mds.length) return stop(); md = mds[i++]; $('#md', box).value = md; draw(); }, 420); });
    $('#lg', box).addEventListener('change', (e) => { stop(); lid = e.target.value; q.md = null; run(); }); $('#ss', box).addEventListener('change', (e) => { stop(); sKey = e.target.value; q.md = null; run(); });
  };
  await run();
}

async function clubsTab(box, q) {
  const hist = await eloHistory(); let picked = (q.clubs ? q.clubs.split(',') : ['leicester', 'man-city', 'dortmund', 'napoli', 'psg']).filter((id) => hist.history[id]).slice(0, 6);
  const all = Object.keys(hist.history).map((id) => [id, club(id).name]).sort((a, b) => a[1].localeCompare(b[1])), seasons = [...new Set(Object.values(hist.history).flatMap((h) => h.map((x) => x[0])))].sort();
  box.innerHTML = html`<div class="toolbar"><label class="field grow" style="max-width:420px">Add a club (up to six)<select class="select" id="add"><option value="">Choose a club…</option>${all.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></label><div class="pick" id="chips"></div></div>
    <div class="panel"><div class="panel-head"><h3>End-of-season Elo rating</h3><span class="sub">Gaps are seasons outside the top flight</span></div><div class="chart" id="c" style="--h:440px"></div></div>
    <div style="margin-top:14px">${note('Leicester City\'s 2015/16 title, the rise of Manchester City and Paris Saint-Germain, Dortmund chasing Bayern: the rating line shows form and decline that a single final table hides. Ratings are GOALVISION Elo from league results only.')}</div>`;
  const draw = () => { const pal = palette(); $('#chips', box).innerHTML = picked.map((id) => `<label><input type="checkbox" checked data-id="${id}"><span>${crest(id, 20)}${esc(club(id).short)} ✕</span></label>`).join(''); $('#c', box).__chart?.dispose();
    chart($('#c', box), { aria: 'Elo rating by season', xAxis: { type: 'category', data: seasons.map((s) => fmt.season(s).slice(2)) }, yAxis: { type: 'value', scale: true, name: 'Elo' }, series: picked.map((id, i) => lineSeries(club(id).short, seasons.map((s) => hist.history[id].find((x) => x[0] === s)?.[1] ?? null), pal[i % pal.length], { showSymbol: true, connectNulls: false })) });
    setQuery({ tab: 'clubs', clubs: picked.join(',') }); };
  $('#add', box).addEventListener('change', (e) => { const id = e.target.value; e.target.value = ''; if (id && !picked.includes(id) && picked.length < 6) { picked.push(id); draw(); } });
  $('#chips', box).addEventListener('change', (e) => { picked = picked.filter((id) => id !== e.target.dataset.id); draw(); }); draw();
}

async function rivalryTab(box, q) {
  let a = q.a || 'real-madrid', b = q.b || 'barcelona';
  const run = async () => {
    const A = club(a), B = club(b), same = A.league && A.league === B.league;
    let ms = [];
    if (same) (await allSeasons(A.league)).forEach((s) => { const i = s.teams.indexOf(a), j = s.teams.indexOf(b); if (i < 0 || j < 0) return; s.matches.forEach((m) => { if (played(m) && ((m[3] === i && m[4] === j) || (m[3] === j && m[4] === i))) ms.push({ season: s.season, date: m[1], home: s.teams[m[3]], ga: m[3] === i ? m[5] : m[6], gb: m[3] === i ? m[6] : m[5] }); }); });
    ms.sort((x, y) => x.date.localeCompare(y.date));
    const w = [ms.filter((m) => m.ga > m.gb).length, ms.filter((m) => m.ga === m.gb).length, ms.filter((m) => m.ga < m.gb).length], big = [...ms].sort((x, y) => Math.abs(y.ga - y.gb) - Math.abs(x.ga - x.gb) || (y.ga + y.gb) - (x.ga + x.gb))[0];
    let run2 = 0; const cum = ms.map((m) => (run2 += Math.sign(m.ga - m.gb)));
    box.innerHTML = html`<div class="toolbar"><div class="field">Classic rivalries<div class="suggest" id="presets">${RIVALRIES.map(([x, y, n]) => `<button type="button" data-a="${x}" data-b="${y}">${n}</button>`).join('')}</div></div></div>
      <div class="toolbar"><label class="field grow">Club<select class="select" id="a">${leagues().map((l) => `<optgroup label="${esc(l.name)}">${clubsOf(l.id).sort((x, y) => x.name.localeCompare(y.name)).map((c) => `<option value="${c.id}"${c.id === a ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label><label class="field grow">Rival (same league)<select class="select" id="b">${clubsOf(A.league).filter((c) => c.id !== a).sort((x, y) => x.name.localeCompare(y.name)).map((c) => `<option value="${c.id}"${c.id === b ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      ${ms.length ? `<div class="split" style="--ca:${A.colors[0]};--cb:${B.colors[0]}"><div class="a">${crest(a, 110)}<h2>${esc(A.name)}</h2><span class="num" style="font:900 54px/1 var(--font-d)">${w[0]}</span><span class="muted">wins</span></div><div class="b">${crest(b, 110)}<h2>${esc(B.name)}</h2><span class="num" style="font:900 54px/1 var(--font-d)">${w[2]}</span><span class="muted">wins</span></div></div>
        <div class="stats" style="margin-top:14px"><div class="stat"><span class="k">League meetings since 2010</span><span class="v num">${ms.length}</span><span class="s">${w[1]} draws</span></div><div class="stat"><span class="k">Goals</span><span class="v num">${ms.reduce((s, m) => s + m.ga, 0)}–${ms.reduce((s, m) => s + m.gb, 0)}</span><span class="s">${(ms.reduce((s, m) => s + m.ga + m.gb, 0) / ms.length).toFixed(2)} per match</span></div><div class="stat"><span class="k">Biggest margin</span><span class="v num">${big.ga}–${big.gb}</span><span class="s">${fmt.date(big.date)} at ${esc(club(big.home).short)}</span></div><div class="stat"><span class="k">Home wins</span><span class="v num">${fmt.pct(ms.filter((m) => (m.home === a ? m.ga > m.gb : m.gb > m.ga)).length / ms.length)}</span><span class="s">of all meetings</span></div></div>
        <div class="grid g-32" style="margin-top:18px"><div class="panel"><div class="panel-head"><h3>Balance of power</h3><span class="sub">Running wins: up for ${esc(A.short)}, down for ${esc(B.short)}</span></div><div class="chart" id="c" style="--h:320px"></div></div>
          <div class="panel"><div class="panel-head"><h3>Every meeting</h3></div><ul class="mini" style="max-height:340px;overflow-y:auto">${[...ms].reverse().map((m) => `<li><span class="dim small num">${fmt.date(m.date, { month: 'short', year: 'numeric' })}</span><span class="team"><span>${m.home === a ? esc(A.short) + ' v ' + esc(B.short) : esc(B.short) + ' v ' + esc(A.short)}</span></span><span class="formdots sm"><i class="${m.ga > m.gb ? 'W' : m.ga === m.gb ? 'D' : 'L'}"></i></span><b class="num">${m.home === a ? m.ga + '–' + m.gb : m.gb + '–' + m.ga}</b></li>`).join('')}</ul></div></div>
        <div class="row" style="margin-top:14px"><a class="btn sm primary" href="#/compare?mode=club&a=${a}&b=${b}">Compare the two clubs today ${ICON.arrow}</a></div>` : `<div class="empty"><h4>No league meetings in the data</h4>${esc(A.name)} and ${esc(B.name)} have not shared a top flight since 2010.</div>`}`;
    if (ms.length) chart($('#c', box), { aria: 'Running balance of results', legend: false, tooltip: { trigger: 'axis', formatter: (p) => { const m = ms[p[0].dataIndex]; return `${fmt.date(m.date)}<br>${esc(A.short)} ${m.ga}–${m.gb} ${esc(B.short)}`; } }, xAxis: { type: 'category', data: ms.map((m) => m.date.slice(0, 4)), axisLabel: { interval: Math.ceil(ms.length / 10) } }, yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'line', step: 'end', data: cum, lineStyle: { color: css('--text'), width: 2 }, symbol: 'circle', symbolSize: 9, itemStyle: { color: (p) => (ms[p.dataIndex].ga > ms[p.dataIndex].gb ? css('--blue') : ms[p.dataIndex].ga < ms[p.dataIndex].gb ? css('--green') : css('--text-3')) }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: css('--text-3'), type: 'dashed' }, label: { show: false } } }] });
    setQuery({ tab: 'rivalry', a, b });
    $('#presets', box).addEventListener('click', (e) => { const t = e.target.closest('button'); if (t) { a = t.dataset.a; b = t.dataset.b; run(); } });
    $('#a', box).addEventListener('change', (e) => { a = e.target.value; b = clubsOf(club(a).league).find((c) => c.id !== a).id; run(); }); $('#b', box).addEventListener('change', (e) => { b = e.target.value; run(); });
  };
  await run();
}

async function erasTab(box) {
  box.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  const data = await Promise.all(leagues().map(async (l) => ({ l, rows: (await allSeasons(l.id)).filter((s) => s.played > 100).map((s) => { const ms = s.matches.filter(played), t = table(s); return { season: s.season, gpm: mean(ms, (m) => m[5] + m[6]), home: ms.filter((m) => m[5] > m[6]).length / ms.length, draw: ms.filter((m) => m[5] === m[6]).length / ms.length, champ: t[0], second: t[1], n: ms.length }; }) })));
  if (!box.isConnected) return; const seasons = [...new Set(data.flatMap((d) => d.rows.map((r) => r.season)))].sort(), pal = palette();
  const series = (fn, mult = 1) => data.map((d, i) => lineSeries(d.l.name, seasons.map((s) => { const r = d.rows.find((x) => x.season === s); return r ? +(fn(r) * mult).toFixed(2) : null; }), pal[i], { showSymbol: false, connectNulls: false }));
  box.innerHTML = html`<div class="grid g2"><div class="panel"><div class="panel-head"><h3>Goals per match</h3></div><div class="chart" id="c1" style="--h:300px"></div></div><div class="panel"><div class="panel-head"><h3>Home win rate</h3></div><div class="chart" id="c2" style="--h:300px"></div><p class="src">The dip in 2020/21 is the season played largely in empty stadiums.</p></div>
      <div class="panel"><div class="panel-head"><h3>Draw rate</h3></div><div class="chart" id="c3" style="--h:300px"></div></div><div class="panel"><div class="panel-head"><h3>Champion's winning margin</h3><span class="sub">Points clear of second place</span></div><div class="chart" id="c4" style="--h:300px"></div></div></div>
    <h2 style="margin:26px 0 14px;font-size:28px">Roll of honour</h2><div class="table-wrap"><table class="t"><thead><tr><th>Season</th>${data.map((d) => `<th>${esc(d.l.name)}</th>`).join('')}</tr></thead><tbody>${[...seasons].reverse().filter((s) => s !== SEASON).map((s) => `<tr><td class="num">${fmt.season(s)}</td>${data.map((d) => { const r = d.rows.find((x) => x.season === s); return `<td>${r ? `<span class="team">${crest(r.champ.id, 22)}<span>${esc(club(r.champ.id).short)}</span><small class="dim num">${r.champ.pts}</small></span>` : '<span class="na">not in archive</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>${source('openfootball/football.json', null, 'https://github.com/openfootball/football.json')}`;
  const base = (name, unit) => ({ aria: name, legend: { type: 'scroll' }, xAxis: { type: 'category', data: seasons.map((s) => fmt.season(s).slice(2)) }, yAxis: { type: 'value', scale: true, axisLabel: { formatter: '{value}' + unit } } });
  chart($('#c1', box), { ...base('Goals per match by league', ''), series: series((r) => r.gpm) }); chart($('#c2', box), { ...base('Home win rate by league', '%'), series: series((r) => r.home, 100) });
  chart($('#c3', box), { ...base('Draw rate by league', '%'), series: series((r) => r.draw, 100) }); chart($('#c4', box), { ...base('Title margin by league', ''), series: series((r) => (r.season === SEASON ? NaN : r.champ.pts - r.second.pts)).map((s) => ({ ...s, data: s.data.map((v) => (Number.isNaN(v) ? null : v)) })) });
}

async function playersTab(box) {
  const sets = await Promise.all(SB_COMPS.map(async ([c, n]) => [c, n, (await sbPlayers(c)).players])); if (!box.isConnected) return;
  const by = {}; sets.forEach(([c, n, list]) => list.forEach((p) => (by[p.id] ||= []).push({ c, n, p })));
  const multi = Object.values(by).filter((a) => a.length > 1 && a.every((x) => x.p.min >= 180)).sort((x, y) => y.reduce((s, a) => s + a.p.min, 0) - x.reduce((s, a) => s + a.p.min, 0));
  let cur = multi.find((a) => a[0].p.n === 'Jude Bellingham') || multi[0];
  box.innerHTML = html`<div class="toolbar"><label class="field grow" style="max-width:460px">Player with two tournaments in the data (180+ minutes in each)<select class="select" id="pl">${multi.map((a) => `<option value="${a[0].p.id}"${a === cur ? ' selected' : ''}>${esc(a[0].p.n)} · ${esc(a[0].p.t)}</option>`).join('')}</select></label></div>
    <div class="grid g-32"><div class="panel"><div class="panel-head"><h3 id="pt"></h3><span class="sub">Per 90 minutes</span></div><div class="chart" id="c" style="--h:340px"></div></div><div class="panel" id="side"></div></div>
    <div style="margin-top:14px">${note(`${multi.length} players appear in two of the bundled tournaments. Two tournaments eighteen months apart are a snapshot, not a career curve: season-by-season club development needs a licensed event feed.`)}</div>`;
  const draw = () => { const keys = ['g90', 'xg90', 'xa90', 'sh90', 'kp90', 'prp90', 'prc90', 'da90'], cols = [css('--blue'), css('--green'), css('--gold')], ord = [...cur].sort((x, y) => SB_COMPS.findIndex((c) => c[0] === x.c) - SB_COMPS.findIndex((c) => c[0] === y.c));
    $('#pt', box).textContent = cur[0].p.n; $('#c', box).__chart?.dispose();
    bars($('#c', box), keys.map((k) => M[k].short), ord.map((x, i) => ({ name: `${x.n.replace(/^(FIFA|UEFA) /, '')} (${x.p.min} min)`, color: cols[i], data: keys.map((k) => +M[k].fn(x.p).toFixed(2)) })), { aria: 'Per-90 output by tournament' });
    $('#side', box).innerHTML = `<div class="panel-head"><h3>Tournament lines</h3></div>${ord.map((x) => `<a class="card" style="margin-bottom:10px" href="#/player/${x.c}/${x.p.id}"><b>${esc(x.n)}</b><div class="row between small muted" style="margin-top:6px"><span>${x.p.mp} matches · ${x.p.min} min</span><span>${x.p.g} goals · ${x.p.a} assists · ${x.p.xg.toFixed(2)} xG</span></div></a>`).join('')}`; };
  $('#pl', box).addEventListener('change', (e) => { cur = multi.find((a) => String(a[0].p.id) === e.target.value); draw(); }); draw();
}
