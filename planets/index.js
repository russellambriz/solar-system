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
// per-frame call is needed in animate().
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
function patchPlanetMaterial(material, U) {
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
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{ float rs = ringShadow(vPWorld); reflectedLight.directDiffuse *= rs; reflectedLight.directSpecular *= rs; }
// Night-side rim: a faint, surface-tinted fresnel edge only where the Sun isn't shining, so the silhouette stays readable
// against black space now that the global ambient light is low. Not physical (think of it as a hint of skyglow).
{ vec3 Lv = normalize((viewMatrix * vec4(normalize(uSunPos - vPWorld), 0.0)).xyz);
  float night = smoothstep(0.05, -0.35, dot(normal, Lv));
  float rimF = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 3.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uNightRim * rimF * night; }`);
  };
  material.customProgramCacheKey = () => 'planets-fx';
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
  patchPlanetMaterial(mat, U);                      // ring shadow (Saturn/Uranus) + night-side rim (all)

  loadTexture(cfg.file, isTouch, true, (tex) => {
    mat.map = tex; mat.needsUpdate = true;
    if (fallbackMap && fallbackMap !== tex) fallbackMap.dispose();
  });

  let atmosphere = null;
  if (cfg.atmo) { atmosphere = createAtmosphere(radius, cfg.atmo, U, isTouch ? 48 : 64); tiltGroup.add(atmosphere); }

  const fx = { name, mesh, radius, uniforms: U, atmosphere, ring: null, sunLight };
  mesh.userData.planetFX = fx;
  const prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...args) { updateFX(fx); prev.apply(this, args); };
  return fx;
}

function updateFX(fx) {
  const U = fx.uniforms;
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
