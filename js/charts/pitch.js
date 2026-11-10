/**
 * SVG football pitch in StatsBomb's 120 x 80 yard frame (penalty area 18 x 44, six-yard box 6 x 20, goal 8 yd,
 * centre circle radius 10). All layers take data in that frame; `flip` mirrors a team so it attacks right-to-left.
 */
const NS = 'http://www.w3.org/2000/svg';
export const PITCH = { w: 120, h: 80 };
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.append(n); return n; };
const X = (x, flip) => (flip ? 120 - x : x), Y = (y, flip) => (flip ? 80 - y : y);

/** StatsBomb position id -> nominal spot for a team attacking towards x = 120. */
export const POSITION_XY = { 1: [7, 40], 2: [26, 70], 3: [22, 54], 4: [20, 40], 5: [22, 26], 6: [26, 10], 7: [36, 73], 8: [36, 7], 9: [40, 52], 10: [38, 40], 11: [40, 28], 12: [58, 70],
  13: [56, 52], 14: [54, 40], 15: [56, 28], 16: [58, 10], 17: [82, 68], 18: [76, 54], 19: [74, 40], 20: [76, 26], 21: [82, 12], 22: [94, 50], 23: [98, 40], 24: [94, 30], 25: [86, 40] };

/** Formation templates: rows from goalkeeper to attack, each row listed right-to-left of the team (y 80 -> 0). */
export const FORMATIONS = {
  '4-3-3': [['GK'], ['RB', 'RCB', 'LCB', 'LB'], ['RCM', 'CDM', 'LCM'], ['RW', 'ST', 'LW']],
  '4-2-3-1': [['GK'], ['RB', 'RCB', 'LCB', 'LB'], ['RDM', 'LDM'], ['RAM', 'CAM', 'LAM'], ['ST']],
  '4-4-2': [['GK'], ['RB', 'RCB', 'LCB', 'LB'], ['RM', 'RCM', 'LCM', 'LM'], ['RST', 'LST']],
  '3-5-2': [['GK'], ['RCB', 'CB', 'LCB'], ['RWB', 'RCM', 'CDM', 'LCM', 'LWB'], ['RST', 'LST']],
  '3-4-3': [['GK'], ['RCB', 'CB', 'LCB'], ['RM', 'RCM', 'LCM', 'LM'], ['RW', 'ST', 'LW']],
  '5-3-2': [['GK'], ['RWB', 'RCB', 'CB', 'LCB', 'LWB'], ['RCM', 'CM', 'LCM'], ['RST', 'LST']],
};
export function formationSpots(name) {
  const rows = FORMATIONS[name]; const depth = rows.length; const out = [];
  rows.forEach((row, r) => {
    const x = r === 0 ? 7 : 24 + (r - 1) * (70 / Math.max(1, depth - 2));          // back line at 24 yd, front line at 94 yd
    row.forEach((role, i) => out.push({ role, x, y: row.length === 1 ? 40 : 70 - i * (60 / (row.length - 1)) }));
  });
  return out;
}
export const formationLabel = (n) => (n ? String(n).split('').join('-') : null);

export function createPitch(container, { half = false, pad = 3, stripes = true, label } = {}) {
  const vb = half ? [60 - pad, -pad, 60 + pad * 2, 80 + pad * 2] : [-pad, -pad, 120 + pad * 2, 80 + pad * 2];
  const svg = el('svg', { viewBox: vb.join(' '), class: 'pitch-svg', role: 'img', 'aria-label': label || 'Football pitch diagram', preserveAspectRatio: 'xMidYMid meet' });
  const defs = el('defs', {}, svg);
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const blur = el('filter', { id: id + 'b', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs); el('feGaussianBlur', { stdDeviation: 2.6 }, blur);
  const mk = el('marker', { id: id + 'a', viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' }, defs); el('path', { d: 'M0 0 6 3 0 6z', fill: 'context-stroke' }, mk);
  el('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], class: 'pitch-grass', rx: 2 }, svg);
  if (stripes) for (let i = 0; i < 12; i += 2) el('rect', { x: i * 10, y: 0, width: 10, height: 80, class: 'pitch-stripe' }, svg);
  const g = el('g', { class: 'pitch-lines', fill: 'none' }, svg);
  el('rect', { x: 0, y: 0, width: 120, height: 80 }, g); el('path', { d: 'M60 0V80' }, g); el('circle', { cx: 60, cy: 40, r: 10 }, g); el('circle', { cx: 60, cy: 40, r: .5, class: 'pitch-dot' }, g);
  for (const s of [0, 1]) {
    const m = (x) => (s ? 120 - x : x);
    el('rect', { x: Math.min(m(0), m(18)), y: 18, width: 18, height: 44 }, g); el('rect', { x: Math.min(m(0), m(6)), y: 30, width: 6, height: 20 }, g);
    el('rect', { x: Math.min(m(0), m(-2)), y: 36, width: 2, height: 8, class: 'pitch-goal' }, g); el('circle', { cx: m(12), cy: 40, r: .5, class: 'pitch-dot' }, g);
    el('path', { d: `M${m(18)} 32.03A10 10 0 0 ${s ? 0 : 1} ${m(18)} 47.97` }, g);
  }
  for (const [cx, cy, a] of [[0, 0, 'M1 0A1 1 0 0 1 0 1'], [120, 0, 'M119 0A1 1 0 0 0 120 1'], [0, 80, 'M0 79A1 1 0 0 1 1 80'], [120, 80, 'M120 79A1 1 0 0 0 119 80']]) el('path', { d: a }, g);
  const layers = el('g', { class: 'pitch-layers' }, svg);
  container.replaceChildren(svg);
  const api = {
    svg, id, clear() { layers.replaceChildren(); return api; },
    layer(cls = '') { return el('g', { class: cls }, layers); },
    /** grid: flat array of gx*gy counts (row-major, x first). */
    heat(grid, [gx, gy], { flip = false, color = '#168FFF', blur: useBlur = true } = {}) {
      const g2 = api.layer('pitch-heat'); if (useBlur) g2.setAttribute('filter', `url(#${id}b)`);
      const max = Math.max(1, ...grid), cw = 120 / gx, ch = 80 / gy;
      grid.forEach((v, i) => { if (!v) return; const cx = i % gx, cy = Math.floor(i / gx); el('rect', { x: flip ? 120 - (cx + 1) * cw : cx * cw, y: flip ? 80 - (cy + 1) * ch : cy * ch, width: cw, height: ch, fill: color, opacity: (Math.pow(v / max, .7) * .85).toFixed(3) }, g2); });
      return api;
    },
    /** shots: [{x, y, xg, outcome:'G'|'S'|'O'|'P'|'B', title}] */
    shots(list, { flip = false, color = '#168FFF', onClick } = {}) {
      const g2 = api.layer('pitch-shots');
      [...list].sort((a, b) => b.xg - a.xg).forEach((s) => {
        const c = el('circle', { cx: X(s.x, flip), cy: Y(s.y, flip), r: (0.8 + Math.sqrt(s.xg) * 3.4).toFixed(2), class: 'shot ' + (s.outcome === 'G' ? 'goal' : s.outcome === 'S' ? 'saved' : 'miss'), stroke: color, fill: s.outcome === 'G' ? color : 'transparent', tabindex: 0 }, g2);
        if (s.title) el('title', {}, c).textContent = s.title;
        if (onClick) c.addEventListener('click', () => onClick(s));
      });
      return api;
    },
    /** nodes: [[name, num, x, y, n]], edges: [[i, j, n]] */
    network(nodes, edges, { flip = false, color = '#168FFF', minEdge = 3 } = {}) {
      const g2 = api.layer('pitch-net'); const maxE = Math.max(1, ...edges.map((e) => e[2])), maxN = Math.max(1, ...nodes.map((n) => n[4]));
      edges.filter((e) => e[2] >= minEdge).forEach(([i, j, n]) => el('line', { x1: X(nodes[i][2], flip), y1: Y(nodes[i][3], flip), x2: X(nodes[j][2], flip), y2: Y(nodes[j][3], flip), stroke: color, 'stroke-width': (0.25 + 2.2 * n / maxE).toFixed(2), opacity: (0.25 + 0.6 * n / maxE).toFixed(2), 'stroke-linecap': 'round' }, g2));
      nodes.forEach(([name, num, x, y, n]) => {
        const gg = el('g', { transform: `translate(${X(x, flip)} ${Y(y, flip)})`, class: 'net-node' }, g2);
        el('circle', { r: (1.5 + 1.7 * n / maxN).toFixed(2), fill: color }, gg); el('text', { 'text-anchor': 'middle', dy: '.36em', class: 'net-num' }, gg).textContent = num ?? '';
        el('text', { 'text-anchor': 'middle', y: 6.2, class: 'net-name' }, gg).textContent = shortName(name); el('title', {}, gg).textContent = `${name} — ${n} passes made or received`;
      });
      return api;
    },
    /** players: [{x, y, label, sub, color}] – static dots (average positions, line-ups) */
    dots(players, { flip = false, color = '#168FFF', r = 2.6 } = {}) {
      const g2 = api.layer('pitch-dots');
      players.forEach((p) => {
        const gg = el('g', { transform: `translate(${X(p.x, flip)} ${Y(p.y, flip)})`, class: 'net-node' }, g2);
        el('circle', { r, fill: p.color || color }, gg); el('text', { 'text-anchor': 'middle', dy: '.36em', class: 'net-num' }, gg).textContent = p.label ?? '';
        if (p.sub) el('text', { 'text-anchor': 'middle', y: r + 3.4, class: 'net-name' }, gg).textContent = p.sub;
        if (p.title) el('title', {}, gg).textContent = p.title;
      });
      return api;
    },
    /** arrows: [[x1, y1, x2, y2]] */
    arrows(list, { flip = false, color = '#BEFF37', width = .45, opacity = .7 } = {}) {
      const g2 = api.layer('pitch-arrows');
      list.forEach(([x1, y1, x2, y2]) => el('line', { x1: X(x1, flip), y1: Y(y1, flip), x2: X(x2, flip), y2: Y(y2, flip), stroke: color, 'stroke-width': width, opacity, 'marker-end': `url(#${id}a)`, 'stroke-linecap': 'round' }, g2));
      return api;
    },
    /** Convex hull of points – team shape. */
    hull(points, { flip = false, color = '#168FFF' } = {}) {
      const pts = points.map(([x, y]) => [X(x, flip), Y(y, flip)]); const h = convexHull(pts);
      if (h.length > 2) el('polygon', { points: h.map((p) => p.join(',')).join(' '), fill: color, 'fill-opacity': .12, stroke: color, 'stroke-width': .4, 'stroke-dasharray': '1.5 1.2' }, api.layer('pitch-hull'));
      return api;
    },
    zones(values, { flip = false, color = '#BEFF37', labels } = {}) {       // three attacking lanes, final third
      const g2 = api.layer('pitch-zones'); const tot = values.reduce((a, b) => a + b, 0) || 1;
      values.forEach((v, i) => { const y0 = i * 80 / 3, yy = flip ? 80 - y0 - 80 / 3 : y0, xx = flip ? 0 : 80;
        el('rect', { x: xx, y: yy, width: 40, height: 80 / 3, fill: color, opacity: (0.12 + 0.6 * v / tot).toFixed(2) }, g2);
        const t = el('text', { x: xx + 20, y: yy + 80 / 6, 'text-anchor': 'middle', class: 'zone-pct' }, g2); t.textContent = Math.round(100 * v / tot) + '%';
        if (labels) el('text', { x: xx + 20, y: yy + 80 / 6 + 5, 'text-anchor': 'middle', class: 'net-name' }, g2).textContent = labels[flip ? 2 - i : i]; });
      return api;
    },
    text(x, y, str, cls = 'net-name') { const t = el('text', { x, y, 'text-anchor': 'middle', class: cls }, api.layer()); t.textContent = str; return api; },
  };
  return api;
}
export const shortName = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : p[0]; };
function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Pointer-drag for tactic-board tokens inside a pitch SVG. onMove(index, x, y) in pitch coordinates. */
export function draggable(svg, selector, onMove) {
  let active = null;
  const pt = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const m = p.matrixTransform(svg.getScreenCTM().inverse()); return [Math.max(1, Math.min(119, m.x)), Math.max(1, Math.min(79, m.y))]; };
  svg.addEventListener('pointerdown', (ev) => { const t = ev.target.closest(selector); if (!t) return; active = t; t.setPointerCapture(ev.pointerId); t.classList.add('drag'); ev.preventDefault(); });
  svg.addEventListener('pointermove', (ev) => { if (!active) return; const [x, y] = pt(ev); active.setAttribute('transform', `translate(${x} ${y})`); onMove(Number(active.dataset.i), x, y, false); });
  const end = (ev) => { if (!active) return; const [x, y] = pt(ev); onMove(Number(active.dataset.i), x, y, true); active.classList.remove('drag'); active = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (ev) => {                       // keyboard: arrows nudge the focused token
    const t = ev.target.closest(selector); if (!t) return; const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[ev.key]; if (!d) return; ev.preventDefault();
    const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(t.getAttribute('transform')); const x = Math.max(1, Math.min(119, +m[1] + d[0])), y = Math.max(1, Math.min(79, +m[2] + d[1]));
    t.setAttribute('transform', `translate(${x} ${y})`); onMove(Number(t.dataset.i), x, y, true);
  });
}
export { el as svgEl };
