// alphacen/: the Alpha Centauri triple system (A, B, Proxima) with Proxima b and d, on the solar-scene
// distance scale. Numbers and sources: alphacen/data.js; notes in the 2026-10-30 CHANGELOG entry.
//
// Usage (main.js, after search/ exists):
//   import { createAlphaCen } from './alphacen/index.js';
//   const alphaCen = createAlphaCen({ scene, search, scaleDistance, flyTo, exitGalaxy, getMode, releaseFocus,
//     getMaxDist, controls, camera, isTouch });
//   ...each solar-view frame: alphaCen.update(days, camera, dt);
//   window.solar.alphaCen = alphaCen;
//
// Placement: AB barycentre and Proxima sit along their true J2000 RA/Dec at 4.37 ly and 4.25 ly, converted
// through alphacen/scale.js (ly → AU → main.js scaleDistance). A and B move on the published binary orbit
// (Akeson 2021 / Pourbaix & Boffin 2016). Proxima's ~550 kyr orbit is treated as fixed. Planets use
// circular-ish Kepler orbits about Proxima in the local frame.
//
// Visuals: simple emissive spheres by default. Space Visuals Coder's alphacen/visuals.js (createStar /
// createPlanet) is installed via alphaCen.useVisuals(...) once that file exists — we do not import it
// here (a missing file would 404 in the console). Proxima b's mesh stays replaceable for EarthBot.
// ScaleBot may add window.solar.flyToAlphaCen(); search uses that when present.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { raDecToScene } from '../constellations/index.js';
import { scaleLy, scaleSystemAU } from './scale.js';
import {
  DIST_LY_AB, DIST_LY_PROXIMA, AB_RA_H, AB_DEC_DEG, PROX_RA_H, PROX_DEC_DEG,
  AB_ORBIT, KAPPA_B, STARS, PLANETS, CARDS,
} from './data.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const SUN_RADIUS = 5;                         // matches main.js
const J2000_YR = 2000.0;

function glowTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fallbackStar({ radius, color, flare = false }) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat);
  mesh.name = 'starMesh';
  group.add(mesh);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: flare ? 0.95 : 0.7,
  }));
  sprite.scale.setScalar(radius * (flare ? 14 : 8));
  sprite.name = 'starGlow';
  group.add(sprite);
  if (flare) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: '#ff4020', transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.55,
    }));
    halo.scale.setScalar(radius * 22);
    halo.name = 'flareHalo';
    group.add(halo);
  }
  return { object3D: group, mesh, radius };
}

function fallbackPlanet({ radius, color }) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.name = 'planetMesh';
  group.add(mesh);
  return { object3D: group, mesh, radius };
}

// Binary relative position of B relative to A (Thiele-Innes / standard Kepler), returned in scene ecliptic-ish
// axes. Ω, i, ω orient the orbit; we treat the line of nodes in the sky plane projected into our ecliptic frame
// approximately by building the usual perifocal → inertial rotation and then mapping (x, y, z) → (x, z, -y)
// to match main.js (ecliptic X, north Y, -ecliptic Y as Z).
function binaryOffset(daysSinceJ2000, outA, outB) {
  const { P_yr, a_AU, e, i_deg, w_deg, Om_deg, T0_yr } = AB_ORBIT;
  const yr = J2000_YR + daysSinceJ2000 / 365.25;
  const M = TAU * ((yr - T0_yr) / P_yr);
  let E = M;
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const r = a_AU * (1 - e * cosE);
  const cosv = (cosE - e) / (1 - e * cosE), sinv = (Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE);
  // perifocal (B relative to A)
  const x = r * cosv, y = r * sinv;
  const cO = Math.cos(Om_deg * D2R), sO = Math.sin(Om_deg * D2R);
  const ci = Math.cos(i_deg * D2R), si = Math.sin(i_deg * D2R);
  const cw = Math.cos(w_deg * D2R), sw = Math.sin(w_deg * D2R);
  // standard: r = R_z(Ω) R_x(i) R_z(ω) · (x, y, 0)
  const xp = (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y;
  const yp = (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y;
  const zp = (sw * si) * x + (cw * si) * y;
  // scene: (X, Z, -Y)_ecliptic
  const relX = xp, relY = zp, relZ = -yp;
  outA.set(-KAPPA_B * relX, -KAPPA_B * relY, -KAPPA_B * relZ);
  outB.set((1 - KAPPA_B) * relX, (1 - KAPPA_B) * relY, (1 - KAPPA_B) * relZ);
  return r;
}

function planetOffset(el, days, out) {
  const M = TAU * (days / el.P_days);
  const e = el.e || 0;
  let E = M;
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const r = el.a_AU * (1 - e * cosE);
  const x = r * ((cosE - e) / (1 - e * cosE));
  const z = r * ((Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE));
  return out.set(x, 0, -z); // face-on in the local XZ plane
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {Function} o.scaleDistance
 * @param {object} [o.search]
 * @param {Function} [o.flyTo]
 * @param {Function} [o.exitGalaxy]
 * @param {Function} [o.getMode]
 * @param {Function} [o.releaseFocus]
 * @param {Function} [o.getMaxDist]
 * @param {object} [o.controls]
 * @param {THREE.Camera} [o.camera]
 * @param {boolean} [o.isTouch]
 */
export function createAlphaCen(o) {
  const {
    scene, scaleDistance, search, flyTo, exitGalaxy, getMode, releaseFocus,
    getMaxDist, controls, camera, isTouch = false,
  } = o;

  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./alphacen.css', import.meta.url).href;
  document.head.appendChild(css);

  const root = new THREE.Group(); root.name = 'AlphaCentauri';
  scene.add(root);
  const abGroup = new THREE.Group(); abGroup.name = 'AlphaCenAB'; root.add(abGroup);
  const proxGroup = new THREE.Group(); proxGroup.name = 'Proxima'; root.add(proxGroup);

  // ---- Layers toggle (remembered) ------------------------------------------------------------------------------------
  const store = {
    get: (k) => { try { return localStorage.getItem('solar.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('solar.' + k, v); } catch (e) { /* private */ } },
  };
  const toggle = document.getElementById('toggle-alphacen');
  let on = store.get('alphacen') !== '0';
  if (toggle) toggle.checked = on;
  const setOn = (v) => {
    on = !!v; if (toggle) toggle.checked = on; store.set('alphacen', on ? '1' : '0');
    root.visible = on; if (!on) release(true);
  };
  toggle?.addEventListener('change', () => setOn(toggle.checked));
  root.visible = on;

  // ---- makers (visuals.js if Space Visuals Coder shipped it; else simple spheres) ------------------------------------
  let makeStar = (spec) => fallbackStar(spec);
  let makePlanet = (spec) => fallbackPlanet(spec);
  // Space Visuals Coder owns alphacen/visuals.js (createStar / createPlanet). We do not import it here:
  // a missing file 404s in the console. Once it ships, call alphaCen.useVisuals(await import('./alphacen/visuals.js')).

  const starRadius = (solar) => Math.max(0.35, SUN_RADIUS * solar);
  // Planets: enlarge enough to tap (≥ ~0.35) while staying well under Proxima's disc
  const planetRadius = (mEarth) => Math.max(0.35, 0.55 * Math.sqrt(Math.max(mEarth, 0.2)));

  function attachBody(parent, built, pickR) {
    parent.add(built.object3D);
    // invisible pick sphere (≥ ~44 px on screen when close; radius floor helps at distance)
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(pickR * 1.6, 1.2), 12, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    pick.userData.acPick = true;
    built.object3D.add(pick);
    return built;
  }

  const bodies = {};
  function buildStar(key, parent) {
    const s = STARS[key];
    const built = makeStar({
      radius: starRadius(s.radiusSolar), color: s.color, flare: key === 'proxima',
      spectral: s.spectral, name: s.name, id: s.id,
    });
    attachBody(parent, built, built.radius);
    bodies[key] = built;
    return built;
  }
  function buildPlanet(key, parent) {
    const p = PLANETS[key];
    const built = makePlanet({
      radius: planetRadius(p.mEarth), color: p.color, name: p.name, id: p.id, massEarth: p.mEarth,
    });
    attachBody(parent, built, built.radius);
    bodies[key] = built;
    return built;
  }

  buildStar('A', abGroup);
  buildStar('B', abGroup);
  buildStar('proxima', proxGroup);
  buildPlanet('proximaB', proxGroup);
  buildPlanet('proximaD', proxGroup);

  // EarthBot may replace Proxima b's mesh later — keep a stable handle
  function replacePlanetMesh(key, newMesh) {
    const b = bodies[key]; if (!b || !newMesh) return;
    const old = b.mesh; if (old?.parent) old.parent.remove(old);
    b.object3D.add(newMesh); b.mesh = newMesh;
  }

  function rebuildAll() {
    for (const key of ['A', 'B', 'proxima']) {
      const parent = key === 'proxima' ? proxGroup : abGroup;
      const old = bodies[key];
      if (old?.object3D?.parent) old.object3D.parent.remove(old.object3D);
      buildStar(key, parent);
    }
    for (const key of ['proximaB', 'proximaD']) {
      const old = bodies[key];
      if (old?.object3D?.parent) old.object3D.parent.remove(old.object3D);
      buildPlanet(key, proxGroup);
    }
    layout(true);
    placeStars(lastDays || 0);
  }
  /** Space Visuals: pass { createStar, createPlanet } from alphacen/visuals.js once that file exists. */
  function useVisuals(v = {}) {
    if (typeof v.createStar === 'function') makeStar = (spec) => v.createStar(spec);
    if (typeof v.createPlanet === 'function') makePlanet = (spec) => v.createPlanet(spec);
    rebuildAll();
  }

  // ---- binary orbit ring (A-B relative, drawn about the barycentre) --------------------------------------------------
  const orbitPts = [];
  for (let i = 0; i <= 256; i++) {
    const M = (i / 256) * TAU, e = AB_ORBIT.e;
    let E = M; for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const cosE = Math.cos(E), sinE = Math.sin(E);
    const r = AB_ORBIT.a_AU * (1 - e * cosE);
    const cosv = (cosE - e) / (1 - e * cosE), sinv = (Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE);
    const x = r * cosv, y = r * sinv;
    const cO = Math.cos(AB_ORBIT.Om_deg * D2R), sO = Math.sin(AB_ORBIT.Om_deg * D2R);
    const ci = Math.cos(AB_ORBIT.i_deg * D2R), si = Math.sin(AB_ORBIT.i_deg * D2R);
    const cw = Math.cos(AB_ORBIT.w_deg * D2R), sw = Math.sin(AB_ORBIT.w_deg * D2R);
    const xp = (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y;
    const yp = (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y;
    const zp = (sw * si) * x + (cw * si) * y;
    // barycentric track of A (scaled later)
    orbitPts.push(new THREE.Vector3(-KAPPA_B * xp, -KAPPA_B * zp, -KAPPA_B * (-yp)));
  }
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
  const orbitLine = new THREE.LineLoop(orbitGeo, new THREE.LineBasicMaterial({
    color: 0xffc878, transparent: true, opacity: 0.35,
  }));
  orbitLine.name = 'ABOrbit';
  abGroup.add(orbitLine);

  // planet orbit rings about Proxima
  function makePlanetOrbit(el, color) {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * el.a_AU, 0, -Math.sin(a) * el.a_AU));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }));
    proxGroup.add(line);
    return { line, el, au: el.a_AU };
  }
  const planetOrbits = [
    makePlanetOrbit(PLANETS.proximaB, 0x7ec8ff),
    makePlanetOrbit(PLANETS.proximaD, 0xa8d4ff),
  ];

  // ---- labels --------------------------------------------------------------------------------------------------------
  const labels = [];
  function makeLabel(text, cls, card, title) {
    const wrap = document.createElement('div'); wrap.className = 'ac-wrap';
    const el = document.createElement('div');
    el.className = `label small solar-label ac-label ${cls}`;
    el.textContent = text; el.title = title || text;
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(card); });
    wrap.appendChild(el);
    const obj = new CSS2DObject(wrap); obj.visible = false;
    root.add(obj);
    const L = { el, obj, card };
    labels.push(L);
    return L;
  }
  makeLabel('α Cen A', 'star-a', 'A', 'Alpha Centauri A (Rigil Kentaurus)');
  makeLabel('α Cen B', 'star-b', 'B', 'Alpha Centauri B (Toliman)');
  makeLabel('Proxima', 'proxima', 'proxima', 'Proxima Centauri');
  makeLabel('Proxima b', 'planet', 'proximaB', 'Proxima Centauri b');
  makeLabel('Proxima d', 'planet', 'proximaD', 'Proxima Centauri d');
  const sysLabel = makeLabel('Alpha Centauri', '', 'system', 'Alpha Centauri triple system');

  // ---- layout / positions --------------------------------------------------------------------------------------------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();
  const abDir = raDecToScene(AB_RA_H * 15, AB_DEC_DEG);       // RA hours → degrees
  const proxDir = raDecToScene(PROX_RA_H * 15, PROX_DEC_DEG);
  let layoutKey = '', lastDays = 0;

  function layout(force = false) {
    const key = `${scaleDistance(1)}|${scaleDistance(30)}|${scaleDistance(1000)}`;
    if (!force && key === layoutKey) return;
    layoutKey = key;
    const abR = scaleLy(DIST_LY_AB, scaleDistance);
    const proxR = scaleLy(DIST_LY_PROXIMA, scaleDistance);
    abGroup.position.copy(abDir).multiplyScalar(abR);
    proxGroup.position.copy(proxDir).multiplyScalar(proxR);
    // scale orbit polylines into scene units (relative to their parent)
    const pos = orbitGeo.attributes.position;
    for (let i = 0; i <= 256; i++) {
      // rebuild from unit-AU orbitPts: stored already as barycentric AU of A; scale each
      // We stored scene-oriented AU; scale magnitude from barycentre.
      const ox = orbitPts[i].x, oy = orbitPts[i].y, oz = orbitPts[i].z;
      const au = Math.hypot(ox, oy, oz) || 1e-9;
      const s = scaleSystemAU(au, scaleDistance) / au;
      pos.setXYZ(i, ox * s, oy * s, oz * s);
    }
    pos.needsUpdate = true;
    for (const po of planetOrbits) {
      const s = scaleSystemAU(po.au, scaleDistance) / po.au;
      const pp = po.line.geometry.attributes.position;
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * TAU;
        pp.setXYZ(i, Math.cos(a) * po.au * s, 0, -Math.sin(a) * po.au * s);
      }
      pp.needsUpdate = true;
    }
  }

  function placeStars(days) {
    binaryOffset(days, _a, _b);
    const sA = scaleSystemAU(Math.hypot(_a.x, _a.y, _a.z) || 1e-9, scaleDistance) / (Math.hypot(_a.x, _a.y, _a.z) || 1e-9);
    const sB = scaleSystemAU(Math.hypot(_b.x, _b.y, _b.z) || 1e-9, scaleDistance) / (Math.hypot(_b.x, _b.y, _b.z) || 1e-9);
    bodies.A.object3D.position.set(_a.x * sA, _a.y * sA, _a.z * sA);
    bodies.B.object3D.position.set(_b.x * sB, _b.y * sB, _b.z * sB);

    planetOffset(PLANETS.proximaB, days, _p);
    let au = Math.hypot(_p.x, _p.z) || PLANETS.proximaB.a_AU;
    let s = scaleSystemAU(au, scaleDistance) / au;
    bodies.proximaB.object3D.position.set(_p.x * s, 0, _p.z * s);
    planetOffset(PLANETS.proximaD, days, _p);
    au = Math.hypot(_p.x, _p.z) || PLANETS.proximaD.a_AU;
    s = scaleSystemAU(au, scaleDistance) / au;
    bodies.proximaD.object3D.position.set(_p.x * s, 0, _p.z * s);
  }

  // ---- info cards ----------------------------------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  const extra = document.createElement('div'); extra.id = 'ac-extra'; extra.className = 'ac-extra hidden';
  $('info-fact')?.after(extra);
  let open = null;

  function fill(key) {
    const ids = ['info-diameter', 'info-distance', 'info-period', 'info-day'];
    CARDS[key].rows().forEach(([label, value], k) => {
      $(ids[k] + '-label').textContent = label; $(ids[k]).textContent = value;
    });
  }
  function showInfo(key) {
    const c = CARDS[key];
    if (!panel || !c) return false;
    $('info-name').textContent = c.name; $('info-name').style.color = c.color;
    $('info-type').textContent = c.type;
    fill(key);
    $('info-fact').textContent = '💡 ' + c.fact;
    for (const id of ['info-phase-row', 'info-sky-row']) $(id)?.classList.add('hidden');
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const L of labels) L.el.classList.toggle('active', L.card === key);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = key;
    setExtra(key);
    return true;
  }
  const isOpenHere = () => open && panel && !panel.classList.contains('hidden')
    && $('info-name').textContent === CARDS[open].name;
  function release(hide) {
    for (const L of labels) L.el.classList.remove('active');
    if (hide && open && isOpenHere()) { panel.classList.add('hidden'); document.body.classList.remove('info-open'); }
    open = null;
    if (closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
    extra.replaceChildren(); extra.classList.add('hidden');
  }
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    release(true);
  }, true);
  function button(text, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ac-btn'; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function setExtra(key) {
    extra.replaceChildren();
    const order = ['system', 'A', 'B', 'proxima', 'proximaB', 'proximaD'];
    for (const k of order) if (k !== key) extra.append(button(CARDS[k].name.replace('Alpha Centauri ', 'α Cen ').replace('Centauri ', ''), () => showInfo(k)));
    extra.append(button('🔭 Fly to Alpha Centauri', () => go(key)));
    extra.classList.remove('hidden');
  }

  // ---- navigation ----------------------------------------------------------------------------------------------------
  function getTarget(out = new THREE.Vector3()) {
    return abGroup.getWorldPosition(out);
  }
  function fallbackFly(key = 'system') {
    if (!on) setOn(true);
    releaseFocus?.();
    const target = getTarget(new THREE.Vector3());
    // Frame AB with a bit of room for the binary orbit (~scaleDistance(a))
    const span = scaleSystemAU(AB_ORBIT.a_AU * (1 + AB_ORBIT.e), scaleDistance) * 2.8;
    const dir = camera ? camera.position.clone().sub(controls?.target || target).normalize()
      : new THREE.Vector3(0.4, 0.35, 0.85).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.4, 0.35, 0.85).normalize();
    const camPos = target.clone().addScaledVector(dir, Math.max(span, 40));
    const max = getMaxDist?.() || 900;
    // Raise zoom + far plane so the soft-capped nearby-star distance is reachable (ScaleBot may replace this).
    if (controls && target.length() > max * 0.9) {
      controls.maxDistance = Math.max(controls.maxDistance, target.length() + span * 2);
    }
    if (camera && camera.far < target.length() + span * 4) {
      camera.far = target.length() + span * 4;
      camera.updateProjectionMatrix();
    }
    if (typeof flyTo === 'function') {
      // fixed duration: flyDuration would stretch a multi-thousand-unit trip up to FLY_STAGE_MAX
      flyTo(camPos, target, 2.6, () => showInfo(key), true);
    } else if (controls && camera) {
      controls.target.copy(target);
      camera.position.copy(camPos);
      controls.update?.();
      showInfo(key);
    } else {
      showInfo(key);
    }
  }
  function go(key = 'system') {
    if (!on) setOn(true);
    const run = () => {
      if (typeof window.solar?.flyToAlphaCen === 'function') {
        window.solar.flyToAlphaCen();
        // open the card shortly after ScaleBot takes over
        setTimeout(() => showInfo(key), 400);
        return;
      }
      fallbackFly(key);
    };
    const mode = getMode?.();
    if (mode === 'galaxy') { exitGalaxy?.(run); return; }
    if (mode && mode !== 'solar') return;
    run();
  }

  // ---- search --------------------------------------------------------------------------------------------------------
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9*/+]+/g, ' ').trim();
  const KINDINFO = { icon: '★', tag: 'Alpha Centauri', color: '#ffe2a0' };
  if (search?.entries) {
    const add = (name, key, sub, aliases) => {
      const e = { name, kind: 'alphacen', kindInfo: KINDINFO, color: CARDS[key].color, sub, go: () => go(key) };
      e.keys = [norm(name), ...aliases.map(norm)];
      search.entries.push(e);
    };
    add('Alpha Centauri', 'system', 'Nearest star system · 4.37 ly',
      ['alpha centauri', 'α centauri', 'rigil kentaurus', 'toliman', 'nearest star', 'alpha cen']);
    add('Alpha Centauri A', 'A', 'G2V · Rigil Kentaurus',
      ['rigil kentaurus', 'rigil kent', 'alpha cen a', 'α cen a']);
    add('Alpha Centauri B', 'B', 'K1V · Toliman',
      ['toliman', 'alpha cen b', 'α cen b']);
    add('Proxima Centauri', 'proxima', 'M5.5V · nearest star · 4.25 ly',
      ['proxima', 'proxima centauri', 'alpha cen c', 'α cen c']);
    add('Proxima Centauri b', 'proximaB', 'Habitable-zone exoplanet · 11.2 days',
      ['proxima b', 'proxima centauri b']);
    add('Proxima Centauri d', 'proximaD', 'Sub-Earth · 5.1 days',
      ['proxima d', 'proxima centauri d']);
  }

  // ---- API body handles ----------------------------------------------------------------------------------------------
  const _wp = new THREE.Vector3();
  function apiBody(key) {
    return {
      get object3D() { return bodies[key]?.object3D; },
      get mesh() { return bodies[key]?.mesh; },
      get radius() { return bodies[key]?.radius ?? 1; },
      getWorldPosition(out = _wp) { return bodies[key]?.object3D.getWorldPosition(out) || out.set(0, 0, 0); },
    };
  }

  // ---- labels each frame ---------------------------------------------------------------------------------------------
  function placeLabels(cam, allow) {
    const map = [
      [labels[0], bodies.A], [labels[1], bodies.B], [labels[2], bodies.proxima],
      [labels[3], bodies.proximaB], [labels[4], bodies.proximaD],
    ];
    for (const [L, b] of map) {
      if (!allow || !b?.object3D) { L.obj.visible = false; continue; }
      b.object3D.getWorldPosition(_w);
      _w.project(cam);
      const vis = !(_w.z > 1 || _w.z < -1 || Math.abs(_w.x) > 1.15 || Math.abs(_w.y) > 1.15);
      if (vis) L.obj.position.copy(b.object3D.getWorldPosition(_p));
      // keep label in root local space: convert world → root
      if (vis) {
        root.worldToLocal(L.obj.position.copy(b.object3D.getWorldPosition(_p)));
      }
      L.obj.visible = vis;
    }
    // system label at AB barycentre
    if (allow) {
      root.worldToLocal(sysLabel.obj.position.copy(abGroup.getWorldPosition(_p)));
      abGroup.getWorldPosition(_w).project(cam);
      sysLabel.obj.visible = !(_w.z > 1 || _w.z < -1 || Math.abs(_w.x) > 1.2 || Math.abs(_w.y) > 1.2);
      // hide system label when any star label is up close
      if (sysLabel.obj.visible && (labels[0].obj.visible || labels[1].obj.visible)) {
        const d = cam.position.distanceTo(abGroup.getWorldPosition(_p));
        if (d < scaleSystemAU(AB_ORBIT.a_AU * 3, scaleDistance)) sysLabel.obj.visible = false;
      }
    } else sysLabel.obj.visible = false;
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  let frame = 0, flareT = 0;
  function update(days, cam, dt = 1 / 60) {
    if (!on) {
      if (root.visible) { root.visible = false; for (const L of labels) L.obj.visible = false; }
      return;
    }
    root.visible = true;
    // Keep the far plane past the soft-capped system so it is not clipped when approached.
    const needFar = abGroup.position.length() + scaleSystemAU(AB_ORBIT.a_AU * 4, scaleDistance);
    if (cam.far < needFar) { cam.far = needFar; cam.updateProjectionMatrix(); }
    layout();
    if (days !== lastDays || (frame % 2) === 0) { placeStars(days); lastDays = days; }
    // gentle Proxima flare pulse
    const halo = bodies.proxima?.object3D?.getObjectByName('flareHalo');
    if (halo) {
      flareT += dt;
      const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(flareT * 0.7) ** 8);
      halo.material.opacity = 0.25 + 0.55 * pulse;
      const base = bodies.proxima.radius * 22;
      halo.scale.setScalar(base * (0.85 + 0.4 * pulse));
    }
    if ((frame++ % 3) === 0) {
      // show labels once the camera is in the neighbourhood of the system (past ~0.3× the AB distance)
      const abDist = abGroup.position.length();
      const camR = cam.position.length();
      const near = camR > abDist * 0.25 || cam.position.distanceTo(abGroup.position) < abDist * 0.5;
      placeLabels(cam, near || !!open);
    }
    if (open && !isOpenHere()) release(false);
  }

  layout(true);
  placeStars(0);

  return {
    group: root,
    abGroup,
    proxGroup,
    A: apiBody('A'),
    B: apiBody('B'),
    proxima: apiBody('proxima'),
    proximaB: apiBody('proximaB'),
    proximaD: apiBody('proximaD'),
    stars: { A: apiBody('A'), B: apiBody('B'), proxima: apiBody('proxima') },
    planets: { proximaB: apiBody('proximaB'), proximaD: apiBody('proximaD') },
    getTarget,
    update,
    go,
    showInfo,
    isOn: () => on,
    setOn,
    replacePlanetMesh,          // EarthBot: replace Proxima b (or d) mesh without rebuilding the module
    useVisuals,                 // Space Visuals: install createStar/createPlanet from visuals.js
    orbit: AB_ORBIT,
    stats: () => ({
      on, open, abR: +abGroup.position.length().toFixed(1), proxR: +proxGroup.position.length().toFixed(1),
      aSep: +bodies.A.object3D.position.distanceTo(bodies.B.object3D.position).toFixed(2),
    }),
  };
}
