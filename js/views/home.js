/**
 * Home: the cinematic showdown (five scroll chapters over the Three.js stadium), then live widgets built from the
 * snapshot or the backend. Three levels of motion, chosen in cinematic():
 *   full   wide windows: the pinned, scroll-driven sequence (GSAP ScrollTrigger)
 *   lite   small windows, or no scroll library: the static layout with entrances and a slowly drifting 3D backdrop
 *   still  reduced motion (the visitor's choice in My Dashboard, or the device setting if they chose to follow it): static
 * Animations play by default. A visitor whose device asks for reduced motion sees a "Reduce motion" button on the hero.
 */
import { $, $$, esc, html, fmt, todayISO, ICON, seg, segmented, options, observeReveals } from '../core/dom.js';
import { playersArt, modelState, currentSeasons, worldCup, sbPlayers, sbMatch, leagues, league, clubsOf, club, asset, SEASON, registry, playerArt, getPrefs, setPref } from '../core/store.js';
import { crest, flag, teamLink, vsRow, probBar, fixtureRow, formDots, note } from '../components/ui.js';
import { table, played } from '../models/standings.js';
import { predictMatch } from '../models/predict.js';
import { rerender } from '../core/router.js';
import { isLive, liveMatches, STATUS_LABEL, isInPlay } from '../services/live.js';

export const fullBleed = true;
const MATCHUPS = [
  { a: 'Lionel Messi', b: 'Cristiano Ronaldo', comp: 'wc2022' },
  { a: 'Kylian Mbappé', b: 'Erling Haaland', comp: 'wc2022' },
  { a: 'Lamine Yamal', b: 'Jude Bellingham', comp: 'euro2024' },
];
const COMP_NAME = { wc2022: 'FIFA World Cup 2022', euro2024: 'UEFA Euro 2024', copa2024: 'Copa América 2024' };
const CHAPTERS = ['Floodlights', 'Tale of the tape', 'The forecast', 'From above', 'World of football'];
const MAP = [
  { x: 17, y: 40, t: 'FIFA World Cup', h: '#/worldcup', k: 'cup' }, { x: 27, y: 15, t: 'UEFA Euro', h: '#/competition/euro', k: 'cup' }, { x: 27, y: 65, t: 'Copa América', h: '#/competition/copa', k: 'cup' },
  { x: 55, y: 12, l: 'eng.1' }, { x: 65, y: 26, l: 'esp.1' }, { x: 55, y: 40, l: 'ita.1' }, { x: 65, y: 54, l: 'ger.1' }, { x: 55, y: 68, l: 'fra.1' },
  { x: 100, y: 40, t: 'Champions League', h: '#/ucl', k: 'star' }, { x: 90, y: 19, t: 'Europa League', h: '#/competition/uel', k: 'cup' }, { x: 90, y: 61, t: 'Conference League', h: '#/competition/uecl', k: 'cup' },
  { x: 109, y: 12, t: 'Club World Cup', h: '#/competition/cwc', k: 'cup' }, { x: 109, y: 68, t: 'UEFA Super Cup', h: '#/competition/usc', k: 'cup' },
];
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const age = (dob) => (dob ? Math.floor((Date.now() - Date.parse(dob)) / 31557600000) : null);

let scene = null, tl = null, st = null, io = null, rotate = null, onResize = null, gsapRef = null, ambientOff = null;
const wantsFull = () => !document.body.classList.contains('reduced-motion') && innerWidth >= 900 && innerHeight >= 560;
/** The scroll libraries, or null if they fail or take too long: the page then uses the lite hero instead of waiting. */
const scrollLibs = () => Promise.race([Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).catch((e) => { console.warn('GSAP unavailable, using the lite hero', e); return null; }), new Promise((r) => setTimeout(() => r(null), 5000))]);

export async function render(el) {
  const libs = wantsFull() ? scrollLibs() : null;   // start downloading now, alongside the data
  const [art, state, seasons, wc26] = await Promise.all([playersArt(), modelState(), currentSeasons(), worldCup(2026)]);
  const people = Object.fromEntries(art.players.map((p) => [p.name, p]));
  const wcNations = new Set(wc26.matches.flatMap((m) => [m.team1, m.team2]));
  const wcGoals = (name, nat) => (wcNations.has(nat) ? (wc26.scorers.find((s) => fold(s.name) === fold(name))?.goals ?? 0) : null);

  el.innerHTML = html`
  <section class="cine" id="cine" aria-label="Featured matchup and scroll story">
    <div class="cine-stage">
      <canvas class="cine-canvas" aria-hidden="true"></canvas>
      <div class="cine-shade" aria-hidden="true"></div>
      <figure class="cine-player a" aria-hidden="true"><img alt="" decoding="async"></figure>
      <figure class="cine-player b" aria-hidden="true"><img alt="" decoding="async"></figure>
      <div class="cine-title">
        <h1>Goalvision AI</h1>
        <p class="cine-tag">Beyond the final whistle</p>
        <p class="cine-sub">Every match has a story. Every statistic reveals another chapter.</p>
        <div class="row cine-cta"><a class="btn primary" href="#/live">Open the match centre ${ICON.arrow}</a><a class="btn" href="#/predictions">Run a forecast</a></div>
      </div>
      <div class="cine-plate a"></div><div class="cine-plate b"></div>
      <div class="cine-tape panel" id="tape"></div>
      <div class="cine-prob" id="prob"></div>
      <div class="cine-aerial"><h2>Every pass, mapped</h2><p>Argentina 3–3 France, World Cup final 2022. Both passing networks are drawn on the pitch from StatsBomb event data: brighter lines carried more passes.</p><a class="btn sm" href="#/tactics?match=3869685">Open this match in the Tactics Lab ${ICON.arrow}</a></div>
      <div class="cine-map" id="map"><div class="cine-map-head"><h2>Choose your competition</h2><p>The pitch is the map. Thirteen competitions, one tap away.</p></div>
        <div class="cine-nodes">${MAP.map((n, i) => { const lg = n.l && league(n.l); return `<a class="cnode ${n.k || 'lg'}" style="--i:${i}" data-i="${i}" href="${lg ? '#/league/' + lg.id : n.h}"><span class="cnode-dot">${lg ? `<img src="https://flagcdn.com/${lg.flag}.svg" alt="">` : n.k === 'star' ? ICON.star : ICON.trophy}</span><span class="cnode-t">${esc(lg ? lg.name : n.t)}</span></a>`; })}</div></div>
      <div class="cine-switch" role="group" aria-label="Featured matchup">
        ${MATCHUPS.map((m, i) => `<button type="button" data-m="${i}" aria-pressed="${i === 0}">${esc(m.a.split(' ').pop())} v ${esc(m.b.split(' ').pop())}</button>`)}
        <button type="button" data-m="custom" aria-pressed="false" aria-expanded="false">Choose players</button>
        <form class="cine-custom panel" id="custom" hidden><label class="field">Left<select class="select" name="a">${options(art.players.map((p) => [p.name, p.name]), MATCHUPS[0].a)}</select></label><label class="field">Right<select class="select" name="b">${options(art.players.map((p) => [p.name, p.name]), MATCHUPS[0].b)}</select></label><button class="btn primary sm" type="submit">Set matchup</button></form>
      </div>
      <ol class="cine-rail" aria-hidden="true">${CHAPTERS.map((c, i) => `<li class="${i === 0 ? 'on' : ''}"><i></i><span>${c}</span></li>`)}</ol>
      <div class="cine-hint" aria-hidden="true"><span>Scroll</span><i></i></div>
    </div>
  </section>
  <div class="container">
    <section class="section" id="matchday"><div class="section-head reveal"><div><h2>Matchday</h2><p id="md-sub"></p></div><a class="btn sm" href="#/live">All matches ${ICON.arrow}</a></div>
      <div class="grid g-32"><div class="panel flush reveal" id="today"></div><div class="panel pitch reveal" id="featured" style="--i:1"></div></div></section>
    <section class="section"><div class="section-head reveal"><div><h2>League leaders</h2><p>Top of each table in ${fmt.season(SEASON)}${seasons[0].live ? `, live from ${esc(seasons[0].source)}` : ' in the snapshot'}, results to ${fmt.date(seasons.map((x) => x.lastResult).sort().at(-1))}.</p></div><a class="btn sm" href="#/leagues">All tables ${ICON.arrow}</a></div>
      <div class="leaders reveal" id="leaders"></div></section>
    <section class="section"><div class="section-head reveal"><div><h2>Players in form</h2><p>Top scorers of the 2026 FIFA World Cup, the most recent complete tournament in the data.</p></div><a class="btn sm" href="#/worldcup/2026">Tournament centre ${ICON.arrow}</a></div>
      <div class="trend reveal" id="trend"></div></section>
    <section class="section"><div class="section-head reveal"><div><h2>AI match forecasts</h2><p>Ensemble of five backtested models for the next headline fixtures. Probabilities, not promises.</p></div><a class="btn sm" href="#/predictions">Prediction Lab ${ICON.arrow}</a></div>
      <div class="grid g3 reveal" id="forecasts"></div></section>
    <section class="section" id="explorer"><div class="section-head reveal"><div><h2>Global football explorer</h2><p>Every club of the ${fmt.season(SEASON)} season in the five major leagues. Hover a crest for its record, select it for the full dashboard.</p></div><div id="ex-seg">${seg(leagues().map((l) => [l.id, l.name]), 'eng.1', 'green')}</div></div>
      <div class="crestwall reveal" id="crestwall"></div></section>
  </div>`;

  /* ── chapter content that depends on the matchup ── */
  let current = 0;
  async function setMatchup(m, announce = true) {
    const A = people[m.a], B = people[m.b]; if (!A || !B) return;
    const natA = A.nationality, natB = B.nationality;
    for (const [side, p] of [['a', A], ['b', B]]) {
      const img = $(`.cine-player.${side} img`, el); img.src = asset(p.img); img.width = p.w; img.height = p.h;
      $(`.cine-plate.${side}`, el).innerHTML = `<span class="pl-nat">${flag(p.nationality, 26)}${esc(p.nationality)}</span><strong>${esc(p.name)}</strong><span class="pl-pos">${esc(p.position || '')}</span>`;
    }
    // stats: one shared tournament when both appear in it, so the rows compare like with like
    const comps = m.comp ? [m.comp, 'euro2024', 'wc2022', 'copa2024'] : ['euro2024', 'wc2022', 'copa2024'];
    let comp = null, sa = null, sb = null;
    for (const c of [...new Set(comps)]) {
      const list = (await sbPlayers(c)).players, x = list.find((p) => fold(p.n) === fold(m.a)), y = list.find((p) => fold(p.n) === fold(m.b));
      if (x && y) { comp = c; sa = x; sb = y; break; }
      if (!comp && (x || y)) { comp = c; sa = x || null; sb = y || null; }
    }
    const r = (k, d = 0) => [sa ? sa[k] : null, sb ? sb[k] : null, d];
    const rows = [['Goals', ...r('g')], ['Assists', ...r('a')], ['Expected goals (xG)', ...r('xg', 2)], ['Shots', ...r('sh')], ['Key passes', ...r('kp')], ['Minutes played', ...r('min')]];
    $('#tape', el).innerHTML = html`<div class="tape-head"><span>${esc(m.a)}</span><h3>Tale of the tape</h3><span>${esc(m.b)}</span></div>
      ${vsRow('Age', age(A.born), age(B.born), { lowerBetter: true })}${vsRow('Goals at the 2026 World Cup', wcGoals(m.a, natA), wcGoals(m.b, natB))}
      <p class="tape-comp">${comp ? esc(COMP_NAME[comp]) : 'Event data'}</p>${rows.map(([l, x, y, d]) => vsRow(l, x, y, { d }))}
      <p class="src">${!sa || !sb ? `${esc(!sa ? m.a : m.b)} did not play in an open-data tournament, so those rows stay empty. ` : ''}Sources: StatsBomb Open Data, openfootball, TheSportsDB.</p>`;
    // forecast between their national teams
    let prob = '';
    if (state.nations[natA] && state.nations[natB]) {
      const f = predictMatch(state, { kind: 'nation', home: natA, away: natB, neutral: true }), [h, d, a] = f.ensemble, top = f.top[0];
      const dial = (v, lab, cls) => `<div class="dial ${cls}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="dial-bg"/><circle cx="60" cy="60" r="52" class="dial-fg" pathLength="100" stroke-dasharray="${(v * 100).toFixed(1)} 100"/></svg><b class="num">${fmt.pct(v)}</b><span>${lab}</span></div>`;
      prob = html`<h2>${esc(natA)} v ${esc(natB)}</h2><p class="prob-sub">If they met tomorrow on neutral ground</p>
        <div class="dials" role="img" aria-label="${esc(natA)} win ${fmt.pct(h)}, draw ${fmt.pct(d)}, ${esc(natB)} win ${fmt.pct(a)}">${dial(h, esc(natA) + ' win', 'a')}${dial(d, 'Draw', 'd')}${dial(a, esc(natB) + ' win', 'b')}</div>
        <p class="prob-xg"><span>Expected goals <b class="num">${f.lambdas[0].toFixed(2)} – ${f.lambdas[1].toFixed(2)}</b></span><span>Most likely score <b class="num">${top.h}–${top.a}</b> (${fmt.pct(top.p)})</span></p>
        <p class="src">Elo ratings from World Cup, Euro 2024 and Copa América 2024 finals matches. A statistical estimate, not a prediction of fact. <a class="link" href="#/predictions?kind=nation&home=${encodeURIComponent(natA)}&away=${encodeURIComponent(natB)}">Open in the Prediction Lab</a></p>`;
    } else {
      const miss = !state.nations[natA] ? natA : natB;
      prob = `<h2>${esc(natA)} v ${esc(natB)}</h2><p class="prob-sub">Forecast not available</p><p class="src">${esc(miss)} has no finals match in the rating data since 2018, so GOALVISION AI does not invent a number for it.</p>`;
    }
    $('#prob', el).innerHTML = prob;
    $$('.cine-switch button[data-m]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m) === String(MATCHUPS.indexOf(m) >= 0 ? MATCHUPS.indexOf(m) : 'custom')));
    if (announce && gsapRef) gsapRef.fromTo($$('.cine-player img', el), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: 'power3.out', stagger: .08, overwrite: true });
  }
  await setMatchup(MATCHUPS[0], false);

  const sw = $('.cine-switch', el), custom = $('#custom', el);
  const stopRotate = () => { clearInterval(rotate); rotate = null; };
  sw.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-m]'); if (!b) return; stopRotate();
    if (b.dataset.m === 'custom') { custom.hidden = !custom.hidden; b.setAttribute('aria-expanded', !custom.hidden); return; }
    custom.hidden = true; current = Number(b.dataset.m); setMatchup(MATCHUPS[current]);
  });
  custom.addEventListener('submit', (ev) => { ev.preventDefault(); const f = new FormData(custom); if (f.get('a') === f.get('b')) return; custom.hidden = true; setMatchup({ a: f.get('a'), b: f.get('b') }); });

  widgets(el, state, seasons, wc26);
  await cinematic(el, () => { current = (current + 1) % MATCHUPS.length; setMatchup(MATCHUPS[current]); }, stopRotate, libs);
}

/* ───────── the scroll sequence ───────── */
async function cinematic(el, nextMatchup, stopRotate, libs) {
  const cine = $('#cine', el), stage = $('.cine-stage', el), canvas = $('.cine-canvas', el);
  const reduced = document.body.classList.contains('reduced-motion'), full = wantsFull();

  // still and lite use the static layout, which is known now: show it at once instead of waiting for the 3D scene.
  const still = () => {                                    // reduced motion: nothing travels; the floodlights fade up once
    cine.classList.add('static');
    if (getPrefs().motion === 'system' && !$('.cine-motion', el)) {   // the device asked for this (the visitor chose to follow it): say so and offer the switch
      $('.cine-cta', el).insertAdjacentHTML('afterend', '<p class="cine-motion"><span>Animations are off because this device is set to reduce motion.</span><button class="btn sm" type="button" id="motion-on">Turn animations on</button></p>');
      $('#motion-on', el).addEventListener('click', () => setPref('motion', 'full'));
    }
  };
  const lite = () => {                                     // small window, or no scroll library: static layout, living backdrop
    if (cine.classList.contains('lite')) return;
    cine.classList.add('static', 'lite');
    // The chapter blocks fade in as they are scrolled to. Applied without a transition so they do not fade out first.
    $$('.cine-tape, .cine-prob, .cine-map', el).forEach((n) => { n.style.transition = 'none'; n.classList.add('reveal'); void n.offsetWidth; n.style.transition = ''; });
    observeReveals(cine);
  };
  if (reduced) still(); else if (!full) lite();
  // Animations play by default, even on a device that asks for less. Such a visitor gets a one-press way to stop them.
  if (!reduced && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stage.insertAdjacentHTML('beforeend', '<button class="cine-calm" type="button" id="motion-off" title="Your device asks for reduced motion. This switches the site to its static version.">Reduce motion</button>');
    $('#motion-off', el).addEventListener('click', () => setPref('motion', 'reduced'));
  }

  let stadium = null;
  try { const mod = await import('../scenes/stadium.js'); stadium = mod.createStadium(canvas, { reduced }); } catch (e) { console.warn('WebGL stadium unavailable, using the static backdrop', e); canvas.remove(); stage.classList.add('no-gl'); }
  if (!el.isConnected) { stadium?.dispose(); return; }   // the page was redrawn or left while this loaded
  scene = stadium;
  sbMatch(3869685).then((m) => stadium?.setNetwork([{ ...m.net[0], color: '#168FFF', flip: false }, { ...m.net[1], color: '#BEFF37', flip: true }])).catch(() => {});
  const placeNodes = () => { if (!stadium || cine.classList.contains('static')) return; $$('.cnode', el).forEach((n) => { const d = MAP[n.dataset.i], [x, y] = stadium.project(d.x, d.y); n.style.left = x + 'px'; n.style.top = y + 'px'; }); };
  // A window dragged across the size threshold switches between the lite hero and the full sequence.
  let resizeTimer = 0;
  onResize = () => { stadium?.resize(); placeNodes(); clearTimeout(resizeTimer); if (!reduced && wantsFull() !== full) resizeTimer = setTimeout(() => { if (el.isConnected && wantsFull() !== full) rerender(); }, 300); };
  addEventListener('resize', onResize);

  window.__gvHome = { stadium, mode: reduced ? 'still' : !full || !stadium ? 'lite' : 'full' };   // test hook
  if (reduced) { stadium?.setProgress(.19); if (stadium) ambient(el, stadium, false); return; }
  const mods = full && stadium ? await libs : null;
  if (!el.isConnected) return;
  if (!mods) { window.__gvHome.mode = 'lite'; lite(); if (stadium) ambient(el, stadium, true); return; }
  const gsap = mods[0].default, ScrollTrigger = mods[1].ScrollTrigger; gsap.registerPlugin(ScrollTrigger);
  gsapRef = gsap; cine.classList.add('pinned');
  const q = (s) => $$(s, el), state = { p: 0 }, intro = { v: 0 };
  gsap.to(intro, { v: 1, duration: 2.6, ease: 'power2.inOut', onUpdate: () => stadium.setIntro(intro.v) });
  gsap.from(q('.cine-title > *'), { y: 34, opacity: 0, duration: 1, ease: 'power3.out', stagger: .09, delay: .15 });
  gsap.from(q('.cine-player img'), { y: 60, opacity: 0, duration: 1.3, ease: 'power3.out', stagger: .12, delay: .5 });
  gsap.from(q('.cine-switch, .cine-rail, .cine-hint'), { opacity: 0, duration: .8, delay: 1.3 });

  tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: cine, start: 'top top', end: 'bottom bottom', scrub: .6, onUpdate: (s) => { const c = Math.min(4, Math.floor(s.progress * 5)); q('.cine-rail li').forEach((li, i) => li.classList.toggle('on', i === c)); if (s.progress > .7) placeNodes(); if (s.progress > .03) stopRotate(); } } });
  st = tl.scrollTrigger;
  tl.to(state, { p: 1, duration: 1, onUpdate: () => stadium.setProgress(state.p) }, 0)
    .fromTo(q('.cine-player'), { filter: 'brightness(.5) saturate(.7)' }, { filter: 'brightness(1.04) saturate(1)', duration: .18 }, 0)
    .to(q('.cine-hint'), { opacity: 0, duration: .04 }, 0)
    .fromTo(q('.cine-plate'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .08 }, .05)
    .to(q('.cine-title'), { opacity: 0, y: -60, duration: .09 }, .13)
    .fromTo(q('.cine-tape'), { opacity: 0, y: 60, visibility: 'hidden' }, { opacity: 1, y: 0, visibility: 'visible', duration: .08 }, .2)
    .to(q('.cine-player.a'), { xPercent: -4, scale: 1.04, duration: .2 }, .2).to(q('.cine-player.b'), { xPercent: 4, scale: 1.04, duration: .2 }, .2)
    .to(q('.cine-tape'), { opacity: 0, y: -50, duration: .07 }, .4).set(q('.cine-tape'), { visibility: 'hidden' }, .47)
    .to(q('.cine-switch'), { opacity: 0, duration: .05 }, .4).set(q('.cine-switch'), { visibility: 'hidden' }, .45)
    .to(q('.cine-plate'), { opacity: 0, duration: .05 }, .41)
    .to(q('.cine-player.a'), { xPercent: -55, opacity: 0, duration: .11 }, .41).to(q('.cine-player.b'), { xPercent: 55, opacity: 0, duration: .11 }, .41)
    .fromTo(q('.cine-prob'), { opacity: 0, y: 40, visibility: 'hidden' }, { opacity: 1, y: 0, visibility: 'visible', duration: .08 }, .47)
    .to(q('.cine-prob'), { opacity: 0, y: -40, duration: .07 }, .64).set(q('.cine-prob'), { visibility: 'hidden' }, .71)
    .fromTo(q('.cine-aerial'), { opacity: 0, y: 30, visibility: 'hidden' }, { opacity: 1, y: 0, visibility: 'visible', duration: .07 }, .7)
    .to(q('.cine-aerial'), { opacity: 0, duration: .05 }, .82).set(q('.cine-aerial'), { visibility: 'hidden' }, .87)
    .fromTo(q('.cine-map'), { opacity: 0, visibility: 'hidden' }, { opacity: 1, visibility: 'visible', duration: .04 }, .84)
    .fromTo(q('.cnode'), { opacity: 0, scale: .4 }, { opacity: 1, scale: 1, duration: .05, stagger: .006, ease: 'back.out(1.6)' }, .86)
    .to({}, { duration: .001 }, 1);

  io = new IntersectionObserver(([e]) => (e.isIntersecting ? stadium.start() : stadium.stop()), { threshold: 0 }); io.observe(cine);
  rotate = setInterval(() => { if (scrollY < 40 && !document.hidden && $('#custom', el).hidden) nextMatchup(); }, 9000);
  placeNodes(); ScrollTrigger.refresh();
  window.__gvHome = { stadium, mode: 'full', tl, placeNodes, intro: (v) => { gsap.killTweensOf(intro); stadium.setIntro(v); } };   // test hook: jump to any point of the sequence
}

/* Motion without scrolling. The floodlights power up; with `drift` the camera also eases slowly back and forth through
   the opening shots and the scene runs its own loop (flicker, dust, the turning ball), paused whenever it is off screen. */
function ambient(el, stadium, drift) {
  const t0 = performance.now(); let raf = 0, visible = true;
  const frame = (now) => {
    const s = (now - t0) / 1000, k = Math.min(1, s / 2.6);
    stadium.setIntro(k * k * (3 - 2 * k));
    if (drift) stadium.setProgress(.19 + .1 * Math.sin(s * .17));
    raf = visible && (drift || k < 1) ? requestAnimationFrame(frame) : 0;
  };
  stadium.setIntro(0); raf = requestAnimationFrame(frame);
  if (drift) {
    stadium.start();
    io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) return stadium.stop(); stadium.start(); if (!raf) raf = requestAnimationFrame(frame); }, { threshold: 0 });
    io.observe($('.cine-canvas', el));
  }
  ambientOff = () => { visible = false; cancelAnimationFrame(raf); raf = 0; };
}

/* ───────── widgets below the fold ───────── */
function widgets(el, state, seasons, wc26) {
  const today = todayISO(), byLeague = Object.fromEntries(seasons.map((s) => [s.league, s]));
  const all = seasons.flatMap((s) => s.matches.map((m) => ({ s, m })));
  const elo = (id) => state.clubs[id]?.elo ?? 1400;

  // today / next up
  const todays = all.filter((x) => x.m[1] === today), upcoming = all.filter((x) => !played(x.m) && x.m[1] >= today).sort((a, b) => (a.m[1] + (a.m[2] || '')).localeCompare(b.m[1] + (b.m[2] || '')));
  const nextDay = upcoming[0]?.m[1], list = todays.length ? todays : upcoming.filter((x) => x.m[1] === nextDay);
  const todayEl = $('#today', el);
  const snapshotList = () => {
    $('#md-sub', el).innerHTML = todays.length ? `Fixtures scheduled for today, ${fmt.day(today)}. <span class="chip demo">DEMO</span> Live scores need the data backend.` : nextDay ? `No top-five-league match is scheduled for today. Next up: ${fmt.day(nextDay)}.` : 'No further fixtures in the snapshot.';
    todayEl.innerHTML = list.length ? `<div class="fx-list">${list.slice(0, 9).map((x) => `<div class="fx-wrap"><span class="fx-lg">${esc(league(x.s.league).name)}</span>${fixtureRow(x.s, x.m, { showDate: false })}</div>`).join('')}</div>` : '<div class="empty" style="border:0">The season schedule in the snapshot is complete.</div>';
  };
  snapshotList();
  if (isLive()) liveMatches(today).then((res) => {
    if (!res.matches?.length || !el.isConnected) return;
    $('#md-sub', el).innerHTML = `Live from ${esc(res.provider)} · refreshed ${fmt.stamp(res.fetchedAt)} <span class="chip live">LIVE</span>`;
    todayEl.innerHTML = `<div class="fx-list">${res.matches.slice(0, 10).map((m) => `<a class="fx" href="#/match/live~${encodeURIComponent(m.id)}"><span class="team">${m.home.club ? crest(m.home.club, 24) : ''}<span>${esc(m.home.name)}</span></span><span class="mid">${m.status === 'SCHEDULED' ? `<span class="ko num">${new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>` : `<span class="score num">${m.score.home ?? '–'}–${m.score.away ?? '–'}</span>`}<span class="when">${isInPlay(m.status) ? (m.minute ? m.minute + "'" : STATUS_LABEL[m.status]) : STATUS_LABEL[m.status] || m.status}</span></span><span class="team">${m.away.club ? crest(m.away.club, 24) : ''}<span>${esc(m.away.name)}</span></span></a>`).join('')}</div>`;
  }).catch(() => {});

  // featured fixture: the strongest pairing in the next fortnight
  const horizon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const pool = upcoming.filter((x) => x.m[1] <= horizon), rank = (x) => elo(x.s.teams[x.m[3]]) + elo(x.s.teams[x.m[4]]);
  const feat = [...(pool.length ? pool : upcoming.slice(0, 40))].sort((a, b) => rank(b) - rank(a))[0];
  const featEl = $('#featured', el);
  if (feat) {
    const h = feat.s.teams[feat.m[3]], a = feat.s.teams[feat.m[4]], f = predictMatch(state, { home: h, away: a, date: feat.m[1] }), top = f.top[0];
    featEl.innerHTML = html`<div class="panel-head"><h3>Featured fixture</h3><span class="chip gold">${esc(league(feat.s.league).name)}</span></div>
      <div class="feat-teams"><a href="#/club/${h}" data-club="${h}">${crest(h, 84, { lazy: false })}<b>${esc(club(h).short)}</b></a><div class="feat-when"><span class="num">${feat.m[2] || 'TBC'}</span><small>${fmt.day(feat.m[1])}</small><small>${esc(club(h).ground)}</small></div><a href="#/club/${a}" data-club="${a}">${crest(a, 84, { lazy: false })}<b>${esc(club(a).short)}</b></a></div>
      ${probBar(f.ensemble)}<div class="prob-labels"><span>${esc(club(h).short)} win</span><span>Draw</span><span>${esc(club(a).short)} win</span></div>
      <dl class="kv-list" style="margin-top:16px"><dt>Expected goals</dt><dd class="num">${f.lambdas[0].toFixed(2)} – ${f.lambdas[1].toFixed(2)}</dd><dt>Most likely score</dt><dd class="num">${top.h}–${top.a} (${fmt.pct(top.p)})</dd><dt>Both teams to score</dt><dd class="num">${fmt.pct(f.market.btts)}</dd></dl>
      <a class="btn primary sm" style="margin-top:18px" href="#/predictions?home=${h}&away=${a}">Open the full forecast ${ICON.arrow}</a>
      <p class="src" style="margin-top:12px">Ensemble forecast from ratings as of ${fmt.date(state.asOf)}.</p>`;
  } else featEl.innerHTML = '<div class="empty" style="border:0">No upcoming fixture found.</div>';

  // league leaders
  $('#leaders', el).innerHTML = seasons.map((s) => { const t = table(s), lg = league(s.league);
    return `<a class="card leader" href="#/league/${s.league}"><div class="row between"><h3>${esc(lg.name)}</h3><img class="flag" style="--s:26px" src="https://flagcdn.com/${lg.flag}.svg" alt="${esc(lg.country)}"></div>
      <ol>${t.slice(0, 3).map((r) => `<li><span class="num">${r.pos}</span>${crest(r.id, 26)}<b>${esc(club(r.id).short)}</b><span class="num pts">${r.pts}<small> pts</small></span></li>`).join('')}</ol><span class="src">${t[0].p} played · best attack ${esc(club([...t].sort((x, y) => y.gf - x.gf)[0].id).short)}</span></a>`; }).join('');

  // players in form: World Cup 2026 scorers (complete goal data)
  const scorers = (wc26.scorers || []).slice(0, 8);
  $('#trend', el).innerHTML = scorers.map((p, i) => `<a class="card tp" href="#/worldcup/2026" style="--i:${i}"><span class="avatar" style="--s:76px" data-art="${esc(p.name)}">${esc(p.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><div><b>${esc(p.name)}</b><span class="team small muted">${flag(p.team, 18)}<span>${esc(p.team)}</span></span></div><span class="tp-n num">${p.goals}<small>goals</small></span></a>`).join('');
  $$('[data-art]', el).forEach(async (n) => { const a = await playerArt(n.dataset.art); if (a?.img && n.isConnected) n.innerHTML = `<img src="${a.img}" alt="" loading="lazy">`; });

  // forecasts
  const picks = [...pool].sort((a, b) => rank(b) - rank(a)).slice(1, 7);
  $('#forecasts', el).innerHTML = picks.length ? picks.map((x) => { const h = x.s.teams[x.m[3]], a = x.s.teams[x.m[4]], f = predictMatch(state, { home: h, away: a, date: x.m[1] });
    return `<a class="card fc" href="#/predictions?home=${h}&away=${a}"><div class="row between small muted"><span>${esc(league(x.s.league).name)}</span><span>${fmt.day(x.m[1])} · ${x.m[2] || 'TBC'}</span></div><div class="fc-teams">${teamLink(h, { link: false, size: 30 })}<span class="dim">v</span>${teamLink(a, { link: false, size: 30 })}</div>${probBar(f.ensemble, 'sm')}<div class="row between small muted" style="margin-top:8px"><span>xG <b class="num">${f.lambdas[0].toFixed(2)} – ${f.lambdas[1].toFixed(2)}</b></span><span>Model spread <b class="num">${fmt.pct(f.spread)}</b></span></div></a>`; }).join('') : `<div class="span-all">${note('No fixtures inside the next fortnight in this snapshot. Open the Prediction Lab to forecast any pairing.')}</div>`;

  // explorer
  const wall = (lid) => { const t = table(byLeague[lid]); $('#crestwall', el).innerHTML = clubsOf(lid).sort((a, b) => a.name.localeCompare(b.name)).map((c) => { const r = t.find((x) => x.id === c.id);
    return `<a class="cw" href="#/club/${c.id}" data-club="${c.id}" style="--c:${c.colors[0]}">${crest(c.id, 74)}<b>${esc(c.short)}</b><span class="small muted">${fmt.ord(r.pos)} · ${r.pts} pts</span>${formDots(r.form.slice(-5).map((f) => f.res), 'sm')}</a>`; }).join(''); };
  wall('eng.1'); segmented($('#ex-seg .seg', el), wall);
}

export function destroy() {
  clearInterval(rotate); rotate = null; io?.disconnect(); io = null;
  ambientOff?.(); ambientOff = null; delete window.__gvHome;
  if (onResize) removeEventListener('resize', onResize); onResize = null;
  tl?.kill(); st?.kill(); tl = st = null; gsapRef = null;
  scene?.dispose(); scene = null;
}
