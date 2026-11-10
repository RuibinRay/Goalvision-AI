/**
 * The football assistant. It is deliberately NOT a language model: it recognises a set of question shapes, runs the
 * matching calculation on the bundled data and returns the rows with their source and date. If it cannot ground an
 * answer it says what it can answer instead of improvising.
 */
import { leagues, league, club, allClubs, season as loadSeason, SEASON, modelState, sbPlayers, sbIndex, SB_COMPS, worldCupIndex, worldCup } from '../core/store.js';
import { table } from './standings.js';
import { predictMatch } from './predict.js';
import { M } from './playerMetrics.js';

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LEAGUE_WORDS = { 'eng.1': ['premier league', 'england', 'english', 'epl'], 'esp.1': ['la liga', 'laliga', 'spain', 'spanish'], 'ita.1': ['serie a', 'italy', 'italian'], 'ger.1': ['bundesliga', 'germany', 'german'], 'fra.1': ['ligue 1', 'france', 'french'] };
const COMP_WORDS = { wc2022: ['world cup 2022', '2022 world cup', 'qatar'], euro2024: ['euro 2024', 'euros', 'european championship'], copa2024: ['copa america', 'copa'] };
const findLeague = (q) => Object.keys(LEAGUE_WORDS).find((id) => LEAGUE_WORDS[id].some((w) => q.includes(w)));
const findComp = (q) => Object.keys(COMP_WORDS).find((id) => COMP_WORDS[id].some((w) => q.includes(w)));
function findClubs(q) { const hits = []; for (const c of allClubs()) { const names = [c.name, c.short, ...c.aliases].map(fold).filter((n) => n.length > 3).sort((a, b) => b.length - a.length); const n = names.find((x) => q.includes(x)); if (n) hits.push({ c, at: q.indexOf(n), len: n.length }); }
  return hits.sort((a, b) => b.len - a.len).filter((h, i, arr) => !arr.slice(0, i).some((o) => h.at >= o.at && h.at < o.at + o.len)).sort((a, b) => a.at - b.at).map((h) => h.c); }

export const EXAMPLES = ['Which Premier League teams have the strongest defenses this season?', 'Compare Mbappé and Haaland', 'Which teams have the biggest difference between actual goals and xG?', 'Who will win Arsenal vs Liverpool?', 'Top scorers at Euro 2024', 'Who won the World Cup in 1998?', 'Best attack in La Liga', 'Bundesliga table', 'Which players created the most chances at the 2022 World Cup?'];

/** → { text, columns?, rows?, sources:[{name, date}], links?:[{label, href}] } */
export async function ask(question) {
  const q = fold(question);
  const leagueTable = async (lid) => { const s = await loadSeason(lid); return { s, t: table(s) }; };
  const src = (s) => ({ name: `openfootball results, ${league(s.league).name} ${SEASON.replace('-', '/')}`, date: `results to ${s.lastResult}` });

  // 1. forecast between two clubs
  if (/(who will win|predict|forecast|chances|odds| vs | v | versus )/.test(q)) { const cs = findClubs(q);
    if (cs.length >= 2) { const st = await modelState(), f = predictMatch(st, { home: cs[0].id, away: cs[1].id });
      return { text: `${cs[0].name} at home to ${cs[1].name}: ${(f.ensemble[0] * 100).toFixed(0)}% home win, ${(f.ensemble[1] * 100).toFixed(0)}% draw, ${(f.ensemble[2] * 100).toFixed(0)}% away win. Expected goals ${f.lambdas[0].toFixed(2)} to ${f.lambdas[1].toFixed(2)}; most likely score ${f.top[0].h}–${f.top[0].a}. This is a statistical estimate, not a guarantee.`,
        columns: ['Model', 'Home', 'Draw', 'Away'], rows: Object.entries(f.models).map(([k, p]) => [k, ...p.map((v) => (v * 100).toFixed(1) + '%')]), sources: [{ name: 'GOALVISION models', date: `ratings as of ${st.asOf}` }], links: [{ label: 'Open in the Prediction Lab', href: `#/predictions?home=${cs[0].id}&away=${cs[1].id}` }] }; } }

  // 2. goals minus xG (teams, event data)
  if (/xg/.test(q) && /(difference|over|under|outperform|biggest|gap)/.test(q)) { const comp = findComp(q) || 'wc2022', idx = await sbIndex(comp), t = {};
    idx.matches.forEach((m) => [[m.home, 0], [m.away, 1]].forEach(([tm, s]) => { const r = (t[tm.name] ||= { n: tm.name, p: 0, g: 0, xg: 0 }); r.p++; r.g += tm.score; r.xg += m.stats[s].xg; }));
    const rows = Object.values(t).sort((a, b) => Math.abs(b.g - b.xg) - Math.abs(a.g - a.xg)).slice(0, 10);
    return { text: `Largest gaps between goals scored and expected goals at ${idx.name}. A positive gap means a side scored more than its chances suggested; over a short tournament most of that is finishing variance. Club-season xG needs a licensed feed, so this uses the tournament event data.`, columns: ['Team', 'Matches', 'Goals', 'xG', 'Goals − xG'], rows: rows.map((r) => [r.n, r.p, r.g, r.xg.toFixed(2), (r.g - r.xg > 0 ? '+' : '') + (r.g - r.xg).toFixed(2)]), sources: [{ name: 'StatsBomb Open Data, ' + idx.name, date: idx.generatedAt.slice(0, 10) }], links: [{ label: 'Tournament page', href: '#/competition/' + comp }] }; }

  // 3. compare two players
  if (/compare/.test(q) || / and /.test(q)) { const found = [];
    for (const [comp, name] of SB_COMPS) for (const p of (await sbPlayers(comp)).players) { const last = fold(p.n).split(' ').pop(); if (last.length > 3 && q.includes(last) && (q.includes(fold(p.n)) || p.min > 200)) found.push({ comp, name, p }); }
    const names = [...new Set(found.map((f) => f.p.n))];
    if (names.length >= 1 && /compare|and/.test(q)) { const want = names.slice(0, 2), rows = found.filter((f) => want.includes(f.p.n));
      const missing = /haaland/.test(q) && !names.some((n) => /Haaland/.test(n)) ? ' Erling Haaland did not play in any of the bundled tournaments (Norway did not qualify), so there is no event data for him here.' : '';
      if (rows.length) return { text: `Per-90 numbers from the tournaments with event data. This is tournament football, a handful of matches each: read it as context, not as a three-season club comparison, which would need a licensed league feed.${missing}`, columns: ['Player', 'Tournament', 'Min', 'Goals', 'Assists', 'xG/90', 'xA/90', 'Shots/90'],
        rows: rows.map((f) => [f.p.n, f.name, f.p.min, f.p.g, f.p.a, M.xg90.fn(f.p).toFixed(2), M.xa90.fn(f.p).toFixed(2), M.sh90.fn(f.p).toFixed(2)]), sources: [{ name: 'StatsBomb Open Data', date: 'World Cup 2022, Euro 2024, Copa América 2024' }], links: want.length === 2 ? [{ label: 'Open in the Rivalry Lab', href: '#/compare?mode=player' }] : [] }; } }

  // 4. league superlatives
  const lid = findLeague(q);
  if (/(defen[cs]e|defensive|conceded|clean sheet)/.test(q) || /(attack|scor|goals for|most goals)/.test(q) && !/scorer/.test(q)) { const def = /(defen[cs]e|defensive|conceded|clean sheet)/.test(q), ids = lid ? [lid] : leagues().map((l) => l.id), all = [];
    let s0; for (const id of ids) { const { s, t } = await leagueTable(id); s0 ||= s; t.filter((r) => r.p).forEach((r) => all.push({ ...r, lg: league(id).name })); }
    all.sort((a, b) => (def ? a.ga / a.p - b.ga / b.p : b.gf / b.p - a.gf / a.p));
    return { text: `${def ? 'Strongest defences' : 'Best attacks'} ${lid ? 'in the ' + league(lid).name : 'across the five leagues'} by goals ${def ? 'conceded' : 'scored'} per match. Early in a season a few matches move these a lot.`, columns: ['Club', 'League', 'Played', def ? 'Conceded' : 'Scored', 'Per match', 'Clean sheets'], rows: all.slice(0, 8).map((r) => [club(r.id).name, r.lg, r.p, def ? r.ga : r.gf, ((def ? r.ga : r.gf) / r.p).toFixed(2), r.cs]), sources: [src(s0)], links: lid ? [{ label: league(lid).name + ' leaders', href: `#/league/${lid}?tab=leaders` }] : [] }; }
  if (lid && /(table|standing|top|leader|who is first|position)/.test(q)) { const { s, t } = await leagueTable(lid);
    return { text: `${league(lid).name} table, ${SEASON.replace('-', '/')}.`, columns: ['#', 'Club', 'P', 'W', 'D', 'L', 'GD', 'Pts'], rows: t.slice(0, 10).map((r) => [r.pos, club(r.id).name, r.p, r.w, r.d, r.l, (r.gd > 0 ? '+' : '') + r.gd, r.pts]), sources: [src(s)], links: [{ label: 'Full table', href: '#/league/' + lid }] }; }

  // 5. world cup winners
  const year = (q.match(/\b(19[3-9]\d|20[0-2]\d)\b/) || [])[1];
  if (/world cup/.test(q) && year && /(won|winner|champion|final|host)/.test(q)) { const e = (await worldCupIndex()).editions.find((x) => String(x.year) === year);
    if (e) return { text: `${e.champion} won the ${e.year} World Cup, hosted by ${e.host}${e.runnerUp ? `, beating ${e.runnerUp}` : ''}. ${e.teams} teams played ${e.matches} matches with ${e.goals} goals.`, sources: [{ name: 'openfootball worldcup.json', date: 'edition ' + e.year }], links: [{ label: `World Cup ${e.year}`, href: '#/worldcup/' + e.year }] }; }

  // 6. player leaderboards from event data
  if (/(scorer|most goals|assist|chances|key pass|creat|tackle|shots|dribbl)/.test(q)) { const comp = findComp(q) || (/2026/.test(q) ? null : 'wc2022');
    if (!comp) { const d = await worldCup(2026); return { text: 'Top scorers of the 2026 World Cup.', columns: ['Player', 'Team', 'Goals'], rows: d.scorers.slice(0, 10).map((s) => [s.name, s.team, s.goals]), sources: [{ name: 'openfootball worldcup.json', date: '2026 edition' }], links: [{ label: 'World Cup 2026', href: '#/worldcup/2026?tab=scorers' }] }; }
    const d = await sbPlayers(comp), key = /assist/.test(q) ? 'a' : /(chances|key pass|creat)/.test(q) ? 'kp' : /tackle/.test(q) ? 'tkl' : /shots/.test(q) ? 'sh' : /dribbl/.test(q) ? 'drc' : 'g', lab = { a: 'Assists', kp: 'Key passes (chances created)', tkl: 'Tackles', sh: 'Shots', drc: 'Dribbles completed', g: 'Goals' }[key];
    return { text: `${lab} leaders at ${d.name}.`, columns: ['Player', 'Team', 'Minutes', lab, 'Per 90'], rows: [...d.players].sort((a, b) => b[key] - a[key]).slice(0, 10).map((p) => [p.n, p.t, p.min, p[key], (p[key] / p.min * 90).toFixed(2)]), sources: [{ name: 'StatsBomb Open Data, ' + d.name, date: d.generatedAt.slice(0, 10) }], links: [{ label: 'Player database', href: '#/players?comp=' + comp }] }; }

  // 7. ratings
  if (/(elo|rating|ranking|best team|strongest team)/.test(q)) { const st = await modelState(), nat = /(nation|country|international)/.test(q);
    return { text: `${nat ? 'National-team' : 'Club'} Elo ratings computed by GOALVISION AI. These are not official FIFA or UEFA rankings.`, columns: ['#', nat ? 'Team' : 'Club', 'Elo'], rows: (nat ? Object.entries(st.nations).map(([n, v]) => [n, v.elo]) : Object.entries(st.clubs).map(([id, v]) => [club(id).name, Math.round(v.elo)])).sort((a, b) => b[1] - a[1]).slice(0, 10).map((r, i) => [i + 1, ...r]), sources: [{ name: 'GOALVISION Elo', date: 'as of ' + st.asOf }], links: [{ label: 'Rankings', href: '#/datalab?tab=rankings' }] }; }

  return { text: 'I can only answer from the data bundled with this site, so I will not guess at that one. I can do: league tables and best attacks or defences this season, forecasts between two clubs, goals against xG by team, player leaderboards and comparisons from the three event-data tournaments, World Cup winners by year, and Elo rankings.', sources: [] };
}
