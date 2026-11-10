/**
 * TACTICAL ANALYSIS LAB.
 *  - Match analysis: nine pitch layers drawn from real StatsBomb event data for the chosen match.
 *  - Formation board: a clearly labelled simulator. Tokens are yours to drag; nothing on it is match data unless you
 *    load a real starting line-up, which is then placed at nominal positions for its formation.
 */
import { $, $$, esc, html, fmt, seg, segmented, options, sum, toast, ICON } from '../core/dom.js';
import { sbIndex, sbMatch, SB_COMPS } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { flag, note, source, tabs } from '../components/ui.js';
import { createPitch, FORMATIONS, formationSpots, formationLabel, POSITION_XY, draggable, shortName, svgEl } from '../charts/pitch.js';
import { css } from '../charts/charts.js';

export const title = 'Tactics Lab';
const LAYERS = [
  ['net', 'Passing network', 'Each dot is a starter at the average spot of their passes; line width is the number of passes between the pair. Drawn up to the first substitution or red card, so the eleven is constant.'],
  ['avg', 'Average positions', 'Mean location of every on-ball action by each starter over the whole match. It shows where a player operated, not where the coach drew them.'],
  ['shape', 'Team shape', 'The outline around the ten outfield average positions. A tall, narrow shape is a stretched side; a flat, wide one is compact between the lines.'],
  ['shots', 'Shot map', 'Circle area is the chance quality (xG). Filled circles are goals, dashed outlines are off target or blocked.'],
  ['touch', 'Possession heat map', 'Where the team had the ball: every pass, carry, receipt, dribble and shot, in ten-yard cells.'],
  ['def', 'Defensive heat map', 'Tackles, interceptions, blocks, clearances, recoveries, fouls and pressures. High up the pitch means a front-foot defence.'],
  ['press', 'Pressing intensity', 'Pressure events only: where the side closed down the ball carrier. Read it with the count of pressures in the panel.'],
  ['prog', 'Ball progression', 'Completed progressive passes: at least ten yards closer to goal from outside the own 40%, or any pass into the penalty area.'],
  ['zones', 'Attacking zones', 'Share of entries into the final third through the left, centre and right channels, from completed passes.'],
];
let cleanup = null;

export async function render(el, _p, q) {
  let comp = SB_COMPS.some((c) => c[0] === q.comp) ? q.comp : 'wc2022', matchId = q.match || null, layer = LAYERS.some((l) => l[0] === q.layer) ? q.layer : 'net', team = 'both', m = null, idx = null;
  if (matchId) { try { m = await sbMatch(matchId); comp = m.comp; } catch { matchId = null; } }
  el.innerHTML = html`<div class="container">
    <header class="page-head"><h1>Tactical analysis lab</h1><p class="lead">See how a match was actually played: who combined with whom, where each side pressed, which channel they attacked. Then build your own shape on the formation board.</p></header>
    <div class="tabs" role="tablist"><button type="button" data-tab="match">Match analysis</button><button type="button" data-tab="board">Formation board</button></div>
    <section data-pane="match"><div class="toolbar"><label class="field">Tournament<select class="select" id="comp" style="min-width:210px">${options(SB_COMPS, comp)}</select></label><label class="field grow" style="max-width:520px">Match<select class="select" id="match"></select></label><div class="field">Team<div id="team">${seg([['both', 'Both'], ['0', 'Home'], ['1', 'Away']], team)}</div></div></div>
      <div id="layers" style="margin-bottom:14px">${seg(LAYERS.map((l) => [l[0], l[1]]), layer, 'green')}</div>
      <div class="grid g-side"><div class="panel pitch-panel"><div class="panel-head"><h3 id="ltitle"></h3><span class="chip blue">Real match data</span></div><div id="pitch"></div><p class="src" id="dir"></p></div>
        <aside class="stack"><div class="panel"><h3 id="mtitle" style="margin-bottom:8px"></h3><p class="muted small" id="lhelp"></p><div id="lnums" style="margin-top:12px"></div><a class="btn sm" id="mlink" style="margin-top:14px">Open the match dashboard ${ICON.arrow}</a></div>
          ${note('Open event data has no player tracking, so off-ball positions are unknown. Everything here is built from on-ball events; nothing is interpolated.')}</aside></div>
      ${source('StatsBomb Open Data', null, 'https://github.com/statsbomb/open-data')}</section>
    <section data-pane="board" hidden><div class="note warn" style="margin-bottom:14px">${ICON.info}<div><b>Tactical simulator.</b> Positions on this board are whatever you set. It is a teaching and planning tool, not a record of any match.</div></div>
      <div class="toolbar"><label class="field">Blue formation<select class="select" id="fa" style="min-width:140px">${options(Object.keys(FORMATIONS).map((f) => [f, f]), q.fa || '4-3-3')}</select></label><label class="field">Green formation<select class="select" id="fb" style="min-width:140px">${options([['none', 'Hide opponent'], ...Object.keys(FORMATIONS).map((f) => [f, f])], q.fb || '4-2-3-1')}</select></label>
        <div class="row"><button class="btn sm" id="b-reset" type="button">Reset positions</button><button class="btn sm" id="b-lines" type="button" aria-pressed="true">Show lines</button><button class="btn sm" id="b-real" type="button">Load the selected match's line-ups</button><button class="btn sm primary" id="b-share" type="button">Copy link to this board</button></div></div>
      <div class="grid g-side"><div class="panel pitch-panel"><div id="board"></div><p class="src">Drag a player, or focus one with Tab and move it with the arrow keys. Blue attacks left to right.</p></div>
        <aside class="stack"><div class="panel"><h3 style="margin-bottom:8px">Shape read-out</h3><div id="b-info"></div></div><div class="panel"><h3 style="margin-bottom:8px">Formations</h3><p class="muted small">4-3-3 and 3-4-3 stretch the pitch with wingers. 4-2-3-1 protects the back four with a double pivot. 4-4-2 gives two flat banks of four. 3-5-2 and 5-3-2 trade width up front for wing-backs and an extra centre-back.</p></div></aside></div></section></div>`;

  const col = () => [css('--blue'), css('--green')];
  const drawMatch = () => {
    if (!m) return; const [L] = LAYERS.filter((l) => l[0] === layer), names = [m.home.name, m.away.name], sides = team === 'both' ? [0, 1] : [Number(team)], c = col(), solo = sides.length === 1;
    $('#ltitle', el).textContent = L[1]; $('#lhelp', el).textContent = L[2]; $('#mtitle', el).innerHTML = `${flag(names[0], 22)} ${esc(names[0])} ${m.home.score}–${m.away.score} ${esc(names[1])} ${flag(names[1], 22)}`; $('#mlink', el).href = '#/match/sb~' + m.id;
    $('#dir', el).innerHTML = `<b style="color:${c[0]}">${esc(names[0])}</b> ${formationLabel(m.home.formation) || ''} attack left to right · <b style="color:${c[1]}">${esc(names[1])}</b> ${formationLabel(m.away.formation) || ''} attack right to left`;
    const P = createPitch($('#pitch', el), { label: `${L[1]}: ${names.join(' v ')}` }), nums = [];
    for (const s of sides) { const flip = s === 1, k = c[s];
      if (layer === 'net') { P.network(m.net[s].nodes, m.net[s].edges, { flip, color: k, minEdge: solo ? 2 : 4 }); const top = [...m.net[s].edges].sort((x, y) => y[2] - x[2])[0]; nums.push([names[s], top ? `${shortName(m.net[s].nodes[top[0]][0])} ↔ ${shortName(m.net[s].nodes[top[1]][0])}: ${top[2]} passes · first ${m.net[s].until}'` : '–']); }
      if (layer === 'avg' || layer === 'shape') { const pts = m.avg[s]; if (layer === 'shape') P.hull(pts.filter((p) => p[2] > 14).map((p) => [p[2], p[3]]), { flip, color: k }); P.dots(pts.map((p) => ({ x: p[2], y: p[3], label: p[1], sub: solo ? shortName(p[0]) : '', title: `${p[0]} · ${p[4]} touches` })), { flip, color: k });
        const out = pts.filter((p) => p[2] > 14), xs = out.map((p) => p[2]), ys = out.map((p) => p[3]); nums.push([names[s], `depth ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} yd · width ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} yd · average line ${(sum(xs) / xs.length).toFixed(0)} yd from own goal`]); }
      if (layer === 'shots') { const sh = m.shots.filter((x) => x[0] === s); P.shots(sh.map((x) => ({ x: x[3], y: x[4], xg: x[5], outcome: x[6], title: `${x[1]} ${x[2] + 1}' · xG ${x[5].toFixed(2)}` })), { flip, color: k }); nums.push([names[s], `${sh.length} shots · ${sh.filter((x) => x[6] === 'G').length} goals · ${sum(sh, (x) => x[5]).toFixed(2)} xG`]); }
      if (['touch', 'def', 'press'].includes(layer)) { const g = m.heat[s][{ touch: 'touch', def: 'deff', press: 'press' }[layer]]; P.heat(g, m.grid, { flip, color: k }); const tot = sum(g), high = sum(g.filter((_, i) => i % m.grid[0] >= 8)); nums.push([names[s], `${tot} events · ${tot ? Math.round(100 * high / tot) : 0}% in the attacking third${layer === 'press' ? ` · ${m.stats[s].pressures} pressures` : ''}`]); }
      if (layer === 'prog') { P.arrows(m.prog[s], { flip, color: k, opacity: solo ? .8 : .5 }); nums.push([names[s], `${m.prog[s].length} progressive passes`]); }
      if (layer === 'zones') { P.zones(m.lanes[s], { flip, color: k, labels: ['Left', 'Centre', 'Right'] }); const t = sum(m.lanes[s]) || 1; nums.push([names[s], `left ${Math.round(100 * m.lanes[s][flip ? 2 : 0] / t)}% · centre ${Math.round(100 * m.lanes[s][1] / t)}% · right ${Math.round(100 * m.lanes[s][flip ? 0 : 2] / t)}% of ${t} entries`]); }
    }
    if (layer === 'zones' && !solo) nums.push(['Note', 'Left and right are from each attacking team\'s own point of view.']);
    $('#lnums', el).innerHTML = `<dl class="kv-list" style="grid-template-columns:1fr">${nums.map(([k, v]) => `<dt>${esc(k)}</dt><dd style="text-align:left;margin-bottom:8px">${esc(v)}</dd>`).join('')}</dl>`;
    setQuery({ match: m.id, comp: null, layer: layer === 'net' ? null : layer });
  };
  const loadList = async () => { idx = await sbIndex(comp); if (!el.isConnected) return; const list = [...idx.matches].reverse();
    $('#match', el).innerHTML = options(list.map((x) => [x.id, `${x.home.name} ${x.home.score}–${x.away.score} ${x.away.name} · ${x.stage} · ${fmt.date(x.date, { day: 'numeric', month: 'short' })}`]), matchId);
    if (!matchId || !list.some((x) => String(x.id) === String(matchId))) matchId = list[0].id; $('#match', el).value = matchId; if (!m || String(m.id) !== String(matchId)) m = await sbMatch(matchId); if (el.isConnected) drawMatch(); };
  $('#comp', el).addEventListener('change', (e) => { comp = e.target.value; matchId = null; m = null; loadList(); });
  $('#match', el).addEventListener('change', async (e) => { matchId = e.target.value; m = await sbMatch(matchId); drawMatch(); });
  segmented($('#layers .seg', el), (v) => { layer = v; drawMatch(); }); segmented($('#team .seg', el), (v) => { team = v; drawMatch(); });

  /* ── formation board ── */
  let fa = FORMATIONS[q.fa] ? q.fa : '4-3-3', fb = q.fb === 'none' ? 'none' : FORMATIONS[q.fb] ? q.fb : '4-2-3-1', lines = true, toks = [];
  const fresh = () => { toks = [...formationSpots(fa).map((s) => ({ ...s, x: s.x * .48 + 2, t: 0, label: s.role })), ...(fb === 'none' ? [] : formationSpots(fb).map((s) => ({ ...s, x: 120 - (s.x * .48 + 2), y: 80 - s.y, t: 1, label: s.role })))]; };
  const decode = (str) => { try { const parts = str.split(';').map((p) => p.split(',')); if (parts.length !== toks.length) return; parts.forEach(([x, y], i) => { toks[i].x = Number(x); toks[i].y = Number(y); }); } catch { /* ignore a bad link */ } };
  fresh(); if (q.p) decode(q.p);
  const info = () => { const read = (t) => { const o = toks.filter((k) => k.t === t && k.role !== 'GK'); if (!o.length) return null; const xs = o.map((k) => (t ? 120 - k.x : k.x)), ys = o.map((k) => k.y); return { depth: Math.max(...xs) - Math.min(...xs), width: Math.max(...ys) - Math.min(...ys), line: Math.min(...xs), front: Math.max(...xs) }; };
    $('#b-info', el).innerHTML = [0, 1].map((t) => { const r = read(t); return r ? `<h4 style="color:${col()[t]};margin:8px 0 6px">${t ? 'Green' : 'Blue'} · ${t ? fb : fa}</h4><dl class="kv-list"><dt>Team length</dt><dd class="num">${r.depth.toFixed(0)} yd</dd><dt>Team width</dt><dd class="num">${r.width.toFixed(0)} yd</dd><dt>Defensive line</dt><dd class="num">${r.line.toFixed(0)} yd from goal</dd><dt>Highest player</dt><dd class="num">${r.front.toFixed(0)} yd</dd></dl>` : ''; }).join(''); };
  const drawBoard = () => {
    const P = createPitch($('#board', el), { label: 'Formation board (simulator)' }), c = col();
    const lineLayer = P.layer('pitch-hull'), tokLayer = P.layer();
    const drawLines = () => { lineLayer.replaceChildren(); if (!lines) return; [0, 1].forEach((t) => { const mine = toks.filter((k) => k.t === t && k.role !== 'GK'), rows = {}; mine.forEach((k) => (rows[k.r ?? Math.round((t ? 120 - k.x0 : k.x0) / 8)] ||= []).push(k));
      Object.values(rows).forEach((row) => { if (row.length < 2) return; const s = [...row].sort((x, y) => x.y - y.y); svgEl('polyline', { points: s.map((k) => `${k.x},${k.y}`).join(' '), fill: 'none', stroke: c[t], 'stroke-width': .45, 'stroke-dasharray': '1.6 1.2', opacity: .75 }, lineLayer); }); }); };
    toks.forEach((k, i) => { k.x0 ??= k.x; const g = svgEl('g', { class: 'token', transform: `translate(${k.x} ${k.y})`, 'data-i': i, tabindex: 0, role: 'button', 'aria-label': `${k.t ? 'Green' : 'Blue'} ${k.label}` }, tokLayer); svgEl('circle', { r: 3.1, fill: c[k.t] }, g); svgEl('text', { 'text-anchor': 'middle', dy: '.36em', class: 'net-num', style: 'font-size:2px' }, g).textContent = k.num ?? k.label; if (k.name) svgEl('text', { 'text-anchor': 'middle', y: 6.4, class: 'net-name' }, g).textContent = k.name; });
    draggable(P.svg, '.token', (i, x, y, done) => { toks[i].x = x; toks[i].y = y; drawLines(); if (done) { info(); setQuery({ fa, fb, p: toks.map((k) => `${k.x.toFixed(0)},${k.y.toFixed(0)}`).join(';') }); } });
    drawLines(); info();
  };
  const rebuild = () => { fresh(); setQuery({ fa, fb, p: null }); drawBoard(); };
  $('#fa', el).addEventListener('change', (e) => { fa = e.target.value; rebuild(); }); $('#fb', el).addEventListener('change', (e) => { fb = e.target.value; rebuild(); });
  $('#b-reset', el).addEventListener('click', rebuild);
  $('#b-lines', el).addEventListener('click', (e) => { lines = !lines; e.currentTarget.setAttribute('aria-pressed', lines); drawBoard(); });
  $('#b-share', el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch { toast('Copy the address bar to share this board'); } });
  $('#b-real', el).addEventListener('click', () => { if (!m) return toast('Choose a match on the Match analysis tab first');
    toks = [0, 1].flatMap((s) => m.lineups[s].players.filter((p) => p.start && POSITION_XY[p.pos]).map((p) => { const [x, y] = POSITION_XY[p.pos], px = x * .48 + 2; return { role: p.pos === 1 ? 'GK' : 'P', label: p.num, num: p.num, name: shortName(p.name), t: s, x: s ? 120 - px : px, y: s ? 80 - y : y, r: Math.round(x / 12) }; }));
    drawBoard(); toast(`Loaded ${m.home.name} v ${m.away.name} starting line-ups at nominal positions`); });

  const drawn = new Set();
  const show = tabs(el, (n) => { setQuery({ tab: n === 'match' ? null : n }); if (drawn.has(n)) return; drawn.add(n); if (n === 'board') drawBoard(); });
  await loadList(); show(q.tab === 'board' ? 'board' : 'match');
  const onTheme = () => { drawMatch(); if (drawn.has('board')) drawBoard(); }; document.addEventListener('theme-change', onTheme); cleanup = () => document.removeEventListener('theme-change', onTheme);
}
export function destroy() { cleanup?.(); cleanup = null; }
