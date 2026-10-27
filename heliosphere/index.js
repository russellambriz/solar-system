// heliosphere/: the Sun's heliosphere at the sim's (compressed) AU scale, and where the two Voyagers crossed its boundaries.
// Numbers and sources: heliosphere/data.js and the 2026-10-26 CHANGELOG entry.
//
// Usage (main.js, after search/ exists):
//   import { createHeliosphere } from './heliosphere/index.js';
//   const heliosphere = createHeliosphere({ scene, bodies, spacecraft, search, scaleDistance, flyTo, exitGalaxy, getMode,
//     releaseFocus, getMaxDist, isTouch });
//   ...each solar-view frame: heliosphere.update(days, camera, dt);
//
// What is drawn (one Group, 3 shell meshes + 1 LineSegments + 4 sprites, all additive, depthWrite off):
//   • Termination shock (amber), heliosheath (faint violet, halfway) and heliopause (blue) as thin fresnel-rimmed shells.
//     Shape: a blunt nose facing the interstellar wind (from λ 255.7°, β 5.1°) and a tail downwind.
//       heliopause      r(φ) = R0 · √(2 / (1 + cos φ)) · (1 + β·sin(ecliptic latitude))   (Rankine half-body: a source in a
//                       uniform flow, the classic first model of the heliopause), cut off 150° from the nose with a fade
//       termination sh. r(φ) = R0 · (1 + 0.9·((1 − cos φ)/2)^1.5) · (1 + β·sin(lat))       (closed, ~1.9× farther downwind)
//     φ is the angle from the nose. R0 and β of each surface are solved so it passes exactly through both Voyager crossings
//     (V1 94 / 121.6 AU at ~35° N, V2 84 / 119 AU at ~39° S): β > 0 squashes the south, as the Voyagers found.
//     Every vertex keeps its true direction and is moved radially by main.js's scaleDistance(), so the scale slider works.
//   • Streamlines of the interstellar wind flowing around the nose (Rankine streamlines, same β), with dashes drifting downwind.
//   • Voyager 1 and 2 crossing markers + labels with the dates, placed on the probes' real outbound legs from spacecraft/
//     (the point of each leg at the crossing distance).
//   • Labels (tap/click → card in main.js's #info-panel): Termination shock, Heliosheath, Heliopause, Heliotail,
//     Interstellar wind, and the four crossings. Search entries; Layers → Heliosphere (remembered).
// The whole thing fades in only once the camera is outside the termination shock, so the planets view is untouched.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { raDecToScene } from '../constellations/index.js';
import { INFLOW, CROSSINGS, FALLBACK_DIR, CARDS } from './data.js';

const D2R = Math.PI / 180;
const HP_PHI_MAX = 160 * D2R;
const gHP = (c) => Math.sqrt(2 / Math.max(1e-4, 1 + c));
const gTS = (c) => 1 + 0.9 * Math.pow(Math.max(0, (1 - c) / 2), 1.5);
const eclDir = (lon, lat, out = new THREE.Vector3()) => {
  const l = lon * D2R, b = lat * D2R;
  return out.set(Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l));   // scene axes: (X, Z, −Y) of the ecliptic
};

const SHELL_VERT = /* glsl */`
  attribute float aPhi;
  varying vec3 vN; varying vec3 vV; varying float vPhi;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vPhi = aPhi;
    gl_Position = projectionMatrix * mv;
  }`;
const SHELL_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity, uBase, uPow, uTail0, uTail1, uNose, uTime, uRipple;
  varying vec3 vN; varying vec3 vV; varying float vPhi;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, uPow);
    float tail = 1.0 - smoothstep(uTail0, uTail1, vPhi);
    float nose = 1.0 + uNose * (1.0 - smoothstep(0.0, 0.9, vPhi));
    float ripple = 1.0 + uRipple * sin(vPhi * 26.0 - uTime * 0.6);
    float a = uOpacity * (uBase + rim) * tail * nose * ripple;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
const LINE_VERT = /* glsl */`
  attribute float aS; attribute float aFade;
  varying float vS; varying float vF;
  void main() { vS = aS; vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LINE_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity, uTime;
  varying float vS; varying float vF;
  void main() {
    float d = fract(vS * 9.0 - uTime * 0.25);
    float dash = smoothstep(0.0, 0.15, d) * (1.0 - smoothstep(0.45, 0.7, d));
    float a = uOpacity * vF * (0.25 + 0.75 * dash);
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

function glowTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createHeliosphere({ scene, bodies = [], spacecraft, search, scaleDistance, flyTo, exitGalaxy, getMode, releaseFocus, getMaxDist, isTouch = false }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./heliosphere.css', import.meta.url).href;
  document.head.appendChild(css);

  const root = new THREE.Group(); root.name = 'Heliosphere'; root.visible = false;
  scene.add(root);

  // ---- Layers toggle (remembered) ------------------------------------------------------------------------------------
  const store = { get: (k) => { try { return localStorage.getItem('solar.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('solar.' + k, v); } catch (e) { /* private mode */ } } };
  const toggle = document.getElementById('toggle-heliosphere');
  let on = store.get('heliosphere') !== '0';
  if (toggle) toggle.checked = on;
  const setOn = (v) => { on = !!v; if (toggle) toggle.checked = on; store.set('heliosphere', on ? '1' : '0'); if (!on) release(true); };
  toggle?.addEventListener('change', () => setOn(toggle.checked));

  // ---- frame: nose direction n, and two axes across it (e1 toward ecliptic north) --------------------------------------
  const n = eclDir(INFLOW.lon, INFLOW.lat);
  const e1 = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();

  // ---- Voyager crossing points on the probes' real outbound legs (spacecraft/ tracks, AU, scene axes) ------------------
  const crossings = CROSSINGS.map((c) => {
    const it = spacecraft?.get?.(c.probe);
    let p = null, simT = null;
    const pts = it?.track?.pts;
    if (pts && pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const ab = b.p.clone().sub(a.p);                                   // |a + t·ab| = d  →  quadratic in t
      const A = ab.lengthSq(), B = 2 * a.p.dot(ab), C = a.p.lengthSq() - c.au * c.au;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) { const t = (-B + Math.sqrt(disc)) / (2 * A); p = a.p.clone().addScaledVector(ab, t); simT = a.t + t * (b.t - a.t); }
    }
    if (!p) { const [ra, dec] = FALLBACK_DIR[c.probe]; p = raDecToScene(ra * 15, dec).multiplyScalar(c.au); }
    return { ...c, posAU: p, dir: p.clone().normalize(), simT, color: it?.info?.color || (c.probe === 'Voyager 1' ? '#8fd3ff' : '#c6b2ff') };
  });
  // solve R0 and β so the surface passes through both crossings: R0·g(φi)·(1 + β·yi) = di
  function fit(boundary, g) {
    const [c1, c2] = ['Voyager 1', 'Voyager 2'].map((pr) => crossings.find((c) => c.probe === pr && c.boundary === boundary));
    const a1 = c1.au / g(c1.dir.dot(n)), a2 = c2.au / g(c2.dir.dot(n));
    const R0b = (a1 - a2) / (c1.dir.y - c2.dir.y), R0 = a1 - R0b * c1.dir.y;
    return { R0, beta: R0b / R0 };
  }
  const TS = { ...fit('ts', gTS), g: gTS }, HP = { ...fit('hp', gHP), g: gHP };
  const rTS = (u) => TS.R0 * gTS(u.dot(n)) * (1 + TS.beta * u.y);
  const rHP = (u) => HP.R0 * gHP(u.dot(n)) * (1 + HP.beta * u.y);
  const rHS = (u) => 0.5 * (rTS(u) + rHP(u));

  // ---- shells -------------------------------------------------------------------------------------------------------
  const NPHI = isTouch ? 40 : 56, NAZ = isTouch ? 48 : 72;
  const _u = new THREE.Vector3(), _v = new THREE.Vector3();
  function makeShell(name, rFn, phiMax, uniforms) {
    const nv = (NPHI + 1) * (NAZ + 1);
    const dirs = new Float32Array(nv * 3), rAU = new Float32Array(nv), phis = new Float32Array(nv);
    for (let i = 0; i <= NPHI; i++) {
      const phi = (i / NPHI) * phiMax, sp = Math.sin(phi), cp = Math.cos(phi);
      for (let j = 0; j <= NAZ; j++) {
        const az = (j / NAZ) * Math.PI * 2, k = i * (NAZ + 1) + j;
        _u.copy(n).multiplyScalar(cp).addScaledVector(e1, sp * Math.cos(az)).addScaledVector(e2, sp * Math.sin(az)).normalize();
        dirs.set([_u.x, _u.y, _u.z], k * 3); rAU[k] = rFn(_u); phis[k] = phi;
      }
    }
    const idx = [];
    for (let i = 0; i < NPHI; i++) for (let j = 0; j < NAZ; j++) {
      const a = i * (NAZ + 1) + j, b = a + NAZ + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('aPhi', new THREE.BufferAttribute(phis, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(uniforms.color) }, uOpacity: { value: 0 }, uBase: { value: uniforms.base }, uPow: { value: uniforms.pow },
        uTail0: { value: uniforms.tail0 }, uTail1: { value: uniforms.tail1 }, uNose: { value: uniforms.nose || 0 }, uTime: { value: 0 }, uRipple: { value: uniforms.ripple || 0 } },
      vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = -1;
    mesh.userData = { dirs, rAU, peak: uniforms.opacity };
    root.add(mesh);
    return mesh;
  }
  const tsMesh = makeShell('TerminationShock', rTS, Math.PI, { color: '#ffb468', opacity: 0.16, base: 0.02, pow: 3.0, tail0: 9, tail1: 10, nose: 0.3 });
  const hsMesh = makeShell('Heliosheath', rHS, HP_PHI_MAX, { color: '#c98cff', opacity: 0.05, base: 0.12, pow: 2.0, tail0: 2.0, tail1: HP_PHI_MAX });
  const hpMesh = makeShell('Heliopause', rHP, HP_PHI_MAX, { color: '#6fc4ff', opacity: 0.27, base: 0.02, pow: 2.6, tail0: 2.1, tail1: HP_PHI_MAX, nose: 0.5, ripple: 0.12 });
  const shells = [tsMesh, hsMesh, hpMesh];

  // ---- interstellar wind streamlines around the nose (Rankine half-body flow) ----------------------------------------
  // cylinder coords about the downstream axis w = −n:  ρ² = ρ∞² + 2R0²(1 + x/√(x² + ρ²))
  const w = n.clone().negate();
  const lines = [], RHO = [0.35, 0.75, 1.2], NAZL = isTouch ? 5 : 6, NPT = 90;
  RHO.forEach((rk, ri) => {
    for (let a = 0; a < NAZL; a++) {
      const az = ((a + (ri % 2) * 0.5) / NAZL) * Math.PI * 2;
      const side = e1.clone().multiplyScalar(Math.cos(az)).addScaledVector(e2, Math.sin(az));
      const rinf = rk * HP.R0, pts = [];
      for (let k = 0; k < NPT; k++) {
        const x = HP.R0 * (-2.8 + (k / (NPT - 1)) * 4.6);
        let rho = rinf + HP.R0;
        for (let it = 0; it < 12; it++) rho = Math.sqrt(rinf * rinf + 2 * HP.R0 * HP.R0 * (1 + x / Math.hypot(x, rho)));
        const p = w.clone().multiplyScalar(x).addScaledVector(side, rho);
        const u = p.clone().normalize();
        p.multiplyScalar(1 + HP.beta * u.y);                 // the same north–south squeeze as the heliopause
        pts.push(p);
      }
      lines.push(pts);
    }
  });
  const nSeg = lines.reduce((s, l) => s + l.length - 1, 0);
  const lAU = new Float32Array(nSeg * 6), lS = new Float32Array(nSeg * 2), lF = new Float32Array(nSeg * 2);
  {
    let o = 0;
    for (const pts of lines) {
      let s = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], ds = a.distanceTo(b) / (HP.R0 * 4.6);
        const fa = Math.sin(Math.PI * k / (pts.length - 1)) ** 0.7, fb = Math.sin(Math.PI * (k + 1) / (pts.length - 1)) ** 0.7;
        lAU.set([a.x, a.y, a.z, b.x, b.y, b.z], o * 6); lS.set([s, s + ds], o * 2); lF.set([fa, fb], o * 2);
        s += ds; o++;
      }
    }
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nSeg * 6), 3));
  lGeo.setAttribute('aS', new THREE.BufferAttribute(lS, 1));
  lGeo.setAttribute('aFade', new THREE.BufferAttribute(lF, 1));
  const lMat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color('#9fe6ff') }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const wind = new THREE.LineSegments(lGeo, lMat);
  wind.name = 'InterstellarWind'; wind.frustumCulled = false;
  root.add(wind);

  // ---- markers and labels -------------------------------------------------------------------------------------------
  const gTex = glowTex();
  const labels = [];
  function makeLabel(text, cls, card, title) {
    const wrap = document.createElement('div'); wrap.className = 'helio-wrap';
    const el = document.createElement('div');
    el.className = `label small solar-label helio-label ${cls}`;
    el.innerHTML = text; el.title = title;
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(card); });
    wrap.appendChild(el);
    const obj = new CSS2DObject(wrap); obj.visible = false;
    root.add(obj);
    const L = { el, obj, card, pos: new THREE.Vector3(), prio: cls.includes('cross') ? 2 : 1 };
    labels.push(L);
    return L;
  }
  for (const c of crossings) {
    c.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, color: c.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    c.marker.renderOrder = 3;
    root.add(c.marker);
  }
  // one label per probe, between its two markers (they sit on the same outbound line, so they project close together)
  const probeLabels = ['Voyager 1', 'Voyager 2'].map((probe) => {
    const ts = crossings.find((c) => c.probe === probe && c.boundary === 'ts'), hp = crossings.find((c) => c.probe === probe && c.boundary === 'hp');
    const short = probe.replace('Voyager ', 'V');
    const L = makeLabel(`<b>${short}</b> shock ${ts.date}<br><b>${short}</b> heliopause ${hp.date}`, `cross ${short.toLowerCase()}`, 'hp',
      `${probe} crossed the termination shock on ${ts.date} (${ts.au} AU) and the heliopause on ${hp.date} (${hp.au} AU): tap for facts`);
    L.el.style.setProperty('--probe', ts.color);
    L.ts = ts; L.hp = hp;
    return L;
  });
  const named = [
    makeLabel('Termination shock', 'ts', 'ts', 'Termination shock: the solar wind drops below the speed of sound (tap for facts)'),
    makeLabel('Heliosheath', 'hs', 'hs', 'Heliosheath: slow, hot solar wind between the shock and the heliopause (tap for facts)'),
    makeLabel('Heliopause', 'hp', 'hp', 'Heliopause: the edge of the heliosphere, where interstellar space begins (tap for facts)'),
    makeLabel('Heliotail', 'tail', 'heliosphere', 'The heliosphere\'s tail, stretched downwind (tap for facts)'),
    makeLabel('Interstellar wind ➜', 'wind', 'heliosphere', `The interstellar wind blows in from ecliptic longitude ${INFLOW.lon}°, latitude ${INFLOW.lat}° at ~${INFLOW.speedKms} km/s (tap for facts)`),
  ];
  // anchor directions/radii (AU) of the named labels
  const anchors = [
    { L: named[0], au: () => { const u = e1.clone().negate().multiplyScalar(0.8).addScaledVector(e2, 0.6).normalize(); return u.multiplyScalar(rTS(u)); } },
    { L: named[1], au: () => { const u = e2.clone().multiplyScalar(-0.9).addScaledVector(w, 0.45).normalize(); return u.multiplyScalar(rHS(u)); } },
    { L: named[2], au: () => { const u = e1.clone().multiplyScalar(0.92).addScaledVector(w, 0.4).normalize(); return u.multiplyScalar(rHP(u)); } },
    { L: named[3], au: () => w.clone().multiplyScalar(HP.R0 * 3.0) },
    { L: named[4], au: () => n.clone().multiplyScalar(HP.R0 * 1.9) },
  ];

  // ---- layout at the current distance scale (only when scaleDistance changes) ---------------------------------------
  let layoutKey = '';
  const sAU = (p, out) => { const r = p.length(); return out.copy(p).multiplyScalar(r > 0 ? scaleDistance(r) / r : 0); };
  function layout() {
    const key = `${scaleDistance(1)}|${scaleDistance(30)}|${scaleDistance(120)}`;
    if (key === layoutKey) return;
    layoutKey = key;
    for (const m of shells) {
      const { dirs, rAU } = m.userData, pos = m.geometry.attributes.position;
      for (let k = 0; k < rAU.length; k++) {
        const s = scaleDistance(rAU[k]);
        pos.array[k * 3] = dirs[k * 3] * s; pos.array[k * 3 + 1] = dirs[k * 3 + 1] * s; pos.array[k * 3 + 2] = dirs[k * 3 + 2] * s;
      }
      pos.needsUpdate = true;
      m.geometry.computeVertexNormals();
    }
    const lp = lGeo.attributes.position;
    for (let k = 0; k < nSeg * 2; k++) {
      sAU(_v.set(lAU[k * 3], lAU[k * 3 + 1], lAU[k * 3 + 2]), _u);
      lp.array[k * 3] = _u.x; lp.array[k * 3 + 1] = _u.y; lp.array[k * 3 + 2] = _u.z;
    }
    lp.needsUpdate = true;
    for (const c of crossings) sAU(c.posAU, c.marker.position);
    for (const L of probeLabels) { L.pos.copy(L.hp.marker.position); L.obj.position.copy(L.pos); }
    for (const a of anchors) { sAU(a.au(), a.L.pos); a.L.obj.position.copy(a.L.pos); }
  }

  // ---- info card (fills main.js's #info-panel, like meteors/ and comets/) -------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  const extra = document.createElement('div'); extra.id = 'helio-extra'; extra.className = 'helio-extra hidden';
  $('info-fact')?.after(extra);
  let open = null, lastRefresh = 0;
  const fmtAU = (x) => x.toFixed(1);
  function liveVoyagers() {
    const out = [];
    for (const name of ['Voyager 1', 'Voyager 2']) {
      const it = spacecraft?.get?.(name);
      if (!it || !it.posAU || !it.active) continue;
      const r = it.posAU.length(), hp = rHP(it.posAU.clone().normalize()), ts = rTS(it.posAU.clone().normalize());
      const where = r > hp ? 'in interstellar space' : r > ts ? 'in the heliosheath' : 'inside the termination shock';
      out.push(`${name}: ${fmtAU(r)} AU, ${where}`);
    }
    return out.length ? out.join('. ') + ' (on the shown date)' : 'Not launched yet on the shown date (1977)';
  }
  function fill(key) {
    const ids = ['info-diameter', 'info-distance', 'info-period', 'info-day'];
    CARDS[key].rows().forEach(([label, value], k) => { $(ids[k] + '-label').textContent = label; $(ids[k]).textContent = value === 'live' ? liveVoyagers() : value; });
  }
  function showInfo(key) {
    const c = CARDS[key];
    if (!panel || !c) return false;
    $('info-name').textContent = c.name; $('info-name').style.color = c.color;
    $('info-type').textContent = c.type;
    fill(key);
    $('info-fact').textContent = '💡 ' + c.fact + ' (Drawn on the sim\'s compressed distance scale; the shells are a simple model fitted through the four Voyager crossings.)';
    for (const id of ['info-phase-row', 'info-sky-row']) $(id)?.classList.add('hidden');
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const L of labels) L.el.classList.toggle('active', L.card === key);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = key; lastRefresh = performance.now();
    setExtra(key);
    return true;
  }
  const isOpenHere = () => open && panel && !panel.classList.contains('hidden') && $('info-name').textContent === CARDS[open].name;
  function release(hide) {
    for (const L of labels) L.el.classList.remove('active');
    if (hide && open && isOpenHere()) { panel.classList.add('hidden'); document.body.classList.remove('info-open'); }
    open = null;
    if (closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
    extra.replaceChildren(); extra.classList.add('hidden');
  }
  // ✕ on our card just closes it (main.js's own ✕ handler would fly back to the overview)
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    release(true);
  }, true);
  function button(text, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'helio-btn'; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function setExtra(key) {
    extra.replaceChildren();
    extra.append(button('🛰 Voyager 1', () => window.solar?.search?.go('Voyager 1')), button('🛰 Voyager 2', () => window.solar?.search?.go('Voyager 2')));
    for (const k of ['heliosphere', 'ts', 'hs', 'hp']) if (k !== key) extra.append(button(CARDS[k].name, () => showInfo(k)));
    extra.append(button('🔭 View the whole bubble', () => go(key)));
    extra.classList.remove('hidden');
  }

  // ---- fly-to (main.js's flyTo; no camera code here) ----------------------------------------------------------------
  function view() {
    const vfov = 50 * D2R, hfov = 2 * Math.atan(Math.tan(vfov / 2) * window.innerWidth / window.innerHeight);
    const portrait = window.innerHeight > window.innerWidth, k = Math.tan(Math.min(vfov, hfov) / 2) / 1.15;
    const max = (getMaxDist?.() || 900) * 0.85;           // stay clear of main.js's switch to the galaxy view
    const nose = scaleDistance(HP.R0);
    // frame the nose and the tail; if that can't fit inside the zoom limit (true-distance scale), frame less of the tail
    let tail = scaleDistance(HP.R0 * 5.2);
    const fitD = () => ((nose + tail) / 2 * (portrait ? 0.8 : 1)) / k;
    if (fitD() > max) tail = Math.max(nose * 0.5, (2 * max * k) / (portrait ? 0.8 : 1) - nose);
    const d = Math.min(Math.max(fitD(), nose * 2.2), max);
    // landscape: side-on (nose left, wind flowing left to right); portrait: more from the nose, so the narrow screen sees the round front
    const target = n.clone().multiplyScalar((nose - tail) * (portrait ? 0.12 : 0.22));
    // look along V1 × V2 so both crossings sit near the bubble's outline instead of over the planets
    const v1 = crossings.find((c) => c.probe === 'Voyager 1' && c.boundary === 'hp').dir, v2 = crossings.find((c) => c.probe === 'Voyager 2' && c.boundary === 'hp').dir;
    const side = new THREE.Vector3().crossVectors(v1, v2).normalize();
    if (side.y < 0) side.negate();
    const dir = side.multiplyScalar(portrait ? 0.45 : 0.85).addScaledVector(new THREE.Vector3(0, 1, 0), 0.3).addScaledVector(n, portrait ? 0.8 : 0.2).normalize();
    return { cam: target.clone().addScaledVector(dir, d), target };
  }
  function go(key = 'heliosphere') {
    if (!on) setOn(true);
    const run = () => { releaseFocus?.(); const v = view(); flyTo(v.cam, v.target, 2.2, () => showInfo(key)); };
    const mode = getMode?.();
    if (mode === 'galaxy') { exitGalaxy?.(run); return; }
    if (mode && mode !== 'solar') return;
    run();
  }

  // ---- search ---------------------------------------------------------------------------------------------------------
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9*/+]+/g, ' ').trim();
  const KINDINFO = { icon: '◌', tag: 'Heliosphere', color: '#9fd8ff' };
  if (search?.entries) {
    const add = (name, key, sub, aliases) => {
      const e = { name, kind: 'heliosphere', kindInfo: KINDINFO, color: CARDS[key].color, sub, go: () => go(key) };
      e.keys = [norm(name), ...aliases.map(norm)];
      search.entries.push(e);
    };
    add('Heliosphere', 'heliosphere', 'The Sun\'s bubble · Voyager crossings', ['heliotail', 'bow wave', 'bow shock', 'interstellar wind', 'ibex ribbon', 'ibex', 'solar wind bubble', 'edge of the solar system', 'local interstellar medium']);
    add('Heliopause', 'hp', 'Edge of interstellar space · ~120 AU', ['interstellar space', 'interstellar boundary', 'edge of interstellar space', 'interstellar medium']);
    add('Termination shock', 'ts', 'Solar wind slows · 84–94 AU', ['solar wind shock', 'shock']);
    add('Heliosheath', 'hs', 'Between the shock and the heliopause', ['helio sheath']);
  }

  // ---- labels: keep clear of main.js's body labels and of each other ------------------------------------------------
  const PX = isTouch ? 8 : 0, PY = isTouch ? 12 : 0, rects = [];
  const overlaps = (r) => rects.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  function placeLabels(camera, W, H, allow) {
    rects.length = 0;
    for (const b of bodies) {
      const lab = b.labelEl;
      if (!lab || !lab._obj || lab.classList.contains('overlap')) continue;
      lab._obj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, lw = lab._w || lab.textContent.length * 7 + 18, lh = lab._h || 20;
      rects.push([cx - lw / 2 - PX, cy - lh / 2 - PY, cx + lw / 2 + PX, cy + lh / 2 + PY]);
    }
    for (const it of spacecraft?.items || []) {                  // spacecraft/ labels (Voyager's own sits right by our markers)
      const lab = it.labelEl;
      if (!lab || !it.labelObj?.visible) continue;
      it.labelObj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, lw = lab.offsetWidth || 90, lh = lab.offsetHeight || 20;
      rects.push([cx - lw / 2, cy - lh / 2, cx + lw / 2, cy + lh / 2 + 16]);
    }
    const order = [...labels].sort((a, b) => ((b.card === open) - (a.card === open)) || (b.prio - a.prio));
    for (const L of order) {
      let vis = allow;
      if (vis) {
        _v.copy(L.pos).project(camera);
        vis = !(_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.02 || Math.abs(_v.y) > 1.02);
      }
      if (vis) {
        const el = L.el;
        if (!el._w && el.offsetWidth) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
        const lw = el._w || el.textContent.length * 6.5 + 18, lh = el._h || 20;
        // crossing labels: above their marker, or below it if that spot is taken (e.g. by the probe's own label)
        const tries = L.prio === 2 ? [-(lh / 2 + 12), lh / 2 + 12] : [0];
        vis = false;
        for (const dy of tries) {
          const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H + dy;
          const r = [cx - lw / 2 - 2 - PX, cy - lh / 2 - 2 - PY, cx + lw / 2 + 2 + PX, cy + lh / 2 + 2 + PY];
          if (overlaps(r)) continue;
          rects.push(r); vis = true;
          if (L.prio === 2 && L.dy !== dy) { L.el.style.transform = `translateY(${Math.round(dy)}px)`; L.dy = dy; }
          break;
        }
      }
      L.obj.visible = vis;
    }
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  let frame = 0, time = 0, fade = 0;
  function update(days, camera, dt = 1 / 60) {
    time += Math.min(dt, 0.1);
    if (!on) { if (root.visible) { root.visible = false; for (const L of labels) L.obj.visible = false; } fade = 0; return; }
    // fade in only once the camera is outside the termination shock (the planets view is untouched)
    const unit = scaleDistance(TS.R0);
    fade = THREE.MathUtils.smoothstep(camera.position.length(), unit * 1.05, unit * 1.75);
    root.visible = fade > 0.001;
    if (!root.visible) { for (const L of labels) L.obj.visible = false; return; }
    layout();
    for (const m of shells) { const u = m.material.uniforms; u.uOpacity.value = m.userData.peak * fade; u.uTime.value = time; }
    lMat.uniforms.uOpacity.value = 0.8 * fade; lMat.uniforms.uTime.value = time;
    const H = window.innerHeight, k = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / H;
    for (const c of crossings) { c.marker.scale.setScalar((isTouch ? 19 : 16) * k); c.marker.material.opacity = 0.95 * fade; }
    if ((frame++ % 3) === 0) placeLabels(camera, window.innerWidth, H, fade > 0.35);
    if (open && performance.now() - lastRefresh > 500) {
      lastRefresh = performance.now();
      if (isOpenHere()) fill(open); else release(false);
    }
  }

  return {
    group: root, update, go, showInfo, isOn: () => on, setOn, crossings, TS, HP,
    rAU: (dir, which = 'hp') => (which === 'ts' ? rTS : which === 'hs' ? rHS : rHP)(dir.clone().normalize()),
    stats: () => ({ on, fade: +fade.toFixed(3), visible: root.visible, open,
      ts: { R0: +TS.R0.toFixed(2), beta: +TS.beta.toFixed(4), tail: +rTS(w).toFixed(1) }, hp: { R0: +HP.R0.toFixed(2), beta: +HP.beta.toFixed(4) },
      crossings: crossings.map((c) => ({ probe: c.probe, b: c.boundary, au: c.au, r: +c.posAU.length().toFixed(2),
        lat: +(Math.asin(c.dir.y) / D2R).toFixed(1), fromNose: +(Math.acos(c.dir.dot(n)) / D2R).toFixed(1),
        simDate: c.simT == null ? null : new Date(Date.UTC(2000, 0, 1, 12) + c.simT * 86400000).toISOString().slice(0, 10), date: c.date })),
      labels: labels.filter((L) => L.obj.visible).map((L) => L.el.textContent), segments: nSeg }),
  };
}
