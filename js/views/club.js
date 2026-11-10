/**
 * Club intelligence dashboard. Everything is derived from match results in the snapshot (2010 →) plus the rating
 * models. Metrics that need an event feed (possession, passing, shots, xG) are listed as unavailable, never estimated.
 */
import { $, esc, html, fmt, seg, segmented, options, mean, ICON } from '../core/dom.js';
import { club, league, season as loadSeason, SEASON, modelState, eloHistory, getJSON, clubsOf } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, teamLink, formDots, stat, note, source, favBtn, probBar } from '../components/ui.js';
import { table, clubMatches, clubFixtures, positionsByMatchday, played } from '../models/standings.js';
import { chart, lineSeries, areaStyle, radar, bars, css } from '../charts/charts.js';
import { predictMatch } from '../models/predict.js';
import { isLive, liveSquad } from '../services/live.js';

export const title = (p) => club(p.id).name;
const UNAVAILABLE = ['Possession', 'Passing accuracy', 'Shots per game', 'xG and xGA', 'xG difference'];

export async function render(el, { id }, q) {
  const c = club(id);
  if (c.past) { el.innerHTML = `<div class="container page-head"><h1>${esc(c.name)}</h1><p class="lead">This club is not in a covered league in ${fmt.season(SEASON)}. Its past seasons are in the <a class="link" href="#/history">Time Machine</a>.</p></div>`; return; }
  const lg = league(c.league), seasonsIn = lg.seasons.map((s) => s.season);
  const [state, hist] = await Promise.all([modelState(), eloHistory()]);
  const files = await Promise.all(seasonsIn.map((s) => loadSeason(c.league, s)));
  const mine = files.filter((f) => f.teams.includes(id));
  const sKey = mine.some((f) => f.season === q.season) ? q.season : SEASON, s = mine.find((f) => f.season === sKey);
  const t = table(s), r = t.find((x) => x.id === id), h = table(s, { venue: 'home' }).find((x) => x.id === id), a = table(s, { venue: 'away' }).find((x) => x.id === id);
  const ms = clubMatches(s, id), fx = sKey === SEASON ? clubFixtures(s, id, 5) : [];
  const eloList = Object.entries(state.clubs).sort((x, y) => y[1].elo - x[1].elo).map(([k]) => k), me = state.clubs[id];
  document.documentElement.style.setProperty('--team-a', c.colors[0]);

  el.innerHTML = html`
  <div class="club-hero" style="--c:${c.colors[0]};--c2:${c.colors[1]}"><div class="container club-hero-in">
    <div class="ch-crest">${crest(id, 148, { lazy: false })}</div>
    <div class="ch-main"><div class="row"><a class="chip" href="#/league/${lg.id}">${esc(lg.name)}</a><span class="chip">${esc(lg.country)}</span>${favBtn('clubs', id, c.name)}</div>
      <h1>${esc(c.name)}</h1><p class="lead">${fmt.ord(r.pos)} of ${t.length} in ${fmt.season(sKey)} · ${r.pts} points from ${r.p} matches · home ground ${esc(c.ground)}</p></div>
    <div class="ch-side"><label class="field">Season<select class="select" id="season">${options(mine.map((f) => [f.season, fmt.season(f.season)]).reverse(), sKey)}</select></label>
      <a class="btn sm" href="#/compare?mode=club&a=${id}">Compare with another club ${ICON.arrow}</a></div></div></div>
  <div class="container"><section class="section" style="padding-top:26px">
    <div class="stats">${stat('Record (W-D-L)', `${r.w}-${r.d}-${r.l}`, `${r.ppg.toFixed(2)} points per match`)}${stat('Goals scored', r.gf, r.p ? (r.gf / r.p).toFixed(2) + ' per match' : '')}${stat('Goals conceded', r.ga, r.p ? (r.ga / r.p).toFixed(2) + ' per match' : '')}${stat('Goal difference', fmt.signed(r.gd))}${stat('Clean sheets', r.cs, r.p ? fmt.pct(r.cs / r.p) + ' of matches' : '')}${stat('Elo rating', Math.round(me.elo), `#${eloList.indexOf(id) + 1} of 96 · as of ${fmt.date(state.asOf)}`)}</div>
    <div class="grid g-23" style="margin-top:18px">
      <div class="panel"><div class="panel-head"><h3>Club profile</h3></div><dl class="kv-list"><dt>Full name</dt><dd>${esc(c.name)}</dd><dt>Country</dt><dd>${esc(lg.country)}</dd><dt>League</dt><dd>${esc(lg.name)}</dd><dt>Home ground</dt><dd>${esc(c.ground)}</dd><dt>Top-flight seasons in data</dt><dd class="num">${mine.length} of ${files.length}</dd><dt>Manager</dt><dd id="mgr"><span class="na">Not available</span></dd><dt>Trophy history</dt><dd><span class="na">Not available</span></dd></dl>
        <div id="squad" style="margin-top:14px"></div></div>
      <div class="panel"><div class="panel-head"><h3>Results and fixtures</h3><span class="sub">${fmt.season(sKey)}</span></div><div class="grid g2"><div><h4 class="dim" style="margin-bottom:8px">Last five</h4><ul class="mini">${ms.slice(-5).reverse().map((m) => `<li><span class="formdots"><i class="${m.res}">${m.res}</i></span>${teamLink(m.opp, { size: 22 })}<span class="dim small">${m.home ? 'H' : 'A'}</span><b class="num">${m.gf}–${m.ga}</b></li>`).join('') || '<li class="dim">No results yet</li>'}</ul></div>
        <div><h4 class="dim" style="margin-bottom:8px">Next up</h4><ul class="mini">${fx.map((f) => { const p = predictMatch(state, { home: f.home ? id : f.opp, away: f.home ? f.opp : id, date: f.date }), win = f.home ? p.ensemble[0] : p.ensemble[2];
          return `<li><span class="dim small num">${fmt.date(f.date, { day: 'numeric', month: 'short' })}</span>${teamLink(f.opp, { size: 22 })}<span class="dim small">${f.home ? 'H' : 'A'}</span><b class="num" title="Ensemble win probability">${fmt.pct(win)}</b></li>`; }).join('') || `<li class="dim">${sKey === SEASON ? 'No fixtures left in the snapshot' : 'Season complete'}</li>`}</ul>${fx.length ? '<p class="src" style="margin-top:8px">Percentage: forecast win probability.</p>' : ''}</div></div></div></div>
  </section>
  <section class="section"><div class="section-head"><div><h2>Season performance</h2><p>Points and league position after every match of ${fmt.season(sKey)}.</p></div></div>
    <div class="grid g-32"><div class="panel"><div class="chart" id="c-season" style="--h:340px"></div></div>
      <div class="panel"><div class="panel-head"><h3>Attack and defence profile</h3><span class="sub">Percentile in ${esc(lg.name)}</span></div><div class="chart" id="c-radar" style="--h:320px"></div></div></div></section>
  <section class="section"><div class="section-head"><div><h2>Form and venue</h2><p>Rolling averages smooth out single results. Choose the window.</p></div><div id="roll">${seg([['5', 'Last 5'], ['10', 'Last 10'], ['20', 'Last 20']], '5')}</div></div>
    <div class="grid g-32"><div class="panel"><div class="panel-head"><h3>Rolling goals for and against</h3></div><div class="chart" id="c-roll" style="--h:300px"></div><p class="src">Rolling window runs across season boundaries so early-season points are still averages of real matches.</p></div>
      <div class="panel"><div class="panel-head"><h3>Home and away</h3></div><div class="chart" id="c-venue" style="--h:300px"></div></div></div></section>
  <section class="section"><div class="section-head"><div><h2>League-relative ranking</h2><p>Where ${esc(c.short)} stands among the ${t.length} clubs on each measure. Rank 1 is best.</p></div></div>
    <div class="grid g-23"><div class="panel"><ul class="ranklist" id="ranks"></ul></div><div class="panel"><div class="panel-head"><h3>Goals by half</h3><span class="sub">From half-time and full-time scores</span></div><div class="chart" id="c-half" style="--h:280px"></div><p class="src">Shot locations need an event-data feed, so the snapshot shows when goals came instead.</p></div></div></section>
  <section class="section"><div class="section-head"><div><h2>History</h2><p>Final league position, points and end-of-season Elo for every top-flight season since ${fmt.season(seasonsIn[0])}.</p></div></div>
    <div class="grid g2"><div class="panel"><div class="chart" id="c-hist" style="--h:320px"></div></div><div class="panel"><div class="chart" id="c-elo" style="--h:320px"></div></div></div>
    <div style="margin-top:16px">${note(`Not in the open snapshot for club seasons: ${UNAVAILABLE.join(', ')}. These need licensed event data and are shown as unavailable instead of being estimated. The <a class="link" href="#/tactics">Tactics Lab</a> shows them for matches that do have event data.`)}</div>${source(s.source, s.fetchedAt, s.sourceUrl)}</section></div>`;

  /* season line */
  const pm = positionsByMatchday(s), cols = [css('--blue'), css('--green'), css('--gold'), css('--red')];
  chart($('#c-season', el), { aria: 'Points and position by matchday', xAxis: { type: 'category', data: pm.matchdays }, yAxis: [{ type: 'value', name: 'Points' }, { type: 'value', name: 'Position', inverse: true, min: 1, max: t.length, splitLine: { show: false } }],
    series: [lineSeries('Points', pm.points[id], cols[0], { areaStyle: areaStyle(cols[0]) }), lineSeries('Position', pm.positions[id], cols[1], { yAxisIndex: 1, smooth: false, step: 'middle' })] });
  /* radar: percentile of each metric inside the league */
  const pct = (rows, fn, low = false) => { const v = rows.filter((x) => x.p).map(fn), mineV = fn(rows.find((x) => x.id === id)); if (v.length < 2) return 50; const below = v.filter((x) => (low ? x > mineV : x < mineV)).length; return Math.round(100 * below / (v.length - 1)); };
  const H = table(s, { venue: 'home' }), A = table(s, { venue: 'away' }), F = table(s, { last: 5 });
  const metrics = [['Goals scored', pct(t, (x) => x.gf / (x.p || 1))], ['Goals conceded', pct(t, (x) => x.ga / (x.p || 1), true)], ['Clean sheets', pct(t, (x) => x.cs / (x.p || 1))], ['Home points', pct(H, (x) => x.ppg)], ['Away points', pct(A, (x) => x.ppg)], ['Form, last 5', pct(F, (x) => x.pts)], ['Scored in', pct(t, (x) => 1 - x.fts / (x.p || 1))]];
  radar($('#c-radar', el), metrics.map((m) => m[0]), [{ name: c.short, values: metrics.map((m) => m[1]), color: cols[0] }, { name: 'League median', values: metrics.map(() => 50), color: css('--text-3') }], { aria: 'Percentile profile' });
  /* rolling window across seasons */
  const allMs = mine.flatMap((f) => clubMatches(f, id).map((m) => ({ ...m, season: f.season }))), upTo = allMs.filter((m) => m.season <= sKey);
  const drawRoll = (w) => { const from = upTo.findIndex((m) => m.season === sKey), xs = [], gf = [], ga = [];
    for (let i = Math.max(0, from); i < upTo.length; i++) { const win = upTo.slice(Math.max(0, i - w + 1), i + 1); xs.push(upTo[i].md); gf.push(+mean(win, (m) => m.gf).toFixed(2)); ga.push(+mean(win, (m) => m.ga).toFixed(2)); }
    $('#c-roll', el).__chart?.dispose();
    chart($('#c-roll', el), { aria: `Rolling ${w}-match goals`, xAxis: { type: 'category', data: xs, name: 'Matchday', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'Goals per match' }, series: [lineSeries('Scored', gf, cols[1], { areaStyle: areaStyle(cols[1], .16) }), lineSeries('Conceded', ga, cols[3])] }); };
  drawRoll(5); segmented($('#roll .seg', el), (v) => drawRoll(Number(v)));
  bars($('#c-venue', el), ['Points / match', 'Goals for / match', 'Goals against / match', 'Win rate'], [
    { name: 'Home', color: cols[0], data: [h.ppg, h.p ? h.gf / h.p : 0, h.p ? h.ga / h.p : 0, h.p ? h.w / h.p : 0].map((v) => +v.toFixed(2)) },
    { name: 'Away', color: cols[1], data: [a.ppg, a.p ? a.gf / a.p : 0, a.p ? a.ga / a.p : 0, a.p ? a.w / a.p : 0].map((v) => +v.toFixed(2)) }], { aria: 'Home versus away' });
  /* league-relative ranks */
  const rank = (rows, fn, low = false) => [...rows].sort((x, y) => (low ? fn(x) - fn(y) : fn(y) - fn(x))).findIndex((x) => x.id === id) + 1;
  const leagueElo = clubsOf(c.league).map((x) => x.id).sort((x, y) => state.clubs[y].elo - state.clubs[x].elo);
  const ranks = [['Points per match', rank(t, (x) => x.ppg)], ['Goals scored per match', rank(t, (x) => x.gf / (x.p || 1))], ['Goals conceded per match', rank(t, (x) => x.ga / (x.p || 1), true)], ['Goal difference', rank(t, (x) => x.gd)], ['Clean sheets', rank(t, (x) => x.cs)], ['Home points per match', rank(H, (x) => x.ppg)], ['Away points per match', rank(A, (x) => x.ppg)], ...(sKey === SEASON ? [['Elo rating', leagueElo.indexOf(id) + 1]] : [])];
  $('#ranks', el).innerHTML = ranks.map(([k, v]) => `<li><span>${k}</span><div class="meter ${v <= 4 ? 'green' : ''}"><i style="--w:${(100 * (t.length - v + 1) / t.length).toFixed(0)}%"></i></div><b class="num">${fmt.ord(v)}</b></li>`).join('');
  /* goals by half */
  const i = s.teams.indexOf(id); let f1 = 0, f2 = 0, a1 = 0, a2 = 0, withHt = 0;
  for (const m of s.matches) { if (!played(m) || m[7] == null || (m[3] !== i && m[4] !== i)) continue; withHt++; const home = m[3] === i, gf = home ? m[5] : m[6], ga = home ? m[6] : m[5], hf = home ? m[7] : m[8], ha = home ? m[8] : m[7]; f1 += hf; f2 += gf - hf; a1 += ha; a2 += ga - ha; }
  if (withHt) bars($('#c-half', el), ['First half', 'Second half'], [{ name: 'Scored', color: cols[1], data: [f1, f2] }, { name: 'Conceded', color: cols[3], data: [a1, a2] }], { aria: 'Goals by half' });
  else $('#c-half', el).outerHTML = '<div class="empty">Half-time scores are not recorded for this season.</div>';
  /* history */
  const finals = mine.map((f) => { const tt = table(f), rr = tt.find((x) => x.id === id); return { season: f.season, pos: rr.pos, pts: rr.pts, p: rr.p, n: tt.length }; });
  chart($('#c-hist', el), { aria: 'League position and points by season', xAxis: { type: 'category', data: finals.map((x) => fmt.season(x.season).slice(2)) }, yAxis: [{ type: 'value', name: 'Position', inverse: true, min: 1, max: 20, interval: 1, axisLabel: { formatter: (v) => ([1, 5, 10, 15, 20].includes(v) ? v : '') } }, { type: 'value', name: 'Points', splitLine: { show: false } }],
    series: [{ name: 'Points', type: 'bar', yAxisIndex: 1, data: finals.map((x) => x.pts), itemStyle: { color: css('--bg-4'), borderRadius: [4, 4, 0, 0] }, barMaxWidth: 22 }, lineSeries('Position', finals.map((x) => x.pos), cols[2], { smooth: false, symbolSize: 8, showSymbol: true })] });
  const eh = (hist.history[id] || []);
  chart($('#c-elo', el), { aria: 'Elo rating by season', legend: false, xAxis: { type: 'category', data: eh.map((x) => fmt.season(x[0]).slice(2)) }, yAxis: { type: 'value', name: 'End-of-season Elo', scale: true }, series: [lineSeries('Elo', eh.map((x) => x[1]), cols[0], { areaStyle: areaStyle(cols[0]), showSymbol: true })] });

  $('#season', el).addEventListener('change', (e) => (location.hash = `#/club/${id}${e.target.value === SEASON ? '' : '?season=' + e.target.value}`));
  if (isLive()) liveSquad(id).then((d) => { if (!el.isConnected) return; if (d.coach) $('#mgr', el).textContent = d.coach;
    if (d.squad?.length) $('#squad', el).innerHTML = `<h4 class="dim" style="margin-bottom:8px">Squad <span class="chip live">LIVE</span></h4><div class="squad">${d.squad.map((p) => `<span><b>${esc(p.name)}</b><small>${esc(p.position || '')}</small></span>`).join('')}</div><p class="src">${esc(d.provider)} · ${fmt.stamp(d.fetchedAt)}</p>`; }).catch(() => {});
  else $('#squad', el).innerHTML = `<p class="src">Manager, current squad and trophy history load from the live backend; they are not part of the open results archive.</p>`;
}
export function destroy() { document.documentElement.style.removeProperty('--team-a'); }
