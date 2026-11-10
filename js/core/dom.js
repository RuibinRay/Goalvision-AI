/** Small DOM + formatting helpers shared by every view. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Tagged template: arrays are joined, null/false dropped. Interpolated strings are NOT escaped — use esc() for data. */
export const html = (s, ...v) => s.reduce((out, str, i) => out + str + (i < v.length ? (Array.isArray(v[i]) ? v[i].join('') : v[i] === null || v[i] === undefined || v[i] === false ? '' : v[i]) : ''), '');
export const NA = '<span class="na">Not available</span>';

export const fmt = {
  n: (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d)),
  pct: (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : (v * 100).toFixed(d) + '%'),
  signed: (v, d = 0) => (v == null ? '–' : (v > 0 ? '+' : '') + Number(v).toFixed(d)),
  per90: (v, min, d = 2) => (!min ? '–' : (v / min * 90).toFixed(d)),
  date: (iso, opt = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', opt) : '–'),
  day: (iso) => fmt.date(iso, { weekday: 'short', day: 'numeric', month: 'short' }),
  stamp: (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'),
  season: (s) => s.replace('-', '/'),
  ord: (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'),
};
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
export const mean = (a, f = (x) => x) => (a.length ? sum(a, f) / a.length : 0);
export const debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8"/></svg>',
  ball: '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#F7FAFF"/><path d="m16 9.6 6.1 4.4-2.3 7.2h-7.6L9.9 14z" fill="#080C13"/><path d="M16 9.6V3.4M22.1 14l5.6-2.4M19.8 21.2l3.9 5M12.2 21.2l-3.9 5M9.9 14l-5.6-2.4" stroke="#080C13" stroke-width="1.8"/><circle cx="16" cy="16" r="14" stroke="#BEFF37" stroke-width="1.6"/></svg>',
};

let toastTimer;
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }

/** Reveal-on-scroll for elements with .reveal (content stays visible if JS or IntersectionObserver is unavailable). */
export function observeReveals(root = document) {
  const els = $$('.reveal:not(.in)', root);
  if (!('IntersectionObserver' in window) || document.body.classList.contains('reduced-motion')) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}

/** Click-to-sort for any table.t whose <th> carry data-sort="key" (rows carry data-<key> values). */
export function sortable(table) {
  const tb = table.tBodies[0];
  table.tHead.addEventListener('click', (ev) => {
    const th = ev.target.closest('th[data-sort]'); if (!th) return;
    const key = th.dataset.sort, dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : 'descending';
    $$('th', table).forEach((x) => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', dir);
    const rows = [...tb.rows], num = rows.every((r) => r.dataset[key] === '' || !Number.isNaN(Number(r.dataset[key])));
    rows.sort((a, b) => { const x = a.dataset[key], y = b.dataset[key]; const c = num ? Number(x) - Number(y) : String(x).localeCompare(String(y)); return dir === 'ascending' ? c : -c; });
    rows.forEach((r) => tb.append(r));
  });
  tb.addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-href]'); if (tr && !ev.target.closest('a,button')) location.hash = tr.dataset.href; });
}
export function segmented(el, onChange) {
  el.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return; $$('button', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); onChange(b.dataset.v, b); });
}
export const seg = (items, cur, cls = '') => `<div class="seg ${cls}" role="group">${items.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join('')}</div>`;
export const options = (items, cur) => items.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
export function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function setRangeFill(input) { const p = (input.value - input.min) / (input.max - input.min) * 100; input.style.setProperty('--fill', p + '%'); }
