// comets/index.js: Halley's Comet and Comet Hale-Bopp on their real elliptical orbits, with a blue ion tail pointing
// straight away from the Sun and a broader, curved dust tail that lags behind along the orbit. Both tails and the coma
// grow as the comet nears the Sun and vanish far out, where its ices stay frozen.
// Also the three interstellar visitors (comets/interstellar.js): 1I/'Oumuamua, 2I/Borisov and 3I/ATLAS on open hyperbolic
// paths (e > 1, hyperbolic Kepler equation M = e sinh H − H). Their paths are drawn as finite violet/magenta curves out to
// ~80 AU each way, fading at the ends, with bright dashes that flow in the direction of travel.
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
import { VISITORS } from './interstellar.js';
import { createAsteroids } from '../asteroids/index.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2, AU_KM = 149597870.7;
const RIBBON_N = 28;                 // centre-line points per tail
const DUST_CURL = 0.45;              // how far the dust tail bends back along the orbit (fraction of its length)
const VIS_R_MAX = 80;                // interstellar paths are drawn out to this distance from the Sun (AU) on each leg
const VIS_N = 600;                   // points per interstellar path
const K_GAUSS = 0.01720209895;       // Gaussian gravitational constant: √(GM☉) in AU^1.5 / day

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
// hyperbolic Kepler equation M = e sinh H − H (e > 1): Newton from Danby's log starter, converges for any M, even for the
// date picker's extremes (years 1000 / 3000, where H ≈ 10 and the visitors are thousands of AU out)
function solveHyperbolic(M, e) {
  if (!Number.isFinite(M)) return 0;
  let H = Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
  for (let k = 0; k < 60; k++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-12 * Math.max(1, Math.abs(H))) break;
  }
  return H;
}
// a < 0 for a hyperbola: x = a(cosh H − e) = |a|(e − cosh H), y = |a|√(e²−1) sinh H
const posFromH = (c, H, out) => toScene(c, c.a * (Math.cosh(H) - c.e), -c.a * Math.sqrt(c.e * c.e - 1) * Math.sinh(H), out);
const velDirFromH = (c, H, out) => toScene(c, -Math.sinh(H), Math.sqrt(c.e * c.e - 1) * Math.cosh(H), out).normalize();
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

// interstellar paths: open curves that fade out with distance from the Sun (aR, AU) and carry bright dashes running along
// the arc (aS, scene units) in the direction of travel, so the "in one side, out the other" motion reads at a glance
// They are screen-space ribbons a few pixels wide (each point doubled and pushed sideways in the vertex shader), since
// WebGL lines are 1 px and got lost among the planets' orbits.
const PATH_VERT = /* glsl */`
  attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aS; attribute float aR;
  uniform vec2 uRes; uniform float uWidth;
  varying float vS; varying float vR; varying float vSide;
  void main() {
    vS = aS; vR = aR; vSide = aSide;
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c = mvp * vec4(position, 1.0), p = mvp * vec4(aPrev, 1.0), n = mvp * vec4(aNext, 1.0);
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec2 cs = c.xy / max(abs(c.w), 1e-6) * asp;
    vec2 ps = p.w > 1e-6 ? p.xy / p.w * asp : cs;
    vec2 ns = n.w > 1e-6 ? n.xy / n.w * asp : cs;
    vec2 dir = ns - ps;
    dir = dot(dir, dir) > 1e-12 ? normalize(dir) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x); nrm.x /= asp.x;
    if (c.w > 1e-6) c.xy += nrm * aSide * (uWidth / uRes.y) * c.w;
    gl_Position = c;
  }`;
const PATH_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uTime, uOpacity, uDash, uRFade;
  varying float vS; varying float vR; varying float vSide;
  void main() {
    float fade = 1.0 - smoothstep(uRFade * 0.3, uRFade, vR);
    float ph = fract(vS / uDash - uTime * 0.3);          // pattern moves towards +s, the direction of motion
    float head = pow(ph, 3.0) * (1.0 - smoothstep(0.93, 1.0, ph));   // bright front, soft trailing fade: little arrows
    float a = uOpacity * fade * (0.35 + 0.65 * head) * (1.0 - smoothstep(0.45, 1.0, abs(vSide)));
    gl_FragColor = vec4(uColor * (0.8 + 0.6 * head), a);
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
  // asteroids/: famous asteroids and near-Earth objects (Apophis, Bennu, Ryugu, Didymos, Psyche, Eros, 2024 YR4), hooked
  // in here so main.js needs no changes; exposed as comets.asteroids for search/ and ui/
  const asteroids = createAsteroids({ scene, bodies, isTouch, scaleDistance, orbitLines });
  const glowTex = glowTexture();
  const scaleK = (r) => scaleDistance(r) / r;   // scene units per AU sideways at distance r (radial compression keeps directions)

  const toggle = document.getElementById('toggle-comets');
  let on = toggle ? toggle.checked : true;
  toggle?.addEventListener('change', () => { on = toggle.checked; });

  const items = [...COMETS, ...VISITORS].map((c, k) => {
    const hyp = !!c.hyperbolic;
    const it = { name: c.name, info: c, prio: 2 - k, posAU: new THREE.Vector3(), velDir: new THREE.Vector3(), pos: new THREE.Vector3(),
      activity: 0, r: 0, inbound: false, markerPx: isTouch ? 10 : 8, hyperbolic: hyp };
    let line;
    it.orbitAU = [];
    if (hyp) {
      // open path from VIS_R_MAX AU in to perihelion and back out, sampled densely near perihelion (H = Hmax·s³)
      const Hmax = Math.acosh((VIS_R_MAX / -c.a + 1) / c.e);
      for (let i = 0; i <= VIS_N; i++) { const s = -1 + (2 * i) / VIS_N; it.orbitAU.push(posFromH(c, Hmax * s * s * s, new THREE.Vector3())); }
      // two vertices per point (aSide = ±1), pushed apart on screen by the vertex shader
      const n2 = (VIS_N + 1) * 2, geo = new THREE.BufferGeometry(), idx = [];
      for (const nm of ['position', 'aPrev', 'aNext']) geo.setAttribute(nm, new THREE.BufferAttribute(new Float32Array(n2 * 3), 3));
      geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n2), 1));
      geo.setAttribute('aR', new THREE.BufferAttribute(Float32Array.from({ length: n2 }, (_, j) => it.orbitAU[j >> 1].length()), 1));
      geo.setAttribute('aSide', new THREE.BufferAttribute(Float32Array.from({ length: n2 }, (_, j) => (j & 1 ? 1 : -1)), 1));
      for (let i = 0; i < VIS_N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      it.pathMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(c.color) }, uTime: { value: 0 }, uOpacity: { value: 0.9 }, uDash: { value: 2.4 },
          uRFade: { value: VIS_R_MAX }, uRes: { value: new THREE.Vector2(1280, 800) }, uWidth: { value: isTouch ? 3.2 : 2.6 } },
        vertexShader: PATH_VERT, fragmentShader: PATH_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      line = it.orbitLine = new THREE.Mesh(geo, it.pathMat);
      line.renderOrder = 2;
      layoutPath(it);
    } else {
      // orbit: sampled densely near perihelion (E = π·s³), where the curve turns sharply for e ≈ 1
      for (let i = 0; i < 720; i++) { const s = -1 + (2 * i) / 720; it.orbitAU.push(posFromE(c, Math.PI * s * s * s, new THREE.Vector3())); }
      const pts = it.orbitAU.map((p) => scaleAU(p.clone(), scaleDistance));
      line = it.orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.3, depthWrite: false }));
    }
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
    const rock = c.rock;                 // 'Oumuamua: a bare, elongated, reddish body (no coma), tumbling
    it.nucleus = new THREE.Mesh(ng, new THREE.MeshStandardMaterial(rock
      ? { color: rock.color, roughness: 0.9, metalness: 0, emissive: 0x6a3020 }
      : { color: 0x3a3632, roughness: 1, metalness: 0, emissive: 0x0b0a09 }));
    // the geometry is already 1.5× long in x; rock.size is the half-length of the long axis (scene units, enlarged like all nuclei)
    if (rock) it.nucleus.scale.set(rock.stretch[0] / 1.5, rock.stretch[1], rock.stretch[2]).multiplyScalar(rock.size / rock.stretch[0]);
    else it.nucleus.scale.setScalar(c.nucleusKm > 30 ? 0.05 : 0.035);
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
    el.className = 'label small solar-label comet-label' + (it.hyperbolic ? ' visitor-label' : '');
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
      const km = r * AU_KM, kmText = km >= 1e12 ? `${fmtN(km / 1e12, 2)} trillion km` : km >= 1e9 ? `${fmtN(km / 1e9, 2)} billion km` : `${fmtN(km / 1e6)} million km`;
      if (it.hyperbolic) {
        const where = r < c.q * 1.05 ? 'at its closest to the Sun' : it.inbound ? 'falling in from interstellar space' : 'leaving the Solar System for good';
        const act = !c.rOn ? '' : it.activity >= 0.01 ? ` · showing ${c.tailText}` : ' · no coma this far out';
        return `${fmtN(r, r < 10 ? 2 : r < 1000 ? 1 : 0)} AU (${kmText}), ${where}${act}`;
      }
      const near = r < c.q * 1.05 ? 'at its closest to the Sun' : r > c.a * (1 + c.e) * 0.97 ? 'near its farthest point' : it.inbound ? 'heading in' : 'heading out';
      return `${r.toFixed(r < 10 ? 2 : 1)} AU (${kmText}), ${near}`;
    }
    if (label === 'Speed') {
      // vis-viva: v² = GM(2/r − 1/a); far from the Sun it settles to v∞ = √(GM/|a|)
      const kms = (v) => v * AU_KM / 86400;
      const v = kms(K_GAUSS * Math.sqrt(Math.max(0, 2 / r - 1 / c.a))), vInf = kms(K_GAUSS * Math.sqrt(-1 / c.a));
      return `${fmtN(v, 1)} km/s now · ${fmtN(vInf, 1)} km/s far from the Sun (v∞), too fast for the Sun to hold`;
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
        if (it.hyperbolic) {
          const Hh = solveHyperbolic(c.n * (days - c.T), c.e);
          posFromH(c, Hh, it.posAU);
          velDirFromH(c, Hh, it.velDir);
          it.inbound = Hh < 0;
          it.pathMat.uniforms.uTime.value = time;
          it.pathMat.uniforms.uRes.value.set(W, H);
        } else {
          const M = ((days - c.T) / c.period) * TAU;
          const E = solveKepler(M, c.e);
          posFromE(c, E, it.posAU);
          velDirFromE(c, E, it.velDir);
          it.inbound = Math.sin(E) < 0;
        }
        it.r = it.posAU.length();
        it.pos.copy(scaleAU(_a.copy(it.posAU), scaleDistance));
        it.head.position.copy(it.pos);
        // activity: ∝ 1/r² inside rOn, 1 at perihelion
        const f = c.rOn > 0 ? THREE.MathUtils.clamp(((c.rOn / it.r) ** 2 - 1) / ((c.rOn / c.q) ** 2 - 1), 0, 1) : 0;
        it.activity = f;
        const dist = cam.distanceTo(it.pos), k = scaleK(it.r);
        it.marker.scale.setScalar(it.markerPx * 2 * tanH / H);
        const comaSize = (0.12 + 0.9 * Math.sqrt(f)) * Math.min(1.6, k / 20);
        it.coma.visible = f > 0.002;
        it.coma.scale.setScalar(comaSize);
        it.coma.material.opacity = 0.25 + 0.65 * Math.sqrt(f);
        it.marker.material.opacity = 1 - THREE.MathUtils.smoothstep(comaSize / dist * pxPerUnit, 10, 30) * 0.7;
        const nucPx = it.nucleus.scale.x / dist * pxPerUnit;
        it.nucleus.visible = f < 0.01 && nucPx > 1.2;   // hidden in the bright coma when active
        if (c.rock) {                                     // bare rock: let the shape show through the marker up close; tumble
          it.marker.material.opacity = 1 - THREE.MathUtils.smoothstep(nucPx, 5, 18) * 0.6;
          it.nucleus.rotation.x += dt * 0.23; it.nucleus.rotation.y += dt * 0.41;
        } else it.nucleus.rotation.y += dt * 0.3;
        // tails
        const showTails = f > 0.003;
        it.ion.visible = showTails && c.ionAU > 0; it.dust.visible = showTails && c.dustAU > 0;
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
    asteroids.update(days, camera, dt, on ? placed : []);   // their labels avoid the comet labels placed just now
    if (open) {
      if (!isOpenHere()) release();
      else if (performance.now() - lastRefresh > 300) { lastRefresh = performance.now(); fillRows(open, true); }
    }
  }

  // labels: never over main.js's labels; above the marker, else below, else hidden. On touch every label has a ≥ 44 px tap
  // area (CSS ::before, 12 px above/below, 8 px to the sides), so keep those areas apart too, or a tap could land on a neighbour.
  const PX = isTouch ? 8 : 0, PY = isTouch ? 12 : 0;
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
      bodyRects.push([cx - w / 2 - PX, cy - h / 2 - PY, cx + w / 2 + PX, cy + h / 2 + PY]);
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
        const r = [cx - w / 2 - 2 - PX, cy + off - h / 2 - 2 - PY, cx + w / 2 + 2 + PX, cy + off + h / 2 + 2 + PY];
        if (!overlaps(r, bodyRects) && !overlaps(r, placed)) { dy = off; placed.push(r); break; }
      }
      it.labelObj.position.copy(it.pos);
      it.labelObj.visible = dy !== null;
      if (dy !== null && el._dy !== dy) { el.style.transform = `translateY(${Math.round(dy)}px)`; el._dy = dy; }
    }
  }

  // redraw the orbit lines after main.js's distance scale changes (positions and tails follow by themselves)
  function layoutPath(it) {
    const geo = it.orbitLine.geometry, A = geo.attributes, n = it.orbitAU.length;
    const pts = it.orbitAU.map((p) => scaleAU(p.clone(), scaleDistance));
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += pts[i].distanceTo(pts[i - 1]);
      const q = pts[i], pv = pts[Math.max(0, i - 1)], nx = pts[Math.min(n - 1, i + 1)];
      for (const j of [i * 2, i * 2 + 1]) {
        A.position.setXYZ(j, q.x, q.y, q.z); A.aPrev.setXYZ(j, pv.x, pv.y, pv.z); A.aNext.setXYZ(j, nx.x, nx.y, nx.z); A.aS.setX(j, s);
      }
    }
    for (const nm of ['position', 'aPrev', 'aNext', 'aS']) A[nm].needsUpdate = true;
    geo.computeBoundingSphere();
  }
  function rebuild() {
    asteroids.rebuild();
    for (const it of items) {
      if (it.hyperbolic) { layoutPath(it); continue; }
      const pos = it.orbitLine.geometry.attributes.position;
      it.orbitAU.forEach((p, i) => { _a.copy(p); scaleAU(_a, scaleDistance); pos.setXYZ(i, _a.x, _a.y, _a.z); });
      pos.needsUpdate = true; it.orbitLine.geometry.computeBoundingSphere();
    }
  }

  return {
    group: root, items, update, rebuild, asteroids,
    showInfo: (name) => { const it = items.find((i) => i.name === name || i.info.short === name); return it ? showInfo(it) : false; },
    get: (name) => items.find((i) => i.name === name || i.info.short === name),
    stats: () => ({ on, comets: items.map((i) => ({ name: i.info.short, r: +i.r.toFixed(3), activity: +i.activity.toFixed(3),
      tails: i.ion.visible || i.dust.visible, label: i.labelObj.visible,
      ...(i.hyperbolic ? { inbound: i.inbound, posAU: i.posAU.toArray().map((x) => +x.toFixed(4)) } : {}) })), open: open && open.info.short }),
  };
}
