/** Competitions directory: the five leagues, international club competitions, national-team tournaments, roadmap. */
import { $, esc, html, fmt, ICON } from '../core/dom.js';
import { leagues, currentSeasons, clubsOf, club, registry, ucl, worldCupIndex, SEASON } from '../core/store.js';
import { crest, flag, note } from '../components/ui.js';
import { table, uclLeaguePhase } from '../models/standings.js';
import { isLive } from '../services/live.js';

export const title = 'Leagues and competitions';
export async function render(el) {
  const [seasons, cl, wc] = await Promise.all([currentSeasons(), ucl(), worldCupIndex()]);
  const comps = Object.fromEntries(registry().competitions.map((c) => [c.id, c]));
  const last = wc.editions.at(-1), uclTop = uclLeaguePhase(cl)[0], final = cl.matches.find((m) => m.stage === 'final');
  const uclChampion = final ? (final.pen ? (final.pen[0] > final.pen[1] ? final.home : final.away) : (final.et || final.ft)[0] > (final.et || final.ft)[1] ? final.home : final.away) : null;
  const liveCard = (id, text) => `<a class="card comp" href="#/competition/${id}"><div class="row between"><h3>${esc(comps[id].name)}</h3><span class="chip ${isLive() ? 'live' : 'demo'}">${isLive() ? 'LIVE' : 'Backend'}</span></div><p class="muted small">${text}</p></a>`;
  el.innerHTML = html`<div class="container">
    <header class="page-head"><h1>Leagues and competitions</h1><p class="lead">Ninety-six clubs across five leagues, the 36-team Champions League, and every World Cup since 1930. Participants come from the season's data file, so promotions and relegations update themselves.</p></header>
    <section class="section"><div class="section-head"><div><h2>Top five leagues, ${fmt.season(SEASON)}</h2><p>Results to ${fmt.date(seasons[0].lastResult)}. Select a league for standings, fixtures, leaders and the title race.</p></div></div>
      <div class="lg-grid">${seasons.map((s, i) => { const lg = leagues().find((l) => l.id === s.league), t = table(s);
        return `<a class="card lgc reveal" style="--i:${i}" href="#/league/${lg.id}"><div class="lgc-top"><img class="flag" style="--s:44px" src="https://flagcdn.com/${lg.flag}.svg" alt="${esc(lg.country)}"><div><h3>${esc(lg.name)}</h3><span class="muted small">${esc(lg.country)} · ${s.teams.length} clubs · ${s.played}/${s.matches.length} played</span></div></div>
          <div class="lgc-lead">${crest(t[0].id, 54)}<div><span class="dim small">Leaders</span><b>${esc(club(t[0].id).name)}</b><span class="muted small num">${t[0].pts} pts from ${t[0].p}, ${fmt.signed(t[0].gd)} GD</span></div></div>
          <div class="lgc-crests">${clubsOf(lg.id).sort((a, b) => a.name.localeCompare(b.name)).map((c) => crest(c.id, 30)).join('')}</div></a>`; })}</div></section>
    <section class="section"><div class="section-head"><div><h2>International club competitions</h2><p>The Champions League uses the 36-club league phase introduced in 2024/25: eight matches each, top eight straight to the round of 16, ninth to 24th into a play-off round.</p></div></div>
      <div class="grid g3"><a class="card comp feature reveal" href="#/ucl"><div class="row between"><h3>UEFA Champions League</h3><span class="chip blue">2025/26 complete</span></div>
          <div class="lgc-lead">${uclChampion ? crest(uclChampion, 54) : ''}<div><span class="dim small">Winners</span><b>${esc(uclChampion ? club(uclChampion).name : 'Not available')}</b><span class="muted small">League phase won by ${esc(uclTop.name)} (${uclTop.pts} pts)</span></div></div><p class="muted small">League-phase table, all eight matchdays, play-offs and the full bracket. The 2026/27 edition loads from the live backend.</p></a>
        ${liveCard('uel', 'Same 36-club league-phase format as the Champions League. Standings and fixtures come from the live backend.')}${liveCard('uecl', '36 clubs, six league-phase matches each. Loaded from the live backend.')}${liveCard('cwc', 'The 32-club tournament: eight groups of four, then a knockout bracket. Loaded from the live backend.')}${liveCard('usc', 'Single match between the Champions League and Europa League winners. Loaded from the live backend.')}</div></section>
    <section class="section"><div class="section-head"><div><h2>National teams</h2><p>Tournament formats are stored per edition, never hard-coded: 13 teams in 1930, 32 from 1998, 48 in 2026.</p></div></div>
      <div class="grid g3"><a class="card comp feature reveal" href="#/worldcup/${last.year}"><div class="row between"><h3>FIFA World Cup</h3><span class="chip gold">${ICON.trophy} ${wc.editions.length} editions</span></div>
          <div class="lgc-lead">${flag(last.champion, 54)}<div><span class="dim small">${last.year} champions</span><b>${esc(last.champion)}</b><span class="muted small">${last.teams} teams · ${last.matches} matches · ${last.goals} goals</span></div></div><p class="muted small">Groups, bracket, scorers and results for every tournament from 1930 to ${last.year}.</p></a>
        <a class="card comp reveal" href="#/competition/euro"><div class="row between"><h3>UEFA European Championship</h3><span class="chip blue">Event data</span></div><p class="muted small">Euro 2024: all 51 matches with line-ups, timelines, shot maps and passing networks from StatsBomb Open Data.</p></a>
        <a class="card comp reveal" href="#/competition/copa"><div class="row between"><h3>Copa América</h3><span class="chip blue">Event data</span></div><p class="muted small">Copa América 2024: all 32 matches with full event data.</p></a>
        ${liveCard('wcq', 'Qualifying groups by confederation. Loaded from the live backend.')}</div></section>
    <section class="section"><div class="section-head"><div><h2>Coverage roadmap</h2><p>These competitions already have canonical ids and provider mappings in the registry. Adding one is a data task, not a code change.</p></div></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Competition</th><th>Type</th><th>football-data.org</th><th>API-Football id</th><th>Status</th></tr></thead><tbody>
        ${registry().competitions.filter((c) => c.status === 'planned').map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.kind)}</td><td>${c.fd ?? '<span class="na">not offered</span>'}</td><td class="num">${c.af}</td><td><span class="chip">Schema ready</span></td></tr>`)}</tbody></table></div>
      ${isLive() ? '' : `<div style="margin-top:14px">${note('Cards marked “Backend” need a sports-data API key, which must never ship in a static site. Deploy the worker in <code>backend/worker</code> and add its URL under My Dashboard → Data connection.')}</div>`}</section>
  </div>`;
}
