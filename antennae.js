// Antennae Galaxies (NGC 4038/4039) for the galaxy scene (1 unit = 100 ly, galactic plane = XZ, +Y = north galactic pole).
// Self-contained: created and updated from galaxy.js createGalaxy() (no main.js hook). It brings its own label + beacon,
// tap-for-info (fills the shared #info-panel), and a keyboard fly-to (key N, "NGC"; A is already Andromeda).
//
//   import { addAntennae, ANTENNAE_INFO } from './antennae.js';
//   const ant = addAntennae({ scene, SUN_POS, R, M31_POS, spinning }, { isTouch });
//   ...each frame (inside galaxy.update): ant.update(camera, dt);
//
// Placement: true distance ~45 Mly = 450,000 units from the Sun toward l = 287.3°, b = +42.3° (RA 12h01m53s, Dec −18°52′,
// constellation Corvus), in exactly the frame galaxy.js uses for Andromeda and sombrero.js for M104.
// Size to scale: each disk ~55,000 ly (R ≈ 280 units), tidal tails ~2,000 units each (~300,000+ ly end to end).
// Built in an "image plane" frame (local z = toward the Sun) so the fly-to view along our line of sight looks like the photos.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const D2R = Math.PI / 180;
export const ANTENNAE_DIST_LY = 45e6;
export const ANTENNAE_L = 287.3, ANTENNAE_B = 42.3;

export const ANTENNAE_INFO = {
  name: 'Antennae Galaxies (NGC 4038/4039)', type: 'Two colliding spiral galaxies', color: '#ffc6e8',
  rows: [
    ['Distance', '~45 million light-years, in the constellation Corvus'],
    ['Size', 'Each disk ~50,000–60,000 ly · tidal tails ~300,000+ ly end to end'],
    ['Collision', 'Began a few hundred million years ago'],
    ['Future', 'Will merge into one big elliptical galaxy'],
  ],
  fact: 'Two spiral galaxies are crashing into each other. Tidal forces flung out two long streams of stars that curve like an insect’s antennae. ' +
        'Squeezed gas in the collision zone is forming billions of new stars, in glowing pink clouds of hydrogen and clusters of hot blue young stars. ' +
        'In a few hundred million years the two will settle into a single elliptical galaxy.',
};

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const VERT = /* glsl */`
  attribute float size; attribute vec3 aColor; attribute vec4 aDrift;   // xyz = drift direction*amplitude, w = phase
  uniform float uScale, uMaxPt, uTime, uBright;
  varying vec3 vColor; varying float vFade;
  void main() {
    vec3 p = position + aDrift.xyz * sin(uTime * 0.35 + aDrift.w);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float ps = size * uScale / max(-mv.z, 1e-3);
    vFade = clamp(ps * ps, 0.0, 1.0);
    vColor = aColor * uBright;
    gl_PointSize = clamp(ps, 1.0, uMaxPt);
    gl_Position = projectionMatrix * mv;
  }`;
const STAR_FRAG = /* glsl */`
  varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8);
    gl_FragColor = vec4(vColor * a * vFade, 1.0); }`;
const DUST_FRAG = /* glsl */`
  uniform float uAlpha; varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = 1.0 - d * 2.0;
    gl_FragColor = vec4(vColor, a * a * uAlpha * vFade); }`;

function radialTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, s] of stops) gr.addColorStop(o, s);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// point-cloud builder
function cloud(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), drift = new Float32Array(n * 4);
  let i = 0;
  return {
    push(p, c, s, d = null, ph = Math.random() * 6.283) {
      if (i >= n) return; pos.set([p.x, p.y, p.z], i * 3); col.set([c.r, c.g, c.b], i * 3); size[i] = s;
      if (d) drift.set([d.x, d.y, d.z, ph], i * 4); i++;
    },
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, i * 3), 3));
      g.setAttribute('size', new THREE.BufferAttribute(size.subarray(0, i), 1));
      g.setAttribute('aDrift', new THREE.BufferAttribute(drift.subarray(0, i * 4), 4));
      return g;
    },
    get count() { return i; },
  };
}

/**
 * @param galaxy  { scene, SUN_POS, R?, M31_POS?, spinning? }
 * @param opts    { isTouch=false, labels=true }
 */
export function addAntennae(galaxy, opts = {}) {
  const { isTouch = false, labels = true } = opts;
  const scene = galaxy.scene, SUN_POS = galaxy.SUN_POS.clone();
  const DIST = ANTENNAE_DIST_LY / 100;   // 450,000 units
  const RD = 280;                        // disk radius (~56,000 ly across)

  // direction: same galactic frame as galaxy.js (M31) / sombrero.js (M104)
  const Y = new THREE.Vector3(0, 1, 0);
  const gcDir = SUN_POS.clone().negate().normalize();
  const l90Dir = Y.clone().cross(gcDir).normalize();
  const L = ANTENNAE_L * D2R, B = ANTENNAE_B * D2R;
  const dir = gcDir.clone().multiplyScalar(Math.cos(B) * Math.cos(L)).addScaledVector(l90Dir, Math.cos(B) * Math.sin(L))
    .addScaledVector(Y, Math.sin(B)).normalize();
  const POS = SUN_POS.clone().addScaledVector(dir, DIST);
  const los = dir.clone().negate();      // Antennae → Sun

  // image-plane frame: local z = toward the Sun, local y ≈ galactic north projected on the sky
  const ez = los.clone(), ey = Y.clone().addScaledVector(ez, -Y.dot(ez)).normalize(), ex = ey.clone().cross(ez).normalize();
  const group = new THREE.Group(); group.name = 'Antennae';
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
  group.position.copy(POS);
  scene.add(group);
  const body = new THREE.Group(); group.add(body);   // slow cosmetic wobble lives here

  const S = isTouch ? 0.42 : 1;                 // particle budget on touch devices
  const N_DISK = Math.round(16000 * S), N_TAIL = Math.round(13000 * S), N_KNOT = Math.round(1400 * S), N_DUST = Math.round(5000 * S);

  // two galaxies (NGC 4038 north, NGC 4039 south), centers ~ 0.75 R apart so the disks overlap
  const gals = [
    { c: new THREE.Vector3(-40, 120, 0), tilt: new THREE.Euler(0.95, 0.2, 0.5), phase: 0.3, spin: 1, warp: 0.22 },
    { c: new THREE.Vector3(60, -95, -40), tilt: new THREE.Euler(-0.6, 0.9, -0.3), phase: 2.1, spin: -1, warp: 0.28 },
  ];
  for (const g of gals) { g.q = new THREE.Quaternion().setFromEuler(g.tilt); g.n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.q); }
  const toWorld = (g, x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(g.q).add(g.c);

  const C = (r, gg, b) => new THREE.Color(r, gg, b);
  const CORE = C(1.0, 0.86, 0.6), ARM = C(0.72, 0.8, 1.0), OLD = C(1.0, 0.8, 0.62);

  // --- disks: 2-armed log spirals, exponential profile, warped and tidally stretched toward each other ---
  const disk = cloud(N_DISK * 2);
  for (const [k, g] of gals.entries()) {
    const other = gals[1 - k].c.clone().sub(g.c).normalize();
    for (let i = 0; i < N_DISK; i++) {
      const r = Math.min(RD * 1.15, -Math.log(1 - Math.random() * 0.985) * RD * 0.38);
      const arm = Math.random() < 0.5 ? 0 : Math.PI;
      const army = Math.random() < 0.7;
      let th = army ? arm + g.phase + g.spin * 2.4 * Math.log(1 + r / 40) + gauss() * 0.28 : Math.random() * 6.283;
      let x = Math.cos(th) * r, y = Math.sin(th) * r;
      let z = gauss() * (8 + 14 * Math.exp(-r / 50)) + g.warp * RD * Math.pow(r / RD, 2) * Math.sin(th - g.phase);
      const p = toWorld(g, x, y, z);
      const along = p.clone().sub(g.c).dot(other);                 // tidal stretch toward the companion
      if (along > 0) p.addScaledVector(other, along * 0.25 * (r / RD));
      const t = Math.min(1, r / RD), c = r < 50 ? CORE.clone() : (army ? ARM.clone().lerp(OLD, 0.25 * Math.random()) : OLD.clone().lerp(ARM, 0.3));
      c.multiplyScalar(r < 50 ? 1.0 : 0.65 + 0.35 * (1 - t));
      disk.push(p, c, (r < 50 ? 9 : 7) + Math.random() * 4);
    }
  }
  // --- tidal tails: two long curved streams (cubic Bézier spines), widening and fading outward, gentle GPU drift ---
  const tails = [
    [new THREE.Vector3(-150, 220, 30), new THREE.Vector3(-650, 750, 120), new THREE.Vector3(-1250, 150, 200), new THREE.Vector3(-1450, -1150, 150)],
    [new THREE.Vector3(200, -200, -60), new THREE.Vector3(850, -60, -150), new THREE.Vector3(950, -950, -250), new THREE.Vector3(450, -2050, -200)],
  ];
  const bez = (P, t) => { const u = 1 - t; return P[0].clone().multiplyScalar(u * u * u).addScaledVector(P[1], 3 * u * u * t).addScaledVector(P[2], 3 * u * t * t).addScaledVector(P[3], t * t * t); };
  const tail = cloud(N_TAIL * 2);
  const TAILC = C(0.62, 0.7, 0.95), TAILW = C(0.9, 0.85, 0.8);
  for (const P of tails) {
    for (let i = 0; i < N_TAIL; i++) {
      const t = Math.pow(Math.random(), 1.25);
      const p = bez(P, t), tan = bez(P, Math.min(1, t + 0.01)).sub(bez(P, Math.max(0, t - 0.01))).normalize();
      const w = 22 + 70 * t * (1 - 0.3 * t);
      p.add(new THREE.Vector3(gauss() * w, gauss() * w, gauss() * w * 0.6));
      const c = TAILW.clone().lerp(TAILC, t).multiplyScalar(0.55 * (1 - 0.55 * t));
      if (Math.random() < 0.015) c.set(0.55, 0.65, 1.0);            // a few blue knots along the tails (tidal dwarf seeds)
      tail.push(p, c, 6 + Math.random() * 5, tan.multiplyScalar(5 + 12 * t));
    }
  }
  // --- star-forming knots: pink/magenta H II regions + blue young clusters around the collision zone ---
  const knot = cloud(N_KNOT);
  const PINK = C(1.0, 0.35, 0.72), MAG = C(0.95, 0.28, 0.9), BLUE = C(0.5, 0.7, 1.0);
  for (let i = 0; i < N_KNOT; i++) {
    let p;
    if (Math.random() < 0.55) {                    // the overlap region and the arc between the nuclei
      const t = Math.random(); p = gals[0].c.clone().lerp(gals[1].c, t).add(new THREE.Vector3(gauss() * 90, gauss() * 60, gauss() * 30));
      p.x += 120 * Math.sin(t * Math.PI);          // bow outward like the real "overlap" arc
    } else {                                       // along both galaxies' arms
      const g = gals[i % 2], r = RD * (0.25 + 0.75 * Math.random()), th = (Math.random() < 0.5 ? 0 : Math.PI) + g.phase + g.spin * 2.4 * Math.log(1 + r / 40) + gauss() * 0.15;
      p = toWorld(g, Math.cos(th) * r, Math.sin(th) * r, gauss() * 6);
    }
    const pink = Math.random() < 0.5;
    const c = (pink ? (Math.random() < 0.6 ? PINK : MAG) : BLUE).clone().multiplyScalar(0.7 + 0.5 * Math.random());
    knot.push(p, c, (pink ? 9 : 7) + Math.random() * (pink ? 10 : 6), new THREE.Vector3(0, 0, 0));
  }
  // --- dust: dark lanes through the overlap region and along the inner arms ---
  const dust = cloud(N_DUST);
  const DUSTC = C(0.05, 0.03, 0.025);
  for (let i = 0; i < N_DUST; i++) {
    let p;
    if (Math.random() < 0.6) { const t = Math.random(); p = gals[0].c.clone().lerp(gals[1].c, 0.15 + 0.7 * t).add(new THREE.Vector3(70 * Math.sin(t * Math.PI) + gauss() * 30, gauss() * 22, 40 + gauss() * 12)); }
    else { const g = gals[i % 2], r = RD * (0.15 + 0.6 * Math.random()), th = (Math.random() < 0.5 ? 0 : Math.PI) + g.phase - 0.25 * g.spin + g.spin * 2.4 * Math.log(1 + r / 40) + gauss() * 0.1;
      p = toWorld(g, Math.cos(th) * r, Math.sin(th) * r, 6 + gauss() * 4); }
    dust.push(p, DUSTC, 18 + Math.random() * 16);
  }

  const shared = { uScale: { value: 800 }, uMaxPt: { value: 128 }, uTime: { value: 0 } };
  const materials = [], geos = [];
  const RO = 60;
  const mk = (cl, frag, order, bright, blending = THREE.AdditiveBlending, alpha = 1) => {
    const m = new THREE.ShaderMaterial({ uniforms: { ...shared, uBright: { value: bright }, uAlpha: { value: alpha } },
      vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending });
    const g = cl.geo(), pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = RO + order;
    materials.push(m); geos.push(g); body.add(pts); return pts;
  };
  const tailPts = mk(tail, STAR_FRAG, 0, isTouch ? 0.8 : 0.65);
  const diskPts = mk(disk, STAR_FRAG, 1, isTouch ? 0.7 : 0.5);
  const dustPts = mk(dust, DUST_FRAG, 3, 1, THREE.NormalBlending, isTouch ? 0.6 : 0.5);
  const knotPts = mk(knot, STAR_FRAG, 4, isTouch ? 0.85 : 0.7);

  // smooth glows: diffuse disk light, emissive yellow-white cores, far smudge
  const glowTex = radialTex([[0, 'rgba(255,235,205,0.55)'], [0.35, 'rgba(230,215,230,0.18)'], [1, 'rgba(0,0,0,0)']]);
  const coreTex = radialTex([[0, 'rgba(255,252,235,1)'], [0.08, 'rgba(255,240,195,0.7)'], [0.3, 'rgba(255,205,130,0.15)'], [1, 'rgba(255,170,90,0)']]);
  const sprites = [];
  const sprite = (tex, scale, pos, order, opacity = 1, color = 0xffffff) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    s.scale.setScalar(scale); s.position.copy(pos); s.renderOrder = RO + order; body.add(s); sprites.push(s); return s;
  };
  const diskGlows = gals.map((g) => sprite(glowTex, RD * 2.3, g.c, 0.5, 0.6));
  const cores = gals.map((g, k) => sprite(coreTex, k ? 190 : 220, g.c, 2, 0.75));
  const smudge = sprite(glowTex, RD * 3.2, new THREE.Vector3(10, 10, 0), -1, 0, 0xffe8d8);

  // ---- calibrate point sizes from the renderer/camera ----
  const _v2 = new THREE.Vector2(); let maxPtChecked = false;
  diskPts.onBeforeRender = (renderer, _s, camera) => {
    if (!maxPtChecked) { const gl = renderer.getContext(), r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); shared.uMaxPt.value = Math.min(128, r ? r[1] : 64); maxPtChecked = true; }
    renderer.getDrawingBufferSize(_v2);
    shared.uScale.value = _v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.isPerspectiveCamera ? camera.fov : 50) / 2));
  };

  // ---- label, distance label, beacon ----
  const labelEls = [];
  const makeLabel = (html, cls) => {
    const wrap = document.createElement('div'); wrap.className = 'galaxy-label-wrap';
    const lab = document.createElement('div'); lab.className = 'label galaxy-label ' + cls; lab.innerHTML = html;
    wrap.appendChild(lab); return { obj: new CSS2DObject(wrap), el: lab };
  };
  let label = null, distLabel = null;
  if (labels) {
    label = makeLabel('Antennae Galaxies', 'antennae-label');
    Object.assign(label.el.style, { color: '#ffd0ec', borderColor: 'rgba(255,170,220,0.6)', background: 'rgba(40,10,32,0.6)', pointerEvents: 'auto',
      cursor: 'pointer', minHeight: '44px', minWidth: '44px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center' });
    label.el.setAttribute('role', 'button'); label.el.setAttribute('aria-label', 'Antennae Galaxies: fly there or show info');
    label.obj.position.set(0, RD * 1.5, 0); group.add(label.obj); labelEls.push(label.el);
    distLabel = makeLabel('≈ 45 million light-years · in Corvus', 'small dist-label antennae-dist off');
    distLabel.obj.position.copy(SUN_POS).lerp(POS, 0.5); scene.add(distLabel.obj); labelEls.push(distLabel.el);
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints([SUN_POS.clone().addScaledVector(dir, 3000), POS.clone().addScaledVector(dir, -RD * 5)]);
  const distLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xffb8e0, transparent: true, opacity: 0.3, dashSize: 6000, gapSize: 4500, depthWrite: false }));
  distLine.computeLineDistances(); distLine.visible = false; scene.add(distLine);
  const beaconTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, color: 0xffc0e4, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, opacity: 0 }));
  beacon.position.copy(POS); beacon.renderOrder = 90; beacon.visible = false; scene.add(beacon);

  // ---- info panel (shared #info-panel DOM, same fields main.js fills for the Sombrero) ----
  const $ = (id) => document.getElementById(id);
  function showInfo() {
    const g = ANTENNAE_INFO; if (!$('info-panel')) return;
    $('info-name').textContent = g.name; $('info-name').style.color = g.color; $('info-type').textContent = g.type;
    ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => { const l = $(id + '-label'); if (l) l.textContent = g.rows[k][0]; if ($(id)) $(id).textContent = g.rows[k][1]; });
    $('info-phase-row')?.classList.add('hidden');
    $('info-fact').textContent = '💡 ' + g.fact;
    $('info-panel').classList.remove('hidden'); $('info-panel').scrollTop = 0; document.body.classList.add('info-open');
  }

  // ---- fly-to (own camera tween through public window.solar handles; no main.js hook) ----
  let fly = null, focused = false;
  const S_ = () => window.solar;
  function viewEnd(camera) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const d = Math.min(2300, 950 / tanH / Math.min(1, camera.aspect));   // frame the disks + inner tails (stay < main.js glide start, 2500)
    const off = ey.clone().multiplyScalar(-0.15).add(ez).normalize();
    return { cam: POS.clone().addScaledVector(off, d).addScaledVector(ey, -250), target: POS.clone().addScaledVector(ey, -250) };
  }
  function flyTo() {
    const s = S_(); if (!s) return;
    if (s.flyToAntennae) { s.flyToAntennae(); return; }   // ScaleBot: main.js scale-aware log-space fly-to when available
    const mode = s.getMode?.();
    if (mode === 'solar') { s.enterGalaxy?.(() => setTimeout(flyTo, 50)); return; }
    if (mode !== 'galaxy') return;
    const f = s.getGalaxyFocus?.();
    if (f === 'sgra') { s.leaveSgrA?.(() => flyTo()); return; }
    if (f === 'ton618') { s.leaveTon618?.(() => flyTo()); return; }
    if (s.isTransitioning?.()) return;
    const cam = s.camera, ctl = s.controls, e = viewEnd(cam);
    fly = { t: 0, start: performance.now(), dur: 5, p0: cam.position.clone(), t0: ctl.target.clone(), p1: e.cam, t1: e.target };
    // arc out through a point well back from both endpoints so the trip reads as a long journey
    fly.mid = fly.p0.clone().lerp(fly.p1, 0.5).addScaledVector(dir, -DIST * 0.15).add(new THREE.Vector3(0, DIST * 0.25, 0));
    ctl.enabled = false;
  }
  function stepFly() {   // wall-clock timed so slow frames do not stretch the trip
    const s = S_(), cam = s.camera, ctl = s.controls;
    fly.t = Math.min(1, (performance.now() - fly.start) / 1000 / fly.dur);
    const k = fly.t * fly.t * (3 - 2 * fly.t), u = 1 - k;
    cam.position.copy(fly.p0).multiplyScalar(u * u).addScaledVector(fly.mid, 2 * u * k).addScaledVector(fly.p1, k * k);
    ctl.target.copy(fly.t0).lerp(fly.t1, THREE.MathUtils.smoothstep(fly.t, 0, 0.6));
    cam.lookAt(ctl.target);
    if (fly.t >= 1) { fly = null; ctl.enabled = true; ctl.update?.(); focused = true; showInfo(); }
  }
  const onKey = (e) => {
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
      if (focused && !fly) showInfo(); else flyTo();
    }
  };
  window.addEventListener('keydown', onKey);
  label?.el.addEventListener('click', (e) => { e.stopPropagation(); if (S_()?.getMode?.() !== 'galaxy') return; if (focused) showInfo(); else flyTo(); });

  let lastT = performance.now(), time = 0, visible = true, glideOff = false;
  const _p = new THREE.Vector3();
  function update(camera, dtIn) {
    const now = performance.now(), dt = dtIn ?? Math.min((now - lastT) / 1000, 0.1); lastT = now;
    if (fly) stepFly();
    if (!visible) return;
    time += dt; shared.uTime.value = time;
    if (galaxy.spinning ?? true) body.rotation.z = 0.03 * Math.sin(time * 0.05);   // barely-there wobble while galaxies spin
    const pxPerUnit = shared.uScale.value / (window.devicePixelRatio || 1);
    const camPos = camera.getWorldPosition(_p), dA = camPos.distanceTo(POS), dMW = camPos.length();
    if (dA > 6000) focused = false;
    // main.js slides the orbit target toward the Local Group once the camera is > 2,500 units from it; that would yank the
    // view 450,000 units home as soon as you zoom out to see the tails. While orbiting the Antennae, pause that glide
    // through the public window.solar.setGlide handle (restored as soon as the orbit target leaves the Antennae).
    const s = S_();
    if (s?.setGlide && s.controls) {
      const near = !fly && s.controls.target.distanceTo(POS) < 3000 && s.getMode?.() === 'galaxy';
      if (near && !glideOff) { s.setGlide(false); glideOff = true; } else if (!near && glideOff) { s.setGlide(true); glideOff = false; }
    }
    const far = THREE.MathUtils.smoothstep(dA, 5000, 60000);
    smudge.material.opacity = 0.9 * far;
    for (const c of cores) c.material.opacity = 0.75 - 0.3 * far;
    const appPx = RD * 2 / dA * pxPerUnit, a = 1 - THREE.MathUtils.smoothstep(appPx, 3, 12);
    beacon.visible = a > 0.01; beacon.material.opacity = 0.85 * a; beacon.scale.setScalar(16 / pxPerUnit);
    const showLine = dMW > 40000 && dA > 40000;
    distLine.visible = showLine; distLabel?.el.classList.toggle('off', !showLine);
    label?.el.classList.toggle('off', dMW < 4500 && dA > 20000);
  }
  function setVisible(v) {
    visible = !!v; group.visible = visible; if (!visible) { distLine.visible = false; beacon.visible = false; }
    for (const el of labelEls) el.classList.toggle('off', !visible || el === distLabel?.el);
  }
  function dispose() {
    window.removeEventListener('keydown', onKey);
    for (const m of materials) m.dispose(); for (const g of [...geos, lineGeo]) g.dispose();
    for (const t of [glowTex, coreTex, beaconTex]) t.dispose();
    for (const s of [...sprites, beacon]) s.material.dispose(); distLine.material.dispose();
    for (const o of [group, distLine, beacon]) o.removeFromParent(); distLabel?.obj.removeFromParent();
    for (const el of labelEls) el.parentElement?.remove();
  }
  return {
    group, update, setVisible, dispose, flyTo, showInfo, labelEls, viewEnd, markFocused: () => { focused = true; }, POS, R: RD, dir, key: 'N',
    get isFlying() { return !!fly; },
    info: { ...ANTENNAE_INFO, position: POS.clone(), distanceUnits: DIST, los: los.clone(),
      counts: { disk: disk.count, tails: tail.count, knots: knot.count, dust: dust.count, total: disk.count + tail.count + knot.count + dust.count } },
  };
}
