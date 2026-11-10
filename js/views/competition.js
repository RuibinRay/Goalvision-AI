/** Generic competition page: tournaments with event data (Euro 2024, Copa América 2024, World Cup 2022) and competitions that only exist through the live backend. */
import { $, esc, html, fmt, sum, ICON, sortable } from '../core/dom.js';
import { registry, sbIndex, sbPlayers } from '../core/store.js';
import { crest, flag, nation, note, source, tabs } from '../components/ui.js';
import { isLive, liveStandings, liveMatches, STATUS_LABEL } from '../services/live.js';
import { todayISO } from '../core/dom.js';

const SB = { euro: 'euro2024', copa: 'copa2024', wc2022: 'wc2022', euro2024: 'euro2024', copa2024: 'copa2024' };
export const title = (p) => registry().competitions.find((c) => c.id === p.id)?.name || 'Competition';

export async function render(el, { id }) {
  if (SB[id]) return tournament(el, SB[id]);
  const c = registry().competitions.find((x) => x.id === id);
  if (!c) { el.innerHTML = `<div class="container page-head"><h1>Unknown competition</h1><p class="lead"><a class="link" href="#/leagues">All competitions</a></p></div>`; return; }
  el.innerHTML = html`<div class="container"><header class="page-head"><div class="row"><span class="chip ${isLive() ? 'live' : 'demo'}">${isLive() ? 'LIVE' : 'Needs the live backend'}</span><span class="chip">${esc(c.kind)}</span></div><h1>${esc(c.name)}</h1>
      <p class="lead">This competition is covered through the live data backend only. No open archive carries its current season, so GOALVISION AI shows nothing here until a provider is connected, instead of placeholder teams.</p></header>
    <div class="grid g2"><div class="panel"><div class="panel-head"><h3>Provider mapping</h3></div><dl class="kv-list"><dt>Canonical id</dt><dd>${esc(c.id)}</dd><dt>API-Football league id</dt><dd class="num">${c.af ?? '–'}</dd><dt>football-data.org code</dt><dd>${c.fd ?? '<span class="na">not offered</span>'}</dd><dt>Status</dt><dd>${c.status === 'planned' ? 'Schema ready' : 'Live only'}</dd></dl></div>
      <div class="panel" id="box">${isLive() ? '<div class="skeleton" style="height:160px"></div>' : note('Connect a backend under <a class="link" href="#/dashboard?tab=data">My Dashboard → Data connection</a>. The worker in <code>backend/worker</code> keeps the API key in an environment variable, caches responses and rate-limits visitors.', 'warn')}</div></div></div>`;
  if (!isLive()) return;
  const box = $('#box', el);
  try {
    const [st, ms] = await Promise.allSettled([liveStandings(id), liveMatches(todayISO(), id)]);
    let out = '';
    if (st.status === 'fulfilled' && st.value.table?.length) out += `<div class="panel-head"><h3>Standings</h3><span class="src">${esc(st.value.provider)} · ${fmt.stamp(st.value.fetchedAt)}</span></div><div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Team</th><th class="n">P</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>${st.value.table.map((r) => `<tr><td class="num">${r.pos}</td><td><span class="team">${r.club ? crest(r.club, 22) : ''}<span>${esc(r.name)}</span></span></td><td class="n">${r.p}</td><td class="n">${fmt.signed(r.gd)}</td><td class="n pts">${r.pts}</td></tr>`).join('')}</tbody></table></div>`;
    if (ms.status === 'fulfilled' && ms.value.matches?.length) out += `<div class="panel-head" style="margin-top:16px"><h3>Today</h3></div><div class="fx-list">${ms.value.matches.map((m) => `<a class="fx" href="#/match/live~${encodeURIComponent(m.id)}"><span class="team"><span>${esc(m.home.name)}</span></span><span class="mid"><span class="score num">${m.score.home ?? '–'}–${m.score.away ?? '–'}</span><span class="when">${STATUS_LABEL[m.status] || m.status}</span></span><span class="team"><span>${esc(m.away.name)}</span></span></a>`).join('')}</div>`;
    box.innerHTML = out || note('The provider returned no standings or matches for this competition today. Its plan may not include it.', 'warn');
  } catch (e) { box.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

async function tournament(el, comp) {
  const [idx, pl] = await Promise.all([sbIndex(comp), sbPlayers(comp)]);
  const stages = [...new Set(idx.matches.map((m) => m.stage))];
  const teams = {};
  for (const m of idx.matches) [[m.home, m.away, 0], [m.away, m.home, 1]].forEach(([t, o, s]) => { const r = (teams[t.name] ||= { name: t.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, xg: 0, xga: 0, poss: 0 }); r.p++; r.gf += t.score; r.ga += o.score; r.xg += m.stats[s].xg; r.xga += m.stats[1 - s].xg; r.poss += m.stats[s].poss; if (t.score > o.score) r.w++; else if (t.score === o.score) r.d++; else r.l++; });
  const fin = idx.matches.find((m) => m.stage === 'Final'), champ = fin ? (fin.pens ? (fin.pens[0] > fin.pens[1] ? fin.home.name : fin.away.name) : fin.home.score > fin.away.score ? fin.home.name : fin.away.name) : null;
  el.innerHTML = html`<div class="container"><header class="page-head"><div class="row"><span class="chip blue">Full event data</span><span class="chip">${idx.matches.length} matches · ${pl.players.length} players</span></div><h1>${esc(idx.name)}</h1>
      ${champ ? `<div class="wc-champ" style="margin-top:6px">${flag(champ, 72)}<div><span class="dim small">Champions</span><h2>${esc(champ)}</h2></div></div>` : ''}
      <p class="lead">Every match can be opened as a replay with line-ups, timeline, shots and xG. Players from this tournament are in the <a class="link" href="#/players?comp=${comp}">player database</a>.</p></header>
    <div class="tabs" role="tablist"><button type="button" data-tab="matches">Matches</button><button type="button" data-tab="teams">Teams</button><button type="button" data-tab="scorers">Scorers</button></div>
    <section data-pane="matches">${stages.slice().reverse().map((st) => `<h3 style="margin:18px 0 10px">${esc(st)}</h3><div class="grid g3">${idx.matches.filter((m) => m.stage === st).map((m) => `<a class="card mcard" href="#/match/sb~${m.id}"><div class="row between small muted"><span>${fmt.date(m.date)}${m.group ? ' · ' + esc(m.group) : ''}</span><span>xG ${m.stats[0].xg.toFixed(1)}–${m.stats[1].xg.toFixed(1)}</span></div><div class="mc-teams"><span class="team">${flag(m.home.name, 26)}<span>${esc(m.home.name)}</span></span><b class="num">${m.home.score}–${m.away.score}${m.pens ? `<small> (${m.pens[0]}–${m.pens[1]} p)</small>` : ''}</b><span class="team">${flag(m.away.name, 26)}<span>${esc(m.away.name)}</span></span></div></a>`).join('')}</div>`).join('')}</section>
    <section data-pane="teams" hidden><div class="table-wrap"><table class="t" id="tt"><thead><tr><th data-sort="name">Team</th><th class="n" data-sort="p">P</th><th class="n" data-sort="w">W</th><th class="n" data-sort="d">D</th><th class="n" data-sort="l">L</th><th class="n" data-sort="gf">GF</th><th class="n" data-sort="ga">GA</th><th class="n" data-sort="xg">xG</th><th class="n" data-sort="xga">xGA</th><th class="n" data-sort="xgd">xG diff / match</th><th class="n" data-sort="poss">Possession</th></tr></thead><tbody>
      ${Object.values(teams).sort((a, b) => b.p - a.p || (b.xg - b.xga) - (a.xg - a.xga)).map((r) => `<tr data-name="${esc(r.name)}" data-p="${r.p}" data-w="${r.w}" data-d="${r.d}" data-l="${r.l}" data-gf="${r.gf}" data-ga="${r.ga}" data-xg="${r.xg.toFixed(2)}" data-xga="${r.xga.toFixed(2)}" data-xgd="${((r.xg - r.xga) / r.p).toFixed(3)}" data-poss="${(r.poss / r.p).toFixed(1)}"><td>${nation(r.name)}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gf}</td><td class="n">${r.ga}</td><td class="n">${r.xg.toFixed(1)}</td><td class="n">${r.xga.toFixed(1)}</td><td class="n ${r.xg > r.xga ? 'pos' : 'neg'}">${fmt.signed((r.xg - r.xga) / r.p, 2)}</td><td class="n">${(r.poss / r.p).toFixed(1)}%</td></tr>`)}</tbody></table></div><p class="src">Draws include matches settled on penalties. Possession is the share of passes.</p></section>
    <section data-pane="scorers" hidden><div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Player</th><th>Team</th><th class="n">Goals</th><th class="n">Assists</th><th class="n">xG</th><th class="n">Minutes</th></tr></thead><tbody>${pl.players.filter((p) => p.g > 0).slice(0, 25).map((p, i) => `<tr data-href="#/player/${comp}/${p.id}" style="cursor:pointer"><td class="num dim">${i + 1}</td><td><a class="link" href="#/player/${comp}/${p.id}">${esc(p.n)}</a></td><td>${nation(p.t)}</td><td class="n pts">${p.g}</td><td class="n">${p.a}</td><td class="n">${p.xg.toFixed(2)}</td><td class="n">${p.min}</td></tr>`).join('')}</tbody></table></div></section>
    ${source('StatsBomb Open Data', idx.generatedAt, idx.sourceUrl)}</div>`;
  sortable($('#tt', el)); tabs(el)('matches');
}
