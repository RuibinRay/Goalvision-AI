/** DATA LAB: custom analytics studio (any dataset, any two variables, CSV export), player similarity engine, transparent rankings and the data-grounded assistant. */
import { $, $$, esc, html, fmt, seg, segmented, options, downloadCSV, ICON, sortable } from '../core/dom.js';
import { leagues, league, club, currentSeasons, season as loadSeason, modelState, sbPlayers, SB_COMPS, worldCupIndex, clubsOf } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, flag, note, tabs } from '../components/ui.js';
import { table } from '../models/standings.js';
import { M, RADAR, POS_LABEL, MIN_SAMPLE, peers, similar, zMatrix, kmeans, pca2 } from '../models/playerMetrics.js';
import { chart, css, palette } from '../charts/charts.js';
import { ask, EXAMPLES } from '../models/assistant.js';

export const title = 'Data Lab';
const COMP = Object.fromEntries(SB_COMPS);
export async function render(el, _p, q) {
  el.innerHTML = html`<div class="container"><header class="page-head"><h1>Data lab</h1><p class="lead">Build your own chart from any dataset on the site, find statistically similar players, read the rating methodology, or ask a question and get the rows behind the answer.</p></header>
    <div class="tabs" role="tablist">${[['studio', 'Analytics studio'], ['similar', 'Similarity engine'], ['rankings', 'Rankings'], ['assistant', 'Assistant']].map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`)}</div>
    <section data-pane="studio"></section><section data-pane="similar" hidden></section><section data-pane="rankings" hidden></section><section data-pane="assistant" hidden></section></div>`;
  const drawn = new Set(), pane = (n) => $(`[data-pane="${n}"]`, el);
  const show = tabs(el, (n) => { setQuery({ tab: n === 'studio' ? null : n }); if (drawn.has(n)) return; drawn.add(n); ({ studio, similar: similarity, rankings, assistant })[n](pane(n), q); });
  show(['similar', 'rankings', 'assistant'].includes(q.tab) ? q.tab : 'studio');
}

/* ───────── analytics studio ───────── */
const DATASETS = {
  clubs: { label: 'Clubs, 2026/27 season (96 rows)', cat: ['league'], name: 'club', load: async () => { const [ss, st] = await Promise.all([currentSeasons(), modelState()]); return ss.flatMap((s) => { const h = table(s, { venue: 'home' }), a = table(s, { venue: 'away' }); return table(s).map((r) => ({ club: club(r.id).name, league: league(s.league).name, position: r.pos, played: r.p, points: r.pts, 'points per match': +r.ppg.toFixed(3), 'goals for': r.gf, 'goals against': r.ga, 'goal difference': r.gd, 'goals for per match': +(r.gf / (r.p || 1)).toFixed(3), 'goals against per match': +(r.ga / (r.p || 1)).toFixed(3), 'clean sheets': r.cs, 'home points per match': +h.find((x) => x.id === r.id).ppg.toFixed(3), 'away points per match': +a.find((x) => x.id === r.id).ppg.toFixed(3), elo: Math.round(st.clubs[r.id].elo), 'attack rating': st.clubs[r.id].att, 'defence rating': st.clubs[r.id].def })); }); }, x: 'attack rating', y: 'defence rating' },
  history: { label: 'Club seasons since 2010 (all five leagues)', cat: ['league', 'season'], name: 'club', load: async () => (await Promise.all(leagues().flatMap((l) => l.seasons.filter((s) => s.season !== '2026-27').map((s) => loadSeason(l.id, s.season))))).flatMap((s) => table(s).map((r) => ({ club: club(r.id).name, league: league(s.league).name, season: fmt.season(s.season), position: r.pos, points: r.pts, 'points per match': +r.ppg.toFixed(3), 'goals for': r.gf, 'goals against': r.ga, 'goal difference': r.gd, wins: r.w, draws: r.d, losses: r.l, 'clean sheets': r.cs }))), x: 'goals for', y: 'points' },
  ...Object.fromEntries(SB_COMPS.map(([c, n]) => ['players:' + c, { label: `Players, ${n}`, cat: ['position', 'team'], name: 'player', minutes: true, load: async () => (await sbPlayers(c)).players.map((p) => ({ player: p.n, team: p.t, position: POS_LABEL[p.pos], minutes: p.min, matches: p.mp, goals: p.g, assists: p.a, xG: p.xg, xA: p.xa, shots: p.sh, ...Object.fromEntries(Object.entries(M).map(([k, m]) => [m.label, +(m.fn(p) * (m.pct ? 100 : 1)).toFixed(3)])) })), x: 'xG per 90', y: 'Goals per 90' }])),
  worldcups: { label: 'World Cup editions, 1930 → 2026', cat: ['host'], name: 'year', load: async () => (await worldCupIndex()).editions.map((e) => ({ year: String(e.year), host: e.host, champion: e.champion, teams: e.teams, matches: e.matches, goals: e.goals, 'goals per match': +(e.goals / e.matches).toFixed(3) })), x: 'teams', y: 'goals per match' },
};
async function studio(box, q) {
  let ds = DATASETS[q.ds] ? q.ds : 'clubs', rows = [], type = q.type || 'scatter', X, Y, color, filt = 'all', minMin = MIN_SAMPLE, topN = 15, labels = true;
  box.innerHTML = html`<div class="studio"><div class="panel studio-controls">
      <label class="field">Dataset<select class="select" id="ds">${options(Object.entries(DATASETS).map(([k, d]) => [k, d.label]), ds)}</select></label>
      <div class="field">Chart<div id="type">${seg([['scatter', 'Scatter'], ['bar', 'Ranked bars'], ['hist', 'Histogram']], type)}</div></div>
      <label class="field" id="fx">X axis<select class="select" id="x"></select></label><label class="field">Y axis / value<select class="select" id="y"></select></label>
      <label class="field">Colour by<select class="select" id="color"></select></label><label class="field">Filter<select class="select" id="filt"></select></label>
      <label class="field" id="fmin"><span>Minimum minutes: <b class="num" id="minv">${minMin}</b></span><input type="range" id="min" min="0" max="540" step="30" value="${minMin}" style="--fill:33%"></label>
      <label class="field" id="ftop"><span>Rows shown: <b class="num" id="topv">${topN}</b></span><input type="range" id="top" min="5" max="30" step="1" value="${topN}" style="--fill:40%"></label>
      <label class="switch"><input type="checkbox" id="labels" checked><i></i>Label points</label>
      <button class="btn primary" id="csv" type="button">${ICON.download} Export CSV</button><p class="src">Exports the filtered rows. Results data is public domain (openfootball); player data is StatsBomb Open Data, free for non-commercial use with attribution.</p></div>
    <div class="stack"><div class="panel"><div class="panel-head"><h3 id="ctitle"></h3><span class="sub" id="ccount"></span></div><div class="chart" id="chart" style="--h:500px"></div><p class="src" id="cnote"></p></div><div class="table-wrap" id="preview"></div></div></div>`;
  const numeric = () => Object.keys(rows[0] || {}).filter((k) => typeof rows[0][k] === 'number'), D = () => DATASETS[ds];
  const filtered = () => rows.filter((r) => (filt === 'all' || r[color] === filt || D().cat.some((c) => r[c] === filt)) && (!D().minutes || r.minutes >= minMin));
  const draw = () => {
    const list = filtered(), nameKey = D().name, pal = palette(), cats = color === 'none' ? ['All'] : [...new Set(list.map((r) => r[color]))].slice(0, 12);
    $('#fx', box).hidden = type !== 'scatter'; $('#ftop', box).hidden = type !== 'bar'; $('#fmin', box).hidden = !D().minutes;
    $('#ccount', box).textContent = `${list.length} rows`; $('#chart', box).__chart?.dispose();
    if (!list.length) { $('#ctitle', box).textContent = 'No rows match'; $('#preview', box).innerHTML = ''; return; }
    if (type === 'scatter') { $('#ctitle', box).textContent = `${Y} against ${X}`;
      const n = list.length, mx = list.reduce((s, r) => s + r[X], 0) / n, my = list.reduce((s, r) => s + r[Y], 0) / n, sxy = list.reduce((s, r) => s + (r[X] - mx) * (r[Y] - my), 0), sxx = list.reduce((s, r) => s + (r[X] - mx) ** 2, 0), syy = list.reduce((s, r) => s + (r[Y] - my) ** 2, 0), rr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, slope = sxx ? sxy / sxx : 0, xs = list.map((r) => r[X]), x0 = Math.min(...xs), x1 = Math.max(...xs);
      chart($('#chart', box), { aria: `${Y} against ${X}`, legend: cats.length > 1 ? { type: 'scroll' } : false, tooltip: { trigger: 'item', formatter: (p) => (p.data.name ? `<b>${esc(p.data.name)}</b><br>${esc(X)}: ${p.value[0]}<br>${esc(Y)}: ${p.value[1]}` : '') }, xAxis: { type: 'value', name: X, nameLocation: 'middle', nameGap: 28, scale: true }, yAxis: { type: 'value', name: Y, scale: true },
        series: [...cats.map((c, i) => ({ name: String(c), type: 'scatter', symbolSize: n > 300 ? 6 : 11, itemStyle: { color: pal[i % pal.length], opacity: .85 }, data: list.filter((r) => color === 'none' || r[color] === c).map((r) => ({ name: r[nameKey] + (r.season ? ' ' + r.season : ''), value: [r[X], r[Y]] })), label: { show: labels && n <= 100, formatter: (p) => p.data.name, position: 'top', fontSize: 10, color: css('--text-2') }, labelLayout: { hideOverlap: true } })),
          { name: 'Trend', type: 'line', data: [[x0, my + slope * (x0 - mx)], [x1, my + slope * (x1 - mx)]], symbol: 'none', lineStyle: { color: css('--text-3'), type: 'dashed', width: 1.5 }, silent: true, tooltip: { show: false } }] });
      $('#cnote', box).textContent = `Pearson correlation r = ${rr.toFixed(2)} across ${n} rows (dashed line: least-squares fit). Correlation is not causation.`;
    } else if (type === 'bar') { const top = [...list].sort((a, b) => b[Y] - a[Y]).slice(0, topN); $('#ctitle', box).textContent = `Top ${top.length} by ${Y}`;
      chart($('#chart', box), { aria: `Top ${top.length} by ${Y}`, legend: false, grid: { left: 4 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: { type: 'value', name: Y, nameLocation: 'middle', nameGap: 28 }, yAxis: { type: 'category', inverse: true, data: top.map((r) => r[nameKey] + (r.season ? ' ' + r.season : '')), axisLabel: { width: 170, overflow: 'truncate' } }, series: [{ type: 'bar', barMaxWidth: 20, data: top.map((r) => ({ value: r[Y], itemStyle: { color: color === 'none' ? pal[0] : pal[cats.indexOf(r[color]) % pal.length], borderRadius: [0, 4, 4, 0] } })), label: { show: labels, position: 'right', color: css('--text-2'), fontSize: 11 } }] });
      $('#cnote', box).textContent = color === 'none' ? '' : `Bar colour: ${color}.`;
    } else { const v = list.map((r) => r[Y]), lo = Math.min(...v), hi = Math.max(...v), bins = Math.min(24, Math.max(6, Math.round(Math.sqrt(v.length)))), w = (hi - lo) / bins || 1, counts = new Array(bins).fill(0); v.forEach((x) => counts[Math.min(bins - 1, Math.floor((x - lo) / w))]++);
      const mean = v.reduce((a, b) => a + b, 0) / v.length, sorted = [...v].sort((a, b) => a - b), med = sorted[Math.floor(v.length / 2)]; $('#ctitle', box).textContent = `Distribution of ${Y}`;
      chart($('#chart', box), { aria: `Distribution of ${Y}`, legend: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: { type: 'category', data: counts.map((_, i) => (lo + i * w).toFixed(w < 1 ? 2 : 0)), name: Y, nameLocation: 'middle', nameGap: 28 }, yAxis: { type: 'value', name: 'Rows' }, series: [{ type: 'bar', data: counts, itemStyle: { color: pal[0], borderRadius: [4, 4, 0, 0] }, barCategoryGap: '6%' }] });
      $('#cnote', box).textContent = `Mean ${mean.toFixed(2)}, median ${med.toFixed(2)}, range ${lo.toFixed(2)} to ${hi.toFixed(2)}.`; }
    const cols = [nameKey, ...D().cat, ...(type === 'scatter' ? [X, Y] : [Y])].filter((c, i, a) => a.indexOf(c) === i), sample = [...list].sort((a, b) => b[Y] - a[Y]).slice(0, 12);
    $('#preview', box).innerHTML = `<table class="t"><thead><tr>${cols.map((c) => `<th class="${typeof list[0][c] === 'number' ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${sample.map((r) => `<tr>${cols.map((c) => `<td class="${typeof r[c] === 'number' ? 'n' : ''}">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    setQuery({ ds: ds === 'clubs' ? null : ds, type: type === 'scatter' ? null : type });
  };
  const load = async () => { $('#ctitle', box).textContent = 'Loading dataset…'; rows = await DATASETS[ds].load(); if (!box.isConnected) return; const num = numeric(); X = num.includes(D().x) ? D().x : num[0]; Y = num.includes(D().y) ? D().y : num[1]; color = D().cat[0]; filt = 'all';
    $('#x', box).innerHTML = options(num.map((k) => [k, k]), X); $('#y', box).innerHTML = options(num.map((k) => [k, k]), Y); $('#color', box).innerHTML = options([['none', 'None'], ...D().cat.map((k) => [k, k])], color);
    const fopts = () => { $('#filt', box).innerHTML = options([['all', 'All rows'], ...D().cat.flatMap((c) => [...new Set(rows.map((r) => r[c]))].sort().slice(0, 60).map((v) => [v, `${c}: ${v}`]))], filt); }; fopts(); draw(); };
  $('#ds', box).addEventListener('change', (e) => { ds = e.target.value; load(); });
  for (const [id, fn] of [['x', (v) => (X = v)], ['y', (v) => (Y = v)], ['color', (v) => (color = v)], ['filt', (v) => (filt = v)]]) $('#' + id, box).addEventListener('change', (e) => { fn(e.target.value); draw(); });
  segmented($('#type .seg', box), (v) => { type = v; draw(); });
  $('#min', box).addEventListener('input', (e) => { minMin = Number(e.target.value); $('#minv', box).textContent = minMin; e.target.style.setProperty('--fill', minMin / 540 * 100 + '%'); draw(); });
  $('#top', box).addEventListener('input', (e) => { topN = Number(e.target.value); $('#topv', box).textContent = topN; e.target.style.setProperty('--fill', (topN - 5) / 25 * 100 + '%'); draw(); });
  $('#labels', box).addEventListener('change', (e) => { labels = e.target.checked; draw(); });
  $('#csv', box).addEventListener('click', () => { const list = filtered(), cols = Object.keys(list[0] || {}); downloadCSV(`goalvision-${ds.replace(':', '-')}.csv`, [cols, ...list.map((r) => cols.map((c) => r[c]))]); });
  await load();
}

/* ───────── similarity engine ───────── */
async function similarity(box, q) {
  let comp = COMP[q.comp] ? q.comp : 'wc2022', pid = q.player || null, k = 4;
  const run = async () => {
    const d = await sbPlayers(comp); if (!box.isConnected) return;
    const pool = d.players.filter((p) => p.min >= MIN_SAMPLE), target = pool.find((p) => String(p.id) === String(pid)) || pool.find((p) => p.n === 'Lionel Messi') || pool[0]; pid = target.id;
    const list = peers(d.players, target.pos), keys = RADAR[target.pos], Z = zMatrix(list, keys), km = kmeans(Z, k), pc = pca2(Z), sim = similar(d.players, target, 10), pal = palette(), ti = list.indexOf(target);
    const describe = (c) => keys.map((key, j) => [M[key].short, c[j]]).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join(', ');
    box.innerHTML = html`<div class="toolbar"><label class="field">Tournament<select class="select" id="comp" style="min-width:210px">${options(SB_COMPS, comp)}</select></label><label class="field grow" style="max-width:460px">Player (${MIN_SAMPLE}+ minutes)<select class="select" id="pl">${options([...pool].sort((a, b) => a.n.localeCompare(b.n)).map((p) => [p.id, `${p.n} · ${p.t} · ${p.pos}`]), pid)}</select></label><div class="field">Clusters<div id="k">${seg([[3, '3'], [4, '4'], [5, '5'], [6, '6']], k)}</div></div></div>
      <div class="grid g-23"><div class="panel"><div class="panel-head"><h3>Closest to ${esc(target.n)}</h3><span class="sub">${POS_LABEL[target.pos]}s only</span></div><ol class="board">${sim.map((s) => `<li><span class="num dim">${s.score}</span><a class="team" href="#/player/${comp}/${s.p.id}">${flag(s.p.t, 22)}<span>${esc(s.p.n)}</span><small>${s.p.min} min</small></a><a class="btn sm" href="#/compare?mode=player&ca=${comp}&cb=${comp}&a=${target.id}&b=${s.p.id}">Compare</a></li>`).join('')}</ol>
          <p class="src" style="margin-top:10px">Score 100 = identical output. Distance is Euclidean over ${keys.length} role metrics (${keys.map((x) => M[x].short).join(', ')}), each standardised inside the position group, so no single stat dominates.</p></div>
        <div class="panel"><div class="panel-head"><h3>Style map of ${list.length} ${POS_LABEL[target.pos].toLowerCase()}s</h3><span class="sub">k-means clusters on the first two principal components</span></div><div class="chart" id="c-map" style="--h:420px"></div>
          <div class="legend">${km.centroids.map((c, i) => `<span><i style="--c:${pal[i % pal.length]}"></i>Cluster ${i + 1}: high ${describe(c)} (${km.labels.filter((l) => l === i).length})</span>`).join('')}</div>
          <p class="src">The two axes keep ${fmt.pct(pc.explained[0] + pc.explained[1])} of the variation in the role metrics. Clusters describe statistical style in one short tournament, not quality.</p></div></div>`;
    chart($('#c-map', box), { aria: 'Player style map', legend: false, tooltip: { trigger: 'item', formatter: (p) => `<b>${esc(p.data.name)}</b><br>Cluster ${p.data.c + 1}` }, xAxis: { type: 'value', name: 'Component 1', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'Component 2' },
      series: [{ type: 'scatter', data: list.map((p, i) => ({ name: p.n + ' · ' + p.t, c: km.labels[i], value: pc.points[i], symbolSize: i === ti ? 22 : 9, itemStyle: { color: pal[km.labels[i] % pal.length], opacity: i === ti ? 1 : .7, borderColor: i === ti ? css('--text') : 'transparent', borderWidth: 3 }, label: { show: i === ti || sim.slice(0, 4).some((s) => s.p === p), formatter: p.n, position: 'top', color: css('--text'), fontSize: 11 } })) }] });
    setQuery({ tab: 'similar', comp: comp === 'wc2022' ? null : comp, player: pid });
    $('#comp', box).addEventListener('change', (e) => { comp = e.target.value; pid = null; run(); }); $('#pl', box).addEventListener('change', (e) => { pid = e.target.value; run(); }); segmented($('#k .seg', box), (v) => { k = Number(v); run(); });
  };
  await run();
}

/* ───────── rankings ───────── */
async function rankings(box) {
  const st = await modelState(); let lg = 'all';
  const clubsRanked = Object.entries(st.clubs).sort((a, b) => b[1].elo - a[1].elo).map(([id, v], i) => ({ id, ...v, rank: i + 1 }));
  box.innerHTML = html`<div class="note warn" style="margin-bottom:16px">${ICON.info}<div><b>These are GOALVISION AI ratings, not official FIFA or UEFA rankings.</b> They are computed openly from match results with the method below and can differ from any official list.</div></div>
    <div class="grid g2"><div><div class="row between" style="margin-bottom:12px"><h2 style="font-size:26px">Club Elo</h2><div id="lg">${seg([['all', 'All'], ...leagues().map((l) => [l.id, l.name.replace('Premier League', 'Premier L.')])], lg)}</div></div><div class="table-wrap" id="clubs" style="max-height:640px;overflow-y:auto"></div><p class="src" style="margin-top:8px">As of ${fmt.date(st.asOf)}. Leagues are linked to each other only by the 2025/26 Champions League, so cross-league order is approximate.</p></div>
      <div><h2 style="font-size:26px;margin-bottom:12px">National-team Elo</h2><div class="table-wrap" style="max-height:640px;overflow-y:auto"><table class="t"><thead><tr><th>#</th><th>Team</th><th class="n">Elo</th><th class="n">Finals matches</th><th>Last rated</th></tr></thead><tbody>${Object.entries(st.nations).map(([n, v], i) => `<tr><td class="num dim">${i + 1}</td><td><span class="team">${flag(n, 22)}<span>${esc(n)}</span></span></td><td class="n pts">${v.elo}</td><td class="n">${v.n}</td><td class="small muted">${esc(v.lastComp)}</td></tr>`).join('')}</tbody></table></div><p class="src" style="margin-top:8px">Built from World Cup finals matches since 1930 plus Euro 2024 and Copa América 2024 only. Friendlies and qualifiers are not in the open data, so teams that qualify rarely are rated on very few matches.</p></div></div>
    <div class="panel" style="margin-top:18px"><div class="panel-head"><h3>Methodology</h3></div><div class="grid g3"><div><h4>Expected result</h4><div class="formula" style="margin-top:8px">E = 1 / (1 + 10<sup>−(R<sub>h</sub> + H − R<sub>a</sub>)/400</sup>)</div><p class="muted small" style="margin-top:8px">H = ${st.params.elo.hfa} points of home advantage for clubs, 0 for tournament matches.</p></div><div><h4>Update</h4><div class="formula" style="margin-top:8px">R′ = R + K · G · (S − E)</div><p class="muted small" style="margin-top:8px">K = ${st.params.elo.k} for league matches, 60 for World Cups, 50 for continental finals. G = 1, 1.5 or (11 + n)/8 for wins by 1, 2 or n ≥ 3 goals.</p></div><div><h4>New and promoted teams</h4><p class="muted small" style="margin-top:8px">A promoted club starts at the average rating of the clubs relegated that summer. Every team starts at 1500 the first time it appears. K and H were chosen on seasons before 2016/17 and then frozen.</p></div></div></div>`;
  const draw = () => { $('#clubs', box).innerHTML = `<table class="t"><thead><tr><th>#</th><th>Club</th><th>League</th><th class="n">Elo</th><th class="n">Attack</th><th class="n">Defence</th></tr></thead><tbody>${clubsRanked.filter((c) => lg === 'all' || c.league === lg).map((c) => `<tr data-href="#/club/${c.id}" style="cursor:pointer"><td class="num dim">${c.rank}</td><td><a class="team" href="#/club/${c.id}" data-club="${c.id}">${crest(c.id, 24)}<span>${esc(club(c.id).name)}</span></a></td><td class="small muted">${esc(league(c.league).name)}</td><td class="n pts">${Math.round(c.elo)}</td><td class="n">${fmt.signed(c.att, 2)}</td><td class="n">${fmt.signed(c.def, 2)}</td></tr>`).join('')}</tbody></table>`; };
  draw(); segmented($('#lg .seg', box), (v) => { lg = v; draw(); });
}

/* ───────── assistant ───────── */
function assistant(box, q) {
  box.innerHTML = html`<div class="grid g-side"><div class="panel chat"><div class="chat-log" id="log" aria-live="polite"><div class="chat-a"><p>Ask about tables, best attacks and defences, forecasts, goals against xG, player leaders or World Cup winners. Every answer is computed from the site's data and shows its source and date. I do not guess: if the data cannot answer it, I say so.</p></div></div>
      <form class="chat-form" id="form"><input class="input" id="in" placeholder="Ask a football data question" aria-label="Question" autocomplete="off"><button class="btn primary" type="submit">Ask</button></form><div class="suggest" id="sug">${EXAMPLES.map((e) => `<button type="button">${esc(e)}</button>`).join('')}</div></div>
    <aside class="stack">${note('<b>How it works.</b> This assistant matches your question to a calculation (a table sort, a model run, a leaderboard) and runs it in your browser. It is not a language model, so it cannot hallucinate a statistic, and it cannot answer questions outside the bundled data.')}${note('With the backend deployed you can route questions to a hosted LLM that is restricted to the same calculation tools. The key stays in the backend environment; see <code>backend/worker/README.md</code>.')}</aside></div>`;
  const log = $('#log', box);
  const send = async (text) => { if (!text.trim()) return; log.insertAdjacentHTML('beforeend', `<div class="chat-q">${esc(text)}</div>`); const wait = document.createElement('div'); wait.className = 'chat-a'; wait.innerHTML = '<div class="skeleton" style="height:40px"></div>'; log.append(wait); log.scrollTop = log.scrollHeight;
    try { const a = await ask(text); wait.innerHTML = `<p>${esc(a.text)}</p>${a.rows ? `<div class="table-wrap"><table class="t"><thead><tr>${a.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${a.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}${a.links?.length ? `<div class="row">${a.links.map((l) => `<a class="btn sm" href="${l.href}">${esc(l.label)} ${ICON.arrow}</a>`).join('')}</div>` : ''}${a.sources.length ? `<p class="src">Sources: ${a.sources.map((s) => `${esc(s.name)} (${esc(s.date)})`).join('; ')}</p>` : ''}`; }
    catch (e) { wait.innerHTML = `<p>That calculation failed: ${esc(e.message)}</p>`; } log.scrollTop = log.scrollHeight; };
  $('#form', box).addEventListener('submit', (e) => { e.preventDefault(); const i = $('#in', box); send(i.value); i.value = ''; });
  $('#sug', box).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); });
  if (q.ask) send(q.ask);
}
