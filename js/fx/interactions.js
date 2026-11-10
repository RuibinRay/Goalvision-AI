/**
 * Pointer polish, for devices with a real pointer only (touch never fires these):
 *   - crest tiles, club cards and league cards tilt toward the cursor, their crest shifts for depth and a light follows
 *   - primary call-to-action buttons lean toward the cursor ("magnetic")
 * One delegated pointermove listener, applied once per animation frame. Transforms are written on the element itself,
 * and the base rectangle is measured once on entry, so tracking never forces layout while the pointer moves.
 * Decorative, so it is limited to showcase surfaces: tables, charts and forms never move under the cursor.
 */
const TILT = '.cw, .clubcard, .lgc', MAGNET = '.cine-cta .btn, .page-head .btn.primary';
const motionOK = () => !document.body.classList.contains('reduced-motion');

export function initInteractions() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let tile = null, tileRect = null, kid = null, mag = null, magRect = null, ev = null, frame = 0;
  const dropTile = () => { if (!tile) return; tile.classList.remove('tilting'); tile.style.transform = ''; if (kid) kid.style.transform = ''; tile = kid = null; };
  const dropMag = () => { if (!mag) return; mag.classList.remove('tracking'); mag.style.transform = ''; mag = null; };
  const apply = () => {
    frame = 0; if (!ev) return;
    if (tile) {
      const px = Math.min(1, Math.max(0, (ev.clientX - tileRect.left) / tileRect.width)), py = Math.min(1, Math.max(0, (ev.clientY - tileRect.top) / tileRect.height)), max = tile.classList.contains('lgc') ? 3.5 : 7;
      tile.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); tile.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      tile.style.transform = `perspective(900px) rotateX(${((.5 - py) * 2 * max).toFixed(2)}deg) rotateY(${((px - .5) * 2 * max).toFixed(2)}deg) translateY(-4px) scale(1.03)`;
      if (kid) kid.style.transform = `translate(${((px - .5) * 10).toFixed(1)}px, ${((py - .5) * 8).toFixed(1)}px) scale(1.08)`;
    }
    if (mag) mag.style.transform = `translate(${((ev.clientX - magRect.left - magRect.width / 2) * .22).toFixed(1)}px, ${((ev.clientY - magRect.top - magRect.height / 2) * .34).toFixed(1)}px)`;
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !motionOK() || !e.target.closest) return;
    const t = e.target.closest(TILT), m = e.target.closest(MAGNET);
    if (t !== tile) { dropTile(); if (t) { tile = t; tileRect = t.getBoundingClientRect(); kid = t.querySelector('.crest, .lg-emblem'); t.classList.add('tilting'); } }
    if (m !== mag) { dropMag(); if (m) { mag = m; magRect = m.getBoundingClientRect(); m.classList.add('magnet', 'tracking'); } }
    if (!tile && !mag) return;
    ev = e; if (!frame) frame = requestAnimationFrame(apply);
  }, { passive: true });
  const dropAll = () => { ev = null; dropTile(); dropMag(); };
  document.documentElement.addEventListener('pointerleave', dropAll);
  addEventListener('scroll', dropAll, { passive: true });           // the measured rectangles are stale once the page scrolls
  addEventListener('pointerdown', dropMag, { passive: true });      // let the button's own press feedback show
  document.addEventListener('route', dropAll);
}
