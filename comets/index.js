// comets/index.js: Halley's Comet and Comet Hale-Bopp on their real elliptical orbits, with a blue ion tail pointing
// straight away from the Sun and a broader, curved dust tail that lags behind along the orbit. Both tails and the coma
// grow as the comet nears the Sun and vanish far out, where its ices stay frozen.
//
// Usage (main.js):
//   import { createComets } from './comets/index.js';
//   const comets = createComets({ scene, bodies, renderer, isTouch, scaleDistance, orbitLines });
//   ...each solar-view frame: comets.update(daysSinceJ2000, camera, dt);
//
// Positions: Kepler orbits from J2000 ecliptic elements (comets/data.js), solved with a starter that converges for
// e ≈ 1, then main.js's radial distance compression (scaleAU). Tails have real lengths at perihelion (Halley ~0.25 AU
// ion, Hale-Bopp ~0.6 AU) and are drawn with one uniform local scale, the compressed orbit's sideways scale at the
// comet (scaleDistance(r) / r), so their shape and their size next to the orbits around them stay true. They are
// camera-facing additive ribbons: a few dozen vertices updated per frame, one draw call each. Each comet has a label that opens an info card, and the
// #toggle-comets Layers checkbox hides everything; the orbits also follow the Orbits checkbox.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scaleAU } from '../smallbodies.js';
import { COMETS } from './data.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2, AU_KM = 149597870.7;
const RIBBON_N = 28;                 // centre-line points per tail
const DUST_CURL = 0.45;              // how far the dust tail bends back along the orbit (fraction of its length)

// Kepler's equation with Danby's starter: converges for every M even when e is within 0.005 of 1 (Hale-Bopp)
function solveKepler(M, e) {
  M = ((M + Math.PI) % TAU + TAU) % TAU - Math.PI;
  let E = M + 0.85 * e * Math.sign(Math.sin(M) || 1);
  for (let k = 0; k < 40; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}
// orbital plane (x toward perihelion) → J2000 ecliptic → scene axes (x = ecl X, y = ecl Z, z = −ecl Y; as smallbodies.js)
function toScene(c, xo, yo, out) {
  const w = c.peri * D2R, O = c.node * D2R, inc = c.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const X = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const Y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const Z = (sw * si) * xo + (cw * si) * yo;
  return out.set(X, Z, -Y);
}
const posFromE = (c, E, out) => toScene(c, c.a * (Math.cos(E) - c.e), c.a * Math.sqrt(1 - c.e * c.e) * Math.sin(E), out);
const velDirFromE = (c, E, out) => toScene(c, -Math.sin(E), Math.sqrt(1 - c.e * c.e) * Math.cos(E), out).normalize();

function canvasTexture(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTexture = () => canvasTexture(128, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});

const RIBBON_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha, uTime, uStreak, uFalloff;
  varying vec2 vUv;
  void main() {
    float s = vUv.x, v = vUv.y * 2.0 - 1.0;
    float across = exp(-v * v * 3.2);
    float along = smoothstep(0.0, 0.04, s) * pow(1.0 - s, uFalloff);
    // ion tail: faint streamers that drift outward; dust tail: smooth
    float streak = 1.0 + uStreak * (0.16 * sin(v * 17.0 + s * 5.0 - uTime * 1.1) + 0.1 * sin(v * 31.0 - s * 11.0 - uTime * 1.7));
    float a = clamp(uAlpha * across * along * streak, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
  }`;

function makeRibbon(color, alpha, streak, falloff) {
  const n = RIBBON_N, geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const uv = new Float32Array(n * 2 * 2), idx = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    uv.set([s, 0, s, 1], i * 4);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uStreak: { value: streak },
      uFalloff: { value: falloff } },
    vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;          // vertices move every frame
  mesh.renderOrder = 3;
  mesh.userData.baseAlpha = alpha;
  mesh.userData.pts = Array.from({ length: n }, () => new THREE.Vector3());
  mesh.userData.w = new Float32Array(n);
  return mesh;
}
const _t = new THREE.Vector3(), _vw = new THREE.Vector3(), _side = new THREE.Vector3();
function layoutRibbon(mesh, cam) {
  const { pts, w } = mesh.userData, n = pts.length, pos = mesh.geometry.attributes.position;
  for (let i = 0; i < n; i++) {
    _t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]);
    _vw.subVectors(cam, pts[i]);
    _side.crossVectors(_t, _vw);
    if (_side.lengthSq() < 1e-14) _side.set(0, 1, 0).cross(_t);
    _side.normalize().multiplyScalar(w[i]);
    pos.setXYZ(i * 2, pts[i].x - _side.x, pts[i].y - _side.y, pts[i].z - _side.z);
    pos.setXYZ(i * 2 + 1, pts[i].x + _side.x, pts[i].y + _side.y, pts[i].z + _side.z);
  }
  pos.needsUpdate = true;
}

export function createComets({ scene, bodies, renderer, isTouch = false, scaleDistance, orbitLines = [] }) {
  const root = new THREE.Group(); root.name = 'Comets';
  const labelRoot = new THREE.Group();
  root.add(labelRoot);
  scene.add(root);
  const glowTex = glowTexture();
  const scaleK = (r) => scaleDistance(r) / r;   // scene units per AU sideways at distance r (radial compression keeps directions)

  const toggle = document.getElementById('toggle-comets');
  let on = toggle ? toggle.checked : true;
  toggle?.addEventListener('change', () => { on = toggle.checked; });

  const items = COMETS.map((c, k) => {
    const it = { name: c.name, info: c, prio: 2 - k, posAU: new THREE.Vector3(), velDir: new THREE.Vector3(), pos: new THREE.Vector3(),
      activity: 0, r: 0, inbound: false, markerPx: isTouch ? 10 : 8 };
    // orbit: sampled densely near perihelion (E = π·s³), where the curve turns sharply for e ≈ 1
    const pts = [];
    for (let i = 0; i < 720; i++) { const s = -1 + (2 * i) / 720; pts.push(scaleAU(posFromE(c, Math.PI * s * s * s, new THREE.Vector3()), scaleDistance)); }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.3, depthWrite: false }));
    orbitLines.push(line);
    it.orbitWrap = new THREE.Group(); it.orbitWrap.add(line);
    root.add(it.orbitWrap);
    // head: constant-size marker dot (always findable) + coma glow that swells near the Sun + a tiny dark nucleus
    it.head = new THREE.Group(); root.add(it.head);
    it.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c.color, transparent: true, depthWrite: false, sizeAttenuation: false }));
    it.coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xd8f4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ng = new THREE.IcosahedronGeometry(1, 1), np = ng.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < np.count; i++) { v.fromBufferAttribute(np, i); v.multiplyScalar(1 + 0.25 * Math.sin(v.x * 3 + k) * Math.cos(v.y * 2.3)); np.setXYZ(i, v.x * 1.5, v.y, v.z); }
    ng.computeVertexNormals();
    it.nucleus = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1, metalness: 0, emissive: 0x0b0a09 }));
    it.nucleus.scale.setScalar(c.nucleusKm > 30 ? 0.05 : 0.035);
    it.head.add(it.marker, it.coma, it.nucleus);
    // tails: ion (narrow, blue, straight away from the Sun) and dust (broad, cream, curving back along the orbit)
    it.ion = makeRibbon(0x6fa8ff, 0.95, 1, 1.2);
    it.dust = makeRibbon(0xffe6bf, 0.9, 0, 1.25);
    root.add(it.dust, it.ion);
    makeLabel(it);
    return it;
  });

  // ---- labels: the wrapper is positioned by CSS2DRenderer, the label inside it is nudged off the marker ---------------
  function makeLabel(it) {
    const wrap = document.createElement('div'); wrap.className = 'comet-wrap';
    const el = document.createElement('div');
    el.className = 'label small solar-label comet-label';
    el.textContent = it.info.short;
    el.title = it.info.name;
    wrap.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(it); });
    it.labelObj = new CSS2DObject(wrap); it.labelObj.visible = false;
    it.labelEl = el; el._dy = null;
    labelRoot.add(it.labelObj);
  }

  // ---- info card (fills main.js's #info-panel) ------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  let open = null, lastRefresh = 0;
  const fmtN = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  function liveValue(it, label) {
    const c = it.info, r = it.r;
    if (label === 'Distance from Sun') {
      const km = r * AU_KM, kmText = km >= 1e9 ? `${fmtN(km / 1e9, 2)} billion km` : `${fmtN(km / 1e6)} million km`;
      const near = r < c.q * 1.05 ? 'at its closest to the Sun' : r > c.a * (1 + c.e) * 0.97 ? 'near its farthest point' : it.inbound ? 'heading in' : 'heading out';
      return `${r.toFixed(r < 10 ? 2 : 1)} AU (${kmText}), ${near}`;
    }
    if (it.activity < 0.01) return `None: at ${fmtN(r, r < 10 ? 1 : 0)} AU from the Sun its ices stay frozen`;
    const mkm = (au) => fmtN(au * it.activity * AU_KM / 1e6);
    return `Ion tail ~${mkm(c.ionAU)} million km, dust tail ~${mkm(c.dustAU)} million km (longest at perihelion)`;
  }
  function fillRows(it, liveOnly) {
    it.info.rows.forEach(([label, value], k) => {
      if (k > 3 || (liveOnly && value !== 'live')) return;
      const id = ['info-diameter', 'info-distance', 'info-period', 'info-day'][k];
      if (!liveOnly) $(id + '-label').textContent = label;
      $(id).textContent = value === 'live' ? liveValue(it, label) : value;
    });
  }
  function showInfo(it) {
    if (!panel) return false;
    $('info-name').textContent = it.info.name; $('info-name').style.color = it.info.color; $('info-type').textContent = it.info.type;
    fillRows(it, false);
    $('info-fact').textContent = '💡 ' + it.info.fact;
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const o of items) o.labelEl.classList.toggle('active', o === it);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = it; lastRefresh = performance.now();
    return true;
  }
  const isOpenHere = () => open && !panel.classList.contains('hidden') && $('info-name').textContent === open.info.name;
  function release() {
    if (open) open.labelEl.classList.remove('active');
    open = null;
    if (closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
  }
  // ✕ on a comet card just closes the card (main.js's own ✕ handler would fly back to the overview)
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    panel.classList.add('hidden');
    document.body.classList.remove('info-open');
    release();
  }, true);

  // ---- per frame ------------------------------------------------------------------------------------------------------
  const occ = bodies.filter((b) => b.name === 'Sun' || (!b.isMoon && !b.isSmall)).map((b) => ({ b, c: new THREE.Vector3(), r: 0 }));
  const _u = new THREE.Vector3(), _vp = new THREE.Vector3(), _a = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3();
  let time = 0;
  function occluded(p, cam) {
    _v.subVectors(p, cam);
    const L = _v.length(); _v.divideScalar(L);
    for (const o of occ) {
      _c.subVectors(o.c, cam);
      const tca = _c.dot(_v);
      if (tca <= 0) continue;
      const d2 = _c.lengthSq() - tca * tca;
      if (d2 < o.r * o.r && tca - Math.sqrt(o.r * o.r - d2) < L) return true;
    }
    return false;
  }

  function update(days, camera, dt = 1 / 60) {
    root.visible = on;
    for (const it of items) it.labelObj.visible = false;
    if (on) {
      time += dt;
      const cam = camera.position;
      const H = renderer.domElement.clientHeight || window.innerHeight, W = renderer.domElement.clientWidth || window.innerWidth;
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), pxPerUnit = H / (2 * tanH);
      for (const o of occ) { o.b.group.getWorldPosition(o.c); o.r = o.b.radius; }
      const cands = [];
      for (const it of items) {
        const c = it.info;
        const M = ((days - c.T) / c.period) * TAU;
        const E = solveKepler(M, c.e);
        posFromE(c, E, it.posAU);
        velDirFromE(c, E, it.velDir);
        it.r = it.posAU.length();
        it.inbound = Math.sin(E) < 0;
        it.pos.copy(scaleAU(_a.copy(it.posAU), scaleDistance));
        it.head.position.copy(it.pos);
        // activity: ∝ 1/r² inside rOn, 1 at perihelion
        const f = THREE.MathUtils.clamp(((c.rOn / it.r) ** 2 - 1) / ((c.rOn / c.q) ** 2 - 1), 0, 1);
        it.activity = f;
        const dist = cam.distanceTo(it.pos), k = scaleK(it.r);
        it.marker.scale.setScalar(it.markerPx * 2 * tanH / H);
        const comaSize = (0.12 + 0.9 * Math.sqrt(f)) * Math.min(1.6, k / 20);
        it.coma.visible = f > 0.002;
        it.coma.scale.setScalar(comaSize);
        it.coma.material.opacity = 0.25 + 0.65 * Math.sqrt(f);
        it.marker.material.opacity = 1 - THREE.MathUtils.smoothstep(comaSize / dist * pxPerUnit, 10, 30) * 0.7;
        it.nucleus.visible = f < 0.01 && it.nucleus.scale.x / dist * pxPerUnit > 1.2;   // hidden in the bright coma when active
        it.nucleus.rotation.y += dt * 0.3;
        // tails
        const showTails = f > 0.003;
        it.ion.visible = it.dust.visible = showTails;
        if (showTails) {
          _u.copy(it.posAU).normalize();                                      // away from the Sun
          _vp.copy(it.velDir).addScaledVector(_u, -it.velDir.dot(_u));         // motion across the Sun line
          if (_vp.lengthSq() > 1e-10) _vp.normalize();
          const Li = c.ionAU * f, Ld = c.dustAU * f;
          const { pts: pi, w: wi } = it.ion.userData, { pts: pd, w: wd } = it.dust.userData;
          for (let i = 0; i < RIBBON_N; i++) {
            const s = i / (RIBBON_N - 1);
            pi[i].copy(it.pos).addScaledVector(_u, Li * s * k);
            wi[i] = (0.008 + 0.035 * s) * Math.max(Li, 0.08) * k;
            pd[i].copy(it.pos).addScaledVector(_u, Ld * s * k).addScaledVector(_vp, -Ld * DUST_CURL * s * s * k);
            wd[i] = (0.03 + 0.25 * s) * Math.max(Ld, 0.06) * k;
          }
          layoutRibbon(it.ion, cam); layoutRibbon(it.dust, cam);
          it.ion.material.uniforms.uAlpha.value = it.ion.userData.baseAlpha * Math.min(1, 0.35 + f);
          it.dust.material.uniforms.uAlpha.value = it.dust.userData.baseAlpha * Math.min(1, 0.35 + f);
          it.ion.material.uniforms.uTime.value = time;
        }
        if (!occluded(it.pos, cam)) cands.push(it);
      }
      placeLabels(camera, cands, W, H);
    }
    if (open) {
      if (!isOpenHere()) release();
      else if (performance.now() - lastRefresh > 300) { lastRefresh = performance.now(); fillRows(open, true); }
    }
  }

  // labels: never over main.js's labels; above the marker, else below, else hidden
  const bodyRects = [], placed = [];
  const overlaps = (r, list) => list.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  function placeLabels(camera, cands, W, H) {
    bodyRects.length = 0; placed.length = 0;
    if (!cands.length) return;
    for (const b of bodies) {
      const lab = b.labelEl;
      if (!lab || !lab._obj || lab.classList.contains('overlap')) continue;
      lab._obj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, w = lab._w || lab.textContent.length * 7 + 18, h = lab._h || 20;
      bodyRects.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
    }
    cands.sort((a, b) => b.prio - a.prio);
    for (const it of cands) {
      _v.copy(it.pos).project(camera);
      if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, el = it.labelEl;
      if (!el._w && el.offsetWidth) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
      const w = el._w || el.textContent.length * 6.5 + 18, h = el._h || 20, gap = it.markerPx / 2 + h / 2 + 3;
      let dy = null;
      for (const off of [-gap, gap, -gap - h - 2, gap + h + 2]) {
        const r = [cx - w / 2 - 2, cy + off - h / 2 - 2, cx + w / 2 + 2, cy + off + h / 2 + 2];
        if (!overlaps(r, bodyRects) && !overlaps(r, placed)) { dy = off; placed.push(r); break; }
      }
      it.labelObj.position.copy(it.pos);
      it.labelObj.visible = dy !== null;
      if (dy !== null && el._dy !== dy) { el.style.transform = `translateY(${Math.round(dy)}px)`; el._dy = dy; }
    }
  }

  return {
    group: root, items, update,
    showInfo: (name) => { const it = items.find((i) => i.name === name || i.info.short === name); return it ? showInfo(it) : false; },
    get: (name) => items.find((i) => i.name === name || i.info.short === name),
    stats: () => ({ on, comets: items.map((i) => ({ name: i.info.short, r: +i.r.toFixed(3), activity: +i.activity.toFixed(3),
      tails: i.ion.visible, label: i.labelObj.visible })), open: open && open.info.short }),
  };
}
