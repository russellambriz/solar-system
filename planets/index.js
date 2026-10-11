// planets/index.js — real texture maps, sun-facing atmosphere rims and lit rings for Mercury, Venus, Jupiter, Saturn,
// Uranus and Neptune. (Earth, Moon and Mars have their own modules and are deliberately not handled here.)
//
// Hook into main.js (planet loop), see the CHANGELOG:
//   import { addPlanetFX, createPlanetRing } from './planets/index.js';
//   tiltGroup.add(mesh);
//   addPlanetFX({ name: p.name, mesh, tiltGroup, radius, sunLight, isTouch: IS_TOUCH });   // no-op for other names
//   ...
//   if (p.name === 'Saturn' || p.name === 'Uranus')
//     tiltGroup.add(createPlanetRing({ name: p.name, mesh, radius, sunLight, isTouch: IS_TOUCH, fallback: ... }));
//
// Everything is lit from sunLight's *world position*, read right before each mesh is drawn (onBeforeRender), so no
// per-frame call is needed in animate(). Cloud motion (Venus, Jupiter, Saturn, Neptune; see FLOW) is clocked the same
// way, from the mesh's sim-time-driven spin.
//
// Scale note: main.js draws planet radii as 0.95·sqrt(diameter / Earth's) and squeezes distances, so all sizes here are
// expressed as multiples of the drawn planet radius. That keeps rings and atmospheres in the right proportion to their
// planet even though planets are not to scale with each other or with their orbits.
import * as THREE from 'three';

const BASE = new URL('../textures/planets/', import.meta.url);

// Which bodies this module owns. `atmo`: rim-glow colour (linear RGB), strength, shell thickness (× radius), falloff power.
// Mars is intentionally absent (owned by the mars/ module).
const PLANETS = {
  Mercury: { file: 'mercury.jpg', atmo: null, roughness: 1.0 },                                       // airless
  Venus:   { file: 'venus.jpg',   atmo: { color: [1.0, 0.86, 0.55], strength: 0.85, thickness: 0.045, power: 2.2 }, roughness: 1.0 },
  Jupiter: { file: 'jupiter.jpg', atmo: { color: [1.0, 0.82, 0.6], strength: 0.30, thickness: 0.02, power: 3.0 }, roughness: 1.0 },
  Saturn:  { file: 'saturn.jpg',  atmo: { color: [1.0, 0.85, 0.6], strength: 0.30, thickness: 0.02, power: 3.0 }, roughness: 1.0 },
  Uranus:  { file: 'uranus.jpg',  atmo: { color: [0.45, 0.85, 1.0], strength: 0.45, thickness: 0.03, power: 2.6 }, roughness: 1.0 },
  Neptune: { file: 'neptune.jpg', atmo: { color: [0.35, 0.55, 1.0], strength: 0.50, thickness: 0.03, power: 2.6 }, roughness: 1.0 },
};

// Ring radii as multiples of the planet's drawn radius (real ratios, so they stay correct with main.js' sqrt sizing).
// Saturn: the Solar System Scope ring strip runs from just inside the C ring (~1.17 Rs) to just outside the A ring
// (~2.35 Rs); calibrated so its Cassini Division lands at ~1.98 Rs (real: 1.95–2.03 Rs) and the B ring's inner edge at 1.53 Rs.
// Uranus keeps main.js' earlier stylised 1.6–2.0 band (real epsilon ring ≈ 2.0 Ru) with its procedural strip.
const RINGS = {
  Saturn: { inner: 1.166, outer: 2.35, file: 'saturn_ring.png', opacity: 1.0, brightness: 2.6, forward: 1.0 },
  Uranus: { inner: 1.6, outer: 2.0, file: null, opacity: 0.5, brightness: 1.0, forward: 0.0 },
};

// Night-side readability (main.js' ambient light is 0.04): strength of the planets' night rim, and of the dim camera
// "headlight" fill that keeps unlit moons and dwarf planets from going pure black (≈4% of the Sun's light, so day sides barely change).
const NIGHT_RIM = 0.35;
const NIGHT_FILL = 0.12;

// ------------------------------------------------------------------------------------------------------------------
// Cloud motion. The clock is the planet's own spin: main.js sets mesh.rotation.y = f(simTime) every frame (and leaves
// it alone while paused), so the drift is read from how far the mesh turned since the last frame. No main.js hook is
// needed, motion stops when the sim is paused, scales with the time-warp, and every drift is measured relative to the
// displayed (50x slowed) rotation, so the wind/rotation ratio is the real one times `exag` (Jupiter 5x, Saturn 1.5x:
// real jets move only ~1-4% of a turn per rotation, invisible next to the spin; Neptune 0.15x: kept subtle on purpose).
//
// mode 'rigid' (Venus): one texture sample, the whole cloud deck slides around the planet (Venus' clouds superrotate
//   at a near-constant angular rate, lapping the planet in ~4 days against the solid body's 243-day retrograde spin).
// mode 'zonal' (Jupiter, Saturn, Neptune): latitude-dependent zonal wind w(lat) in m/s, a sum of Gaussian jets
//   [lat°, m/s, width°] in the map's own latitudes. The band at `baseLat` (Jupiter: the Great Red Spot's) moves as a
//   rigid offset that never resets, so that band and the GRS travel around the planet indefinitely without smearing.
//   Everything else is the difference w(lat) - w(baseLat), shown flow-map style: two samples displaced by
//   rel·(phase-0.5)·P with phases half a cycle apart, crossfaded with a triangle weight, so no feature is displaced by
//   more than `maxDisp` of the map width (no endless shear) and there is no seam. A soft mask around the GRS keeps the
//   vortex coherent: it rides its band instead of being sheared by its neighbouring jets.
// `veq`: equatorial rotation speed (m/s) to turn winds into "map widths per rotation" (w / (veq·cos lat)).
// `maxSpeed`: cap on the fastest visible drift in map widths per wall-clock second, so high time-warp never strobes
// (the flow cycle then never runs faster than 2·maxDisp/maxSpeed ≈ 1.25 s). At the default 10 d/s nothing is capped.
// Cost: Venus 1 texture sample, the zonal planets 2 (instead of 1); ~12 exp() per fragment for the wind profile.
const FLOW = {
  Venus: { mode: 'rigid', perTurn: 243.02 / 4.0 - 1.0, maxSpeed: 0.03 },          // clouds ~4 d vs the body's 243 d
  Jupiter: {
    mode: 'zonal', veq: 12570, exag: 5, maxSpeed: 0.04, maxDisp: 0.025, baseLat: -19,
    jets: [[0, 100, 8], [19, 140, 2.5], [25, -30, 2.5], [31, 40, 2.5], [36, -20, 3], [43, 30, 3],
           [-7, 30, 3], [-15, -50, 2.5], [-19, -40, 5], [-24, 45, 3], [-31, -20, 3], [-37, 35, 3]],
    spot: { u: 0.363, lat: -19, du: 0.042, dlat: 7.5 },     // Great Red Spot in the texture (u, planetographic lat)
  },
  Saturn: {
    mode: 'zonal', veq: 9960, exag: 1.5, maxSpeed: 0.04, maxDisp: 0.025, baseLat: null,
    jets: [[0, 400, 18], [40, -25, 3], [-40, -25, 3], [47, 90, 3.5], [-47, 90, 3.5], [55, -15, 3], [-55, -15, 3],
           [62, 75, 3], [-62, 75, 3], [76, 110, 2.5], [-72, 60, 3]],
  },
  Neptune: {                                                // -400 m/s retrograde equator, +250 m/s at ±70°; kept faint
    mode: 'zonal', veq: 2680, exag: 0.15, maxSpeed: 0.01, maxDisp: 0.01, baseLat: null,
    jets: [[0, -400, 30], [70, 250, 14], [-70, 250, 14]],
  },
};
const zonalWind = (jets, lat) => jets.reduce((w, [l, a, s]) => w + a * Math.exp(-(((lat - l) / s) ** 2)), 0);
const relPerTurn = (w, lat, veq) => w / (veq * Math.max(Math.cos(THREE.MathUtils.degToRad(lat)), 0.3));
const fract1 = (x) => x - Math.floor(x);

const loader = new THREE.TextureLoader();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3();

/** Loads textures/planets/<set>/<file>; on failure `onError` runs and the caller keeps its procedural texture. */
function loadTexture(file, isTouch, srgb, onLoad, onError) {
  const url = new URL(`${isTouch ? 'mobile' : 'desktop'}/${file}`, BASE).href;   // iPad: 1024 px set, desktop: 2048 px
  const tex = loader.load(url, () => onLoad(tex), undefined, () => {
    console.warn(`[planets] could not load ${url}; keeping the procedural texture`);   // warn, not error
    onError && onError();
  });
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = isTouch ? 4 : 8;
  return tex;
}

// ------------------------------------------------------------------------------------------------------------------
// Planet surface: MeshStandardMaterial (so it matches the rest of the scene's lighting) with a real map and, for
// ringed planets, an analytic ring shadow injected with onBeforeCompile.
// ------------------------------------------------------------------------------------------------------------------
const FLOW_GLSL = /* glsl */`
#ifdef FLOW_MODE
uniform float uFlowBase;          // rigid offset (map widths, wrapped to [0,1))
#if FLOW_MODE == 2
uniform float uFlowPhase, uFlowP, uFlowW0, uFlowK, uSpotOn;
uniform vec3 uJets[JET_COUNT];    // lat (deg), wind (m/s), width (deg)
uniform vec4 uSpot;               // u, lat, half-size u, half-size lat
float zonalWind(float lat) {
  float w = 0.0;
  for (int i = 0; i < JET_COUNT; i++) { float d = (lat - uJets[i].x) / uJets[i].z; w += uJets[i].y * exp(-d * d); }
  return w;
}
#endif
#endif`;
const FLOW_MAP_FRAGMENT = /* glsl */`
#ifdef USE_MAP
  #if defined(FLOW_MODE) && FLOW_MODE == 1
  vec4 sampledDiffuseColor = texture2D(map, vec2(vMapUv.x - uFlowBase, vMapUv.y));
  #elif defined(FLOW_MODE) && FLOW_MODE == 2
  float fLat = (vMapUv.y - 0.5) * 180.0;
  float fx0 = vMapUv.x - uFlowBase;                        // map u after the rigid band offset
  // wind relative to the rigid band, in map widths per unit of the flow clock
  float rel = (zonalWind(fLat) / max(cos(radians(fLat)), 0.3) - uFlowW0) * uFlowK;
  if (uSpotOn > 0.5) {                                     // keep the Great Red Spot coherent (super-Gaussian mask)
    vec2 sd = vec2(fract(fx0 - uSpot.x + 0.5) - 0.5, fLat - uSpot.y) / uSpot.zw;
    float r2 = dot(sd, sd);
    rel *= 1.0 - exp(-r2 * r2);
  }
  float ph1 = fract(uFlowPhase + 0.5);
  vec4 s0 = texture2D(map, vec2(fx0 - rel * (uFlowPhase - 0.5) * uFlowP, vMapUv.y));
  vec4 s1 = texture2D(map, vec2(fx0 - rel * (ph1 - 0.5) * uFlowP, vMapUv.y));
  // triangle crossfade: each sample is fully hidden at the instant its displacement wraps
  vec4 sampledDiffuseColor = mix(s0, s1, abs(2.0 * uFlowPhase - 1.0));
  #else
  vec4 sampledDiffuseColor = texture2D(map, vMapUv);
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`;

function patchPlanetMaterial(material, U, flowKey = 'none') {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPWorld;
uniform vec3 uSunPos, uRingCenter, uRingNormal;
uniform float uRingInner, uRingOuter, uRingOpacity, uHasRing, uNightRim;
uniform sampler2D uRingMap;
${FLOW_GLSL}
// Fraction of sunlight that gets through the ring plane on the way from this point to the Sun (1 = no ring in the way).
float ringShadow(vec3 p) {
  if (uHasRing < 0.5) return 1.0;
  vec3 L = normalize(uSunPos - p);
  float den = dot(L, uRingNormal);
  if (abs(den) < 1e-5) return 1.0;
  float t = dot(uRingCenter - p, uRingNormal) / den;
  if (t <= 0.0) return 1.0;
  float r = length(p + L * t - uRingCenter);
  float u = (r - uRingInner) / (uRingOuter - uRingInner);
  if (u < 0.0 || u > 1.0) return 1.0;
  return 1.0 - 0.92 * texture2D(uRingMap, vec2(u, 0.5)).a * uRingOpacity;
}`)
      .replace('#include <map_fragment>', FLOW_MAP_FRAGMENT)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{ float rs = ringShadow(vPWorld); reflectedLight.directDiffuse *= rs; reflectedLight.directSpecular *= rs; }
// Night-side rim: a faint, surface-tinted fresnel edge only where the Sun isn't shining, so the silhouette stays readable
// against black space now that the global ambient light is low. Not physical (think of it as a hint of skyglow).
{ vec3 Lv = normalize((viewMatrix * vec4(normalize(uSunPos - vPWorld), 0.0)).xyz);
  float night = smoothstep(0.05, -0.35, dot(normal, Lv));
  float rimF = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 3.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uNightRim * rimF * night; }`);
  };
  material.customProgramCacheKey = () => 'planets-fx-' + flowKey;
}

// ------------------------------------------------------------------------------------------------------------------
// Atmosphere: a slightly larger additive shell. Brightness = fresnel rim × how sunlit that part of the limb is, so it
// glows on the day-side limb and fades to nothing across the terminator.
// ------------------------------------------------------------------------------------------------------------------
const ATMO_VERT = /* glsl */`
varying vec3 vN; varying vec3 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ATMO_FRAG = /* glsl */`
uniform vec3 uSunPos, uColor, uCenter; uniform float uStrength, uPower, uR, uRa;
varying vec3 vN; varying vec3 vP;
void main() {
  // Impact parameter of the view ray: d = closest distance from the planet centre. The glow peaks at the limb (d = R)
  // and fades to zero both outward (at the shell edge, so there is no hard outline) and inward across the disc.
  vec3 D = normalize(vP - cameraPosition);
  vec3 oc = uCenter - cameraPosition;
  float b = dot(oc, D);
  vec3 closest = cameraPosition + D * b;
  float d = length(closest - uCenter);
  float g = d > uR ? pow(clamp((uRa - d) / (uRa - uR), 0.0, 1.0), 2.0)
                   : pow(clamp(d / uR, 0.0, 1.0), uPower * 4.0);
  // which part of the atmosphere this is: the limb point for rays that miss the planet, the shell point otherwise
  vec3 N = d > uR ? normalize(closest - uCenter) : normalize(vN);
  vec3 L = normalize(uSunPos - uCenter);              // sun direction from the planet's centre
  float day = smoothstep(-0.25, 0.45, dot(N, L));     // fade out across the terminator (a little twilight wrap)
  // a touch brighter when looking toward the Sun through the limb (forward scattering in the haze)
  float fwd = 1.0 + 0.6 * pow(max(dot(D, L), 0.0), 4.0);
  float a = g * day * fwd * uStrength;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

function createAtmosphere(radius, cfg, U, segs) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunPos: U.uSunPos, uCenter: U.uCenter, uColor: { value: new THREE.Color(...cfg.color) },
      uStrength: { value: cfg.strength }, uPower: { value: cfg.power }, uR: U.uR, uRa: { value: 0 } },
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius * (1 + cfg.thickness), segs, segs / 2), mat);
  m.name = 'atmosphere';
  m.userData.thickness = cfg.thickness;
  m.onBeforeRender = () => { mat.uniforms.uRa.value = U.uR.value * (1 + cfg.thickness); };
  m.raycast = () => {};                               // never steal picks from main.js' pick spheres
  return m;
}

/**
 * Upgrades an existing planet mesh in place: real texture (the procedural map stays until it loads, and stays for good
 * if the load fails), sun-facing atmosphere rim, ring-shadow hook. Returns null for bodies this module doesn't own.
 */
export function addPlanetFX({ name, mesh, tiltGroup, radius, sunLight, isTouch = false }) {
  const cfg = PLANETS[name];
  if (!cfg) return null;
  const old = mesh.material;
  const fallbackMap = old.map;
  const mat = new THREE.MeshStandardMaterial({ map: fallbackMap, roughness: cfg.roughness, metalness: 0 });
  old.dispose();
  mesh.material = mat;

  const U = {
    uSunPos: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() },
    uRingCenter: { value: new THREE.Vector3() }, uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
    uRingInner: { value: 0 }, uRingOuter: { value: 1 }, uRingOpacity: { value: 0 }, uHasRing: { value: 0 },
    uRingMap: { value: null }, uR: { value: radius }, uNightRim: { value: NIGHT_RIM },
  };
  const flow = setupFlow(name, mat, U);
  patchPlanetMaterial(mat, U, flow ? flow.key : 'none');   // ring shadow (Saturn/Uranus) + night-side rim (all) + cloud flow
  if (flow && fallbackMap) { fallbackMap.wrapS = THREE.RepeatWrapping; fallbackMap.needsUpdate = true; }

  loadTexture(cfg.file, isTouch, true, (tex) => {
    if (flow) tex.wrapS = THREE.RepeatWrapping;       // drifting u must wrap around the planet without a seam
    mat.map = tex; mat.needsUpdate = true;
    if (fallbackMap && fallbackMap !== tex) fallbackMap.dispose();
  });

  let atmosphere = null;
  if (cfg.atmo) { atmosphere = createAtmosphere(radius, cfg.atmo, U, isTouch ? 48 : 64); tiltGroup.add(atmosphere); }

  const fx = { name, mesh, radius, uniforms: U, atmosphere, ring: null, sunLight, flow };
  mesh.userData.planetFX = fx;
  const prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...args) { updateFX(fx, args[0]); prev.apply(this, args); };
  return fx;
}

/** Adds the cloud-flow defines/uniforms for planets listed in FLOW; returns the per-planet flow state (or null). */
function setupFlow(name, mat, U) {
  const c = FLOW[name];
  if (!c) return null;
  const f = { cfg: c, lastRot: null, lastT: 0, lastFrame: -1, clock: 0, base: 0, key: c.mode };
  U.uFlowBase = { value: 0 };
  if (c.mode === 'rigid') {
    mat.defines = { ...mat.defines, FLOW_MODE: 1 };
    f.basePerClock = c.perTurn;                      // map widths per planet turn
    f.capClock = c.maxSpeed / Math.abs(c.perTurn);   // planet turns per wall second at the speed cap
    return f;
  }
  const K = 1 / c.veq;                               // clock unit = one exaggerated planet turn (exag applied to the clock)
  // w0: the rigid band's angular wind (m/s at the equator equivalent), so rel(baseLat) is exactly 0
  const w0 = c.baseLat == null ? 0 : relPerTurn(zonalWind(c.jets, c.baseLat), c.baseLat, 1);
  f.basePerClock = w0 * K;                           // map widths per clock unit
  let relMax = Math.abs(f.basePerClock), shearMax = 0;
  for (let lat = -70; lat <= 70; lat += 0.5) {
    const a = relPerTurn(zonalWind(c.jets, lat), lat, 1);
    relMax = Math.max(relMax, Math.abs(a * K));      // fastest total drift (caps the clock)
    shearMax = Math.max(shearMax, Math.abs((a - w0) * K));   // fastest drift relative to the rigid band
  }
  f.capClock = c.maxSpeed / Math.max(relMax, shearMax);   // no band moves faster than maxSpeed map widths / s
  f.period = (2 * c.maxDisp) / shearMax;              // flow cycle length in clock units → |displacement| ≤ maxDisp
  mat.defines = { ...mat.defines, FLOW_MODE: 2, JET_COUNT: c.jets.length };
  f.key = `zonal${c.jets.length}`;
  Object.assign(U, {
    uFlowPhase: { value: 0.5 }, uFlowP: { value: f.period }, uFlowW0: { value: w0 }, uFlowK: { value: K },
    uJets: { value: c.jets.map(([l, a, s]) => new THREE.Vector3(l, a, s)) },
    uSpot: { value: c.spot ? new THREE.Vector4(c.spot.u, c.spot.lat, c.spot.du, c.spot.dlat) : new THREE.Vector4(0, 0, 1, 1) },
    uSpotOn: { value: c.spot ? 1 : 0 },
  });
  return f;
}

/** Advances the flow clock from the mesh's spin (= sim time), once per rendered frame, capped per wall second. */
function updateFlow(fx, renderer) {
  const f = fx.flow, U = fx.uniforms;
  const frame = renderer && renderer.info ? renderer.info.render.frame : -2;
  if (frame === f.lastFrame && frame !== -2) return;  // already advanced this frame (e.g. a second render pass)
  f.lastFrame = frame;
  const now = performance.now(), rot = fx.mesh.rotation.y;
  if (f.lastRot === null) { f.lastRot = rot; f.lastT = now; return; }
  const dt = Math.min((now - f.lastT) / 1000, 0.1);
  let d = ((rot - f.lastRot) / (2 * Math.PI)) * (f.cfg.mode === 'rigid' ? 1 : f.cfg.exag);   // clock units
  f.lastRot = rot; f.lastT = now;
  const cap = f.capClock * dt;
  if (d > cap) d = cap; else if (d < -cap) d = -cap;
  f.clock += d;
  f.base = fract1(f.base + d * f.basePerClock);
  U.uFlowBase.value = f.base;
  if (U.uFlowPhase) U.uFlowPhase.value = fract1(f.clock / f.period);
}

function updateFX(fx, renderer) {
  const U = fx.uniforms;
  if (fx.flow) updateFlow(fx, renderer);
  fx.sunLight.getWorldPosition(U.uSunPos.value);
  fx.mesh.getWorldPosition(U.uCenter.value);
  fx.mesh.getWorldScale(_s);
  U.uR.value = fx.radius * _s.x;
  if (fx.ring) {
    const r = fx.ring;
    r.getWorldPosition(U.uRingCenter.value);
    r.getWorldQuaternion(_q); r.getWorldScale(_s);
    U.uRingNormal.value.set(0, 0, 1).applyQuaternion(_q).normalize();   // RingGeometry lies in its local XY plane
    U.uRingInner.value = r.userData.inner * _s.x;
    U.uRingOuter.value = r.userData.outer * _s.x;
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Rings: thin sheet lit by the Sun. Lit face: diffuse reflection; unlit face: light diffusing through the sheet, which
// makes sparse rings glow and dense ones (B ring) go dark, as in Cassini images. Analytic planet shadow (ray-sphere test
// toward the Sun) and forward scattering when the Sun is behind the rings.
// ------------------------------------------------------------------------------------------------------------------
const RING_VERT = /* glsl */`
varying vec3 vLocal; varying vec3 vP; varying vec3 vN;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const RING_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSunPos, uSunColor, uPlanetCenter;
uniform float uInner, uOuter, uPlanetR, uOpacity, uBrightness, uForward, uAmbient;
varying vec3 vLocal; varying vec3 vP; varying vec3 vN;
void main() {
  float u = (length(vLocal.xy) - uInner) / (uOuter - uInner);   // exact radial coordinate (not interpolated uv)
  if (u < 0.0 || u > 1.0) discard;
  vec4 tex = texture2D(uMap, vec2(u, 0.5));
  float alpha = tex.a * uOpacity;
  if (alpha < 0.003) discard;
  vec3 albedo = tex.rgb * uBrightness;

  vec3 L = normalize(uSunPos - vP);
  vec3 V = normalize(cameraPosition - vP);
  vec3 N = normalize(vN);
  float nl = dot(N, L), nv = dot(N, V);
  float mu0 = abs(nl);

  // planet shadow: does the ray toward the Sun hit the planet sphere? (soft ~2% penumbra)
  vec3 oc = uPlanetCenter - vP;
  float b = dot(oc, L);
  float d = sqrt(max(dot(oc, oc) - b * b, 0.0));
  float lit = b > 0.0 ? smoothstep(uPlanetR * 0.985, uPlanetR * 1.02, d) : 1.0;

  // the sheet is thin: brighter at low tilt-to-sun only weakly (dense rings are optically thick)
  float illum = 0.3 + 0.7 * sqrt(mu0);
  bool sameSide = nl * nv > 0.0;
  // unlit face: transmitted light ∝ how much light leaks through (1 - tau) times what scatters (tau)
  float face = sameSide ? 1.0 : 2.2 * (1.0 - alpha) * 1.0;
  // forward scattering: brightest looking toward the Sun through the rings (dusty, sparse rings light up most)
  float fwd = uForward * pow(max(dot(-V, L), 0.0), 6.0) * (0.35 + (1.0 - alpha)) * 1.6;
  vec3 col = albedo * uSunColor * (illum * face + fwd) * lit + albedo * uAmbient;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Builds a sun-lit ring for Saturn or Uranus and registers it with the planet (ring shadow on the planet's surface).
 * `fallback` is main.js' procedural strip texture factory; it is shown until the real strip loads (Saturn) or for good (Uranus).
 */
export function createPlanetRing({ name, mesh, radius, sunLight, isTouch = false, fallback }) {
  const cfg = RINGS[name];
  const inner = radius * cfg.inner, outer = radius * cfg.outer;
  const geo = new THREE.RingGeometry(inner, outer, isTouch ? 128 : 192, 1);
  const U = {
    uMap: { value: fallback() },
    uSunPos: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uPlanetCenter: { value: new THREE.Vector3() }, uPlanetR: { value: radius },
    uInner: { value: inner }, uOuter: { value: outer }, uOpacity: { value: cfg.opacity },
    uBrightness: { value: cfg.file ? cfg.brightness : 1.0 }, uForward: { value: cfg.forward },
    uAmbient: { value: 0.1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;                   // into the planet's equatorial plane (tiltGroup's XZ)
  ring.name = `${name} rings`;
  ring.userData.inner = inner; ring.userData.outer = outer;

  const fx = mesh.userData.planetFX;
  const P = fx ? fx.uniforms : null;
  const setShadowMap = (tex) => { if (P) { P.uRingMap.value = tex; P.uRingOpacity.value = cfg.opacity; P.uHasRing.value = 1; } };
  setShadowMap(U.uMap.value);
  if (fx) fx.ring = ring;

  if (cfg.file) {
    loadTexture(cfg.file, isTouch, true, (tex) => {
      const old = U.uMap.value;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      U.uMap.value = tex; setShadowMap(tex);
      U.uBrightness.value = cfg.brightness;
      if (old && old !== tex) old.dispose();
    }, () => { U.uBrightness.value = 1.0; });       // procedural strip is already bright
    U.uBrightness.value = 1.0;                       // until the real strip arrives
  }

  const _r = new THREE.Vector3();
  ring.onBeforeRender = () => {
    sunLight.getWorldPosition(U.uSunPos.value);
    mesh.getWorldPosition(U.uPlanetCenter.value);
    mesh.getWorldScale(_r);
    U.uPlanetR.value = radius * _r.x;
    // match MeshStandardMaterial's Lambert response to the same light: colour × intensity / π
    U.uSunColor.value.copy(sunLight.color).multiplyScalar(sunLight.intensity / Math.PI);
  };
  return ring;
}

/**
 * A very dim light that sits at the camera (a "headlight"): night sides of every MeshStandard body (moons, dwarf
 * planets, Mars) facing the viewer get a faint fill, brightest at the disc centre, so they don't vanish against black
 * space. Custom-shaded bodies (Earth, Moon, rings, atmospheres) ignore it. Position is refreshed by scene.onBeforeRender.
 */
export function addNightFill(scene, intensity = NIGHT_FILL) {
  const light = new THREE.PointLight(0xc8d4ff, intensity, 0, 0);   // decay 0, slightly cool like starlight
  light.name = 'night fill (camera headlight)';
  scene.add(light);
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, ...rest) {
    camera.getWorldPosition(light.position);
    light.updateMatrixWorld();                       // the scene graph was already updated for this frame
    prev.call(this, renderer, sc, camera, ...rest);
  };
  return light;
}

export const PLANET_FX_NAMES = Object.keys(PLANETS);
