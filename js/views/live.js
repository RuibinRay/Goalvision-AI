/**
 * Live match centre. With a backend: real provider data, refreshed on the provider's cadence, last refresh shown.
 * Without one (DEMO): the dated fixture snapshot, with honest statuses, plus the archive of matches that have full
 * event data and can be replayed minute by minute.
 */
import { $, esc, html, fmt, seg, segmented, options, todayISO, ICON } from '../core/dom.js';
import { leagues, league, currentSeasons, sbIndex, SB_COMPS, registry } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, flag, fixtureRow, fixtureStatus, note } from '../components/ui.js';
import { played } from '../models/standings.js';
import { isLive, liveMatches, backendHealth, STATUS_LABEL, isInPlay } from '../services/live.js';
import { CONFIG } from '../core/config.js';

export const title = 'Live match centre';
let timer = null;
const shift = (iso, d) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

export async function render(el, _p, q) {
  const seasons = await currentSeasons(), today = todayISO();
  let date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : today, comp = q.league || 'all', arch = q.archive || 'wc2022', stage = 'all';
  const lastResult = seasons.map((s) => s.lastResult).sort().at(-1);
  const nextFixture = seasons.flatMap((s) => s.matches).filter((m) => !played(m) && m[1] >= today).map((m) => m[1]).sort()[0];
  el.innerHTML = html`<div class="container">
    <header class="page-head"><div class="row"><span class="chip ${isLive() ? 'live' : 'demo'}" id="mode">${isLive() ? 'LIVE' : 'DEMO'}</span><span class="src" id="refreshed"></span></div><h1>Live match centre</h1>
      <p class="lead">Scores, clocks, goalscorers and cards for every supported competition. Select a match for line-ups, the event timeline, statistics and visualisations.</p></header>
    <div class="toolbar"><div class="row"><button class="btn sm" id="prev" type="button" aria-label="Previous day">‹</button><label class="field"><span class="sr">Date</span><input class="input" type="date" id="date" value="${date}" style="width:170px"></label><button class="btn sm" id="next" type="button" aria-label="Next day">›</button>
        <button class="btn sm" id="today" type="button">Today</button>${lastResult ? `<button class="btn sm" id="jump-last" type="button">Latest results</button>` : ''}${nextFixture ? `<button class="btn sm" id="jump-next" type="button">Next fixtures</button>` : ''}</div>
      <div id="comp">${seg([['all', 'All'], ...leagues().map((l) => [l.id, l.name])], comp)}</div></div>
    <div id="board" aria-live="polite"></div>
    <section class="section" style="padding-bottom:0"><div class="section-head"><div><h2>Replay a match with full event data</h2><p>147 international matches with line-ups, every goal, card and substitution, shot maps with xG, passing networks and momentum. These are historical matches from StatsBomb Open Data and are labelled as replays.</p></div><div id="arch">${seg(SB_COMPS, arch, 'green')}</div></div>
      <div class="row" style="margin-bottom:14px"><label class="field" style="min-width:220px">Stage<select class="select" id="stage"></select></label></div><div class="grid g3" id="archive"></div></section></div>`;

  const board = $('#board', el);
  const snapshot = () => {
    const blocks = seasons.filter((s) => comp === 'all' || s.league === comp).map((s) => ({ s, ms: s.matches.filter((m) => m[1] === date) })).filter((b) => b.ms.length);
    const pending = blocks.some((b) => b.ms.some((m) => fixtureStatus(m).code === 'PENDING'));
    board.innerHTML = (blocks.length ? blocks.map((b) => `<div class="panel flush" style="margin-bottom:14px"><div class="panel-head" style="padding:14px 16px 0"><h3><a href="#/league/${b.s.league}">${esc(league(b.s.league).name)}</a></h3><span class="sub">Matchday ${b.ms[0][0] ?? ''}</span></div><div class="fx-list">${b.ms.map((m) => fixtureRow(b.s, m, { showDate: false })).join('')}</div></div>`).join('')
      : `<div class="empty"><h4>No fixture in the snapshot for ${fmt.day(date)}</h4>Use “Latest results” or “Next fixtures”, or pick another date.</div>`)
      + (isLive() ? '' : `<div style="margin-top:14px">${note(`<b>DEMO mode.</b> ${pending ? 'Some matches on this date have been played since the snapshot was built; their results are shown as pending instead of guessed. ' : ''}The fixture list and results come from a dated snapshot (results to ${fmt.date(lastResult)}). Live scores, clocks and events need the data backend: see <a class="link" href="#/dashboard?tab=data">My Dashboard → Data connection</a>.`, 'warn')}</div>`);
    $('#refreshed', el).textContent = `Snapshot built ${fmt.stamp(registry().generatedAt)}`;
  };
  const live = async () => {
    clearTimeout(timer);
    try {
      const res = await liveMatches(date, comp === 'all' ? '' : comp); if (!el.isConnected) return;
      // The site's own competitions first, under their own names and in registry order; anything else the provider lists follows.
      const known = [...registry().leagues, ...registry().competitions], order = known.map((c) => c.id), names = Object.fromEntries(known.map((c) => [c.id, c.name]));
      const rank = (ms) => { const i = order.indexOf(ms[0].competition); return i < 0 ? order.length : i; };
      const by = {}; res.matches.forEach((m) => (by[names[m.competition] || m.competitionName || m.competition] ||= []).push(m));
      board.innerHTML = Object.keys(by).length ? Object.entries(by).sort((a, b) => rank(a[1]) - rank(b[1])).map(([name, ms]) => `<div class="panel flush" style="margin-bottom:14px"><div class="panel-head" style="padding:14px 16px 0"><h3>${esc(name)}</h3></div><div class="fx-list">${ms.map((m) => {
        const inplay = isInPlay(m.status), mid = m.status === 'SCHEDULED' ? `<span class="ko num">${new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><span class="when">Kick-off</span>` : `<span class="score num">${m.score.home ?? '–'}–${m.score.away ?? '–'}</span><span class="when ${inplay ? 'accent' : ''}">${inplay && m.minute ? m.minute + "'" : STATUS_LABEL[m.status] || m.status}</span>`;
        const reds = (side) => (m.cards || []).filter((c) => c.side === side && c.kind !== 'yellow').length;
        return `<a class="fx" href="#/match/live~${encodeURIComponent(m.id)}"><span class="team">${m.home.club ? crest(m.home.club, 24) : ''}<span>${esc(m.home.name)}</span>${reds('home') ? `<i class="redcard" title="Red cards">${reds('home')}</i>` : ''}</span><span class="mid">${mid}</span><span class="team">${m.away.club ? crest(m.away.club, 24) : ''}<span>${esc(m.away.name)}</span>${reds('away') ? `<i class="redcard">${reds('away')}</i>` : ''}</span></a>${(m.goals || []).length ? `<div class="fx-goals">${m.goals.map((g) => `${esc(g.player || 'Goal')} ${g.minute}'`).join(' · ')}</div>` : ''}`; }).join('')}</div></div>`).join('') : `<div class="empty"><h4>No matches on ${fmt.day(date)}</h4>The provider lists nothing for this date and filter.</div>`;
      $('#refreshed', el).textContent = `${res.provider} · last successful refresh ${fmt.stamp(res.fetchedAt)}${res.cached ? ' (cached)' : ''}`;
      if (res.matches.some((m) => isInPlay(m.status))) timer = setTimeout(live, Math.max(CONFIG.liveRefreshSeconds, res.refreshSeconds || 0) * 1000);
    } catch (e) {
      if (!el.isConnected) return;
      snapshot(); board.insertAdjacentHTML('afterbegin', `<div class="error" style="margin-bottom:14px">Live data is unavailable right now (${esc(e.message)}). Showing the snapshot below; nothing here is live.</div>`);
      $('#mode', el).className = 'chip demo'; $('#mode', el).textContent = 'DEMO · backend offline';
    }
  };
  const draw = () => { $('#date', el).value = date; setQuery({ date: date === today ? null : date, league: comp === 'all' ? null : comp }); if (isLive()) { board.innerHTML = '<div class="skeleton" style="height:180px"></div>'; live(); } else snapshot(); };
  const go = (d) => { date = d; draw(); };
  $('#prev', el).addEventListener('click', () => go(shift(date, -1))); $('#next', el).addEventListener('click', () => go(shift(date, 1)));
  $('#today', el).addEventListener('click', () => go(today)); $('#jump-last', el)?.addEventListener('click', () => go(lastResult)); $('#jump-next', el)?.addEventListener('click', () => go(nextFixture));
  $('#date', el).addEventListener('change', (e) => e.target.value && go(e.target.value));
  segmented($('#comp .seg', el), (v) => { comp = v; draw(); });
  draw();

  const drawArchive = async () => {
    const idx = await sbIndex(arch); if (!el.isConnected) return;
    const stages = [...new Set(idx.matches.map((m) => m.stage))];
    $('#stage', el).innerHTML = options([['all', 'All stages'], ...stages.map((s) => [s, s])], stage);
    const list = idx.matches.filter((m) => stage === 'all' || m.stage === stage).reverse();
    $('#archive', el).innerHTML = list.map((m) => `<a class="card mcard" href="#/match/sb~${m.id}"><div class="row between small muted"><span>${esc(m.stage)}${m.group ? ' · ' + esc(m.group) : ''}</span><span class="chip">REPLAY</span></div>
      <div class="mc-teams"><span class="team">${flag(m.home.name, 28)}<span>${esc(m.home.name)}</span></span><b class="num">${m.home.score}–${m.away.score}${m.pens ? `<small> (${m.pens[0]}–${m.pens[1]} p)</small>` : ''}</b><span class="team">${flag(m.away.name, 28)}<span>${esc(m.away.name)}</span></span></div>
      <div class="row between small muted"><span>${fmt.date(m.date)} · ${esc(m.stadium || '')}</span><span>xG <b class="num">${m.stats[0].xg.toFixed(1)}–${m.stats[1].xg.toFixed(1)}</b></span></div></a>`).join('');
  };
  drawArchive();
  segmented($('#arch .seg', el), (v) => { arch = v; stage = 'all'; setQuery({ archive: v === 'wc2022' ? null : v }); drawArchive(); });
  $('#stage', el).addEventListener('change', (e) => { stage = e.target.value; drawArchive(); });
}
export function destroy() { clearTimeout(timer); timer = null; }
