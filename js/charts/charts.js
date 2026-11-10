/**
 * Apache ECharts wrappers. The library is loaded on first use (keeps the first paint light), every chart is themed
 * from the CSS tokens, resized with its container and disposed on route change.
 */
let lib = null; const live = new Set();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => es.forEach((e) => e.target.__chart?.resize())) : null;
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const palette = () => [1, 2, 3, 4, 5, 6, 7].map((i) => css('--chart-' + i));
export const rgba = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

export async function chart(el, { aria, ...option }) {            // `aria` is our accessible label, not ECharts' aria component
  if (!el) return null;
  lib ||= await import('echarts');
  if (!el.isConnected) return null;
  const t = { text: css('--text'), text2: css('--text-2'), text3: css('--text-3'), line: css('--line'), line2: css('--line-2'), bg2: css('--bg-2') };
  const c = lib.init(el, null, { renderer: 'canvas' });
  const axis = { axisLine: { lineStyle: { color: t.line2 } }, axisTick: { show: false }, axisLabel: { color: t.text3, fontSize: 11.5 }, splitLine: { lineStyle: { color: t.line } }, nameTextStyle: { color: t.text3, fontSize: 11.5 } };
  const base = {
    color: palette(), backgroundColor: 'transparent', animationDuration: 700, animationEasing: 'cubicOut',
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: t.text2 },
    grid: { left: 8, right: 14, top: 38, bottom: 6, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: t.bg2, borderColor: t.line2, textStyle: { color: t.text, fontSize: 12.5 }, axisPointer: { lineStyle: { color: t.line2 } }, confine: true },
    legend: { textStyle: { color: t.text2, fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8, top: 0, right: 0, inactiveColor: t.text3 },
  };
  const merged = { ...base, ...option, tooltip: { ...base.tooltip, ...(option.tooltip || {}) }, legend: option.legend === false ? { show: false } : { ...base.legend, ...(option.legend || {}) }, grid: { ...base.grid, ...(option.grid || {}) } };
  for (const k of ['xAxis', 'yAxis']) if (merged[k]) merged[k] = [].concat(merged[k]).map((a, i) => ({ ...axis, ...a, axisLabel: { ...axis.axisLabel, ...(a.axisLabel || {}) }, splitLine: { ...axis.splitLine, ...(a.splitLine || {}) },
    nameTextStyle: { ...axis.nameTextStyle, ...(k === 'yAxis' && a.type !== 'category' ? { align: i ? 'right' : 'left' } : {}), ...(a.nameTextStyle || {}) } }));
  if (document.body.classList.contains('reduced-motion')) merged.animation = false;
  c.setOption(merged);
  el.__chart = c; live.add(c); ro?.observe(el);
  el.setAttribute('role', 'img'); if (aria) el.setAttribute('aria-label', aria);
  return c;
}
export function disposeCharts() { for (const c of live) { try { ro?.unobserve(c.getDom()); c.dispose(); } catch { /* already gone */ } } live.clear(); }

/* ── presets ── */
export const lineSeries = (name, data, color, extra = {}) => ({ name, type: 'line', data, smooth: .25, symbol: 'circle', symbolSize: 5, showSymbol: data.length < 45, lineStyle: { width: 2.5, color }, itemStyle: { color }, ...extra });
export const areaStyle = (color, a = .22) => ({ color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: rgba(color, a) }, { offset: 1, color: rgba(color, 0) }] } });

export function radar(el, indicators, series, { max = 100, aria } = {}) {
  const t3 = css('--text-3'), line = css('--line-2');
  return chart(el, {
    aria, tooltip: { trigger: 'item' }, legend: { bottom: 0, top: 'auto', right: 'auto', left: 'center' },
    radar: { indicator: indicators.map((n) => ({ name: n, max })), radius: '64%', center: ['50%', '47%'], splitNumber: 4, axisName: { color: css('--text-2'), fontSize: 11.5 }, splitLine: { lineStyle: { color: line } }, splitArea: { areaStyle: { color: ['transparent', rgba('#8492A6', .05)] } }, axisLine: { lineStyle: { color: line } } },
    series: [{ type: 'radar', symbolSize: 5, data: series.map((s) => ({ name: s.name, value: s.values, lineStyle: { color: s.color, width: 2.5 }, itemStyle: { color: s.color }, areaStyle: { color: rgba(s.color, .18) } })) }],
  });
}
export function bars(el, cats, series, { horizontal = false, stack = false, aria, fmtLabel, max } = {}) {
  const cat = { type: 'category', data: cats, axisLabel: { interval: 0, hideOverlap: true } }, val = { type: 'value', max };
  return chart(el, {
    aria, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: series.length > 1 ? {} : false,
    xAxis: horizontal ? val : cat, yAxis: horizontal ? { ...cat, inverse: true } : val,
    series: series.map((s) => ({ name: s.name, type: 'bar', stack: stack ? 'a' : undefined, data: s.data, itemStyle: { color: s.color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }, barMaxWidth: 26, label: fmtLabel ? { show: true, position: horizontal ? 'right' : 'top', color: css('--text-2'), fontSize: 11, formatter: fmtLabel } : undefined })),
  });
}
/** Semi-circular three-way probability gauge (home / draw / away). */
export function gauge3(el, [h, d, a], labels, { aria } = {}) {
  const cols = [css('--blue'), css('--bg-4'), css('--green')];
  return chart(el, {
    aria, legend: false, tooltip: { trigger: 'item', formatter: (p) => `${p.name}: <b>${(p.value * 100).toFixed(1)}%</b>` },
    series: [{ type: 'pie', startAngle: 180, endAngle: 360, radius: ['62%', '92%'], center: ['50%', '86%'], padAngle: 1.5, itemStyle: { borderRadius: 6 }, label: { show: false }, emphasis: { scale: true, scaleSize: 5 },
      data: [{ value: h, name: labels[0], itemStyle: { color: cols[0] } }, { value: d, name: 'Draw', itemStyle: { color: cols[1] } }, { value: a, name: labels[1], itemStyle: { color: cols[2] } }] }],
  });
}
