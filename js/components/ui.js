/** Shared UI fragments: crests, flags, fixtures, notes, favourites, the club hover card. */
import { $, esc, html, fmt, ICON, toast, todayISO } from '../core/dom.js';
import { club, asset, flagCode, isFav, toggleIn, league, season as loadSeason, SEASON } from '../core/store.js';
import { table, played } from '../models/standings.js';

/** Club crest with its natural aspect ratio. Clubs without supplied artwork get a monogram, never a wrong logo. */
export function crest(id, size = 28, { lazy = true } = {}) {
  const c = club(id);
  if (!c.logo) return `<span class="crest mono" style="--s:${size}px" title="${esc(c.name)}">${esc(c.tla || '')}</span>`;
  return `<span class="crest" style="--s:${size}px"><img src="${asset(c.logo)}" alt="${esc(c.name)} crest" width="${c.logoW}" height="${c.logoH}"${lazy ? ' loading="lazy"' : ''} decoding="async"></span>`;
}
export function flag(country, size = 22) {
  const code = flagCode(country);
  return code ? `<img class="flag" style="--s:${size}px" src="https://flagcdn.com/${code}.svg" alt="${esc(country)} flag" loading="lazy" decoding="async">` : `<span class="flag" style="--s:${size}px" title="${esc(country)}"></span>`;
}
export const teamLink = (id, { size = 24, short = true, link = true } = {}) => {
  const c = club(id), inner = `${crest(id, size)}<span>${esc(short ? c.short : c.name)}</span>`;
  return link && !c.past ? `<a class="team" href="#/club/${id}" data-club="${id}">${inner}</a>` : `<span class="team">${inner}</span>`;
};
export const nation = (name, { size = 22 } = {}) => `<span class="team">${flag(name, size)}<span>${esc(name)}</span></span>`;
export const formDots = (list, cls = '') => `<span class="formdots ${cls}" aria-label="Recent form: ${list.join(' ')}">${list.map((r) => `<i class="${r}">${r}</i>`).join('')}</span>`;
export const stat = (k, v, s = '') => `<div class="stat${v == null ? ' na' : ''}"><span class="k">${k}</span><span class="v num">${v ?? 'Not available'}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
export const note = (text, cls = '') => `<div class="note ${cls}">${ICON.info}<div>${text}</div></div>`;
export const source = (name, date, url) => `<p class="src">Source: ${url ? `<a href="${url}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}${date ? ` · snapshot ${fmt.stamp(date)}` : ''}</p>`;
export const favBtn = (kind, id, label) => `<button class="fav-btn" type="button" data-fav="${kind}" data-id="${esc(id)}" aria-pressed="${isFav(kind, id)}" aria-label="Add ${esc(label)} to favourites" title="Favourite">${ICON.star}</button>`;
export const vsRow = (label, a, b, { d = 0, lowerBetter = false, suffix = '' } = {}) => {
  const A = a ?? 0, B = b ?? 0, tot = Math.abs(A) + Math.abs(B) || 1, aw = lowerBetter ? A < B : A > B, bw = lowerBetter ? B < A : B > A;
  const show = (v) => (v == null ? '–' : (typeof v === 'number' ? v.toFixed(d) : v) + suffix);
  return `<div class="vs-row"><span class="lab">${label}</span><b class="num ${aw ? 'win' : bw ? 'lose' : ''}">${show(a)}</b><div class="vs-bar"><i style="flex-basis:${(Math.abs(A) / tot * 100).toFixed(1)}%"></i><i style="flex-basis:${(Math.abs(B) / tot * 100).toFixed(1)}%"></i></div><b class="num ${bw ? 'win' : aw ? 'lose' : ''}">${show(b)}</b></div>`;
};
export const probBar = ([h, d, a], cls = '') => `<div class="prob ${cls}" role="img" aria-label="Home ${fmt.pct(h)}, draw ${fmt.pct(d)}, away ${fmt.pct(a)}"><span class="h" style="flex-basis:${(h * 100).toFixed(1)}%">${fmt.pct(h)}</span><span class="d" style="flex-basis:${(d * 100).toFixed(1)}%">${fmt.pct(d)}</span><span class="a" style="flex-basis:${(a * 100).toFixed(1)}%">${fmt.pct(a)}</span></div>`;

/** Status of a snapshot fixture relative to today. Unplayed past fixtures are reported as missing, never guessed. */
export function fixtureStatus(m, today = todayISO()) {
  if (played(m)) return { code: 'FT', label: 'Full time' };
  if (m[1] < today) return { code: 'PENDING', label: 'Result not in snapshot' };
  if (m[1] === today) return { code: 'TODAY', label: 'Today' };
  return { code: 'SCHEDULED', label: 'Scheduled' };
}
/** One league fixture row. `s` is the season file, `m` a match row. */
export function fixtureRow(s, m, { showDate = true } = {}) {
  const st = fixtureStatus(m), h = s.teams[m[3]], a = s.teams[m[4]], i = s.matches.indexOf(m);
  const mid = st.code === 'FT' ? `<span class="score num">${m[5]}–${m[6]}</span><span class="when">${showDate ? fmt.day(m[1]) : 'FT'}</span>`
    : `<span class="ko num">${m[2] || 'TBC'}</span><span class="when">${st.code === 'PENDING' ? 'Result pending' : showDate ? fmt.day(m[1]) : st.label}</span>`;
  return `<a class="fx" href="#/match/lg~${s.league}~${s.season}~${i}">${teamLink(h, { link: false })}<span class="mid">${mid}</span>${teamLink(a, { link: false })}</a>`;
}

/* ── favourites: one delegated listener for the whole app ── */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.fav-btn'); if (!b) return; ev.preventDefault(); ev.stopPropagation();
  const kind = b.dataset.fav, id = b.dataset.id, on = toggleIn(kind, kind === 'players' ? { id, name: b.dataset.name, comp: b.dataset.comp } : id);
  b.setAttribute('aria-pressed', on); toast(on ? 'Added to My Dashboard' : 'Removed from My Dashboard');
});

/* ── club hover card: position, record, goals and form from the current snapshot ── */
const hc = () => $('#hovercard'); let hcTimer = null; const tables = new Map();
async function tableFor(lid) { if (!tables.has(lid)) tables.set(lid, loadSeason(lid).then((s) => ({ s, t: table(s) }))); return tables.get(lid); }
async function showCard(target) {
  const id = target.dataset.club, c = club(id); if (c.past) return;
  const { s, t } = await tableFor(c.league); const r = t.find((x) => x.id === id); if (!r || !target.matches(':hover, :focus-visible')) return;
  const el = hc(); el.hidden = false;
  el.innerHTML = html`<div class="row" style="gap:12px;flex-wrap:nowrap">${crest(id, 46)}<div style="min-width:0"><h4>${esc(c.name)}</h4><div class="dim small">${esc(league(c.league).name)} · ${fmt.season(SEASON)}</div></div></div>
    <div class="kv"><span>Position</span><b>${fmt.ord(r.pos)} of ${t.length}</b><span>Record (W-D-L)</span><b>${r.w}-${r.d}-${r.l}</b><span>Goals scored</span><b>${r.gf}</b><span>Goals conceded</span><b>${r.ga}</b><span>Points</span><b>${r.pts}</b><span>Form</span><b>${formDots(r.form.slice(-5).map((f) => f.res), 'sm')}</b></div>
    <div class="src" style="margin-top:10px">Results to ${fmt.date(s.lastResult)}</div>`;
  const b = target.getBoundingClientRect(), w = 268, h = el.offsetHeight;
  let x = b.left + b.width / 2 - w / 2, y = b.bottom + 10; if (y + h > innerHeight - 8) y = b.top - h - 10;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; el.style.top = Math.max(8, y) + 'px';
  requestAnimationFrame(() => el.classList.add('show'));
}
function hideCard() { clearTimeout(hcTimer); const el = hc(); el.classList.remove('show'); }
document.addEventListener('pointerover', (ev) => { const t = ev.target.closest?.('[data-club]'); if (!t || ev.pointerType === 'touch') return; clearTimeout(hcTimer); hcTimer = setTimeout(() => showCard(t), 140); });
document.addEventListener('pointerout', (ev) => { if (ev.target.closest?.('[data-club]')) hideCard(); });
document.addEventListener('focusin', (ev) => { const t = ev.target.closest?.('[data-club]'); if (t) showCard(t); });
document.addEventListener('focusout', hideCard);
document.addEventListener('route', hideCard);
window.addEventListener('scroll', hideCard, { passive: true });

/** Tabs helper: buttons with data-tab switch which [data-pane] is visible; calls onShow(name) once per activation. */
export function tabs(root, onShow) {
  const bar = $('.tabs', root); if (!bar) return;
  const show = (name) => {
    bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
    root.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
    onShow?.(name);
  };
  bar.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-tab]'); if (b) show(b.dataset.tab); });
  return show;
}
