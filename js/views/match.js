/**
 * Match dashboard. Three sources, one layout:
 *   sb~<id>                      StatsBomb Open Data match (full event data, replayable minute by minute)
 *   lg~<league>~<season>~<index> league fixture from the snapshot (score or kick-off, forecast, head-to-head)
 *   live~<id>                    live or recent match from the backend provider
 * A statistic the source does not carry is printed as "Not available"; nothing is estimated.
 */
import { $, $$, esc, html, fmt, ICON, NA, sum, setRangeFill } from '../core/dom.js';
import { sbMatch, season as loadSeason, league, club, modelState } from '../core/store.js';
import { crest, flag, teamLink, vsRow, probBar, formDots, note, source, tabs, fixtureStatus } from '../components/ui.js';
import { clubMatches, played, table } from '../models/standings.js';
import { predictMatch, MODEL_INFO } from '../models/predict.js';
import { pairKey } from '../models/features.js';
import { poissonPmf } from '../models/poisson.js';
import { chart, lineSeries, areaStyle, css, rgba } from '../charts/charts.js';
import { createPitch, POSITION_XY, formationLabel, shortName } from '../charts/pitch.js';
import { liveMatch, STATUS_LABEL, isInPlay } from '../services/live.js';
import { CONFIG } from '../core/config.js';

export const title = 'Match';
let timer = null, playTimer = null;
const EV_ICON = { goal: '⚽', own: '⚽', 'pen-miss': '✕', yc: '', y2: '', rc: '', sub: '⇄' };
const evText = (e) => e.t === 'goal' ? `<b>${esc(e.player)}</b>${e.pen ? ' (penalty)' : ''}${e.assist ? ` <span class="dim">assist ${esc(e.assist)}</span>` : ''}` : e.t === 'own' ? `<b>Own goal</b> <span class="dim">${esc(e.player)}</span>`
  : e.t === 'pen-miss' ? `<b>${esc(e.player)}</b> <span class="dim">penalty not scored (${esc(e.detail || '')})</span>` : e.t === 'sub' ? `<b>${esc(e.on)}</b> <span class="dim">for ${esc(e.off)}</span>` : `<b>${esc(e.player)}</b> <span class="dim">${e.t === 'yc' ? 'yellow card' : e.t === 'y2' ? 'second yellow, sent off' : 'red card'}</span>`;

export async function render(el, { id }) {
  const [kind, ...rest] = id.split('~');
  try {
    if (kind === 'sb') return await renderSB(el, rest[0]);
    if (kind === 'lg') return await renderLeague(el, rest[0], rest[1], Number(rest[2]));
    if (kind === 'live') return await renderLive(el, rest.join('~'));
  } catch (e) { console.error(e); el.innerHTML = `<div class="container page-head"><h1>Match unavailable</h1><p class="lead">${esc(e.message)}. <a class="link" href="#/live">Back to the match centre</a></p></div>`; return; }
  el.innerHTML = `<div class="container page-head"><h1>Unknown match</h1><p class="lead"><a class="link" href="#/live">Back to the match centre</a></p></div>`;
}

/* ───────────────── StatsBomb match with replay ───────────────── */
async function renderSB(el, id) {
  const m = await sbMatch(id), T = m.momentum[0].length - 1, regEnd = Math.min(T, Math.round(45 + (m.periods['2'] || 45))), hasET = !!m.periods['3'], names = [m.home.name, m.away.name], col = [css('--blue'), css('--green')];
  document.title = `${names[0]} v ${names[1]} · GOALVISION AI`;
  let upTo = T;
  el.innerHTML = html`<div class="container">
    <header class="page-head" style="padding-bottom:8px"><div class="row"><a class="chip" href="#/live?archive=${m.comp}">${esc(m.compName)}</a><span class="chip">${esc(m.stage)}${m.group ? ' · ' + esc(m.group) : ''}</span><span class="chip">REPLAY · historical match</span></div></header>
    <div class="panel scorepanel"><div class="scorebug"><div class="side">${flag(names[0], 84)}<h2>${esc(names[0])}</h2><span class="muted small">${esc(m.home.manager || '')}</span></div>
        <div style="display:grid;justify-items:center;gap:8px"><div class="digits num"><span id="sh">${m.home.score}</span><em>:</em><span id="sa">${m.away.score}</span></div><span class="chip live" id="clock">Full time</span>${m.pens ? `<span class="muted small">Penalties ${m.pens[0]}–${m.pens[1]}</span>` : ''}</div>
        <div class="side">${flag(names[1], 84)}<h2>${esc(names[1])}</h2><span class="muted small">${esc(m.away.manager || '')}</span></div></div>
      <div class="scorers" id="scorers"></div>
      <div class="replay"><button class="btn sm primary" id="play" type="button">▶ Replay</button><input type="range" id="scrub" min="0" max="${T}" value="${T}" aria-label="Match minute"><button class="btn sm" id="full" type="button">Full match</button></div>
      <dl class="meta"><div><dt>Date</dt><dd>${fmt.date(m.date)} · ${m.kickoff}</dd></div><div><dt>Stadium</dt><dd>${esc(m.stadium || 'Not available')}</dd></div><div><dt>Referee</dt><dd>${esc(m.referee || 'Not available')}</dd></div><div><dt>Formations</dt><dd class="num">${formationLabel(m.home.formation) || '–'} v ${formationLabel(m.away.formation) || '–'}</dd></div></dl></div>
    <div class="tabs" role="tablist" style="margin-top:22px">${[['overview', 'Line-ups'], ['timeline', 'Timeline'], ['stats', 'Statistics'], ['visuals', 'Visualisations']].map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`)}</div>
    <section data-pane="overview"><div class="grid g-32"><div class="panel pitch-panel"><div class="panel-head"><h3>Starting line-ups</h3><span class="sub"><b style="color:${col[0]}">${esc(names[0])}</b> ${formationLabel(m.home.formation) || ''} · <b style="color:${col[1]}">${esc(names[1])}</b> ${formationLabel(m.away.formation) || ''}</span></div><div id="lineup"></div></div>
      <div class="grid g2" style="align-content:start">${[0, 1].map((s) => `<div class="panel"><div class="panel-head"><h3>${esc(names[s])}</h3></div><ul class="squadlist">${m.lineups[s].players.map((p) => `<li class="${p.start ? '' : 'sub'}"><span class="num">${p.num ?? ''}</span><span>${esc(p.name)}</span><small class="dim">${p.start ? (p.off != null ? `off ${p.off}'` : '') : `on ${p.on}'`}</small></li>`).join('')}</ul>${m.lineups[s].unused.length ? `<p class="src" style="margin-top:10px">Unused: ${m.lineups[s].unused.map((p) => esc(p.name)).join(', ')}</p>` : ''}</div>`).join('')}</div></div></section>
    <section data-pane="timeline" hidden><div class="panel"><ol class="timeline" id="tl"></ol><p class="src">VAR reviews are not recorded in this dataset.</p></div></section>
    <section data-pane="stats" hidden><div class="grid g-23"><div class="panel" id="statbox" style="--team-a:${col[0]};--team-b:${col[1]}"></div>
      <div class="panel pitch-panel"><div class="panel-head"><h3>Shot map</h3><span class="sub">Circle area = xG · filled = goal</span></div><div id="shotmap"></div><p class="src">${esc(names[0])} attack left to right, ${esc(names[1])} right to left.</p></div></div></section>
    <section data-pane="visuals" hidden><div class="grid g2"><div class="panel"><div class="panel-head"><h3>Score and xG progression</h3></div><div class="chart" id="c-xg" style="--h:300px"></div></div>
      <div class="panel"><div class="panel-head"><h3>Attacking momentum</h3><span class="sub">Final-third actions, rolling 5 minutes</span></div><div class="chart" id="c-mom" style="--h:300px"></div></div>
      <div class="panel span-all"><div class="panel-head"><h3>Win, draw, loss probability through the match</h3></div><div class="chart" id="c-wp" style="--h:300px"></div><p class="src">In-play estimate from score and clock only: both sides get the tournament-average scoring rate for the time remaining (Poisson). It shows how the scoreline moves the odds; it does not know team strength and is not a validated forecast.</p></div></div>
      <div class="row" style="margin-top:16px"><a class="btn primary sm" href="#/tactics?match=${m.id}">Passing networks, heat maps and team shape in the Tactics Lab ${ICON.arrow}</a></div></section>
    ${source('StatsBomb Open Data', null, 'https://github.com/statsbomb/open-data')}</div>`;

  /* line-ups on one pitch */
  const lp = createPitch($('#lineup', el), { label: 'Starting line-ups' });
  [0, 1].forEach((s) => lp.dots(m.lineups[s].players.filter((p) => p.start && POSITION_XY[p.pos]).map((p) => ({ x: POSITION_XY[p.pos][0] * .48 + 2, y: POSITION_XY[p.pos][1], label: p.num, sub: shortName(p.name), title: `${p.name} · ${p.posName}` })), { flip: s === 1, color: col[s], r: 2.7 }));
  const periodOf = (min) => (min < 45 ? 'First half' : !hasET || min < regEnd ? 'Second half' : 'Extra time');
  const state = () => { const ev = m.events.filter((e) => e.m <= upTo), goals = ev.filter((e) => e.t === 'goal' || e.t === 'own'), sc = [goals.filter((g) => g.side === 0).length, goals.filter((g) => g.side === 1).length], shots = m.shots.filter((s) => s[2] <= upTo); return { ev, goals, sc, shots }; };
  const draw = () => {
    const st = state(), full = upTo >= T;
    $('#sh', el).textContent = st.sc[0]; $('#sa', el).textContent = st.sc[1];
    $('#clock', el).textContent = full ? (hasET ? 'After extra time' : 'Full time') : `${Math.min(upTo + 1, T)}' · ${periodOf(upTo)}`; $('#clock', el).className = 'chip ' + (full ? 'live' : 'blue');
    $('#scorers', el).innerHTML = [0, 1].map((s) => `<div>${st.goals.filter((g) => g.side === s).map((g) => `<span>${esc(g.t === 'own' ? g.player + ' (og)' : g.player)} ${g.lbl}${g.pen ? ' (p)' : ''}</span>`).join('')}</div>`).join('<i>⚽</i>');
    $('#tl', el).innerHTML = st.ev.length ? st.ev.map((e) => `<li class="s${e.side} ${e.t}"><span class="tl-min num">${e.lbl}</span><span class="tl-ic ${e.t}">${EV_ICON[e.t]}</span><span class="tl-tx">${evText(e)}${e.score ? ` <b class="num tl-sc">${e.score[0]}–${e.score[1]}</b>` : ''}</span></li>`).join('') : '<li class="dim">No events yet.</li>';
    const agg = (s) => { const sh = st.shots.filter((x) => x[0] === s); return { shots: sh.length, sot: sh.filter((x) => x[6] === 'G' || x[6] === 'S').length, xg: sum(sh, (x) => x[5]) }; }, A = agg(0), B = agg(1), S = m.stats;
    $('#statbox', el).innerHTML = `<div class="panel-head"><h3>${full ? 'Match statistics' : `Statistics to ${upTo + 1}'`}</h3></div>` + (full ? '' : `<p class="src" style="margin-bottom:6px">Shots and xG follow the replay clock. The remaining rows are full-match totals.</p>`) +
      [vsRow('Possession (share of passes)', S[0].poss, S[1].poss, { d: 1, suffix: '%' }), vsRow('Shots', A.shots, B.shots), vsRow('Shots on target', A.sot, B.sot), vsRow('Expected goals (xG)', A.xg, B.xg, { d: 2 }), vsRow('Corners', S[0].corners, S[1].corners), vsRow('Fouls', S[0].fouls, S[1].fouls, { lowerBetter: true }), vsRow('Offsides', S[0].offsides, S[1].offsides, { lowerBetter: true }),
        vsRow('Passes', S[0].passes, S[1].passes), vsRow('Pass completion', S[0].passAcc, S[1].passAcc, { d: 1, suffix: '%' }), vsRow('Saves', S[0].saves, S[1].saves), vsRow('Tackles', S[0].tackles, S[1].tackles), vsRow('Interceptions', S[0].interceptions, S[1].interceptions), vsRow('Yellow cards', S[0].yc, S[1].yc, { lowerBetter: true }), vsRow('Red cards', S[0].rc, S[1].rc, { lowerBetter: true })].join('');
    const sm = createPitch($('#shotmap', el), { label: 'Shot map' });
    [0, 1].forEach((s) => sm.shots(st.shots.filter((x) => x[0] === s).map((x) => ({ x: x[3], y: x[4], xg: x[5], outcome: x[6], title: `${x[1]} ${x[2] + 1}' · xG ${x[5].toFixed(2)} · ${{ G: 'goal', S: 'saved', O: 'off target', P: 'post', B: 'blocked' }[x[6]]}${x[7] ? ' · penalty' : ''}` })), { flip: s === 1, color: col[s] }));
    charts(st);
  };
  let chartsReady = false;
  const charts = (st) => {
    if (!chartsReady) return;
    const mins = Array.from({ length: T + 1 }, (_, i) => i), cut = (arr) => arr.map((v, i) => (i <= upTo ? v : null));
    const cum = (s) => { let t = 0; return mins.map((i) => { t += sum(m.shots.filter((x) => x[0] === s && x[2] === i), (x) => x[5]); return +t.toFixed(3); }); };
    const marks = (s) => st.goals.filter((g) => g.side === s).map((g) => ({ coord: [g.m, cum(s)[Math.min(T, g.m)]], value: g.player }));
    for (const idc of ['#c-xg', '#c-mom', '#c-wp']) $(idc, el).__chart?.dispose();
    chart($('#c-xg', el), { aria: 'Cumulative xG by minute', xAxis: { type: 'category', data: mins, name: 'Minute', nameLocation: 'middle', nameGap: 26, axisLabel: { interval: 14 } }, yAxis: { type: 'value', name: 'Cumulative xG' },
      series: [0, 1].map((s) => lineSeries(names[s], cut(cum(s)), col[s], { step: 'end', smooth: false, showSymbol: false, areaStyle: areaStyle(col[s], .14), markPoint: { symbol: 'circle', symbolSize: 13, itemStyle: { color: col[s], borderColor: css('--text'), borderWidth: 2 }, label: { show: false }, data: marks(s) } })) });
    const roll = (arr) => arr.map((_, i) => sum(arr.slice(Math.max(0, i - 4), i + 1)));
    chart($('#c-mom', el), { aria: 'Attacking momentum', tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: { type: 'category', data: m.momentum[0].map((_, i) => i), axisLabel: { interval: 14 } }, yAxis: { type: 'value', axisLabel: { formatter: (v) => Math.abs(v) } },
      series: [{ name: names[0], type: 'bar', stack: 'm', data: cut(roll(m.momentum[0])), itemStyle: { color: col[0] }, barCategoryGap: '8%' }, { name: names[1], type: 'bar', stack: 'm', data: cut(roll(m.momentum[1]).map((v) => -v)), itemStyle: { color: col[1] } }] });
    /* in-play W/D/L from score and clock, equal strengths */
    const rate = 1.3 / 90, wp = mins.map((t) => {
      const sc = [m.events.filter((e) => e.m <= t && (e.t === 'goal' || e.t === 'own') && e.side === 0).length, m.events.filter((e) => e.m <= t && (e.t === 'goal' || e.t === 'own') && e.side === 1).length];
      const horizon = hasET && t >= regEnd ? T : regEnd, lam = Math.max(0, horizon - t) * rate; let h = 0, d = 0, a = 0;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { const p = poissonPmf(x, lam) * poissonPmf(y, lam), diff = sc[0] + x - sc[1] - y; if (diff > 0) h += p; else if (diff === 0) d += p; else a += p; }
      const s = h + d + a; return [h / s, d / s, a / s];
    });
    const area = (name, k, c) => ({ name, type: 'line', stack: 'wp', symbol: 'none', smooth: false, lineStyle: { width: 0 }, areaStyle: { color: c, opacity: .9 }, data: cut(wp.map((v) => +(v[k] * 100).toFixed(1))) });
    chart($('#c-wp', el), { aria: 'In-play win probability', xAxis: { type: 'category', data: mins, boundaryGap: false, axisLabel: { interval: 14 } }, yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } }, tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '–' : v + '%') },
      series: [area(names[0] + ' win', 0, col[0]), area('Draw', 1, css('--bg-4')), area(names[1] + ' win', 2, col[1])] });
  };
  const scrub = $('#scrub', el), stop = () => { clearInterval(playTimer); playTimer = null; $('#play', el).textContent = '▶ Replay'; };
  scrub.addEventListener('input', () => { upTo = Number(scrub.value); setRangeFill(scrub); draw(); });
  $('#full', el).addEventListener('click', () => { stop(); upTo = T; scrub.value = T; setRangeFill(scrub); draw(); });
  $('#play', el).addEventListener('click', () => { if (playTimer) return stop(); if (upTo >= T) upTo = 0; $('#play', el).textContent = '❚❚ Pause';
    playTimer = setInterval(() => { upTo++; scrub.value = upTo; setRangeFill(scrub); draw(); if (upTo >= T) stop(); }, 350); });
  setRangeFill(scrub);
  const show = tabs(el, (n) => { if (n === 'visuals' && !chartsReady) { chartsReady = true; charts(state()); } });
  show('overview'); draw();
}

/* ───────────────── league fixture from the snapshot ───────────────── */
async function renderLeague(el, lid, sKey, i) {
  const [s, state] = await Promise.all([loadSeason(lid, sKey), modelState()]), m = s.matches[i];
  if (!m) throw new Error('That fixture is not in the season data');
  const h = s.teams[m[3]], a = s.teams[m[4]], H = club(h), A = club(a), st = fixtureStatus(m, undefined, s.live), lg = league(lid), done = st.code === 'FT';
  document.title = `${H.short} v ${A.short} · GOALVISION AI`;
  const before = (id) => clubMatches(s, id).filter((x) => x.date < m[1]).slice(-5), h2h = state.h2h[pairKey(h, a)];
  const canForecast = !done && state.clubs[h] && state.clubs[a], f = canForecast ? predictMatch(state, { home: h, away: a, date: m[1] }) : null;
  el.innerHTML = html`<div class="container">
    <header class="page-head" style="padding-bottom:8px"><div class="row"><a class="chip" href="#/league/${lid}">${esc(lg.name)}</a><span class="chip">${fmt.season(sKey)} · Matchday ${m[0] ?? '–'}</span><span class="chip ${done ? 'live' : st.code === 'PENDING' ? 'demo' : 'blue'}">${st.label}</span></div></header>
    <div class="panel scorepanel" style="--c:${H.colors[0]};--c2:${A.colors[0]}"><div class="scorebug"><a class="side" href="#/club/${h}">${crest(h, 110, { lazy: false })}<h2>${esc(H.name)}</h2></a>
        <div style="display:grid;justify-items:center;gap:8px">${done ? `<div class="digits num"><span>${m[5]}</span><em>:</em><span>${m[6]}</span></div>${m[7] != null ? `<span class="muted small">Half-time ${m[7]}–${m[8]}</span>` : ''}` : `<div class="digits num" style="font-size:clamp(40px,7vw,84px)">${m[2] || 'TBC'}</div><span class="muted small">${st.code === 'PENDING' ? 'Played after the snapshot was built' : 'Scheduled kick-off (local time)'}</span>`}</div>
        <a class="side" href="#/club/${a}">${crest(a, 110, { lazy: false })}<h2>${esc(A.name)}</h2></a></div>
      <dl class="meta"><div><dt>Date</dt><dd>${fmt.day(m[1])} ${new Date(m[1]).getFullYear()}</dd></div><div><dt>Ground</dt><dd>${esc(H.ground || 'Not available')}</dd></div><div><dt>Competition</dt><dd>${esc(lg.name)}</dd></div><div><dt>Officials</dt><dd>${NA}</dd></div></dl></div>
    <div class="grid g2" style="margin-top:18px">
      ${f ? `<div class="panel"><div class="panel-head"><h3>Forecast</h3><span class="sub">Ratings as of ${fmt.date(state.asOf)}</span></div>${probBar(f.ensemble)}<div class="prob-labels"><span>${esc(H.short)} win</span><span>Draw</span><span>${esc(A.short)} win</span></div>
          <table class="t" style="margin-top:14px"><thead><tr><th>Model</th><th class="n">Home</th><th class="n">Draw</th><th class="n">Away</th></tr></thead><tbody>${Object.entries(f.models).map(([k, p]) => `<tr><td>${MODEL_INFO[k]?.name || k}</td><td class="n">${fmt.pct(p[0])}</td><td class="n">${fmt.pct(p[1])}</td><td class="n">${fmt.pct(p[2])}</td></tr>`).join('')}</tbody></table>
          <dl class="kv-list" style="margin-top:14px"><dt>Expected goals</dt><dd class="num">${f.lambdas[0].toFixed(2)} – ${f.lambdas[1].toFixed(2)}</dd><dt>Most likely scores</dt><dd class="num">${f.top.slice(0, 3).map((x) => `${x.h}–${x.a} (${fmt.pct(x.p)})`).join(' · ')}</dd></dl>
          <a class="btn sm primary" style="margin-top:14px" href="#/predictions?home=${h}&away=${a}">Open in the Prediction Lab ${ICON.arrow}</a><p class="src" style="margin-top:10px">A statistical estimate, not a guarantee and not betting advice.</p></div>`
        : `<div class="panel"><div class="panel-head"><h3>Before kick-off</h3></div>${[['League position', (id) => { const t = table(s, { until: new Date(new Date(m[1]).getTime() - 864e5).toISOString().slice(0, 10) }).find((x) => x.id === id); return t.p ? fmt.ord(t.pos) : '–'; }], ['Points', (id) => table(s, { until: new Date(new Date(m[1]).getTime() - 864e5).toISOString().slice(0, 10) }).find((x) => x.id === id).pts]].map(([k, fn]) => `<div class="vs-row"><span class="lab">${k}</span><b class="num">${fn(h)}</b><span></span><b class="num">${fn(a)}</b></div>`).join('')}
          <p class="src" style="margin-top:10px">No forecast is shown for a finished match: today's ratings already include its result, so a “prediction” would be leaking the answer. Past forecasts are scored in <a class="link" href="#/predictions?tab=validation">model validation</a>.</p></div>`}
      <div class="panel"><div class="panel-head"><h3>Form going in</h3><span class="sub">Last five league matches before ${fmt.date(m[1], { day: 'numeric', month: 'short' })}</span></div>
        ${[h, a].map((id) => { const l = before(id); return `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line)">${teamLink(id, { size: 28 })}${l.length ? formDots(l.map((x) => x.res)) : '<span class="dim small">First matches of the season</span>'}</div>`; }).join('')}
        <h4 style="margin:18px 0 8px">Head-to-head since 2010</h4>${h2h ? (() => { const first = h < a ? h : a, hw = first === h ? h2h.w[0] : h2h.w[2], aw = first === h ? h2h.w[2] : h2h.w[0];
          return `<div class="h2h"><div><b class="num">${hw}</b><span>${esc(H.short)} wins</span></div><div><b class="num">${h2h.w[1]}</b><span>Draws</span></div><div><b class="num">${aw}</b><span>${esc(A.short)} wins</span></div></div><ul class="mini" style="margin-top:10px">${[...h2h.last].reverse().slice(0, 5).map(([d, hm, hg, ag]) => `<li><span class="dim small num">${fmt.date(d, { month: 'short', year: 'numeric' })}</span><span class="team"><span>${esc(club(hm).short)} v ${esc(club(hm === h ? a : h).short)}</span></span><b class="num">${hg}–${ag}</b></li>`).join('')}</ul>`; })() : '<p class="dim small">No league meeting in the data.</p>'}</div></div>
    <div style="margin-top:16px">${note(`Line-ups, the event timeline and match statistics are not part of the open results archive for league fixtures. With the live backend connected this page loads them from the provider. For matches with full event data, open a <a class="link" href="#/live">replay</a>.`)}</div>
    ${source(s.source, s.fetchedAt, s.sourceUrl, { live: s.live })}</div>`;
}

/* ───────────────── live match from the backend ───────────────── */
async function renderLive(el, id) {
  const load = async () => {
    const r = await liveMatch(id), m = r.match; if (!el.isConnected) return;
    document.title = `${m.home.name} v ${m.away.name} · GOALVISION AI`;
    const inplay = isInPlay(m.status), stat = (k) => [m.stats?.home?.[k] ?? null, m.stats?.away?.[k] ?? null];
    const rows = [['Possession', 'possession', '%'], ['Shots', 'shots'], ['Shots on target', 'shotsOnTarget'], ['Corners', 'corners'], ['Fouls', 'fouls'], ['Offsides', 'offsides'], ['Passes', 'passes'], ['Pass completion', 'passAccuracy', '%'], ['Saves', 'saves'], ['Expected goals (xG)', 'xg']];
    const events = [...(m.goals || []).map((g) => ({ ...g, t: g.kind === 'own' ? 'own' : 'goal', pen: g.kind === 'penalty' })), ...(m.cards || []).map((c) => ({ ...c, t: c.kind === 'yellow' ? 'yc' : c.kind === 'second-yellow' ? 'y2' : 'rc' })), ...(m.subs || []).map((x) => ({ ...x, t: 'sub' })), ...(m.var || []).map((v) => ({ ...v, t: 'var' }))].sort((x, y) => (x.minute || 0) - (y.minute || 0));
    el.innerHTML = html`<div class="container"><header class="page-head" style="padding-bottom:8px"><div class="row"><span class="chip">${esc(m.competitionName || m.competition || '')}</span><span class="chip ${inplay ? 'live' : 'blue'}">${inplay && m.minute ? m.minute + "' · " : ''}${STATUS_LABEL[m.status] || m.status}</span><span class="src">${esc(r.provider)} · last successful refresh ${fmt.stamp(r.fetchedAt)}${r.cached ? ' (cached)' : ''}</span></div></header>
      <div class="panel scorepanel"><div class="scorebug"><div class="side">${m.home.club ? crest(m.home.club, 110) : ''}<h2>${esc(m.home.name)}</h2></div><div style="display:grid;justify-items:center;gap:8px">${m.status === 'SCHEDULED' ? `<div class="digits num" style="font-size:clamp(40px,7vw,84px)">${new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>` : `<div class="digits num"><span>${m.score.home ?? '–'}</span><em>:</em><span>${m.score.away ?? '–'}</span></div>`}${m.score.ht ? `<span class="muted small">Half-time ${m.score.ht[0]}–${m.score.ht[1]}</span>` : ''}${m.score.pen ? `<span class="muted small">Penalties ${m.score.pen[0]}–${m.score.pen[1]}</span>` : ''}</div><div class="side">${m.away.club ? crest(m.away.club, 110) : ''}<h2>${esc(m.away.name)}</h2></div></div>
        <dl class="meta"><div><dt>Kick-off</dt><dd>${fmt.stamp(m.utcDate)}</dd></div><div><dt>Stadium</dt><dd>${m.venue ? esc(m.venue) : NA}</dd></div><div><dt>Referee</dt><dd>${m.referee ? esc(m.referee) : NA}</dd></div><div><dt>Formations</dt><dd>${m.lineups ? `${esc(m.lineups.home.formation || '–')} v ${esc(m.lineups.away.formation || '–')}` : NA}</dd></div></dl></div>
      <div class="grid g2" style="margin-top:18px"><div class="panel"><div class="panel-head"><h3>Timeline</h3></div>${events.length ? `<ol class="timeline">${events.map((e) => `<li class="s${e.side === 'home' ? 0 : 1} ${e.t}"><span class="tl-min num">${e.minute ?? ''}'</span><span class="tl-ic ${e.t}">${EV_ICON[e.t] ?? 'VAR'}</span><span class="tl-tx">${e.t === 'sub' ? `<b>${esc(e.on || '')}</b> <span class="dim">for ${esc(e.off || '')}</span>` : e.t === 'var' ? `<b>VAR</b> <span class="dim">${esc(e.detail || '')}</span>` : `<b>${esc(e.player || '')}</b>${e.assist ? ` <span class="dim">assist ${esc(e.assist)}</span>` : ''}`}</span></li>`).join('')}</ol>` : `<p class="dim">${m.status === 'SCHEDULED' ? 'The match has not started.' : 'The provider has not published events for this match.'}</p>`}</div>
        <div class="panel"><div class="panel-head"><h3>Statistics</h3></div>${rows.map(([l, k, suf]) => { const [x, y] = stat(k); return x == null && y == null ? `<div class="vs-row"><span class="lab">${l}</span><b></b><span style="text-align:center">${NA}</span><b></b></div>` : vsRow(l, x, y, { suffix: suf || '', d: k === 'xg' ? 2 : 0 }); }).join('')}</div>
        ${m.lineups ? ['home', 'away'].map((sd) => `<div class="panel"><div class="panel-head"><h3>${esc(m[sd].name)}</h3><span class="sub">${esc(m.lineups[sd].formation || '')}${m.lineups[sd].coach ? ' · ' + esc(m.lineups[sd].coach) : ''}</span></div><ul class="squadlist">${(m.lineups[sd].start || []).map((p) => `<li><span class="num">${p.number ?? ''}</span><span>${esc(p.name)}</span><small class="dim">${esc(p.position || '')}</small></li>`).join('')}${(m.lineups[sd].bench || []).map((p) => `<li class="sub"><span class="num">${p.number ?? ''}</span><span>${esc(p.name)}</span><small class="dim">bench</small></li>`).join('')}</ul></div>`).join('') : `<div class="panel span-all">${note('Line-ups are not available from the provider for this match yet.')}</div>`}</div></div>`;
    clearTimeout(timer); if (inplay) timer = setTimeout(() => load().catch(() => {}), Math.max(CONFIG.liveRefreshSeconds, r.refreshSeconds || 0) * 1000);
  };
  await load();
}
export function destroy() { clearTimeout(timer); clearInterval(playTimer); timer = playTimer = null; }
