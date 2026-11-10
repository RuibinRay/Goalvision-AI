/** THE RIVALRY LAB: club v club, player v player, nation v nation, on a split screen with sample-size and competition caveats. */
import { $, esc, html, fmt, seg, segmented, options, ICON, toast } from '../core/dom.js';
import { modelState, eloHistory, leagues, league, clubsOf, club, season as loadSeason, SEASON, sbPlayers, SB_COMPS, playerArt, worldCupIndex, worldCup, toggleIn } from '../core/store.js';
import { setQuery } from '../core/router.js';
import { crest, flag, vsRow, probBar, note, formDots } from '../components/ui.js';
import { table } from '../models/standings.js';
import { predictMatch } from '../models/predict.js';
import { pairKey } from '../models/features.js';
import { M, RADAR, POS_LABEL, MIN_SAMPLE, peers, percentile } from '../models/playerMetrics.js';
import { chart, radar, lineSeries, css } from '../charts/charts.js';

export const title = 'Rivalry Lab';
const COMP = Object.fromEntries(SB_COMPS);
export async function render(el, _p, q) {
  let mode = ['club', 'player', 'nation'].includes(q.mode) ? q.mode : 'club';
  el.innerHTML = html`<div class="container"><header class="page-head"><h1>The Rivalry Lab</h1><p class="lead">Put two clubs, two players or two national teams side by side. Blue is always the left side, green the right.</p></header>
    <div id="mode" style="margin-bottom:18px">${seg([['club', 'Club v club'], ['player', 'Player v player'], ['nation', 'Nation v nation']], mode, 'green')}</div><div id="body"></div></div>`;
  const body = $('#body', el), draw = () => ({ club: clubs, player: players, nation: nations })[mode](body, q);
  segmented($('#mode .seg', el), (v) => { mode = v; q = { mode }; history.replaceState(null, '', '#/compare?mode=' + v); draw(); });
  await draw();
}
const save = (label) => { toggleIn('saved', { id: 'cmp:' + location.hash, label, href: location.hash }); toast('Saved to My Dashboard'); };
const clubOpts = (cur) => leagues().map((l) => `<optgroup label="${esc(l.name)}">${clubsOf(l.id).sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}"${c.id === cur ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');

/* ───────── clubs ───────── */
async function clubs(box, q) {
  const [state, hist] = await Promise.all([modelState(), eloHistory()]);
  let a = state.clubs[q.a] ? q.a : 'real-madrid', b = state.clubs[q.b] ? q.b : (a === 'barcelona' ? 'real-madrid' : 'barcelona');
  const run = async () => {
    setQuery({ mode: 'club', a, b });
    const A = club(a), B = club(b), same = A.league === B.league, [sa, sb] = await Promise.all([loadSeason(A.league), loadSeason(B.league)]);
    const row = (s, id, o) => table(s, o).find((x) => x.id === id), ra = row(sa, a), rb = row(sb, b), ha = row(sa, a, { venue: 'home' }), hb = row(sb, b, { venue: 'home' }), aa = row(sa, a, { venue: 'away' }), ab = row(sb, b, { venue: 'away' });
    const h2h = state.h2h[pairKey(a, b)], first = a < b ? a : b, f = predictMatch(state, { home: a, away: b }), fr = predictMatch(state, { home: b, away: a });
    const pct = (s, id, fn, low) => { const t = table(s).filter((x) => x.p), v = fn(t.find((x) => x.id === id)), n = t.filter((x) => (low ? fn(x) > v : fn(x) < v)).length; return Math.round(100 * n / Math.max(1, t.length - 1)); };
    const axes = [['Points / match', (x) => x.ppg], ['Goals scored', (x) => x.gf / (x.p || 1)], ['Goals conceded', (x) => x.ga / (x.p || 1), true], ['Clean sheets', (x) => x.cs / (x.p || 1)], ['Scored in', (x) => 1 - x.fts / (x.p || 1)], ['Goal difference', (x) => x.gd / (x.p || 1)]];
    box.innerHTML = html`<div class="toolbar"><label class="field grow">Left<select class="select" id="a">${clubOpts(a)}</select></label><label class="field grow">Right<select class="select" id="b">${clubOpts(b)}</select></label><button class="btn sm" id="save" type="button">${ICON.star} Save comparison</button></div>
      <div class="split" style="--ca:${A.colors[0]};--cb:${B.colors[0]}"><div class="a"><a href="#/club/${a}">${crest(a, 120, { lazy: false })}</a><h2>${esc(A.name)}</h2><span class="muted">${esc(league(A.league).name)} · ${fmt.ord(ra.pos)}</span>${formDots(ra.form.slice(-5).map((x) => x.res))}</div><div class="b"><a href="#/club/${b}">${crest(b, 120, { lazy: false })}</a><h2>${esc(B.name)}</h2><span class="muted">${esc(league(B.league).name)} · ${fmt.ord(rb.pos)}</span>${formDots(rb.form.slice(-5).map((x) => x.res))}</div></div>
      ${same ? '' : `<div style="margin-top:14px">${note('Different leagues: per-match numbers reflect different opponents. League-relative percentiles (the radar) are the fairer comparison; Elo links the leagues only through 2025/26 Champions League results.', 'warn')}</div>`}
      <div class="grid g2" style="margin-top:18px"><div class="panel" style="--team-a:${css('--blue')};--team-b:${css('--green')}"><div class="panel-head"><h3>${fmt.season(SEASON)} so far</h3><span class="sub">${ra.p} and ${rb.p} matches</span></div>
          ${vsRow('Elo rating', Math.round(state.clubs[a].elo), Math.round(state.clubs[b].elo))}${vsRow('Points per match', ra.ppg, rb.ppg, { d: 2 })}${vsRow('Goals scored per match', ra.gf / (ra.p || 1), rb.gf / (rb.p || 1), { d: 2 })}${vsRow('Goals conceded per match', ra.ga / (ra.p || 1), rb.ga / (rb.p || 1), { d: 2, lowerBetter: true })}${vsRow('Clean sheets', ra.cs, rb.cs)}${vsRow('Home points per match', ha.ppg, hb.ppg, { d: 2 })}${vsRow('Away points per match', aa.ppg, ab.ppg, { d: 2 })}${vsRow('Attack rating (log, v league)', state.clubs[a].att, state.clubs[b].att, { d: 2 })}${vsRow('Defence rating (log, v league)', state.clubs[a].def, state.clubs[b].def, { d: 2 })}
          <p class="src" style="margin-top:8px">Expected goals (xG) for club seasons need a licensed event feed: <span class="na">Not available</span>.</p></div>
        <div class="panel"><div class="panel-head"><h3>League-relative profile</h3><span class="sub">Percentile inside each club's own league</span></div><div class="chart" id="c-radar" style="--h:360px"></div></div>
        <div class="panel"><div class="panel-head"><h3>Head-to-head since 2010</h3></div>${h2h ? `<div class="h2h"><div><b class="num">${first === a ? h2h.w[0] : h2h.w[2]}</b><span>${esc(A.short)} wins</span></div><div><b class="num">${h2h.w[1]}</b><span>Draws</span></div><div><b class="num">${first === a ? h2h.w[2] : h2h.w[0]}</b><span>${esc(B.short)} wins</span></div></div>
            <p class="muted small" style="margin:10px 0">${h2h.p} league meetings · goals ${first === a ? h2h.g[0] : h2h.g[1]}–${first === a ? h2h.g[1] : h2h.g[0]}</p><ul class="mini">${[...h2h.last].reverse().map(([d, hm, hg, ag]) => `<li><span class="dim small num">${fmt.date(d)}</span><span class="team"><span>${esc(club(hm).short)} v ${esc(club(hm === a ? b : a).short)}</span></span><b class="num">${hg}–${ag}</b></li>`).join('')}</ul>` : `<div class="empty">No league meeting between these clubs in the data${same ? '' : ' (they play in different leagues)'}.</div>`}</div>
        <div class="panel"><div class="panel-head"><h3>If they met</h3></div><p class="muted small" style="margin-bottom:6px">${esc(A.short)} at home</p>${probBar(f.ensemble)}<div class="prob-labels"><span>${esc(A.short)}</span><span>Draw</span><span>${esc(B.short)}</span></div>
          <p class="muted small" style="margin:14px 0 6px">${esc(B.short)} at home</p>${probBar([fr.ensemble[2], fr.ensemble[1], fr.ensemble[0]])}<div class="prob-labels"><span>${esc(A.short)}</span><span>Draw</span><span>${esc(B.short)}</span></div>
          <a class="btn sm primary" style="margin-top:16px" href="#/predictions?home=${a}&away=${b}">Full forecast ${ICON.arrow}</a><p class="src" style="margin-top:10px">${same ? 'Ensemble of five backtested models.' : 'Elo-based forecast (cross-league).'} A statistical estimate.</p></div>
        <div class="panel span-all"><div class="panel-head"><h3>Elo rating by season</h3></div><div class="chart" id="c-elo" style="--h:300px"></div></div></div>`;
    radar($('#c-radar', box), axes.map((x) => x[0]), [{ name: A.short, values: axes.map((x) => pct(sa, a, x[1], x[2])), color: css('--blue') }, { name: B.short, values: axes.map((x) => pct(sb, b, x[1], x[2])), color: css('--green') }], { aria: 'League-relative percentile radar' });
    const seasonsAll = [...new Set([...(hist.history[a] || []), ...(hist.history[b] || [])].map((x) => x[0]))].sort(), val = (id, s) => (hist.history[id] || []).find((x) => x[0] === s)?.[1] ?? null;
    chart($('#c-elo', box), { aria: 'Elo history', xAxis: { type: 'category', data: seasonsAll.map((s) => fmt.season(s).slice(2)) }, yAxis: { type: 'value', scale: true }, series: [lineSeries(A.short, seasonsAll.map((s) => val(a, s)), css('--blue'), { connectNulls: false, showSymbol: true }), lineSeries(B.short, seasonsAll.map((s) => val(b, s)), css('--green'), { connectNulls: false, showSymbol: true })] });
    $('#a', box).addEventListener('change', (e) => { a = e.target.value; run(); }); $('#b', box).addEventListener('change', (e) => { b = e.target.value; run(); });
    $('#save', box).addEventListener('click', () => save(`${A.short} v ${B.short}`));
  };
  await run();
}

/* ───────── players ───────── */
async function players(box, q) {
  let ca = COMP[q.ca] ? q.ca : 'wc2022', cb = COMP[q.cb] ? q.cb : ca, a = q.a || null, b = q.b || null;
  const run = async () => {
    const [da, db] = await Promise.all([sbPlayers(ca), sbPlayers(cb)]);
    const pick = (d, id, dflt) => d.players.find((p) => String(p.id) === String(id)) || d.players.find((p) => p.n === dflt) || d.players[0];
    const A = pick(da, a, 'Lionel Messi'), B = pick(db, b, A.n === 'Kylian Mbappé' ? 'Lionel Messi' : 'Kylian Mbappé'); a = A.id; b = B.id; setQuery({ mode: 'player', ca, cb, a, b });
    const samePos = A.pos === B.pos, keys = samePos ? RADAR[A.pos] : [...new Set([...RADAR[A.pos].slice(0, 4), ...RADAR[B.pos].slice(0, 4)])];
    const opts = (d, cur) => options([...d.players].sort((x, y) => x.n.localeCompare(y.n)).map((p) => [p.id, `${p.n} · ${p.t} · ${p.pos}`]), cur);
    const warn = [A.min < MIN_SAMPLE || B.min < MIN_SAMPLE ? `Small sample: ${A.min < MIN_SAMPLE ? A.n + ' played ' + A.min + ' minutes' : ''}${A.min < MIN_SAMPLE && B.min < MIN_SAMPLE ? ' and ' : ''}${B.min < MIN_SAMPLE ? B.n + ' played ' + B.min + ' minutes' : ''}. Per-90 figures under ${MIN_SAMPLE} minutes are unstable.` : '', ca !== cb ? 'Different tournaments: opposition strength and team style differ, so treat gaps as context.' : '', samePos ? '' : `Different roles (${POS_LABEL[A.pos]} v ${POS_LABEL[B.pos]}): role-specific metrics are not like for like.`].filter(Boolean);
    box.innerHTML = html`<div class="toolbar"><div class="field grow">Left<div class="row" style="flex-wrap:nowrap"><select class="select" id="ca" style="max-width:190px">${options(SB_COMPS, ca)}</select><select class="select" id="a">${opts(da, a)}</select></div></div><div class="field grow">Right<div class="row" style="flex-wrap:nowrap"><select class="select" id="cb" style="max-width:190px">${options(SB_COMPS, cb)}</select><select class="select" id="b">${opts(db, b)}</select></div></div><button class="btn sm" id="save" type="button">${ICON.star} Save comparison</button></div>
      <div class="split">${[[A, ca, 'a'], [B, cb, 'b']].map(([p, c, s]) => `<div class="${s}"><span class="avatar" style="--s:150px" data-art="${esc(p.n)}">${esc(p.n.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><h2><a href="#/player/${c}/${p.id}">${esc(p.n)}</a></h2><span class="team">${flag(p.t, 22)}<span>${esc(p.t)} · ${POS_LABEL[p.pos]}</span></span><span class="sample ${p.min >= MIN_SAMPLE ? 'ok' : ''}">${p.min} min · ${p.mp} matches · ${esc(COMP[c])}</span></div>`).join('')}</div>
      ${warn.length ? `<div style="margin-top:14px;display:grid;gap:8px">${warn.map((w) => note(esc(w), 'warn')).join('')}</div>` : ''}
      <div class="grid g2" style="margin-top:18px"><div class="panel" style="--team-a:${css('--blue')};--team-b:${css('--green')}"><div class="panel-head"><h3>Per 90 minutes</h3></div>
          ${['g90', 'a90', 'xg90', 'xa90', 'conv', 'sh90', 'kp90', 'passPct', 'prp90', 'prc90', 'da90', 'rec90'].map((k) => vsRow(M[k].label, M[k].pct ? M[k].fn(A) * 100 : M[k].fn(A), M[k].pct ? M[k].fn(B) * 100 : M[k].fn(B), { d: M[k].d, suffix: M[k].pct ? '%' : '', lowerBetter: !!M[k].low })).join('')}</div>
        <div class="stack"><div class="panel"><div class="panel-head"><h3>Role radar</h3><span class="sub">Percentile among positional peers in each player's tournament</span></div><div class="chart" id="c-radar" style="--h:380px"></div></div>
          <div class="panel"><div class="panel-head"><h3>Totals</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Statistic</th><th class="n">${esc(A.n)}</th><th class="n">${esc(B.n)}</th></tr></thead><tbody>${[['Goals', 'g'], ['Assists', 'a'], ['Shots', 'sh'], ['xG', 'xg', 2], ['xA', 'xa', 2], ['Key passes', 'kp'], ['Tackles + interceptions', null]].map(([l, k, d]) => `<tr><td>${l}</td><td class="n">${k ? A[k].toFixed(d || 0) : A.tkl + A.int}</td><td class="n">${k ? B[k].toFixed(d || 0) : B.tkl + B.int}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;
    radar($('#c-radar', box), keys.map((k) => M[k].short), [{ name: A.n, values: keys.map((k) => percentile(peers(da.players, A.pos), A, k)), color: css('--blue') }, { name: B.n, values: keys.map((k) => percentile(peers(db.players, B.pos), B, k)), color: css('--green') }], { aria: 'Player percentile radar' });
    box.querySelectorAll('[data-art]').forEach(async (n) => { const art = await playerArt(n.dataset.art); if (art?.img && n.isConnected) n.innerHTML = `<img src="${art.img}" alt="">`; });
    $('#ca', box).addEventListener('change', (e) => { ca = e.target.value; a = null; run(); }); $('#cb', box).addEventListener('change', (e) => { cb = e.target.value; b = null; run(); });
    $('#a', box).addEventListener('change', (e) => { a = e.target.value; run(); }); $('#b', box).addEventListener('change', (e) => { b = e.target.value; run(); });
    $('#save', box).addEventListener('click', () => save(`${A.n} v ${B.n}`));
  };
  await run();
}

/* ───────── national teams ───────── */
async function nations(box, q) {
  const [state, idx] = await Promise.all([modelState(), worldCupIndex()]), names = Object.keys(state.nations).sort();
  let a = state.nations[q.a] ? q.a : 'Argentina', b = state.nations[q.b] ? q.b : 'France';
  const files = await Promise.all(idx.editions.map((e) => worldCup(e.year)));
  const alias = (n) => ({ 'West Germany': 'Germany', USA: 'United States' }[n] || n);
  const record = (n) => { const r = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, eds: new Set(), titles: idx.editions.filter((e) => alias(e.champion || '') === n).length, finals: idx.editions.filter((e) => [e.champion, e.runnerUp].map((x) => alias(x || '')).includes(n)).length };
    files.forEach((f) => f.matches.forEach((m) => { const s = m.score.et || m.score.ft; if (!s) return; const h = alias(m.team1) === n, aw = alias(m.team2) === n; if (!h && !aw) return; r.eds.add(f.year); r.p++; const gf = h ? s[0] : s[1], ga = h ? s[1] : s[0]; r.gf += gf; r.ga += ga; if (gf > ga) r.w++; else if (gf === ga) r.d++; else r.l++; })); return r; };
  const run = () => {
    setQuery({ mode: 'nation', a, b });
    const A = record(a), B = record(b), f = a !== b ? predictMatch(state, { kind: 'nation', home: a, away: b, neutral: true }) : null;
    const meets = files.flatMap((fl) => fl.matches.filter((m) => m.score.ft && [alias(m.team1), alias(m.team2)].sort().join() === [a, b].sort().join()).map((m) => ({ ...m, year: fl.year })));
    box.innerHTML = html`<div class="toolbar"><label class="field grow">Left<select class="select" id="a">${options(names.map((n) => [n, n]), a)}</select></label><label class="field grow">Right<select class="select" id="b">${options(names.map((n) => [n, n]), b)}</select></label><button class="btn sm" id="save" type="button">${ICON.star} Save comparison</button></div>
      <div class="split">${[[a, A, 'a'], [b, B, 'b']].map(([n, r, s]) => `<div class="${s}">${flag(n, 130)}<h2>${esc(n)}</h2><span class="muted">Elo ${state.nations[n].elo} · last rated ${esc(state.nations[n].lastComp)}</span>${r.titles ? `<span class="chip gold">${ICON.trophy} ${r.titles} World Cup${r.titles > 1 ? 's' : ''}</span>` : ''}</div>`).join('')}</div>
      <div class="grid g2" style="margin-top:18px"><div class="panel" style="--team-a:${css('--blue')};--team-b:${css('--green')}"><div class="panel-head"><h3>World Cup finals record, 1930 → 2026</h3></div>${vsRow('GOALVISION Elo', state.nations[a].elo, state.nations[b].elo)}${vsRow('Tournaments', A.eds.size, B.eds.size)}${vsRow('Titles', A.titles, B.titles)}${vsRow('Finals reached', A.finals, B.finals)}${vsRow('Matches', A.p, B.p)}${vsRow('Wins', A.w, B.w)}${vsRow('Win rate', A.p ? 100 * A.w / A.p : 0, B.p ? 100 * B.w / B.p : 0, { d: 1, suffix: '%' })}${vsRow('Goals per match', A.p ? A.gf / A.p : 0, B.p ? B.gf / B.p : 0, { d: 2 })}${vsRow('Goals conceded per match', A.p ? A.ga / A.p : 0, B.p ? B.ga / B.p : 0, { d: 2, lowerBetter: true })}
          <p class="src" style="margin-top:8px">West Germany's record counts with Germany. Extra-time scores included; shoot-outs count as draws.</p></div>
        <div class="stack"><div class="panel"><div class="panel-head"><h3>If they met on neutral ground</h3></div>${f ? `${probBar(f.ensemble)}<div class="prob-labels"><span>${esc(a)}</span><span>Draw</span><span>${esc(b)}</span></div><dl class="kv-list" style="margin-top:14px"><dt>Expected goals</dt><dd class="num">${f.lambdas[0].toFixed(2)} – ${f.lambdas[1].toFixed(2)}</dd><dt>Most likely score</dt><dd class="num">${f.top[0].h}–${f.top[0].a} (${fmt.pct(f.top[0].p)})</dd></dl><p class="src" style="margin-top:10px">${esc(f.notes[0])} These ratings are GOALVISION's own and are not FIFA rankings.</p>` : '<div class="empty">Pick two different teams.</div>'}</div>
          <div class="panel"><div class="panel-head"><h3>World Cup meetings</h3></div>${meets.length ? `<ul class="mini">${meets.reverse().map((m) => `<li><span class="dim small num">${m.year}</span><span class="team"><span>${esc(m.team1)} v ${esc(m.team2)} <small class="dim">${esc(m.round || m.group || '')}</small></span></span><b class="num">${(m.score.et || m.score.ft).join('–')}${m.score.p ? ` <small class="dim">(${m.score.p.join('–')} p)</small>` : ''}</b></li>`).join('')}</ul>` : '<div class="empty">These teams have never met at a World Cup finals.</div>'}</div></div></div>`;
    $('#a', box).addEventListener('change', (e) => { a = e.target.value; run(); }); $('#b', box).addEventListener('change', (e) => { b = e.target.value; run(); });
    $('#save', box).addEventListener('click', () => save(`${a} v ${b}`));
  };
  run();
}
