/** LEARN: How to Read the Data. Lesson index, six-part lessons, interactive tools and quizzes with local progress. */
import { $, $$, esc, html, fmt, setRangeFill, ICON } from '../core/dom.js';
import { getJSON, modelState, modelEval } from '../core/store.js';
import { note } from '../components/ui.js';
import { LESSONS, GROUPS } from '../data/lessons.js';
import { scoreMatrix, outcomes, topScores } from '../models/poisson.js';
import { orderedProbs } from '../models/elo.js';
import { createPitch, svgEl } from '../charts/pitch.js';
import { chart, css, lineSeries } from '../charts/charts.js';

export const title = (p) => (LESSONS.find((l) => l.id === p.topic)?.t || 'Learn football analytics');
const KEY = 'gv.learn.v1';
const done = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
const mark = (id) => { const d = done(); d.add(id); try { localStorage.setItem(KEY, JSON.stringify([...d])); } catch { /* private mode */ } };
const TOOLS = [['xg', 'xG shot calculator'], ['poisson', 'Poisson scoreline simulator'], ['elo', 'Elo rating calculator'], ['pass-completion', 'Passing accuracy calculator'], ['team-shape', 'Football tactics board'], ['xg-vs-goals', 'Expected points calculator'], ['outcome-probabilities', 'Probability visualiser']];

export async function render(el, { topic }) {
  const L = LESSONS.find((l) => l.id === topic), d = done();
  const nav = `<nav class="learn-nav" aria-label="Lessons">${GROUPS.map(([g, name]) => `<div><h4>${name}</h4>${LESSONS.filter((l) => l.g === g).map((l) => `<a href="#/learn/${l.id}" class="${d.has(l.id) ? 'done' : ''}"${l.id === topic ? ' aria-current="page"' : ''}>${l.t}</a>`).join('')}</div>`).join('')}</nav>`;
  if (!L) {
    el.innerHTML = html`<div class="container"><header class="page-head"><h1>How to read the data</h1><p class="lead">Twenty-five short lessons, from goals per 90 to model calibration. Each one explains the idea in plain words, shows the formula, works a real example, lets you play with it, and tells you where it breaks.</p>
        <div class="row"><span class="chip ${d.size ? 'live' : ''}">${d.size} of ${LESSONS.length} quizzes passed</span><a class="btn primary sm" href="#/learn/${(LESSONS.find((l) => !d.has(l.id)) || LESSONS[0]).id}">${d.size ? 'Continue' : 'Start with the basics'} ${ICON.arrow}</a></div></header>
      <section class="section"><div class="section-head"><h2>Interactive tools</h2></div><div class="topic-grid">${TOOLS.map(([id, name]) => `<a class="card" href="#/learn/${id}"><h3>${name}</h3><small>${LESSONS.find((l) => l.id === id).t}</small></a>`).join('')}</div></section>
      ${GROUPS.map(([g, name]) => `<section class="section"><div class="section-head"><h2>${name}</h2></div><div class="topic-grid">${LESSONS.filter((l) => l.g === g).map((l) => `<a class="card" href="#/learn/${l.id}"><h3>${l.t}${d.has(l.id) ? ' <span class="accent">✓</span>' : ''}</h3><small>${esc(l.plain.split('. ')[0])}.</small></a>`).join('')}</div></section>`).join('')}
      <div style="margin-bottom:20px">${note('xG and xA come from statistical models, and every provider builds its own. The numbers on this site are StatsBomb\'s for the tournaments with event data. They cannot be reproduced from public box scores, and they should not be mixed with figures from another source.')}</div></div>`;
    return;
  }
  const i = LESSONS.indexOf(L), prev = LESSONS[i - 1], next = LESSONS[i + 1];
  el.innerHTML = html`<div class="container" style="padding-top:28px"><div class="learn-layout">${nav}
    <article class="lesson"><div><a class="chip" href="#/learn">${GROUPS.find((g) => g[0] === L.g)[1]}</a><h2 style="margin-top:12px">${L.t}</h2></div>
      <section><h3>In plain words</h3><p class="lead" style="max-width:none">${L.plain}</p></section>
      <section><h3>The formula</h3><div class="formula">${L.formula}</div></section>
      <section><h3>Worked example</h3><p>${L.example}</p></section>
      <section class="panel"><div class="panel-head"><h3>Try it</h3></div><div id="tool"></div></section>
      <section><h3>Limits and interpretation</h3><p class="muted">${L.limits}</p></section>
      <section class="panel"><div class="panel-head"><h3>Quick quiz</h3>${d.has(L.id) ? '<span class="chip live">Passed</span>' : ''}</div><p style="margin-bottom:12px"><b>${L.quiz.q}</b></p><div class="quiz" id="quiz">${L.quiz.o.map((o, n) => `<button type="button" data-n="${n}">${o}</button>`).join('')}</div><p class="muted small" id="why" style="margin-top:12px" aria-live="polite"></p></section>
      <div class="row between">${prev ? `<a class="btn sm" href="#/learn/${prev.id}">‹ ${prev.t}</a>` : '<span></span>'}${next ? `<a class="btn sm primary" href="#/learn/${next.id}">${next.t} ›</a>` : '<a class="btn sm primary" href="#/predictions">Put it to work in the Prediction Lab ›</a>'}</div></article></div></div>`;
  $('#quiz', el).addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; const ok = Number(b.dataset.n) === L.quiz.a; $$('#quiz button', el).forEach((x) => x.classList.remove('right', 'wrong')); b.classList.add(ok ? 'right' : 'wrong');
    $('#why', el).textContent = (ok ? 'Correct. ' : 'Not quite. ') + L.quiz.why; if (ok) { mark(L.id); $(`.learn-nav a[href="#/learn/${L.id}"]`, el)?.classList.add('done'); } });
  await tool($('#tool', el), L.tool);
}

/* ───────── tools ───────── */
async function tool(box, t) {
  if (t.type === 'calc') return calc(box, t);
  if (t.type === 'link') { box.innerHTML = `<p class="muted" style="margin-bottom:12px">This idea is best seen on a real match.</p><a class="btn primary" href="${t.href}">${t.label} ${ICON.arrow}</a>`; return; }
  return ({ xg: xgTool, prog: progTool, xt: xtTool, poisson: poissonTool, xpts: xptsTool, logit: logitTool, prob: probTool, calib: calibTool })[t.type](box, t);
}
function calc(box, t) {
  box.innerHTML = `<div class="calc"><div class="sliders">${t.fields.map((f) => `<label><span>${f.label}<output>${f.value}</output></span><input type="range" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.value}"></label>`).join('')}</div><div class="calc-out" id="out" aria-live="polite"></div></div>`;
  const run = () => { const v = {}; $$('input', box).forEach((i) => { v[i.dataset.k] = Number(i.value); i.previousElementSibling.querySelector('output').textContent = i.value; setRangeFill(i); }); const o = t.out(v); $('#out', box).innerHTML = `<span class="big num">${o.big}</span><b>${o.label}</b>${o.lines.map((l) => `<span class="muted small">${l}</span>`).join('')}`; };
  box.addEventListener('input', run); run();
}
const pitchPoint = (svg, ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const m = p.matrixTransform(svg.getScreenCTM().inverse()); return [Math.max(0, Math.min(120, m.x)), Math.max(0, Math.min(80, m.y))]; };
const xgOf = (mdl, x, y, header) => { const dx = 120 - x, dy = 40 - y, dist = Math.hypot(dx, dy); let a = Math.atan2(8 * dx, dx * dx + dy * dy - 16); if (a < 0) a += Math.PI; const f = [dist, a, header ? 1 : 0], z = f.map((v, j) => (v - mdl.mean[j]) / mdl.sd[j]); return { xg: 1 / (1 + Math.exp(-(mdl.w[3] + z[0] * mdl.w[0] + z[1] * mdl.w[1] + z[2] * mdl.w[2]))), dist, angle: a * 180 / Math.PI }; };

async function xgTool(box) {
  const mdl = await getJSON('data/models/xg_simple.json'); let pt = [108, 34], header = false;
  box.innerHTML = `<div class="calc"><div><div id="p"></div><label class="switch" style="margin-top:12px"><input type="checkbox" id="hd"><i></i>Header</label><p class="src" style="margin-top:8px">Click or tap anywhere in the attacking half to place the shot.</p></div><div class="calc-out" id="out" aria-live="polite"></div></div>
    <p class="src" style="margin-top:12px">Teaching model: logistic regression on distance, goal angle and a header flag, fitted to ${mdl.shots.toLocaleString('en-GB')} non-penalty shots (${mdl.goals} goals) from the bundled tournaments. Cross-validated log loss ${mdl.logLoss.model5FoldCV}; StatsBomb's own xG scores ${mdl.logLoss.statsbombXg} on the same shots because it also sees defenders and the goalkeeper; always guessing the average scores ${mdl.logLoss.baseRate}.</p>`;
  const P = createPitch($('#p', box), { half: true, label: 'Click to place a shot' }), layer = P.layer();
  const draw = () => { const r = xgOf(mdl, pt[0], pt[1], header); layer.replaceChildren(); svgEl('polygon', { points: `${pt[0]},${pt[1]} 120,36 120,44`, fill: css('--green'), opacity: .22 }, layer); svgEl('circle', { cx: pt[0], cy: pt[1], r: 1 + Math.sqrt(r.xg) * 4, fill: css('--green'), stroke: '#fff', 'stroke-width': .5 }, layer);
    $('#out', box).innerHTML = `<span class="big num">${r.xg.toFixed(2)}</span><b>expected goals</b><span class="muted small">Scores about once in ${Math.max(1, Math.round(1 / r.xg))} attempts</span><span class="muted small">Distance ${r.dist.toFixed(1)} yd · goal angle ${r.angle.toFixed(0)}°${header ? ' · header' : ''}</span>`; };
  P.svg.style.cursor = 'crosshair'; P.svg.addEventListener('click', (ev) => { const [x, y] = pitchPoint(P.svg, ev); if (x < 62) return; pt = [Math.min(119, x), y]; draw(); });
  $('#hd', box).addEventListener('change', (e) => { header = e.target.checked; draw(); }); draw();
}
function progTool(box, t) {
  let pts = [[52, 30], [78, 44]], n = 0; const dg = (p) => Math.hypot(120 - p[0], 40 - p[1]), inBox = (p) => p[0] >= 102 && p[1] >= 18 && p[1] <= 62;
  box.innerHTML = `<div class="calc"><div><div id="p"></div><p class="src" style="margin-top:8px">Click once for the start and once for the end. The team attacks left to right.</p></div><div class="calc-out" id="out" aria-live="polite"></div></div>`;
  const P = createPitch($('#p', box), { label: 'Click start and end' }), layer = P.layer();
  const draw = () => { const [a, b] = pts, gain = dg(a) - dg(b), box2 = inBox(b) && !inBox(a), ok = (a[0] >= 48 && gain >= 10) || box2; layer.replaceChildren(); svgEl('rect', { x: 0, y: 0, width: 48, height: 80, fill: '#000', opacity: .22 }, layer);
    svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: ok ? css('--green') : css('--red'), 'stroke-width': .8, 'marker-end': `url(#${P.id}a)` }, layer); svgEl('circle', { cx: a[0], cy: a[1], r: 1.6, fill: '#fff' }, layer);
    $('#out', box).innerHTML = `<span class="big" style="color:${ok ? 'var(--green-ink)' : 'var(--red)'}">${ok ? 'Progressive' : 'Not progressive'}</span><b>${t.carry ? 'carry' : 'pass'}</b><span class="muted small">${gain >= 0 ? 'Gains' : 'Loses'} ${Math.abs(gain).toFixed(1)} yd toward goal (needs 10)</span><span class="muted small">${a[0] < 48 ? 'Starts inside the own 40% (shaded): excluded' : 'Starts outside the own 40%'}</span><span class="muted small">${box2 ? 'Enters the penalty area: counts regardless' : 'Does not enter the penalty area'}</span>`; };
  P.svg.style.cursor = 'crosshair'; P.svg.addEventListener('click', (ev) => { pts[n % 2] = pitchPoint(P.svg, ev); n++; draw(); }); draw();
}
async function xtTool(box) {
  const mdl = await getJSON('data/models/xg_simple.json'); box.innerHTML = `<div id="p" style="max-width:720px"></div><p class="src" style="margin-top:10px">Shooting value by zone: the teaching xG model at the centre of each 7.5 × 8 yd cell, shown as a percentage. Darker means a shot from there is more likely to score. This is one ingredient of xT, not a full xT surface.</p>`;
  const P = createPitch($('#p', box), { label: 'Shooting value by zone' }), layer = P.layer(), cw = 7.5, ch = 8;
  for (let cx = 0; cx < 16; cx++) for (let cy = 0; cy < 10; cy++) { const v = xgOf(mdl, cx * cw + cw / 2, cy * ch + ch / 2, false).xg; svgEl('rect', { x: cx * cw, y: cy * ch, width: cw, height: ch, fill: css('--green'), opacity: Math.min(.9, Math.pow(v, .55) * 1.6).toFixed(3) }, layer); if (v >= .02) svgEl('text', { x: cx * cw + cw / 2, y: cy * ch + ch / 2 + 1, 'text-anchor': 'middle', class: 'net-name' }, layer).textContent = (v * 100).toFixed(0); }
}
function poissonTool(box) {
  box.innerHTML = `<div class="calc"><div class="sliders"><label><span>Home expected goals (λ)<output></output></span><input type="range" data-k="h" min="0.2" max="4" step="0.05" value="1.6"></label><label><span>Away expected goals (μ)<output></output></span><input type="range" data-k="a" min="0.2" max="4" step="0.05" value="1.1"></label><label><span>Dixon-Coles ρ<output></output></span><input type="range" data-k="r" min="-0.2" max="0.2" step="0.01" value="-0.05"></label></div><div class="calc-out" id="out" aria-live="polite"></div></div><div class="matrix" id="mx" style="grid-template-columns:repeat(7,minmax(0,1fr));margin-top:16px;max-width:560px"></div><p class="src" style="margin-top:8px">Rows: home goals 0–5. Columns: away goals 0–5. Cells are percentages.</p>`;
  const run = () => { const v = {}; $$('input', box).forEach((i) => { v[i.dataset.k] = Number(i.value); i.previousElementSibling.querySelector('output').textContent = Number(i.value).toFixed(2); setRangeFill(i); });
    const m = scoreMatrix(v.h, v.a, { rho: v.r }), o = outcomes(m), top = topScores(m, 1)[0], mx = Math.max(...m.slice(0, 6).flatMap((r) => r.slice(0, 6)));
    $('#out', box).innerHTML = `<div class="prob"><span class="h" style="flex-basis:${o.home * 100}%">${fmt.pct(o.home)}</span><span class="d" style="flex-basis:${o.draw * 100}%">${fmt.pct(o.draw)}</span><span class="a" style="flex-basis:${o.away * 100}%">${fmt.pct(o.away)}</span></div><div class="prob-labels"><span>Home</span><span>Draw</span><span>Away</span></div><span class="muted small">Most likely score ${top.h}–${top.a} (${fmt.pct(top.p, 1)})</span><span class="muted small">Both teams score ${fmt.pct(o.btts)} · over 2.5 goals ${fmt.pct(o.over25)}</span><span class="muted small">Home clean sheet ${fmt.pct(Math.exp(-v.a))}</span>`;
    $('#mx', box).innerHTML = `<div class="hd"></div>${[0, 1, 2, 3, 4, 5].map((n) => `<div class="hd">${n}</div>`).join('')}` + [0, 1, 2, 3, 4, 5].map((r) => `<div class="hd">${r}</div>` + [0, 1, 2, 3, 4, 5].map((c) => `<div class="${r === c ? 'draw' : ''} ${r === top.h && c === top.a ? 'top' : ''}" style="--a:${(m[r][c] / mx * .9).toFixed(3)}">${(m[r][c] * 100).toFixed(1)}</div>`).join('')).join(''); };
  box.addEventListener('input', run); run();
}
function xptsTool(box) {
  box.innerHTML = `<div class="calc"><div class="sliders"><label><span>Your xG<output></output></span><input type="range" data-k="f" min="0" max="4.5" step="0.05" value="2"></label><label><span>Opponent xG<output></output></span><input type="range" data-k="a" min="0" max="4.5" step="0.05" value="1"></label><label><span>Matches like this<output></output></span><input type="range" data-k="n" min="1" max="38" step="1" value="10"></label></div><div class="calc-out" id="out" aria-live="polite"></div></div>`;
  const run = () => { const v = {}; $$('input', box).forEach((i) => { v[i.dataset.k] = Number(i.value); i.previousElementSibling.querySelector('output').textContent = i.dataset.k === 'n' ? i.value : Number(i.value).toFixed(2); setRangeFill(i); });
    const o = outcomes(scoreMatrix(Math.max(.01, v.f), Math.max(.01, v.a))), x = 3 * o.home + o.draw; $('#out', box).innerHTML = `<span class="big num">${x.toFixed(2)}</span><b>expected points per match</b><span class="muted small">Win ${fmt.pct(o.home)} · draw ${fmt.pct(o.draw)} · loss ${fmt.pct(o.away)}</span><span class="muted small">Over ${v.n} such matches: about ${(x * v.n).toFixed(1)} points</span>`; };
  box.addEventListener('input', run); run();
}
async function logitTool(box) {
  const st = await modelState(), P = st.params.ordered;
  box.innerHTML = `<div class="sliders" style="max-width:520px;margin-bottom:12px"><label><span>Elo gap, home minus away, including ${st.params.elo.hfa} points of home advantage<output></output></span><input type="range" id="d" min="-500" max="500" step="10" value="${st.params.elo.hfa}"></label></div><div class="prob" id="pb"></div><div class="prob-labels"><span>Home win</span><span>Draw</span><span>Away win</span></div><div class="chart" id="c" style="--h:280px;margin-top:14px"></div><p class="src">Fitted on ${st.trainedOn.matches.toLocaleString('en-GB')} league matches: c₁ = ${P.c1}, c₂ = ${P.c2}, b = ${P.b} per 400 points.</p>`;
  const xs = []; for (let d = -500; d <= 500; d += 20) xs.push(d); const cur = (d) => orderedProbs(d / 400, P);
  await chart($('#c', box), { aria: 'Outcome probability by Elo gap', xAxis: { type: 'category', data: xs, name: 'Elo gap', nameLocation: 'middle', nameGap: 26, axisLabel: { interval: 4 } }, yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } }, series: [['Home win', 'home', css('--blue')], ['Draw', 'draw', css('--text-3')], ['Away win', 'away', css('--green')]].map(([n, k, c]) => lineSeries(n, xs.map((d) => +(cur(d)[k] * 100).toFixed(1)), c, { showSymbol: false })) });
  const run = () => { const i = $('#d', box), o = cur(Number(i.value)); i.previousElementSibling.querySelector('output').textContent = (i.value > 0 ? '+' : '') + i.value; setRangeFill(i); $('#pb', box).innerHTML = `<span class="h" style="flex-basis:${o.home * 100}%">${fmt.pct(o.home)}</span><span class="d" style="flex-basis:${o.draw * 100}%">${fmt.pct(o.draw)}</span><span class="a" style="flex-basis:${o.away * 100}%">${fmt.pct(o.away)}</span>`; };
  $('#d', box).addEventListener('input', run); run();
}
function probTool(box) {
  let seed = 1; box.innerHTML = `<div class="calc"><div class="sliders"><label><span>Home win<output></output></span><input type="range" data-k="h" min="0" max="100" value="55"></label><label><span>Draw<output></output></span><input type="range" data-k="d" min="0" max="100" value="25"></label><p class="muted small" id="aw"></p><button class="btn sm" id="again" type="button">Simulate another 100</button></div><div><div id="dots" style="display:grid;grid-template-columns:repeat(10,1fr);gap:5px;max-width:300px"></div><p class="muted small" id="tally" style="margin-top:10px" aria-live="polite"></p></div></div>`;
  const run = () => { let h = Number($('[data-k=h]', box).value), d = Number($('[data-k=d]', box).value); if (h + d > 100) { d = 100 - h; $('[data-k=d]', box).value = d; }
    $$('input', box).forEach((i) => { i.previousElementSibling.querySelector('output').textContent = i.value + '%'; setRangeFill(i); }); $('#aw', box).textContent = `Away win: ${100 - h - d}% (the three always sum to 100%)`;
    let t = seed * 7919; const rnd = () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296 * 100; }, c = [0, 0, 0], cols = [css('--blue'), css('--text-3'), css('--green')];
    $('#dots', box).innerHTML = Array.from({ length: 100 }, () => { const u = rnd(), k = u < h ? 0 : u < h + d ? 1 : 2; c[k]++; return `<i style="aspect-ratio:1;border-radius:50%;background:${cols[k]}"></i>`; }).join('');
    $('#tally', box).textContent = `This run: ${c[0]} home wins, ${c[1]} draws, ${c[2]} away wins. The same probabilities give a different 100 every time.`; };
  box.addEventListener('input', run); $('#again', box).addEventListener('click', () => { seed++; run(); }); run();
}
async function calibTool(box) {
  const ev = await modelEval(), cal = ev.calibration.ensemble.filter((b) => b.n > 30);
  box.innerHTML = `<div class="chart" id="c" style="--h:320px"></div><p class="src">${ev.window.matches.toLocaleString('en-GB')} out-of-sample matches, ${fmt.season(ev.window.from)} to ${fmt.season(ev.window.to)}. Ensemble log loss ${ev.models.ensemble.logLoss} against ${ev.models.baseRate.logLoss} for the base-rate baseline. <a class="link" href="#/predictions?tab=validation">Full validation report</a></p>`;
  chart($('#c', box), { aria: 'Calibration of the ensemble', legend: false, tooltip: { trigger: 'item', formatter: (p) => `Forecast ${(p.value[0] * 100).toFixed(1)}%<br>Happened ${(p.value[1] * 100).toFixed(1)}%` }, xAxis: { type: 'value', min: 0, max: 1, name: 'Forecast probability', nameLocation: 'middle', nameGap: 26, axisLabel: { formatter: (v) => v * 100 + '%' } }, yAxis: { type: 'value', min: 0, max: 1, name: 'How often it happened', axisLabel: { formatter: (v) => v * 100 + '%' } },
    series: [{ type: 'line', data: [[0, 0], [1, 1]], symbol: 'none', lineStyle: { color: css('--text-3'), type: 'dashed', width: 1 }, silent: true }, { type: 'line', data: cal.map((b) => [b.predicted, b.observed]), symbolSize: 9, lineStyle: { color: css('--green'), width: 2.5 }, itemStyle: { color: css('--green') } }] });
}
