/**
 * Competition identity: each league has its own lighting (two key colours and a highlight) and an emblem.
 * The emblems are original GOALVISION marks (a hexagonal badge with the league's initials), not the leagues' official
 * logos, which are trademarks this project has no licence to reproduce.
 */
import { league, club } from '../core/store.js';
import { esc } from '../core/dom.js';

export const LEAGUE_THEME = {
  'eng.1': { a: '#7C4DFF', b: '#FF2E88', c: '#3EE7FF', tag: 'PL', mood: 'Under the lights' },
  'esp.1': { a: '#FF4B33', b: '#FFB020', c: '#FFE08A', tag: 'LL', mood: 'Fire and gold' },
  'ita.1': { a: '#1F9DFF', b: '#19E3A0', c: '#BDE8FF', tag: 'SA', mood: 'Azzurro nights' },
  'ger.1': { a: '#FF2B3A', b: '#F2F5FA', c: '#FF9AA2', tag: 'BL', mood: 'Steel and red' },
  'fra.1': { a: '#2F6BFF', b: '#D4FF3D', c: '#9DB8FF', tag: 'L1', mood: 'Electric blue' },
};
const DEFAULT = { a: '#168FFF', b: '#BEFF37', c: '#E9C15B', tag: 'GV', mood: '' };
export const themeOf = (id) => LEAGUE_THEME[id] || DEFAULT;

/** The league's emblem as inline SVG. `cls` adds classes (for example the faint watermark behind a league header). */
export function emblem(id, size = 64, cls = '') {
  const t = themeOf(id), g = 'lge-' + id.replace(/\W/g, ''), name = league(id)?.name || 'Competition';
  return `<svg class="lg-emblem ${cls}" data-emblem="${esc(id)}" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${esc(name)} emblem">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient></defs>
    <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="#0B1020" stroke="url(#${g})" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 11.5 49.5 21.7v20.6L32 52.5 14.5 42.3V21.7z" fill="none" stroke="${t.c}" stroke-opacity=".38" stroke-width="1"/>
    <text x="32" y="39.4" text-anchor="middle" font-family="Archivo, 'Arial Narrow', Arial, sans-serif" font-weight="900" font-size="19" fill="#F7FAFF" style="font-stretch:125%">${t.tag}</text></svg>`;
}
/** Inline style that hands a league's colours to a card or section as --la / --lb. */
export const leagueVars = (id) => { const t = themeOf(id); return `--la:${t.a};--lb:${t.b}`; };

/** Light the whole page (backdrop, heroes, accents) in a league's or club's colours; no argument restores the house lighting. */
export function setLighting(a, b) {
  const s = document.documentElement.style;
  if (a) { s.setProperty('--lg-a', a); s.setProperty('--lg-b', b || a); } else { s.removeProperty('--lg-a'); s.removeProperty('--lg-b'); }
}
/** Called on every route: league and club pages bring their own lighting, every other page uses the house colours. */
export function lightRoute(info) {
  const [, kind, id] = info.path.split('/');
  if (kind === 'league' && LEAGUE_THEME[id]) { const t = themeOf(id); return setLighting(t.a, t.b); }
  if (kind === 'club') { const c = club(id); if (c && !c.past && c.colors) return setLighting(c.colors[0], c.colors[1]); }
  setLighting();
}

/** Markup for a hero's atmosphere layer: two spotlights, a fog bank and a few drifting motes at fixed pseudo-random spots. */
export function atmos(motes = 12) {
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const dots = Array.from({ length: motes }, () => `<em style="--x:${(r() * 100).toFixed(1)}%;--y:${(20 + r() * 75).toFixed(1)}%;--t:${(7 + r() * 7).toFixed(1)}s;--d:-${(r() * 9).toFixed(1)}s"></em>`).join('');
  return `<div class="atmos" aria-hidden="true"><i></i><i></i><b></b>${dots}</div>`;
}
/** A stylised stadium outline (not a picture of any real ground), tinted by the club's colour through currentColor. */
export const GROUND = `<svg class="ch-ground" viewBox="0 0 900 260" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <path d="M10 250C90 150 250 96 450 96s360 54 440 154" /><path d="M60 250c70-78 210-120 390-120s320 42 390 120" opacity=".7"/><path d="M120 250c60-56 180-86 330-86s270 30 330 86" opacity=".45"/>
  <path d="M96 196 84 60M804 196l12-136M250 122 240 28M650 122l10-94" /><path d="M64 60h40M796 60h40M222 28h36M642 28h36" stroke-width="7"/>
  <path d="M10 250h880" /><path d="M300 250v-34h300v34M395 250v-16h110v16" opacity=".6"/></svg>`;
