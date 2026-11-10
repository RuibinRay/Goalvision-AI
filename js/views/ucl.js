/** UEFA Champions League, league-phase era: 36-club table, eight matchdays, play-offs and the knockout bracket. */
import { $, esc, html, fmt, seg, segmented, sortable, options } from '../core/dom.js';
import { ucl, club } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, formDots, note, source, tabs } from '../components/ui.js';
import { uclLeaguePhase, ties } from '../models/standings.js';
import { isLive, liveStandings } from '../services/live.js';

export const title = 'UEFA Champions League';
const STAGES = [['playoff', 'Knockout play-offs'], ['r16', 'Round of 16'], ['qf', 'Quarter-finals'], ['sf', 'Semi-finals'], ['final', 'Final']];
export async function render(el, _p, q) {
  const d = await ucl('2025-26'), t = uclLeaguePhase(d), team = Object.fromEntries(d.teams.map((x) => [x.id, x]));
  const tl = (id, size = 24) => `<span class="team">${team[id]?.club ? crest(id, size) : `<span class="crest mono" style="--s:${size}px">${esc(team[id]?.country || '')}</span>`}<span>${esc(team[id]?.name || id)}</span></span>`;
  const score = (m) => (m.ft ? `${m.ft[0]}–${m.ft[1]}${m.et ? ` <small class="dim">aet ${m.et[0]}–${m.et[1]}</small>` : ''}${m.pen ? ` <small class="dim">pens ${m.pen[0]}–${m.pen[1]}</small>` : ''}` : m.time || 'TBC');
  let md = Number(q.md) || 8, focus = q.club && team[q.club] ? q.club : null;
  el.innerHTML = html`<div class="container">
    <header class="page-head"><div class="row"><span class="chip blue">Season 2025/26 · complete</span><span class="chip ${isLive() ? 'live' : 'demo'}">2026/27 ${isLive() ? 'live below' : 'needs the live backend'}</span></div><h1>UEFA Champions League</h1>
      <p class="lead">One table of 36 clubs. Each plays eight different opponents; places 1–8 go straight to the round of 16, 9–24 meet in two-legged play-offs, 25–36 are eliminated.</p></header>
    <div class="tabs" role="tablist"><button data-tab="table" type="button">League phase</button><button data-tab="md" type="button">Matchdays</button><button data-tab="bracket" type="button">Knockout bracket</button><button data-tab="live" type="button">2026/27</button></div>
    <section data-pane="table"><div class="grid g-side"><div><div class="table-wrap" id="tbl"><table class="t"><thead><tr><th data-sort="pos">#</th><th data-sort="name">Club</th><th class="n" data-sort="p">P</th><th class="n" data-sort="w">W</th><th class="n" data-sort="d">D</th><th class="n" data-sort="l">L</th><th class="n" data-sort="gf">GF</th><th class="n" data-sort="ga">GA</th><th class="n" data-sort="gd">GD</th><th class="n" data-sort="pts">Pts</th><th>Form</th></tr></thead><tbody>
        ${t.map((r) => `<tr data-club-row="${r.id}" data-pos="${r.pos}" data-name="${esc(r.name)}" data-p="${r.p}" data-w="${r.w}" data-d="${r.d}" data-l="${r.l}" data-gf="${r.gf}" data-ga="${r.ga}" data-gd="${r.gd}" data-pts="${r.pts}" tabindex="0"><td class="pos num z-${r.zone}">${r.pos}</td><td>${tl(r.id)} <small class="dim">${r.country}</small></td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gf}</td><td class="n">${r.ga}</td><td class="n">${fmt.signed(r.gd)}</td><td class="n pts">${r.pts}</td><td>${formDots(r.form.slice(-5), 'sm')}</td></tr>`)}</tbody></table></div>
        <div class="legend"><span class="z-r16"><i></i>1–8: round of 16</span><span class="z-playoff"><i></i>9–24: knockout play-offs</span><span class="z-out"><i></i>25–36: eliminated</span></div><p class="src">Order: points, goal difference, goals scored, away goals scored, wins, away wins.</p></div>
        <aside class="panel" id="sched"></aside></div></section>
    <section data-pane="md" hidden><div id="mdseg" style="margin-bottom:14px">${seg([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, 'Matchday ' + n]), md)}</div><div class="panel flush" id="mdlist"></div></section>
    <section data-pane="bracket" hidden><div class="bracket" id="bracket"></div></section>
    <section data-pane="live" hidden><div id="livebox"></div></section>
    ${source(d.source, d.fetchedAt, 'https://github.com/openfootball/champions-league')}</div>`;
  sortable($('#tbl table', el));
  const drawSched = () => {
    const id = focus || t[0].id, r = t.find((x) => x.id === id), ms = d.matches.filter((m) => m.stage === 'league' && (m.home === id || m.away === id));
    $('#sched', el).innerHTML = html`<div class="panel-head"><h3>${esc(r.name)}</h3><span class="chip ${r.zone === 'r16' ? 'live' : r.zone === 'out' ? 'red' : ''}">${fmt.ord(r.pos)} · ${r.pts} pts</span></div><p class="muted small" style="margin-bottom:10px">Eight league-phase matches, four at home and four away. Select any row in the table to switch club.</p>
      <ul class="mini">${ms.map((m) => { const home = m.home === id, opp = home ? m.away : m.home, gf = home ? m.ft[0] : m.ft[1], ga = home ? m.ft[1] : m.ft[0], res = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
        return `<li><span class="formdots"><i class="${res}">${res}</i></span>${tl(opp, 22)}<span class="dim small">${home ? 'H' : 'A'} · MD${m.md}</span><b class="num">${gf}–${ga}</b></li>`; })}</ul>`;
    el.querySelectorAll('[data-club-row]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.clubRow === id));
  };
  drawSched();
  const pick = (ev) => { const tr = ev.target.closest('[data-club-row]'); if (!tr || (ev.type === 'keydown' && ev.key !== 'Enter')) return; focus = tr.dataset.clubRow; setQuery({ club: focus }); drawSched(); };
  $('#tbl', el).addEventListener('click', pick); $('#tbl', el).addEventListener('keydown', pick);
  const drawMd = () => { let day = ''; $('#mdlist', el).innerHTML = `<div class="fx-list">${d.matches.filter((m) => m.stage === 'league' && m.md === md).map((m) => { const head = m.date !== day ? `<div class="fx-day">${fmt.day(m.date)}</div>` : ''; day = m.date;
    return head + `<div class="fx">${tl(m.home)}<span class="mid"><span class="score num">${score(m)}</span><span class="when">${m.ht ? `HT ${m.ht[0]}–${m.ht[1]}` : ''}</span></span>${tl(m.away)}</div>`; }).join('')}</div>`; };
  const drawBracket = () => { $('#bracket', el).innerHTML = STAGES.map(([k, name]) => `<div class="br-col"><h3>${name}</h3>${ties(d, k).map((x) => { const single = x.legs.length === 1, m = x.legs[0];
    const sA = single ? (m.et || m.ft)[m.home === x.a ? 0 : 1] : x.agg[0], sB = single ? (m.et || m.ft)[m.home === x.a ? 1 : 0] : x.agg[1], pen = x.pen ? `<small class="dim">pens ${x.pen[0]}–${x.pen[1]}</small>` : '';
    return `<div class="tie"><div class="${x.winner === x.a ? 'won' : ''}">${tl(x.a, 22)}<b class="num">${sA}</b></div><div class="${x.winner === x.b ? 'won' : ''}">${tl(x.b, 22)}<b class="num">${sB}</b></div><small class="dim">${single ? fmt.date(m.date) + (m.et ? ' · after extra time' : '') : `Aggregate over two legs: ${x.legs.map((l) => `${l.ft[0]}–${l.ft[1]}`).join(', ')}`} ${pen}</small></div>`; }).join('')}</div>`).join(''); };
  const drawLive = () => { const box = $('#livebox', el);
    if (!isLive()) { box.innerHTML = note('The 2026/27 league phase is not in the open archive yet. Connect the live backend (My Dashboard → Data connection) and this tab shows the current 36-club table with the same qualification thresholds.', 'warn'); return; }
    box.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    liveStandings('ucl').then((res) => { box.innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Club</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>${res.table.map((r) => `<tr><td class="pos num z-${r.pos <= 8 ? 'r16' : r.pos <= 24 ? 'playoff' : 'out'}">${r.pos}</td><td><span class="team">${r.club ? crest(r.club, 24) : ''}<span>${esc(r.name)}</span></span></td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${fmt.signed(r.gd)}</td><td class="n pts">${r.pts}</td></tr>`).join('')}</tbody></table></div><p class="src">${esc(res.provider)} · refreshed ${fmt.stamp(res.fetchedAt)}</p>`; })
      .catch((e) => { box.innerHTML = `<div class="error">The backend could not load the 2026/27 table: ${esc(e.message)}</div>`; }); };
  const drawn = new Set();
  const show = tabs(el, (n) => { setQuery({ tab: n === 'table' ? null : n }); if (drawn.has(n)) return; drawn.add(n); ({ md: drawMd, bracket: drawBracket, live: drawLive })[n]?.(); });
  show(['md', 'bracket', 'live'].includes(q.tab) ? q.tab : 'table');
  segmented($('#mdseg .seg', el), (v) => { md = Number(v); setQuery({ md }); drawMd(); });
}
