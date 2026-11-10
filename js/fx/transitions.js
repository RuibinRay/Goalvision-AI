/**
 * Cinematic transitions for the two selections that matter: choosing a league and choosing a club.
 *
 * League (first time in a visit, on a pointer device with a reasonably large window):
 *   1 the emblem grows and travels to the centre   2 the screen darkens and the league's colours come up
 *   3 an energy wave leaves the emblem             4 the camera pushes through it into a floodlit stadium
 *   5 the stadium gives way to the dashboard, whose header, tabs and rows assemble in sequence
 * A league already opened in this visit, and every phone, gets the short form (steps 1 to 3, about 0.7 s).
 * Club: the crest comes toward the screen in the club's colours, then lands on the dashboard's own crest.
 *
 * Rules that keep navigation safe:
 *   - links stay ordinary links; this only intercepts a plain primary click made with a pointer
 *   - keyboard activation, modified clicks, back/forward and reduced motion navigate at once, as before
 *   - any click or key press skips the sequence, and a timer removes the overlay whatever happens
 *   - the destination starts loading while the sequence plays, so the animation hides the wait instead of adding one
 * Built on the Web Animations API and one 2D canvas: nothing to download before a transition can run.
 */
import { themeOf, emblem } from './leagues.js';
import { league, club } from '../core/store.js';
import { esc } from '../core/dom.js';

const EO = 'cubic-bezier(.16,1,.3,1)', EIO = 'cubic-bezier(.77,0,.175,1)';
const motionOK = () => !document.body.classList.contains('reduced-motion');
const lite = () => innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
const rgba = (hex, a) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0; return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const mark = (name) => { try { performance.mark('gv:' + name); } catch { /* timing marks are optional */ } };   // visible in DevTools' Performance panel
const routeDone = () => new Promise((r) => document.addEventListener('route:done', () => { mark('routed'); r(); }, { once: true }));
const seen = new Set();          // leagues whose full sequence has already played in this visit
let active = null;

export function initTransitions() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.detail === 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || active || !motionOK()) return;
    if (e.target.closest('button, [data-fav], input, select')) return;          // controls inside a card keep their own behaviour
    const a = e.target.closest('a[href^="#/league/"], a[href^="#/club/"]');
    if (!a || a.target === '_blank') return;
    const href = a.getAttribute('href'), m = href.match(/^#\/(league|club)\/([^/?]+)/);
    if (!m || href === location.hash) return;
    if (m[1] === 'league' && league(m[2])) { e.preventDefault(); leagueTransition(a, href, m[2]); return; }
    const img = a.querySelector('.crest img'), c = m[1] === 'club' && club(m[2]);
    if (img && c && !c.past && c.colors) { e.preventDefault(); clubTransition(img, href, c); }
  }, true);
}

/* ───────── overlay plumbing ───────── */
function overlay(colors) {
  const el = document.createElement('div'); el.className = 'fxo'; el.setAttribute('aria-hidden', 'true');
  for (const k of ['a', 'b', 'c']) el.style.setProperty('--' + k, colors[k] || colors.a);
  el.innerHTML = '<div class="fxo-dim"></div><div class="fxo-glow"></div><span class="fxo-skip">Click to skip</span>';
  document.body.append(el);
  let skip; const skipped = new Promise((r) => (skip = r));
  const o = {
    el, dim: el.children[0], glow: el.children[1], isSkipped: false,
    wait: (ms) => Promise.race([new Promise((r) => setTimeout(r, ms)), skipped]),
    until: (p, max) => Promise.race([p, skipped, new Promise((r) => setTimeout(r, max))]),
    /** Run one animation; resolves when it ends, or at once (jumping to its end state) if the sequence is skipped. */
    play(node, frames, opts) {
      const a = node.animate(frames, { fill: 'forwards', easing: EO, ...opts });
      if (o.isSkipped) { a.finish(); return Promise.resolve(); }
      return Promise.race([a.finished.catch(() => {}), skipped.then(() => { try { a.finish(); } catch { /* already removed */ } })]);
    },
    remove() { removeEventListener('keydown', onSkip, true); el.remove(); },
  };
  const onSkip = () => { o.isSkipped = true; skip(); };
  el.addEventListener('pointerdown', onSkip); addEventListener('keydown', onSkip, true);
  o.play(el.children[2], [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 700 });
  return o;
}
/** Shared ending: make sure we navigated, uncover the page, drop the overlay. Safe to call twice. */
function closer(o, href, restore) {
  let navigated = false, closed = false;
  mark('start');
  const go = () => { if (navigated) return; navigated = true; mark('navigate'); document.body.classList.add('fx-hold'); if (location.hash !== href) location.hash = href; };
  const finish = () => { if (closed) return; closed = true; clearTimeout(guard); go(); document.body.classList.remove('fx-hold'); restore?.(); o.remove(); if (active === o) active = null; mark('end'); };
  const guard = setTimeout(finish, 6500);      // the page is never left covered, whatever goes wrong
  return { go, finish };
}

/* ───────── league ───────── */
async function leagueTransition(link, href, id) {
  const t = themeOf(id), lg = league(id), full = !seen.has(id) && !lite(); seen.add(id);
  const o = (active = overlay(t)), done = routeDone(), { go, finish } = closer(o, href);
  try {
    const src = (link.querySelector('[data-emblem], .cnode-dot, .flag') || link).getBoundingClientRect();
    const size = Math.round(Math.min(210, innerWidth * .36)), s0 = Math.max(.12, Math.min(src.width, src.height, size) / size);
    const cx = innerWidth / 2 - size / 2, cy = innerHeight / 2 - size / 2 - 12;
    const from = `translate(${(src.left + src.width / 2 - size * s0 / 2).toFixed(1)}px, ${(src.top + src.height / 2 - size * s0 / 2).toFixed(1)}px) scale(${s0.toFixed(3)})`, mid = `translate(${cx}px, ${cy}px) scale(1)`;
    const em = document.createElement('div'); em.className = 'fxo-emblem'; em.innerHTML = emblem(id, size); em.style.transform = from;
    const name = document.createElement('p'); name.className = 'fxo-name'; name.innerHTML = `${esc(lg.name)}<small>${esc(t.mood)}</small>`;
    o.el.append(em, name);
    // 1 and 2
    o.play(o.dim, [{ opacity: 0 }, { opacity: .95 }], { duration: 340 });
    o.play(o.glow, [{ opacity: 0 }, { opacity: 1 }], { duration: 560, delay: 140 });
    await o.play(em, [{ transform: from, opacity: .55 }, { transform: mid, opacity: 1 }], { duration: full ? 440 : 300, easing: EIO });
    // 3
    rings(o, full ? 3 : 1);
    o.play(name, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 320 });
    go();                                     // the dashboard loads underneath while the sequence plays
    if (full) { await o.wait(240); await fly(o, t, em, name, mid, size, done); }      // 4
    else { await o.wait(380); await o.until(done, 1500); }
    // 5
    mark('lift'); document.body.classList.remove('fx-hold'); cascade();
    await o.play(o.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease' });
  } catch (e) { console.warn('League transition cut short', e); }
  finish();
}
function rings(o, n) {
  for (let i = 0; i < n; i++) {
    const r = document.createElement('i'); r.className = 'fxo-ring'; o.el.append(r);
    o.play(r, [{ opacity: .95, transform: 'scale(.55)' }, { opacity: 0, transform: 'scale(3.6)' }], { duration: 820, delay: i * 140 }).then(() => r.remove());
  }
}
/** Step 4: the emblem rushes at the camera and dissolves while a canvas flies down the pitch into the stadium. */
async function fly(o, t, em, name, mid, size, done) {
  const cv = document.createElement('canvas'); o.el.insertBefore(cv, em);
  // A fast, glowing scene does not need every pixel: cap the drawing buffer near 1280 px wide and let CSS stretch it.
  const dpr = Math.min(devicePixelRatio || 1, 1.5, 1280 / innerWidth), W = (cv.width = Math.round(innerWidth * dpr)), H = (cv.height = Math.round(innerHeight * dpr)), ctx = cv.getContext('2d', { alpha: false }), scene = stadium(t);
  const S = 9;
  o.play(cv, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease' });
  o.play(em, [{ transform: mid, opacity: 1 }, { transform: `translate(${(innerWidth / 2 - size * S / 2).toFixed(1)}px, ${(innerHeight / 2 - size * S / 2).toFixed(1)}px) scale(${S})`, opacity: 0 }], { duration: 580, easing: EIO });
  o.play(name, [{ opacity: 1 }, { opacity: 0 }], { duration: 240 });
  o.play(o.glow, [{ opacity: 1 }, { opacity: .3 }], { duration: 520 });
  const D = 880, t0 = performance.now(); let routed = false; done.then(() => (routed = true));
  await new Promise((res) => {
    const frame = (now) => {
      const e = now - t0, k = Math.min(1, e / D), kk = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      try { scene.draw(ctx, W, H, kk + Math.max(0, e - D) / 1000 * .03, e / 1000); } catch (err) { console.warn('Stadium flight stopped', err); return res(); }   // never strand the overlay; if the data is slow the camera keeps gliding
      if (o.isSkipped || (k >= 1 && (routed || e > D + 1600))) return res();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
/**
 * A floodlit stadium drawn in perspective on a 2D canvas: mown stripes, pitch markings, three tiers of crowd lights,
 * four floodlights and speed streaks, all tinted by the league. The camera runs from behind one goal toward the centre.
 */
function stadium(t) {
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const crowd = [];
  for (let tier = 0; tier < 5; tier++) {
    const y = 3 + tier * 3.6, off = 41 + tier * 4.6;
    for (let i = 0; i < 44; i++) { const z = -14 + r() * 134; crowd.push([-off, y + r() * 1.8, z, r()], [off, y + r() * 1.8, z, r()]); }
    for (let i = 0; i < 26; i++) crowd.push([(r() * 2 - 1) * (off + 3), y + r() * 1.8, 113 + tier * 4.6, r()]);
  }
  const streaks = Array.from({ length: 44 }, () => [(r() * 2 - 1) * 62, 1.5 + r() * 26, -34 + r() * 150]);
  const ring = Array.from({ length: 41 }, (_, i) => [Math.cos(i / 40 * Math.PI * 2) * 9.15, 0, 52.5 + Math.sin(i / 40 * Math.PI * 2) * 9.15]);
  const LINES = [[[-34, 0, 0], [34, 0, 0], [34, 0, 105], [-34, 0, 105], [-34, 0, 0]], [[-34, 0, 52.5], [34, 0, 52.5]], ring,
    [[-20.15, 0, 0], [-20.15, 0, 16.5], [20.15, 0, 16.5], [20.15, 0, 0]], [[-9.16, 0, 0], [-9.16, 0, 5.5], [9.16, 0, 5.5], [9.16, 0, 0]],
    [[-20.15, 0, 105], [-20.15, 0, 88.5], [20.15, 0, 88.5], [20.15, 0, 105]], [[-9.16, 0, 105], [-9.16, 0, 99.5], [9.16, 0, 99.5], [9.16, 0, 105]],
    [[-3.66, 0, 105], [-3.66, 2.44, 105], [3.66, 2.44, 105], [3.66, 0, 105]]];
  const LIGHTS = [[-60, 40, 0], [60, 40, 0], [-60, 40, 105], [60, 40, 105]], NEAR = 1.4;
  const ROOF = [[-63, 24, -40], [-63, 24, 112], [-63, 24, 137], [63, 24, 137], [63, 24, 112], [63, 24, -40]];
  let prev = 0;
  return {
    draw(ctx, W, H, k, time) {
      const camZ = -66 + 98 * k, camH = 13.5 - 8 * Math.min(1, k), f = H * 1.02, cx = W / 2, hy = H * (.45 - .05 * Math.min(1, k)), u = W / 900, speed = Math.min(1, Math.abs(k - prev) * 46); prev = k;
      const P = (p) => { const d = p[2] - camZ; return d < NEAR - .001 ? null : [cx + p[0] * f / d, hy + (camH - p[1]) * f / d, d]; };   // the small tolerance keeps points clipped exactly onto the near plane
      const clip = (a, b) => {                                     // keep the part of a segment in front of the camera
        const da = a[2] - camZ, db = b[2] - camZ; if (da < NEAR && db < NEAR) return null;
        const cut = (p, q, dp, dq) => { const m = (NEAR - dp) / (dq - dp); return [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m, camZ + NEAR]; };
        return [P(da < NEAR ? cut(a, b, da, db) : a), P(db < NEAR ? cut(b, a, db, da) : b)];
      };
      ctx.globalCompositeOperation = 'source-over';
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#04060d'); sky.addColorStop(Math.min(.98, hy / H), rgba(t.a, .26)); sky.addColorStop(Math.min(.99, hy / H + .012), '#060a14'); sky.addColorStop(1, '#04060d');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // the stands: two long banks and the far end, dark against the sky
      const zn = camZ + NEAR + .05, fill = (pts) => { const q = pts.map(P); if (q.includes(null)) return; ctx.beginPath(); q.forEach((x, i) => (i ? ctx.lineTo(x[0], x[1]) : ctx.moveTo(x[0], x[1]))); ctx.closePath(); ctx.fill(); };
      ctx.fillStyle = '#080d19';
      for (const sx of [-1, 1]) { if (zn < 112) fill([[sx * 37, 0, zn], [sx * 37, 0, 112], [sx * 63, 24, 112], [sx * 63, 24, zn]]); fill([[sx * 37, 0, 112], [sx * 63, 24, 112], [sx * 63, 24, 137]]); }
      fill([[-37, 0, 112], [37, 0, 112], [63, 24, 137], [-63, 24, 137]]);
      for (let i = 0; i < 15; i++) {                               // mown stripes
        const z0 = Math.max(i * 7, camZ + NEAR + .05), z1 = (i + 1) * 7; if (z1 <= z0) continue;
        const a = P([-34, 0, z0]), b = P([34, 0, z0]), c = P([34, 0, z1]), d = P([-34, 0, z1]); if (!a || !b || !c || !d) continue;
        ctx.fillStyle = i % 2 ? '#0d3f2c' : '#0a3425'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
      }
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const pass of [[7 * u, rgba(t.c, .16)], [2 * u, 'rgba(247,250,255,.92)']]) {      // glow, then the white line
        ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1]; ctx.beginPath();
        for (const L of LINES) for (let i = 1; i < L.length; i++) { const sg = clip(L[i - 1], L[i]); if (sg) { ctx.moveTo(sg[0][0], sg[0][1]); ctx.lineTo(sg[1][0], sg[1][1]); } }
        ctx.stroke();
      }
      for (const p of crowd) {                                     // the crowd: small lights that twinkle
        const q = P(p); if (!q) continue;
        const sz = Math.max(u, Math.min(5 * u, f / q[2] * .17));
        ctx.fillStyle = rgba(p[3] < .5 ? '#F7FAFF' : p[3] < .78 ? t.a : t.b, .28 + .6 * Math.abs(Math.sin(time * 2.6 + p[3] * 40)));
        ctx.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
      }
      for (const pass of [[8 * u, rgba(t.b, .14)], [2 * u, rgba(t.a, .85)]]) {      // the roof edge, lit in the league's colours
        ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1]; ctx.beginPath();
        for (let i = 1; i < ROOF.length; i++) { const sg = clip(ROOF[i - 1], ROOF[i]); if (sg) { ctx.moveTo(sg[0][0], sg[0][1]); ctx.lineTo(sg[1][0], sg[1][1]); } }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of LIGHTS) {                                    // floodlights
        const q = P(p); if (!q) continue;
        const rad = Math.max(30 * u, Math.min(W * .42, f / q[2] * 15)), g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], rad);
        g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.14, rgba(t.c, .5)); g.addColorStop(1, rgba(t.a, 0));
        ctx.fillStyle = g; ctx.fillRect(q[0] - rad, q[1] - rad, rad * 2, rad * 2);
      }
      if (speed > .02) {                                           // speed streaks, only while the camera is really moving
        ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(t.c, .5 * speed); ctx.beginPath();
        for (const p of streaks) { const sg = clip(p, [p[0], p[1], p[2] + 3 + 16 * speed]); if (sg) { ctx.moveTo(sg[0][0], sg[0][1]); ctx.lineTo(sg[1][0], sg[1][1]); } }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      const v = ctx.createRadialGradient(cx, H * .5, H * .3, cx, H * .5, Math.max(W, H) * .78); v.addColorStop(0, 'rgba(4,6,13,0)'); v.addColorStop(1, 'rgba(4,6,13,.82)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      if (k > .84) { ctx.fillStyle = rgba(t.a, Math.min(.32, (k - .84) / .16 * .32)); ctx.fillRect(0, 0, W, H); }      // the league's colour washes in as the dashboard takes over
    },
  };
}

/* ───────── club ───────── */
async function clubTransition(img, href, c) {
  const o = (active = overlay({ a: c.colors[0], b: c.colors[1] || c.colors[0], c: c.colors[0] })), done = routeDone();
  const { go, finish } = closer(o, href, () => { if (img.isConnected) img.style.visibility = ''; });
  try {
    const r = img.getBoundingClientRect(), S = Math.round(Math.min(250, innerWidth * .46, innerHeight * .46)), s0 = Math.max(r.width, r.height) / S;
    const at = (x, y, sc) => `translate(${(x - S * sc / 2).toFixed(1)}px, ${(y - S * sc / 2).toFixed(1)}px) scale(${sc.toFixed(3)})`;
    const from = at(r.left + r.width / 2, r.top + r.height / 2, s0), mid = at(innerWidth / 2, innerHeight / 2, 1);
    const ghost = new Image(); ghost.className = 'fxo-crest'; ghost.alt = ''; ghost.src = img.currentSrc || img.src; ghost.style.width = ghost.style.height = S + 'px'; ghost.style.transform = from;
    o.el.append(ghost); img.style.visibility = 'hidden';
    // toward the screen, in the club's colours; the dashboard starts loading on the way
    o.play(o.dim, [{ opacity: 0 }, { opacity: .9 }], { duration: 300 });
    o.play(o.glow, [{ opacity: 0 }, { opacity: .95 }], { duration: 420 });
    setTimeout(go, 170);
    await o.play(ghost, [{ transform: from }, { transform: mid }], { duration: 360, easing: EIO });
    go(); await o.until(done, 1500);
    // land on the dashboard's own crest while the page assembles around it
    const dest = document.querySelector('#main .ch-crest img'); mark('lift'); document.body.classList.remove('fx-hold'); cascade();
    if (dest && !o.isSkipped) {
      const d = dest.getBoundingClientRect(); dest.style.visibility = 'hidden';
      o.play(o.dim, [{ opacity: .9 }, { opacity: 0 }], { duration: 380, easing: 'ease' }); o.play(o.glow, [{ opacity: .95 }, { opacity: 0 }], { duration: 380, easing: 'ease' });
      await o.play(ghost, [{ transform: mid }, { transform: at(d.left + d.width / 2, d.top + d.height / 2, Math.max(d.width, d.height) / S) }], { duration: 400, easing: EIO });
      dest.style.visibility = '';
    } else await o.play(o.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease' });
  } catch (e) { console.warn('Club transition cut short', e); }
  finish();
}

/* ───────── arrival ───────── */
/** The dashboard assembles: header, tabs, tiles, rows and crests rise in sequence; headline numbers count up once. */
function cascade() {
  const view = document.querySelector('#main .view'); if (!view || !motionOK()) return;
  const sel = '.lg-hero .page-head > *, .club-hero .ch-main > *, .club-hero .ch-side, .tabs, .stats > .stat, .t tbody tr, .crestwall > *, .panel';
  const items = [...view.querySelectorAll(sel)].filter((n) => { if (n.matches('tr') && n.closest('.panel')) return false; const r = n.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0; }).slice(0, 44);
  items.forEach((n, i) => {
    n.style.setProperty('--k', i); n.classList.add('arrive-item');
    const done = () => { n.classList.remove('arrive-item'); n.style.removeProperty('--k'); };
    n.addEventListener('animationend', done, { once: true }); setTimeout(done, 2400);
    const v = n.matches('.stat') && n.querySelector('.v'); if (v) countUp(v, i * 32);
  });
}
/** Count a headline figure up to its value once. Only plain numbers move; the exact original text is restored at the end. */
function countUp(el, delay = 0) {
  const text = el.textContent.trim(), m = text.match(/^([+−-]?)(\d+(?:\.\d+)?)(%?)$/); if (!m) return;
  const target = Number(m[2]), dec = (m[2].split('.')[1] || '').length, D = 700; let t0 = 0;
  const frame = (now) => {
    if (!el.isConnected) return; t0 ||= now;
    const k = Math.min(1, Math.max(0, now - t0 - delay) / D), e = 1 - Math.pow(1 - k, 3);
    el.textContent = k >= 1 ? text : m[1] + (target * e).toFixed(dec) + m[3];
    if (k < 1) requestAnimationFrame(frame);
  };
  el.textContent = m[1] + (0).toFixed(dec) + m[3]; requestAnimationFrame(frame);
}
