// moon/index.js — MoonBot's Moon: real NASA LRO maps, lunar photometry, earthshine, LOD and size easing.
//
// Hook into main.js (Earth branch):
//   import { createMoonMesh, updateMoon } from './moon/index.js';
//   const moonMesh = createMoonMesh({ radius: moonR, isTouch: IS_TOUCH });       // replaces the old Mesh(...)
//   ...after the Moon body is built:  moonBody.baseRadius = moonR;
// and in animate(), right after updateBodies():
//   updateMoon(moonBody, camera, sunLight);
//
// The mesh is a THREE.LOD, so main.js can keep using moonBody.mesh.rotation.y for tidal locking.
import * as THREE from 'three';
import { VERT, FRAG } from './shaders.js';

const BASE = new URL('../textures/moon/', import.meta.url);
const REAL_RATIO = 0.273;           // real Moon radius / Earth radius
const OVERVIEW_RATIO = 0.5;         // what main.js draws at overview zoom (moonR = Earth radius * 0.5)

// Selenographic lat/lon (deg, east-positive) -> unit vector in mesh space (+x = lon 0 facing Earth, +y = north, east = -z).
function seleno(latDeg, lonDeg) {
  const la = THREE.MathUtils.degToRad(latDeg), lo = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

// Second-tier ray craters: younger, smaller craters whose bright ejecta stand out at full Moon, after the big four
// (Tycho, Copernicus, Kepler, Aristarchus). Positions and sizes from the IAU names via Wikipedia; ray lengths are
// the published reach where there is one (Proclus 600+ km, Anaxagoras 900+ km, Thales 600+ km) and rough
// visual estimates otherwise. Proclus formed at a low angle, so it has no ejecta in an arc to the southwest
// (Palus Somni sits in that gap).
//   [name, lat, lon, crater diameter km, longest ray km, rays around the rim, strength, ray-free arc centre deg,
//    half-width deg, ray width scale km (rays of small young craters are wider than the crater size alone gives)]
const MINOR_RAYS = [
  ['Proclus', 16.1, 46.8, 27, 620, 16, 2.2, 225, 55, 42],
  ['Anaxagoras', 73.48, -10.17, 51.9, 920, 22, 1.6, 0, 0, 52],
  ['Thales', 61.8, 50.3, 32, 600, 18, 1.5, 0, 0, 42],
  ['Glushko', 8.4, -77.6, 43, 420, 20, 1.7, 0, 0, 46],
  ['Byrgius A', -24.5, -63.7, 19, 380, 16, 1.7, 0, 0, 38],
  ['Stevinus A', -31.8, 51.6, 8, 260, 14, 1.8, 0, 0, 30],
  ['Furnerius A', -33.5, 59.0, 12, 300, 14, 1.6, 0, 0, 32],
  ['Censorinus', -0.4, 32.7, 4.1, 60, 10, 1.8, 0, 0, 8],
];
const KM = 1 / 1737.4;   // km -> radians of arc on the Moon

const _sun = new THREE.Vector3(), _earth = new THREE.Vector3(), _moon = new THREE.Vector3();

// The maps wrap around in longitude, so filtering at the 180° meridian (the u = 0/1 edge on the far side) must
// blend the left and right edge columns. With the default clamp each side stopped at its own edge texel, which
// drew a hard vertical seam down the far side, worst on iPad's magnified 1K maps.
function wrapLon(t) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t; }

function loadTex(file, srgb) {
  const t = wrapLon(new THREE.TextureLoader().load(new URL(file, BASE).href));
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

// Elevation map for terrain shadows: read exactly, so no mipmaps or colour conversion (see SOURCES.md for the encoding).
function loadHeight(file, onReady) {
  const t = wrapLon(new THREE.TextureLoader().load(new URL(file, BASE).href, onReady));
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// CPU copy of the 1K elevation map, so latLonToWorld can put markers on the displaced ground (uRelief) instead of
// the reference sphere. Read with no colour conversion so the bytes are exact. Until it's loaded, heights are 0.
let _hgt = null;
const RELIEF = 2.0;
function loadHeightCpu(file) {
  if (_hgt || typeof fetch === 'undefined' || typeof createImageBitmap === 'undefined') return;
  _hgt = { w: 0, h: 0, km: null };
  fetch(new URL(file, BASE).href).then((r) => r.blob())
    .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
    .then((img) => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data, km = new Float32Array(img.width * img.height);
      for (let i = 0; i < km.length; i++) km[i] = -9.5 + 20.5 * (d[4 * i] * 256 + d[4 * i + 1]) / 65472;
      _hgt.w = img.width; _hgt.h = img.height; _hgt.km = km;
    })
    .catch(() => {});   // markers just sit on the reference sphere
}
/** LOLA height (km above the 1737.4 km sphere) at selenographic lat/lon, bilinear; 0 until the map has loaded. */
export function surfaceHeightKm(latDeg, lonDeg) {
  if (!_hgt || !_hgt.km) return 0;
  const { w, h, km } = _hgt;
  const x = ((((lonDeg + 180) / 360) % 1 + 1) % 1) * w - 0.5, y = Math.min(Math.max((90 - latDeg) / 180 * h - 0.5, 0), h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, y1 = Math.min(y0 + 1, h - 1);
  const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w;
  const top = km[y0 * w + xa] * (1 - fx) + km[y0 * w + xb] * fx, bot = km[y1 * w + xa] * (1 - fx) + km[y1 * w + xb] * fx;
  return top * (1 - fy) + bot * fy;
}

// The renderer's texture size limit, recorded when the Moon first draws (onBeforeRender hands us the renderer).
// 0 until then, which keeps the 8K map off.
let _maxTex = 0;
function maxTextureSize() { return _maxTex; }
function noteRenderer(r) { if (!_maxTex && r && r.capabilities) _maxTex = r.capabilities.maxTextureSize || 0; }

function loadHiRes(file, srgb) {
  const tex = wrapLon(new THREE.TextureLoader().load(new URL(file, BASE).href, () => tex.onReady && tex.onReady()));
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Builds the Moon as a THREE.LOD (three sphere resolutions sharing one material). */
export function createMoonMesh({ radius, isTouch = false }) {
  const size = isTouch ? '1k' : '2k';   // iPad/phones get the small set (~0.3 MB vs ~1.3 MB)
  const uniforms = {
    uMap: { value: loadTex(`moon_color_${size}.jpg`, true) },
    uNormalMap: { value: loadTex(`moon_normal_${size}.jpg`, false) },
    uNormalStrength: { value: 1.0 },
    uSunPos: { value: new THREE.Vector3() },
    uSunIntensity: { value: 1.25 },                         // tuned to sit next to MeshStandard planets lit by sunLight
    uEarthPos: { value: new THREE.Vector3() },
    uEarthLit: { value: 0.5 },                              // Earth's brightness from here, 1 = full Earth (see updateMoon)
    uEarthTint: { value: new THREE.Color(0.55, 0.66, 0.9) }, // replaced by EarthBot's shared uniform when available
    uEarthshine: { value: 0.3 },                             // scaled for EarthBot's uEarthTint (~0.31 grey-blue)
    uEarthLS: { value: 1.0 },                                // 1 = Lommel-Seeliger earthshine + Earth phase law; 0 = the old Lambert fill
    // Bright ray craters (analytic, on top of the LRO albedo; strongest near full Moon). 0 turns them off.
    uRayStrength: { value: 1.0 },
    uTycho: { value: seleno(-43.31, -11.36) },
    uCopernicus: { value: seleno(9.62, -20.08) },
    uKepler: { value: seleno(8.12, -38.01) },
    uAristarchus: { value: seleno(23.73, -47.49) },
    uTychoRayDir: { value: seleno(21.8, 17.9) },             // Bessel, in Mare Serenitatis: Tycho's famous long ray runs past it
    uRayMinor: { value: 1.0 },                               // second-tier ray craters (MINOR_RAYS); 0 turns them off
    uMinorC: { value: MINOR_RAYS.map(([, lat, lon]) => seleno(lat, lon)) },
    uMinorP: { value: MINOR_RAYS.map(([, , , dKm, lenKm, nR, k]) => new THREE.Vector4(0.5 * dKm * KM, lenKm * KM, nR, k)) },
    uMinorA: { value: MINOR_RAYS.map(([, , , , , , , az, hw, wKm], i) =>
      new THREE.Vector4(THREE.MathUtils.degToRad(az), THREE.MathUtils.degToRad(hw), 173 + 29 * i, 0.5 * wKm * KM)) },
    uMessierA: { value: seleno(-2.03, 46.94) },              // Messier A's twin rays run west across Mare Fecunditatis
    uMessierT1: { value: seleno(-1.1, 40.0) },
    uMessierT2: { value: seleno(-2.6, 40.0) },
    // Close-up crater field: fades in below the maps' resolution once you fly close. 0 turns it off.
    uDetail: { value: 1.0 },
    uMapTexel: { value: (2 * Math.PI) / (isTouch ? 1024 : 2048) },   // updated when the 4K set streams in
    // Terrain shadows from the LOLA elevation map (ragged terminator, sunlit peaks past it). 0 = smooth terminator.
    uHeightMap: { value: loadHeight('moon_height_1k.png') },          // desktop adds the 2K map with the 4K stream
    uHeightTexel: { value: (2 * Math.PI) / 1024 },
    uShadow: { value: 1.0 },
    // Limb profile: LOLA heights displace the geometry, exaggerated 2x (the relief maps use 2.5-3x). 0 = smooth sphere.
    uRelief: { value: RELIEF },
    // Mare colour: blue high-titanium vs brownish low-titanium lava, amplified from the LROC mosaic's own colour. 1 = map as is.
    uMareTint: { value: 3.0 },
  };
  // iPad: three size bands (down to ~3 km craters); desktop adds a fourth (~1.3 km) for the closest views.
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG,
    defines: { DETAIL_BANDS: isTouch ? 3 : 4, SHADOW_STEPS: isTouch ? 24 : 44, MINOR_RAYS: MINOR_RAYS.length } });

  const lod = new THREE.LOD();
  // The closest level is fine enough for the displaced limb to show mountain profiles (~20 km steps on desktop,
  // ~40 km on iPad); it only draws within 3 base radii (about 5.5 Moon radii once the size easing has settled).
  const levels = isTouch ? [[288, 144, 0], [96, 64, 3], [48, 32, 8], [24, 16, 40]]
    : [[640, 320, 0], [160, 112, 3], [72, 48, 8], [24, 16, 40]];
  for (const [w, h, d] of levels) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, w, h), material);
    mesh.onBeforeRender = noteRenderer;
    lod.addLevel(mesh, d * radius);
  }
  lod.userData.moonUniforms = uniforms;
  lod.userData.hiRes = isTouch ? 'never' : 'pending';   // desktop streams 4K maps in once you fly close
  loadHeightCpu('moon_height_1k.png');                  // CPU copy so latLonToWorld can stand markers on the ground
  return lod;
}

/** Per frame: sun/Earth positions for lighting, earthshine, and the 0.5x -> 0.273x size easing. */
export function updateMoon(moonBody, camera, sunLight, days) {
  const u = moonBody.mesh.userData.moonUniforms;
  if (!u) return;
  if (!moonBody.moon) moonBody.moon = {
    // Same as EarthBot's helper: a first argument with option keys but no offset/target/driftAxis is treated as options.
    getCinematicStart: (out, opts) => (isOptions(out) ? getCinematicStart(moonBody, sunLight, out) : getCinematicStart(moonBody, sunLight, opts, out)),
    latLonToWorld: (lat, lon, altitudeKm, out) => latLonToWorld(moonBody, lat, lon, altitudeKm, out),
  };

  // Libration: the Moon spins at a constant rate but moves faster near perigee, so seen from Earth it rocks
  // ~±7.9° east-west (anomalistic month, 27.55 d); its 6.7° tilt to the orbit nods it ~±6.7° north-south
  // (draconic month, 27.21 d). Together they show ~59% of the surface over time. main.js sets the tidal-lock
  // spin each frame in updateBodies(); we add the wobble on top. `days` = sim days since J2000 (pauses with the sim).
  if (days !== undefined) {
    const M = 2 * Math.PI * (days / 27.554550) + 2.355;     // mean anomaly (J2000 value 134.96°)
    const F = 2 * Math.PI * (days / 27.212221) + 1.628;     // argument of latitude (J2000 value 93.27°)
    moonBody.mesh.rotation.y += THREE.MathUtils.degToRad(-7.9) * Math.sin(M);
    moonBody.mesh.rotation.z = THREE.MathUtils.degToRad(6.7) * Math.sin(F);
  }
  const earth = moonBody.parent;

  // Borrow EarthBot's shared earthshine tint once it exists (same uniform object, so it stays in sync).
  const tint = earth.earth && earth.earth.uEarthTint;
  if (tint && u.uEarthTint !== tint) { u.uEarthTint = tint; moonBody.mesh.children.forEach(m => (m.material.uniforms.uEarthTint = tint)); }

  sunLight.getWorldPosition(_sun);
  earth.group.getWorldPosition(_earth);
  moonBody.group.getWorldPosition(_moon);
  u.uSunPos.value.copy(_sun);
  u.uEarthPos.value.copy(_earth);
  // Earth's phase seen from the Moon: 1 = full Earth (new Moon, brightest earthshine), 0 = new Earth.
  const toSun = _sun.clone().sub(_earth).normalize();
  const toMoon = _moon.clone().sub(_earth).normalize();
  // Brightness follows a Lambert sphere's phase law, not the lit fraction: a half Earth sends the Moon about 32% of a
  // full Earth's light (not 50%), and a thin crescent Earth almost none, as measured for the "ashen light".
  const cosA = Math.max(-1, Math.min(1, toSun.dot(toMoon)));
  const a = Math.acos(cosA);
  u.uEarthLit.value = u.uEarthLS.value > 0.5 ? (Math.sin(a) + (Math.PI - a) * cosA) / Math.PI : 0.5 * (1 + cosA);

  // Size easing: one camera distance (to the nearer of Earth/Moon) drives scale, tap target and label together.
  const d = Math.min(camera.position.distanceTo(_moon), camera.position.distanceTo(_earth));
  const base = moonBody.baseRadius || moonBody.radius;
  const far = base * 40, near = base * 8;                  // overview look beyond `far`, real ratio inside `near`
  const t = 1 - THREE.MathUtils.smoothstep(d, near, far);
  const s = THREE.MathUtils.lerp(1, REAL_RATIO / OVERVIEW_RATIO, t);
  // Close-up detail: on desktop, swap in the 4K color, relief and elevation maps the first time the camera gets close
  // (the 4K elevation map halves the terrain-shadow step to ~2.7 km, so shadow edges and lit peaks come out sharper).
  // They load in the background; the 2K set stays on screen until both are ready, so there's no pop to grey.
  if (t > 0.35 && moonBody.mesh.userData.hiRes === 'pending') {
    moonBody.mesh.userData.hiRes = 'loading';
    let ready = 0;
    const map = loadHiRes('moon_color_4k.jpg', true), nrm = loadHiRes('moon_normal_4k.jpg', false);
    const hgt = loadHeight('moon_height_4k.png', () => done());
    function done() {
      if (++ready < 3) return;
      u.uMap.value = map; u.uNormalMap.value = nrm; u.uMapTexel.value = (2 * Math.PI) / 4096;
      u.uHeightMap.value = hgt; u.uHeightTexel.value = (2 * Math.PI) / 4096;
      moonBody.mesh.userData.hiRes = 'loaded';
    }
    map.onReady = nrm.onReady = done;
  }
  // Closest views (desktop, within ~2.5 Moon radii of the centre): the 4K colour map is magnified ~3x on screen there,
  // so swap in the 8K LROC colour mosaic (~1.3 km per texel) for sharper small craters, ray streaks and mare edges.
  // Only after the 4K set is in, and only where the GPU takes 8192 px textures; the 4K map is freed once 8K is ready.
  // Relief and shadows keep the 4K maps (uMapTexel unchanged, so the close-up crater field still fills in below 4K).
  const ud = moonBody.mesh.userData;
  if (ud.hiRes === 'loaded' && !ud.colour8k && camera.position.distanceTo(_moon) < 2.5 * base * s) {
    ud.colour8k = maxTextureSize() >= 8192 ? 'loading' : 'never';
    if (ud.colour8k === 'loading') {
      const map8 = loadHiRes('moon_color_8k.jpg', true);
      map8.onReady = () => { const old = u.uMap.value; u.uMap.value = map8; ud.colour8k = 'loaded'; old.dispose(); };
    }
  }
  moonBody.group.scale.setScalar(s);                       // mesh, pick sphere and label offset all live in this group
  moonBody.radius = base * s;
}

/**
 * Suggested "cinematic" framing for the end of a fly-to (same shape as EarthBot's earth.getCinematicStart()):
 * the camera sits low over the terminator with the Sun ~80° off the view axis, so the crater shadows are at their
 * longest, then drifts slowly from the day side toward the night side.
 *   offset     THREE.Vector3  camera position minus the Moon's centre, in MOON RADII (direction is what matters)
 *   target     THREE.Vector3  look-at point minus the Moon's centre, in Moon radii (zero = centre)
 *   driftSpeed number         radians per REAL second about driftAxis (positive = toward the night side)
 *   driftAxis  THREE.Vector3  unit world-space axis through the Moon's centre
 * Usage: const c = body.moon.getCinematicStart(); (or getCinematicStart(out, opts) to reuse an object) cam = moonCentre + c.offset * body.radius; each frame
 *   c.offset.applyAxisAngle(c.driftAxis, c.driftSpeed * dtReal). Call it when the fly-to ends (depends on the Sun).
 * @param {object} [opts] { distance = 2.6, sunAngleDeg = 80, elevationDeg = 10, driftSpeed = 0.015 }
 */
const _c = new THREE.Vector3(), _S = new THREE.Vector3(), _A = new THREE.Vector3(), _E = new THREE.Vector3(),
  _up = new THREE.Vector3(), _q = new THREE.Quaternion();
/** body.moon.getCinematicStart(out?, opts?): pass an `out` object to reuse it every frame (no allocations); its
 *  offset/target/driftAxis vectors are filled in place and `out` is returned. Options are never read off `out`. */
export function getCinematicStart(moonBody, sunLight, opts = {}, out = {}) {
  const { distance = 2.6, sunAngleDeg = 80, elevationDeg = 10, driftSpeed = 0.015 } = opts || {};
  const offset = out.offset || (out.offset = new THREE.Vector3());
  const target = out.target || (out.target = new THREE.Vector3());
  const driftAxis = out.driftAxis || (out.driftAxis = new THREE.Vector3());
  moonBody.group.getWorldPosition(_c);
  const S = sunLight.getWorldPosition(_S).sub(_c);
  if (S.lengthSq() < 1e-12) S.set(1, 0, 0);
  S.normalize();
  const A = _A.set(0, 1, 0).applyQuaternion(moonBody.mesh.getWorldQuaternion(_q)).normalize();
  const E = _E.crossVectors(A, S);
  if (E.lengthSq() < 1e-8) E.set(0, 0, 1).cross(S);
  E.normalize();
  const a = THREE.MathUtils.degToRad(sunAngleDeg);
  const dir = offset.copy(S).multiplyScalar(Math.cos(a)).addScaledVector(E, Math.sin(a)).normalize();
  const up = _up.copy(A).addScaledVector(dir, -A.dot(dir));
  if (up.lengthSq() > 1e-8) {
    const e = THREE.MathUtils.degToRad(elevationDeg);
    dir.multiplyScalar(Math.cos(e)).addScaledVector(up.normalize(), Math.sin(e)).normalize();
  }
  driftAxis.crossVectors(S, dir).normalize();
  dir.multiplyScalar(distance);
  target.set(0, 0, 0);
  out.driftSpeed = driftSpeed;
  return out;
}

const OPTION_KEYS = ['distance', 'sunAngleDeg', 'elevationDeg', 'driftSpeed'];
function isOptions(o) {
  return !!o && !o.offset && !o.target && !o.driftAxis && OPTION_KEYS.some((k) => k in o);
}

const MOON_RADIUS_KM = 1737.4;
/**
 * body.moon.latLonToWorld(latDeg, lonDeg, altitudeKm = 0, out?) -> THREE.Vector3 in world space.
 * Selenographic coordinates: latitude north-positive, longitude east-positive, 0/0 = centre of the near side
 * (the point facing Earth). Follows tidal lock, libration and the 0.5x -> 0.273x size easing, so a marker placed
 * with it every frame stays glued to the surface. Altitude is real km above the local ground as drawn (the LOLA
 * height times the uRelief exaggeration, so markers sit on the displaced terrain), scaled with the Moon (e.g.
 * Apollo 11: latLonToWorld(0.674, 23.473)). Pass `out` to avoid allocations.
 */
export function latLonToWorld(moonBody, latDeg, lonDeg, altitudeKm = 0, out = new THREE.Vector3()) {
  const lat = THREE.MathUtils.degToRad(latDeg), lon = THREE.MathUtils.degToRad(lonDeg);
  const u = moonBody.mesh.userData.moonUniforms;
  const ground = u && u.uRelief.value > 0 ? u.uRelief.value * surfaceHeightKm(latDeg, lonDeg) : 0;
  const r = (moonBody.baseRadius || moonBody.radius) * (1 + (altitudeKm + ground) / MOON_RADIUS_KM);
  // mesh-local frame of three.js SphereGeometry: +x = lon 0 (faces Earth), +y = north, east = -z
  out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).multiplyScalar(r);
  moonBody.mesh.updateWorldMatrix(true, false);
  return moonBody.mesh.localToWorld(out);
}
