/**
 * The floodlit stadium behind the homepage: a procedural Three.js scene (no model or texture downloads).
 * Pitch 105 x 68 m with regulation markings, a superellipse bowl, four floodlight rigs with light cones, a crowd of
 * points, drifting dust, a 32-panel football and an optional real pass network drawn on the grass.
 * One number drives everything: setProgress(0..1) = the five chapters of the scroll sequence.
 */
import * as THREE from 'three';

const PW = 105, PH = 68;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function pitchTextures() {
  const W = 2048, H = Math.round(W * PH / PW), s = W / PW;
  const grass = document.createElement('canvas'); grass.width = W; grass.height = H;
  const g = grass.getContext('2d');
  for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? '#0F4029' : '#145235'; g.fillRect(i * W / 20, 0, W / 20 + 1, H); }
  const id = g.getImageData(0, 0, W, H), d = id.data;                 // fine grain so the turf is not flat
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n * .6; }
  g.putImageData(id, 0, 0);
  const lines = document.createElement('canvas'); lines.width = W; lines.height = H;
  const l = lines.getContext('2d'); l.fillStyle = '#000'; l.fillRect(0, 0, W, H);
  const draw = (ctx, color, lw) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'butt';
    const m = (v) => v * s, cx = W / 2, cy = H / 2, o = lw / 2;
    ctx.strokeRect(o, o, W - lw, H - lw);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, m(9.15), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, lw * 1.3, 0, Math.PI * 2); ctx.fill();
    for (const side of [0, 1]) {
      const x0 = side ? W - o : o, dir = side ? -1 : 1;
      ctx.strokeRect(side ? x0 - m(16.5) : x0, cy - m(20.16), m(16.5), m(40.32));
      ctx.strokeRect(side ? x0 - m(5.5) : x0, cy - m(9.16), m(5.5), m(18.32));
      const px = x0 + dir * m(11);
      ctx.beginPath(); ctx.arc(px, cy, lw * 1.2, 0, Math.PI * 2); ctx.fill();
      const a = Math.acos(5.5 / 9.15);
      ctx.beginPath(); if (side) ctx.arc(px, cy, m(9.15), Math.PI - a, Math.PI + a); else ctx.arc(px, cy, m(9.15), -a, a); ctx.stroke();
    }
    for (const [x, y, a0] of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, -Math.PI / 2]]) { ctx.beginPath(); ctx.arc(x, y, m(1), a0, a0 + Math.PI / 2); ctx.stroke(); }
  };
  draw(g, 'rgba(240,248,255,.92)', 5); draw(l, '#fff', 6);
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: tex(grass), emissive: tex(lines) };
}
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256); return new THREE.CanvasTexture(c);
}
function panelTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#05070a'; g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) { const gr = g.createRadialGradient(18 + x * 27.5, 18 + y * 30.5, 0, 18 + x * 27.5, 18 + y * 30.5, 12); gr.addColorStop(0, '#fff'); gr.addColorStop(.5, 'rgba(210,228,255,.8)'); gr.addColorStop(1, 'rgba(160,200,255,0)'); g.fillStyle = gr; g.fillRect(x * 27.5, y * 30.5, 36, 36); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ringPoint = (a, b, t, n = 3.4) => { const c = Math.cos(t), s = Math.sin(t); return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]; };

/** Truncated icosahedron: 12 dark pentagons + 20 white hexagons, each a slightly domed panel over a dark seam sphere. */
export function createBall() {
  const ico = new THREE.IcosahedronGeometry(1, 0), pos = ico.attributes.position;
  const verts = [], faces = [], seen = new Map();
  for (let i = 0; i < pos.count; i += 3) {
    const f = [];
    for (let j = 0; j < 3; j++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i + j), k = v.toArray().map((n) => n.toFixed(3)).join(); if (!seen.has(k)) { seen.set(k, verts.length); verts.push(v); } f.push(seen.get(k)); }
    faces.push(f);
  }
  const nb = verts.map(() => new Set()); faces.forEach(([a, b, c]) => { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); });
  const polys = [];
  verts.forEach((V, i) => {
    const pts = [...nb[i]].map((j) => V.clone().lerp(verts[j], 1 / 3)), n = V.clone().normalize(), u = pts[0].clone().sub(V).normalize(), w = new THREE.Vector3().crossVectors(n, u);
    const ang = (p) => { const d = p.clone().sub(V); return Math.atan2(d.dot(w), d.dot(u)); };
    polys.push({ pts: pts.sort((p, q) => ang(p) - ang(q)), dark: true });
  });
  faces.forEach(([a, b, c]) => { const A = verts[a], B = verts[b], C = verts[c]; polys.push({ pts: [A.clone().lerp(B, 1 / 3), A.clone().lerp(B, 2 / 3), B.clone().lerp(C, 1 / 3), B.clone().lerp(C, 2 / 3), C.clone().lerp(A, 1 / 3), C.clone().lerp(A, 2 / 3)], dark: false }); });
  const P = [], N = [], C = [], L = 5;
  for (const poly of polys) {
    const c = poly.pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / poly.pts.length), cdir = c.clone().normalize();
    const col = poly.dark ? [0.03, 0.04, 0.06] : [0.93, 0.95, 0.98], inset = poly.pts.map((p) => c.clone().lerp(p, .955));
    for (let e = 0; e < inset.length; e++) {
      const a = inset[e], b = inset[(e + 1) % inset.length];
      const pt = (i, j) => {
        const wa = i / L, wb = j / L, wc = 1 - wa - wb, p = new THREE.Vector3().addScaledVector(c, wc).addScaledVector(a, wa).addScaledVector(b, wb);
        const t = 1 - wc, dir = p.normalize(), r = 1 - .024 * Math.pow(t, 4), n = dir.clone().addScaledVector(dir.clone().sub(cdir), 1.1 * Math.pow(t, 3)).normalize();
        return { p: dir.clone().multiplyScalar(r), n };
      };
      const push = (x, y, z) => {
        const out = new THREE.Vector3().crossVectors(y.p.clone().sub(x.p), z.p.clone().sub(x.p)).dot(x.p) > 0 ? [x, y, z] : [x, z, y];
        for (const v of out) { P.push(v.p.x, v.p.y, v.p.z); N.push(v.n.x, v.n.y, v.n.z); C.push(...col); }
      };
      for (let i = 0; i < L; i++) for (let j = 0; j < L - i; j++) { push(pt(i, j), pt(i + 1, j), pt(i, j + 1)); if (j < L - i - 1) push(pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const ball = new THREE.Group();
  ball.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .38, metalness: 0, clearcoat: .7, clearcoatRoughness: .25 })));
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(.968, 48, 32), new THREE.MeshStandardMaterial({ color: 0x0b0f15, roughness: .8 })));
  return ball;
}

export function createStadium(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080d); scene.fog = new THREE.FogExp2(0x060a11, .0058);
  const camera = new THREE.PerspectiveCamera(40, 1, .5, 900);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  /* pitch */
  const tex = pitchTextures(); keep(tex.map); keep(tex.emissive);
  const pitchMat = keep(new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: .1, roughness: .92 }));
  const pitch = new THREE.Mesh(keep(new THREE.PlaneGeometry(PW, PH)), pitchMat); pitch.rotation.x = -Math.PI / 2; scene.add(pitch);
  const apron = new THREE.Mesh(keep(new THREE.PlaneGeometry(PW + 22, PH + 22)), keep(new THREE.MeshStandardMaterial({ color: 0x0a2c1d, roughness: 1 }))); apron.rotation.x = -Math.PI / 2; apron.position.y = -.03; scene.add(apron);
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(900, 900)), keep(new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 1 }))); ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; scene.add(ground);

  /* bowl: rows of a superellipse, faces wound to look at the pitch so the near stand vanishes when the camera sits inside it */
  const rows = [[66, 47, .4], [67.5, 48.5, 3.6], [96, 77, 24], [98, 79, 24.2], [98, 79, 31], [83, 64, 34]];
  const SEG = 128, sp = [], sref = [new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 90, 0), new THREE.Vector3(0, 90, 0), new THREE.Vector3(0, 28, 0), new THREE.Vector3(0, 0, 0)];
  for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG * Math.PI * 2, t1 = (i + 1) / SEG * Math.PI * 2, q = (row, t) => { const [x, z] = ringPoint(row[0], row[1], t); return new THREE.Vector3(x, row[2], z); };
    const a = q(rows[r], t0), b = q(rows[r], t1), c = q(rows[r + 1], t1), d = q(rows[r + 1], t0);
    for (const tri of [[a, b, c], [a, c, d]]) {
      const n = new THREE.Vector3().crossVectors(tri[1].clone().sub(tri[0]), tri[2].clone().sub(tri[0])), toRef = sref[r].clone().sub(tri[0]);
      (n.dot(toRef) > 0 ? tri : [tri[0], tri[2], tri[1]]).forEach((v) => sp.push(v.x, v.y, v.z));
    }
  }
  const standGeo = keep(new THREE.BufferGeometry()); standGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); standGeo.computeVertexNormals();
  const standMat = keep(new THREE.MeshStandardMaterial({ color: 0x0d1622, roughness: .96, metalness: .1, flatShading: true }));
  scene.add(new THREE.Mesh(standGeo, standMat));

  /* crowd: points on the tier (not on the camera-side stand) */
  const CN = 5200, cp = new Float32Array(CN * 3), cc = new Float32Array(CN * 3), cside = new Int8Array(CN); let ci = 0;
  while (ci < CN) {
    const t = Math.random() * Math.PI * 2, s = Math.random(), a = lerp(rows[1][0], rows[2][0], s), b = lerp(rows[1][1], rows[2][1], s), [x, z] = ringPoint(a, b, t);
    if (z > 40) continue;
    cp.set([x, lerp(rows[1][2], rows[2][2], s) + .8, z], ci * 3); cside[ci] = Math.random() < .42 ? (x < 0 ? 1 : 2) : 0; ci++;
  }
  const crowdGeo = keep(new THREE.BufferGeometry()); crowdGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3)); crowdGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const dot = keep(radialTexture([[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]));
  const crowdMat = keep(new THREE.PointsMaterial({ size: .95, map: dot, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(new THREE.Points(crowdGeo, crowdMat));

  /* LED ribbon along the front wall, split into the two team colours */
  const rp = [], rc = [];
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG * Math.PI * 2, t1 = (i + 1) / SEG * Math.PI * 2, [x0, z0] = ringPoint(67.4, 48.4, t0), [x1, z1] = ringPoint(67.4, 48.4, t1);
    rp.push(x0, 3.7, z0, x1, 3.7, z1, x1, 5, z1, x0, 3.7, z0, x1, 5, z1, x0, 5, z0); for (let k = 0; k < 6; k++) rc.push(0, 0, 0);
  }
  const ribGeo = keep(new THREE.BufferGeometry()); ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); ribGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  const ribMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(new THREE.Mesh(ribGeo, ribMat));

  /* floodlights */
  const hemi = new THREE.HemisphereLight(0x9bbcff, 0x0b2418, .1); scene.add(hemi);
  const beamTex = keep(beamTexture()), panelTex = keep(panelTexture()), glowTex = keep(radialTexture([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(190,215,255,.55)'], [1, 'rgba(120,170,255,0)']]));
  const rigs = [];
  for (const [ang, tx, tz] of [[.72, 22, 8], [Math.PI - .72, -22, 8], [Math.PI + .72, -22, -8], [-.72, 22, -8]]) {
    const [x, z] = ringPoint(90, 71, ang), origin = new THREE.Vector3(x, 37, z), target = new THREE.Vector3(tx, 0, tz), dir = target.clone().sub(origin), len = dir.length();
    const panel = new THREE.Mesh(keep(new THREE.PlaneGeometry(11, 5.5)), keep(new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, opacity: 0, toneMapped: false })));
    panel.position.copy(origin); panel.lookAt(0, 8, 0); scene.add(panel);
    const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))); glow.position.copy(origin); glow.scale.set(34, 34, 1); scene.add(glow);
    const coneGeo = keep(new THREE.ConeGeometry(30, len, 40, 1, true)); coneGeo.translate(0, -len / 2, 0);
    const beam = new THREE.Mesh(coneGeo, keep(new THREE.MeshBasicMaterial({ map: beamTex, color: 0xcfe2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    beam.position.copy(origin); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize()); scene.add(beam);
    const spot = new THREE.SpotLight(0xe4eeff, 0, 0, .62, .7, 0); spot.position.copy(origin); spot.target.position.copy(target); scene.add(spot, spot.target);
    rigs.push({ panel, glow, beam, spot, aim: beam.quaternion.clone() });
  }
  /* team-coloured wash from each end */
  const washA = new THREE.PointLight(0x168fff, 0, 150, 1.2), washB = new THREE.PointLight(0xbeff37, 0, 150, 1.2);
  washA.position.set(-58, 20, 26); washB.position.set(58, 20, 26); scene.add(washA, washB);

  /* dust in the light */
  const DN = 700, dp = new Float32Array(DN * 3); for (let i = 0; i < DN; i++) dp.set([(Math.random() - .5) * 130, 1 + Math.random() * 42, (Math.random() - .5) * 110], i * 3);
  const dustGeo = keep(new THREE.BufferGeometry()); dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = keep(new THREE.PointsMaterial({ size: .5, map: dot, color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(new THREE.Points(dustGeo, dustMat));

  /* football */
  const ball = createBall(); ball.traverse((o) => { if (o.isMesh) { keep(o.geometry); keep(o.material); } }); scene.add(ball);
  const ballKey = new THREE.PointLight(0xffffff, 0, 60, 1.4), ballRim = new THREE.PointLight(0x168fff, 0, 60, 1.4); scene.add(ballKey, ballRim);

  /* pass network (real data, set later) */
  const net = new THREE.Group(); net.position.y = .12; scene.add(net); const netMats = [];
  function setNetwork(teams) {
    net.clear(); netMats.length = 0;
    teams.forEach(({ nodes, edges, color, flip }) => {
      const P3 = (x, y) => [((flip ? 120 - x : x) / 120 - .5) * PW, 0, ((flip ? 80 - y : y) / 80 - .5) * PH], maxE = Math.max(1, ...edges.map((e) => e[2]));
      const lp = [], lc = [], col = new THREE.Color(color);
      edges.filter((e) => e[2] >= 3).forEach(([i, j, n]) => { const w = .25 + .75 * n / maxE; lp.push(...P3(nodes[i][2], nodes[i][3]), ...P3(nodes[j][2], nodes[j][3])); lc.push(col.r * w, col.g * w, col.b * w, col.r * w, col.g * w, col.b * w); });
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
      const lm = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(nodes.flatMap((n) => P3(n[2], n[3])), 3));
      const pm = new THREE.PointsMaterial({ size: 3.4, map: dot, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      net.add(new THREE.LineSegments(lg, lm), new THREE.Points(pg, pm)); netMats.push(lm, pm); disposables.push(lg, lm, pg, pm);
    });
    apply();
  }
  function setTeams(a, b) {
    const A = new THREE.Color(a), B = new THREE.Color(b), neutral = new THREE.Color(0x9fb4d6);
    washA.color.copy(A); washB.color.copy(B);
    const rcol = ribGeo.attributes.color, rpos = ribGeo.attributes.position;
    for (let i = 0; i < rcol.count; i++) { const c = rpos.getX(i) < 0 ? A : B; rcol.setXYZ(i, c.r, c.g, c.b); } rcol.needsUpdate = true;
    for (let i = 0; i < CN; i++) { const c = cside[i] === 1 ? A : cside[i] === 2 ? B : neutral, k = .35 + Math.random() * .65; cc.set([c.r * k, c.g * k, c.b * k], i * 3); } crowdGeo.attributes.color.needsUpdate = true;
    ballRim.color.copy(A); apply();
  }

  /* camera path */
  const KEY = [
    { p: 0, pos: [0, 6.5, 76], tgt: [0, 11, 0] }, { p: .2, pos: [0, 6, 68], tgt: [0, 9, 0] }, { p: .4, pos: [0, 5, 52], tgt: [0, 6, 0] },
    { p: .6, pos: [0, 6.5, 46], tgt: [0, 5, 0] }, { p: .8, pos: [0, 120, 6], tgt: [0, 0, 0] }, { p: 1, pos: [0, 120, 6], tgt: [0, 0, 0] },
  ];
  let aerialD = 120, progress = 0, intro = reduced ? 1 : 0, time = 0, w = 1, h = 1;
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
  function apply() {
    const p = progress;
    let k = 0; while (k < KEY.length - 2 && p > KEY[k + 1].p) k++;
    const A = KEY[k], B = KEY[k + 1], t = smooth(0, 1, (p - A.p) / (B.p - A.p));
    const P = (key) => (key.p >= .8 ? [0, aerialD, aerialD * .045] : key.pos);
    pos.fromArray(P(A)).lerp(new THREE.Vector3().fromArray(P(B)), t); tgt.fromArray(A.tgt).lerp(new THREE.Vector3().fromArray(B.tgt), t);
    const sway = reduced ? 0 : Math.sin(time * .22) * 1.4 * (1 - smooth(.55, .8, p));
    camera.position.set(pos.x + sway, pos.y, pos.z); camera.lookAt(tgt);
    const aerial = smooth(.62, .8, p), map = smooth(.82, .96, p), lights = Math.max(intro * .55, smooth(.0, .19, p));
    const sweep = (createStadium.q ||= new THREE.Quaternion()), swing = (createStadium.e ||= new THREE.Euler());
    rigs.forEach((r, i) => {
      const on = Math.max(intro * .55, smooth(i * .03, i * .03 + .13, p)), flick = on > .04 && on < .5 && !reduced ? .65 + .35 * Math.sin(time * 37 + i * 9) * Math.sin(time * 13 + i) : 1, v = on * flick;
      r.panel.material.opacity = v; r.glow.material.opacity = v * .85 * (1 - aerial * .7); r.beam.material.opacity = v * .1 * (1 - aerial * .85) * (1 + (reduced ? 0 : .12 * Math.sin(time * .8 + i * 2))); r.spot.intensity = v * 2.1;
      // the beams sweep slowly across the pitch, each on its own rhythm
      if (!reduced) r.beam.quaternion.copy(r.aim).multiply(sweep.setFromEuler(swing.set(Math.sin(time * .31 + i * 1.7) * .075, 0, Math.sin(time * .23 + i * 2.3) * .1)));
    });
    hemi.intensity = .1 + lights * .34;
    pitchMat.emissiveIntensity = .06 + lights * .22 + aerial * .5 + map * .35 * (reduced ? 1 : .8 + .2 * Math.sin(time * 2));
    crowdMat.opacity = lights * .9 * (1 - aerial * .65); ribMat.opacity = lights * .75 * (1 - map * .5); dustMat.opacity = lights * .42 * (1 - aerial);
    const wash = smooth(.08, .3, p) * (1 - aerial * .6); washA.intensity = wash * 420; washB.intensity = wash * 420;
    standMat.color.setScalar(1); standMat.color.set(0x0d1622).multiplyScalar(1 - map * .55);
    /* ball: falls in for chapter three, settles on the centre spot for the aerial view */
    const bi = smooth(.36, .5, p), land = smooth(.6, .8, p);
    const bx = 0, by = lerp(lerp(34, 8.6, bi), 1.25, land), bz = lerp(lerp(-30, 22, bi), 0, land), bs = lerp(lerp(.6, 2.3, bi), 1.25, land);
    ball.position.set(bx, by, bz); ball.scale.setScalar(bs); ball.visible = p > .34;
    ball.rotation.set(time * .5 + p * 9, time * .35 + p * 14, 0);
    ballKey.position.set(bx + 6, by + 7, bz + 12); ballRim.position.set(bx - 8, by + 1, bz - 6); ballKey.intensity = bi * 260 * (1 - land * .5); ballRim.intensity = bi * 300 * (1 - land * .6);
    const nv = smooth(.42, .56, p) * (1 - map * .75); netMats.forEach((m, i) => (m.opacity = nv * (i % 2 ? 1 : .8)));
  }
  function render() { apply(); renderer.render(scene, camera); }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 52 : 40; camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    aerialD = Math.max((PW + 26) / (2 * tan * camera.aspect), (PH + 50) / (2 * tan)); render();
  }
  let raf = 0, running = false, last = 0;
  function loop(now) { if (!running) return; const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; time += dt;
    const a = dustGeo.attributes.position; for (let i = 0; i < DN; i++) { let y = a.getY(i) + dt * (.35 + (i % 7) * .05); if (y > 44) y = 1; a.setY(i, y); } a.needsUpdate = true;
    render(); raf = requestAnimationFrame(loop); }
  const api = {
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); if (!running) render(); },
    setIntro(v) { intro = v; if (!running) render(); },
    setTeams, setNetwork, resize, render,
    start() { if (running || reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    /** Pitch coordinates (StatsBomb 120 x 80) -> CSS pixels inside the canvas. */
    project(x, y) { const v = new THREE.Vector3((x / 120 - .5) * PW, 0, (y / 80 - .5) * PH).project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; },
    dispose() { api.stop(); disposables.forEach((d) => d.dispose?.()); renderer.dispose(); },
  };
  setTeams('#168FFF', '#BEFF37'); resize();
  return api;
}
