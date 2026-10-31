// proximab/: commercial-quality Proxima Centauri b — tidally-locked rocky super-Earth ("eyeball" planet).
//
// Hooks into Space Model Coder's alphacen/ via replacePlanetMesh('proximaB', mesh). Prefer calling
// createProximaB({ alphaCen, isTouch }) from main.js after window.solar.alphaCen is set (2 hook lines).
// Per-frame tidal lock + star-light refresh runs in mesh.onBeforeRender (no animate-loop edit needed).
//
// Design (mobile-safe, procedural, no textures):
//   • radius matches alphacen's planetRadius(~1.07 M⊕) ≈ 0.55·√m
//   • substellar ocean "eye", rocky day side, ice beyond / permanent night ice
//   • dim orange-red lighting from Proxima (~3000 K); uses Space Visuals star-light API when present
//   • thin atmosphere rim tinted by the star
//
// Exposed: window.solar.proximaB = { group, mesh, atmosphere, params, uniforms, update, dispose, stats }
import * as THREE from 'three';
import { createProximaBMaterial } from './material.js';
import { createProximaBAtmosphere } from './atmosphere.js';

// Approximate blackbody chromaticity for ~3000 K (Proxima Teff ≈ 2992 K), normalised so peak channel = 1.
export const PROXIMA_TEFF = 3000;
export const PROXIMA_COLOR = new THREE.Color(1.0, 0.45, 0.18);

const DEFAULTS = {
  atmoThickness: 0.028,          // shell = R · (1 + t); thin but readable
  atmoIntensity: 1.35,
  atmoTint: new THREE.Color(1.0, 0.75, 0.55),
  ambient: 0.012,
  oceanEdge: 0.62,               // cosθ of ocean coastline from substellar (~52°)
  iceEdge: 0.12,                 // day-side ice starts near the terminator
  oceanSpec: 0.55,
  rockRough: 1.0,
  iceBright: 1.0,
  terminator: 0.12,              // soft terminator half-width in cosine
  rockColor: new THREE.Color(0.09, 0.075, 0.07),
  oceanColor: new THREE.Color(0.02, 0.045, 0.055),
  iceColor: new THREE.Color(0.55, 0.62, 0.72),
  hazeColor: new THREE.Color(1.0, 0.55, 0.32),
  haze: 0.22,
  starIntensity: 1.15,           // artistic exposure on top of /π units
  // If Space Visuals exposes a brighter/dimmer star light, we still multiply by this.
};

/**
 * Resolve Proxima's light colour / brightness.
 * Space Visuals may expose any of: alphaCen.getStarLight('proxima'), proxima.getLight(),
 * proxima.lightColor + lightIntensity, or window.solar.alphaCenVisuals.getStarLight('proxima').
 * Falls back to ~3000 K orange-red.
 * @returns {{ color: THREE.Color, intensity: number }}
 */
export function resolveProximaLight(alphaCen) {
  const tryApi = (fn, arg) => {
    try {
      if (typeof fn !== 'function') return null;
      const r = arg !== undefined ? fn(arg) : fn();
      if (!r) return null;
      const color = r.color?.isColor ? r.color.clone()
        : r.color != null ? new THREE.Color(r.color)
          : r.isColor ? r.clone() : null;
      if (!color) return null;
      const intensity = r.intensity != null ? +r.intensity : (r.brightness != null ? +r.brightness : 1);
      return { color, intensity: Number.isFinite(intensity) ? intensity : 1 };
    } catch (_) { return null; }
  };
  return tryApi(alphaCen?.getStarLight, 'proxima')
    || tryApi(alphaCen?.proxima?.getLight)
    || (alphaCen?.proxima?.lightColor != null
      ? { color: new THREE.Color(alphaCen.proxima.lightColor), intensity: +(alphaCen.proxima.lightIntensity ?? 1) }
      : null)
    || tryApi(typeof window !== 'undefined' ? window.solar?.alphaCenVisuals?.getStarLight : null, 'proxima')
    || tryApi(typeof window !== 'undefined' ? window.solar?.visuals?.getStarLight : null, 'proxima')
    || { color: PROXIMA_COLOR.clone(), intensity: 1 };
}

/**
 * @param {object} o
 * @param {object} o.alphaCen          window.solar.alphaCen from alphacen/
 * @param {boolean} [o.isTouch]
 * @param {object}  [o.params]         overrides for DEFAULTS
 * @param {boolean} [o.replace=true]   call alphaCen.replacePlanetMesh('proximaB', …)
 */
export function createProximaB({ alphaCen, isTouch = false, params = {}, replace = true } = {}) {
  if (!alphaCen?.proximaB) {
    console.warn('[proximab] alphaCen.proximaB missing — defer install');
  }
  const P = { ...DEFAULTS, ...params };
  // Keep Color instances even when params pass hex/strings
  for (const k of ['atmoTint', 'rockColor', 'oceanColor', 'iceColor', 'hazeColor']) {
    if (!(P[k] instanceof THREE.Color)) P[k] = new THREE.Color(P[k]);
  }

  const radius = alphaCen?.proximaB?.radius ?? Math.max(0.35, 0.55 * Math.sqrt(1.07));
  const segs = isTouch ? 48 : 96;

  const U = {
    uStarDir:     { value: new THREE.Vector3(0, 0, 1) },
    uStarDirObj:  { value: new THREE.Vector3(0, 0, 1) },
    uStarColor:   { value: PROXIMA_COLOR.clone().multiplyScalar(P.starIntensity / Math.PI) },
    uAmbient:     { value: P.ambient },
    uOceanEdge:   { value: P.oceanEdge },
    uIceEdge:     { value: P.iceEdge },
    uOceanSpec:   { value: P.oceanSpec },
    uRockRough:   { value: P.rockRough },
    uIceBright:   { value: P.iceBright },
    uTerminator:  { value: P.terminator },
    uRockColor:   { value: P.rockColor.clone() },
    uOceanColor:  { value: P.oceanColor.clone() },
    uIceColor:    { value: P.iceColor.clone() },
    uHazeColor:   { value: P.hazeColor.clone() },
    uHaze:        { value: P.haze },
  };

  const atmoU = {
    uCenter:        { value: new THREE.Vector3() },
    uR:             { value: radius },
    uRa:            { value: radius * (1 + P.atmoThickness) },
    uStarDir:       U.uStarDir,          // shared
    uStarColor:     { value: PROXIMA_COLOR.clone().multiplyScalar(P.starIntensity) },
    uAtmoIntensity: { value: P.atmoIntensity },
    uAtmoTint:      { value: P.atmoTint.clone() },
  };

  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, Math.round(segs * 0.75)),
    createProximaBMaterial(U),
  );
  ground.name = 'planetMesh';
  ground.userData.proximaB = true;

  const atmosphere = createProximaBAtmosphere(radius, atmoU, P.atmoThickness, isTouch ? 32 : 64);

  // Wrapper so replacePlanetMesh swaps one object; atmosphere rides along as a child.
  const group = new THREE.Group();
  group.name = 'ProximaB';
  group.add(ground);
  group.add(atmosphere);

  const _starW = new THREE.Vector3();
  const _planetW = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _inv = new THREE.Matrix4();
  const _local = new THREE.Vector3();
  const _plusZ = new THREE.Vector3(0, 0, 1);
  const _q = new THREE.Quaternion();

  function syncParams() {
    U.uAmbient.value = P.ambient;
    U.uOceanEdge.value = P.oceanEdge;
    U.uIceEdge.value = P.iceEdge;
    U.uOceanSpec.value = P.oceanSpec;
    U.uRockRough.value = P.rockRough;
    U.uIceBright.value = P.iceBright;
    U.uTerminator.value = P.terminator;
    U.uRockColor.value.copy(P.rockColor);
    U.uOceanColor.value.copy(P.oceanColor);
    U.uIceColor.value.copy(P.iceColor);
    U.uHazeColor.value.copy(P.hazeColor);
    U.uHaze.value = P.haze;
    atmoU.uAtmoIntensity.value = P.atmoIntensity;
    atmoU.uAtmoTint.value.copy(P.atmoTint);
    atmoU.uRa.value = radius * (1 + P.atmoThickness);
  }

  function applyStarLight() {
    const L = resolveProximaLight(alphaCen);
    U.uStarColor.value.copy(L.color).multiplyScalar((L.intensity * P.starIntensity) / Math.PI);
    atmoU.uStarColor.value.copy(L.color).multiplyScalar(L.intensity * P.starIntensity);
  }

  /** Orient so object +Z (substellar) faces Proxima; refresh lighting uniforms. */
  function update() {
    if (!alphaCen?.proxima || !alphaCen?.proximaB) return;
    syncParams();
    applyStarLight();
    alphaCen.proxima.getWorldPosition(_starW);
    alphaCen.proximaB.getWorldPosition(_planetW);
    _dir.subVectors(_starW, _planetW);
    if (_dir.lengthSq() < 1e-12) return;
    _dir.normalize();
    U.uStarDir.value.copy(_dir);
    atmoU.uCenter.value.copy(_planetW);
    atmoU.uR.value = radius;

    // Orient the wrapper: local +Z → world star direction (tidal lock).
    const parent = group.parent;
    if (parent) {
      _inv.copy(parent.matrixWorld).invert();
      _local.copy(_dir).transformDirection(_inv).normalize();
      _q.setFromUnitVectors(_plusZ, _local);
      group.quaternion.copy(_q);
    } else {
      // Not yet attached — point +Z along +Z (identity); star dir still set for lighting.
      group.quaternion.identity();
    }
    // After lock, star in object space is +Z
    U.uStarDirObj.value.set(0, 0, 1);
  }

  ground.onBeforeRender = () => { update(); };

  function install() {
    if (!alphaCen?.replacePlanetMesh) return false;
    alphaCen.replacePlanetMesh('proximaB', group);
    update();
    return true;
  }

  if (replace && alphaCen) install();

  // Re-install after Space Visuals rebuilds planets via useVisuals()
  if (alphaCen && typeof alphaCen.useVisuals === 'function' && !alphaCen._proximaBPatched) {
    const orig = alphaCen.useVisuals.bind(alphaCen);
    alphaCen.useVisuals = (v) => {
      orig(v);
      install();
    };
    alphaCen._proximaBPatched = true;
  }

  function dispose() {
    ground.geometry.dispose();
    ground.material.dispose();
    atmosphere.geometry.dispose();
    atmosphere.material.dispose();
  }

  const api = {
    group,
    mesh: ground,
    atmosphere,
    radius,
    params: P,
    uniforms: U,
    atmoUniforms: atmoU,
    update,
    install,
    dispose,
    resolveProximaLight: () => resolveProximaLight(alphaCen),
    stats: () => ({
      radius,
      oceanEdge: P.oceanEdge,
      installed: !!(group.parent),
      star: (() => {
        const L = resolveProximaLight(alphaCen);
        return { hex: '#' + L.color.getHexString(), intensity: L.intensity };
      })(),
    }),
  };
  return api;
}

/**
 * Self-registering install: waits for window.solar.alphaCen, then creates Proxima b.
 * Safe to call once from main.js (or import for side effect after solar is exposed).
 */
export function installProximaB(opts = {}) {
  const go = () => {
    const ac = typeof window !== 'undefined' ? window.solar?.alphaCen : null;
    if (!ac) return null;
    if (window.solar.proximaB?.mesh) return window.solar.proximaB;
    const pb = createProximaB({ alphaCen: ac, isTouch: !!opts.isTouch, params: opts.params });
    window.solar.proximaB = pb;
    return pb;
  };
  const existing = go();
  if (existing) return existing;
  let n = 0;
  const id = setInterval(() => {
    n++;
    if (go() || n > 200) clearInterval(id);
  }, 50);
  return null;
}
