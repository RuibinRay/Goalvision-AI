/** FIFA World Cup: every edition 1930 → 2026. Groups, bracket, results and scorers are derived from that edition's own data, so each format (13, 16, 24, 32, 48 teams) renders without special cases. */
import { $, esc, html, fmt, options, seg, segmented, ICON } from '../core/dom.js';
import { worldCup, worldCupIndex, modelState } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { flag, nation, note, source, tabs } from '../components/ui.js';
import { chart, css } from '../charts/charts.js';

export const title = (p) => 'FIFA World Cup' + (p.year ? ' ' + p.year : '');
const final = (m) => m.score.et || m.score.ft;
const outcome = (m) => { const s = final(m); if (!s) return null; if (s[0] !== s[1]) return s[0] > s[1] ? 1 : 2; return m.score.p ? (m.score.p[0] > m.score.p[1] ? 1 : 2) : 0; };
const scoreText = (m) => (m.score.ft ? `${final(m)[0]}–${final(m)[1]}${m.score.et ? ' <small class="dim">aet</small>' : ''}${m.score.p ? ` <small class="dim">pens ${m.score.p[0]}–${m.score.p[1]}</small>` : ''}` : m.time || 'TBC');

export async function render(el, p, q) {
  const idx = await worldCupIndex(), years = idx.editions.map((e) => e.year), year = years.includes(Number(p.year)) ? Number(p.year) : years.at(-1);
  const [d, state] = await Promise.all([worldCup(year), modelState()]), ed = idx.editions.find((e) => e.year === year);
  const groupMs = d.matches.filter((m) => m.group), ko = d.matches.filter((m) => !m.group);
  const koTeams = new Set(ko.flatMap((m) => [m.team1, m.team2]));
  const groups = [...new Set(groupMs.map((m) => m.group))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((g) => {
    const rows = new Map();
    for (const m of groupMs.filter((x) => x.group === g)) { const s = m.score.ft; for (const tname of [m.team1, m.team2]) if (!rows.has(tname)) rows.set(tname, { t: tname, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }); if (!s) continue;
      const a = rows.get(m.team1), b = rows.get(m.team2); a.p++; b.p++; a.gf += s[0]; a.ga += s[1]; b.gf += s[1]; b.ga += s[0];
      if (s[0] > s[1]) { a.w++; b.l++; a.pts += year >= 1994 ? 3 : 2; } else if (s[0] < s[1]) { b.w++; a.l++; b.pts += year >= 1994 ? 3 : 2; } else { a.d++; b.d++; a.pts++; b.pts++; } }
    return { g, rows: [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf) };
  });
  const rounds = []; for (const m of ko) { let r = rounds.find((x) => x.name === m.round); if (!r) rounds.push((r = { name: m.round, ms: [] })); r.ms.push(m); }
  const titles = {}; idx.editions.forEach((e) => { if (e.champion) { const k = e.champion === 'West Germany' ? 'Germany' : e.champion; titles[k] = (titles[k] || 0) + 1; } });

  el.innerHTML = html`<div class="container">
    <header class="page-head"><div class="row between"><div><div class="row"><span class="chip gold">${ICON.trophy} FIFA World Cup</span><span class="chip">${ed.teams} teams · ${ed.matches} matches · ${ed.goals} goals</span></div><h1 style="margin-top:12px">World Cup ${year}</h1></div>
      <label class="field" style="min-width:210px">Edition<select class="select" id="year">${options(idx.editions.map((e) => [e.year, `${e.year} · ${e.host}`]).reverse(), year)}</select></label></div>
      <div class="wc-podium"><div class="wc-champ">${flag(ed.champion, 96)}<div><span class="dim small">Champions</span><h2>${esc(ed.champion || 'Not available')}</h2><span class="muted">Hosted by ${esc(ed.host)}${ed.runnerUp ? ` · runners-up ${esc(ed.runnerUp)}` : ''}</span></div></div>
        ${ed.topScorer ? `<div class="stat"><span class="k">Top scorer</span><span class="v">${ed.topScorer.goals}</span><span class="s">${esc(ed.topScorer.name)} · ${esc(ed.topScorer.team)}</span></div>` : `<div class="stat na"><span class="k">Top scorer</span><span class="v">Not available</span><span class="s">Goal-scorer records are incomplete for ${year}</span></div>`}
        <div class="stat"><span class="k">Goals per match</span><span class="v num">${(ed.goals / ed.matches).toFixed(2)}</span><span class="s">${ed.goals} in ${ed.matches}</span></div></div></header>
    <div class="tabs" role="tablist">${[['groups', groups.length ? 'Groups' : 'Format'], ['bracket', 'Knockout bracket'], ['matches', 'All matches'], ['scorers', 'Scorers'], ['history', 'History']].map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`)}</div>
    <section data-pane="groups">${groups.length ? `<div class="grid g3">${groups.map((g) => `<div class="panel flush"><div class="panel-head" style="padding:14px 16px 0"><h3>${esc(g.g)}</h3></div><table class="t"><thead><tr><th>Team</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>
        ${g.rows.map((r, i) => `<tr><td class="pos ${koTeams.has(r.t) ? 'z-r16' : ''}" style="width:auto">${nation(r.t)}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${fmt.signed(r.gf - r.ga)}</td><td class="n pts">${r.pts}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>
        <div class="legend"><span class="z-r16"><i></i>Advanced to the next round (read from that edition's own fixtures)</span><span>${year >= 1994 ? '3 points for a win' : '2 points for a win'}</span></div>` : note('This edition was a straight knockout tournament with no group stage.')}</section>
    <section data-pane="bracket" hidden>${rounds.length ? `<div class="bracket">${rounds.map((r) => `<div class="br-col"><h3>${esc(r.name)}</h3>${r.ms.map((m) => { const o = outcome(m);
        return `<div class="tie"><div class="${o === 1 ? 'won' : ''}">${nation(m.team1)}<b class="num">${m.score.ft ? final(m)[0] : ''}</b></div><div class="${o === 2 ? 'won' : ''}">${nation(m.team2)}<b class="num">${m.score.ft ? final(m)[1] : ''}</b></div><small class="dim">${fmt.date(m.date)}${m.score.et ? ' · after extra time' : ''}${m.score.p ? ` · pens ${m.score.p[0]}–${m.score.p[1]}` : ''}${m.ground ? ' · ' + esc(m.ground) : ''}</small></div>`; }).join('')}</div>`).join('')}</div>` : note('The title was decided by a final group in this edition, so there is no knockout bracket. See the Groups tab.')}</section>
    <section data-pane="matches" hidden><div class="row" style="margin-bottom:14px"><label class="field" style="min-width:220px">Round<select class="select" id="rnd">${options([['all', 'All rounds'], ...[...new Set(d.matches.map((m) => m.group || m.round))].map((r) => [r, r])], 'all')}</select></label><label class="field" style="min-width:220px">Team<select class="select" id="tm">${options([['all', 'All teams'], ...[...new Set(d.matches.flatMap((m) => [m.team1, m.team2]))].sort().map((x) => [x, x])], 'all')}</select></label></div><div class="panel flush" id="mlist"></div></section>
    <section data-pane="scorers" hidden>${d.scorers ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Player</th><th>Team</th><th class="n">Goals</th></tr></thead><tbody>${d.scorers.slice(0, 30).map((s, i) => `<tr><td class="num dim">${i + 1}</td><td><b>${esc(s.name)}</b></td><td>${nation(s.team)}</td><td class="n pts">${s.goals}</td></tr>`).join('')}</tbody></table></div><p class="src">Own goals are not credited to a scorer.</p>` : note(`The archive does not list every goal-scorer for ${year}, so no scorers table is published for it.`, 'warn')}</section>
    <section data-pane="history" hidden><div class="grid g-32"><div class="table-wrap"><table class="t"><thead><tr><th>Year</th><th>Host</th><th>Champions</th><th>Runners-up</th><th class="n">Teams</th><th class="n">Goals / match</th></tr></thead><tbody>
        ${[...idx.editions].reverse().map((e) => `<tr data-href="#/worldcup/${e.year}" style="cursor:pointer"><td class="num"><a class="link" href="#/worldcup/${e.year}">${e.year}</a></td><td>${esc(e.host)}</td><td>${e.champion ? nation(e.champion) : ''}</td><td>${e.runnerUp ? nation(e.runnerUp) : ''}</td><td class="n">${e.teams}</td><td class="n">${(e.goals / e.matches).toFixed(2)}</td></tr>`)}</tbody></table></div>
        <div class="stack"><div class="panel"><div class="panel-head"><h3>Titles by nation</h3></div><div class="chart" id="c-titles" style="--h:300px"></div><p class="src">West Germany's titles are counted with Germany.</p></div><div class="panel"><div class="panel-head"><h3>Goals per match by edition</h3></div><div class="chart" id="c-gpm" style="--h:240px"></div></div></div></div></section>
    <div style="margin-top:22px" class="row"><a class="btn sm" href="#/compare?mode=nation">Compare two national teams ${ICON.arrow}</a>${year === 2022 ? `<a class="btn sm" href="#/competition/wc2022">Open 2022 match data (line-ups, shots, passing) ${ICON.arrow}</a>` : ''}</div>
    ${source(d.source, d.fetchedAt, 'https://github.com/openfootball/worldcup.json')}</div>`;

  const drawMatches = () => { const r = $('#rnd', el).value, tm = $('#tm', el).value, list = d.matches.filter((m) => (r === 'all' || (m.group || m.round) === r) && (tm === 'all' || m.team1 === tm || m.team2 === tm)); let day = '';
    $('#mlist', el).innerHTML = list.length ? `<div class="fx-list">${list.map((m) => { const head = m.date !== day ? `<div class="fx-day">${fmt.day(m.date)}</div>` : ''; day = m.date; const goals = [...(m.goals1 || []).map((g) => `${g.name} ${g.minute}'${g.penalty ? ' (pen)' : ''}${g.owngoal ? ' (og)' : ''}`), ...(m.goals2 || []).map((g) => `${g.name} ${g.minute}'${g.penalty ? ' (pen)' : ''}${g.owngoal ? ' (og)' : ''}`)];
      return head + `<div class="fx" title="${esc(goals.join(', '))}">${nation(m.team1)}<span class="mid"><span class="score num">${scoreText(m)}</span><span class="when">${esc(m.group || m.round || '')}</span></span>${nation(m.team2)}</div>`; }).join('')}</div>` : '<div class="empty" style="border:0">No match for that filter.</div>'; };
  const drawHistory = () => {
    const tt = Object.entries(titles).sort((a, b) => b[1] - a[1]);
    chart($('#c-titles', el), { aria: 'World Cup titles by nation', legend: false, grid: { left: 4 }, xAxis: { type: 'value', minInterval: 1 }, yAxis: { type: 'category', inverse: true, data: tt.map((x) => x[0]) }, series: [{ type: 'bar', data: tt.map((x) => x[1]), itemStyle: { color: css('--gold'), borderRadius: [0, 4, 4, 0] }, barMaxWidth: 18, label: { show: true, position: 'right', color: css('--text-2') } }] });
    chart($('#c-gpm', el), { aria: 'Goals per match by World Cup', legend: false, xAxis: { type: 'category', data: idx.editions.map((e) => e.year) }, yAxis: { type: 'value', scale: true }, series: [{ type: 'line', smooth: .3, data: idx.editions.map((e) => +(e.goals / e.matches).toFixed(2)), lineStyle: { color: css('--blue'), width: 2.5 }, itemStyle: { color: css('--blue') }, markPoint: { data: [{ coord: [String(year), +(ed.goals / ed.matches).toFixed(2)], symbol: 'circle', symbolSize: 14, itemStyle: { color: css('--green') } }] } }] });
  };
  const drawn = new Set();
  const show = tabs(el, (n) => { setQuery({ tab: n === 'groups' ? null : n }); if (drawn.has(n)) return; drawn.add(n); ({ matches: drawMatches, history: drawHistory })[n]?.(); });
  show(['bracket', 'matches', 'scorers', 'history'].includes(q.tab) ? q.tab : 'groups');
  $('#year', el).addEventListener('change', (e) => (location.hash = '#/worldcup/' + e.target.value));
  $('#rnd', el).addEventListener('change', drawMatches); $('#tm', el).addEventListener('change', drawMatches);
  el.addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-href]'); if (tr && !ev.target.closest('a')) location.hash = tr.dataset.href; });
}
