// earth/index.js — real-texture Earth: day/night surface, ocean glint, cloud deck with ground shadows and a
// single-scattering atmosphere (limb halo + aerial perspective), all lit from the Sun's actual position every frame.
// Desktop starts on the 2K NASA maps and upgrades to 4K day/night when the GPU allows (earth.textureInfo).
//
// Usage (see main.js Earth branch):
//   const earth = createEarth({ radius, sunLight, isMobile, renderer, mesh });
//   tiltGroup.add(earth.group);          // clouds + atmosphere (and the ground mesh, if one was not supplied)
//   body.clouds = earth.clouds;          // main.js keeps spinning the cloud sphere as before
//
// Uniforms are refreshed automatically right before the ground is drawn (mesh.onBeforeRender), so no extra call
// is needed in the render loop; earth.update(camera) can still be called manually.
//
// Camera / marker helpers (JSDoc at the bottom of this file):
//   earth.getCinematicStart(out?, opts?)   cinematic arrival framing (offset/target in Earth radii, drift in rad/s)
//   earth.latLonToWorld(latDeg, lonDeg, altitudeKm = 0, out?)   world-space point that follows tilt + spin
//   earth.radius                           ground radius in scene units (object space; world radius = uniforms.uR)
//
// Earthshine hook for the Moon: `earth.uEarthTint` (also earth.uniforms.uEarthTint) is a THREE uniform
// { value: THREE.Vector3 } holding Earth's mean linear reflectance colour (land/ocean + cloud cover).
// The Moon shader can share the same uniform object: `moonMat.uniforms.uEarthTint = earth.uEarthTint`.
import * as THREE from 'three';
import { loadEarthTextures, solidTexture } from './textures.js';
import { createEarthMaterial } from './earthMaterial.js';
import { createCloudMesh } from './clouds.js';
import { createAtmosphere } from './atmosphere.js';

// Mean linear colour of earth_day.jpg (cos-latitude weighted, measured offline) blended with ~30% cloud
// cover of albedo ~0.8 — a reasonable "Earth seen from the Moon" average. Bluish-grey, Bond albedo ≈ 0.3.
const DAY_MEAN = new THREE.Vector3(0.1014, 0.1014, 0.1165);
const CLOUD_FRACTION = 0.3;
export const EARTH_TINT = DAY_MEAN.clone().multiplyScalar(1 - CLOUD_FRACTION).addScalar(0.8 * CLOUD_FRACTION);

// December-map weight per month (Jan … Dec, mid-month) for the seasonal day-map blend: approximate Northern
// Hemisphere snow-cover climatology (Rutgers Global Snow Lab monthly means, ~3 M km² in Jul/Aug … ~47 in Jan),
// normalised so July → 0 (the July 2004 map) and December → 1 (the December 2004 map), clamped to 0..1.
const SNOW_W = [1, 1, 0.91, 0.67, 0.38, 0.14, 0, 0, 0.05, 0.38, 0.76, 1];

// Tunables (exposed on earth.params for console experiments)
const DEFAULTS = {
  cloudAltitude: 0.02,     // cloud sphere radius = radius · (1 + cloudAltitude)  (matches the old main.js value)
  atmoThickness: 0.03,     // top of the atmosphere = radius · (1 + atmoThickness) (≈ 6× real, for visibility)
  atmoColor: new THREE.Color(0.10, 0.30, 1.0),   // linear sky blue, still used for the thin-cloud limb tint
  atmoIntensity: 4.0,      // exposure on the (physically scaled) scattering result — exaggerated for readability
  rayleigh: new THREE.Vector3(0.046, 0.108, 0.265), // vertical optical depth at the surface (Earth's values)
  mie: 0.05,               // vertical Mie optical depth (light haze)
  mieG: 0.85,              // forward-scattering asymmetry → bright rim when the Sun is behind Earth
  mieGain: 3.0,            // extra gain on Mie inscatter (our camera sits ~3 R away, so the rim is ~18° off the Sun
                           // and the physical forward peak is weak; real eclipse views see it at ~1°)
  scaleR: 0.22,            // Rayleigh scale height as a fraction of the shell thickness
  scaleM: 0.10,            // Mie scale height (aerosols sit lower)
  aerial: 0.25,            // strength of the haze over the ground relative to the limb
  atmoSamples: 6,          // view-ray samples (mobile: atmoSamplesMobile)
  atmoSamplesMobile: 4,
  // cloud drift (CLOUD_FLOW in glsl.js). Clock unit = radians of Earth spin (so it follows the sim time speed).
  cloudTrades: -0.035,     // tropics: westward, radians of longitude per radian of spin
  cloudWesterlies: 0.08,   // ~45° N/S: eastward
  cloudSolid: 0.03,        // slow solid-body eastward creep of the whole deck (unbounded, no shear)
  cloudFlowPeriod: 2,      // crossfade period (clock units): max band-to-band shear ≈ 0.08·2 rad ≈ 9°; inter-copy gap at mid-fade ≈ 4.6° (was ~14° at period 6)
  cloudMaxRate: 1.5,       // speed limit for the cloud clock, radians of spin per real second (≈ 12 sim-days/s)
  // close-approach "cinematic" limb: thicker + brighter as Earth's on-screen radius grows (CSS px)
  closeFrom: 300,          // no change below this on-screen radius (far view unchanged)
  closeTo: 700,            // full effect from here
  closeThicken: 0.35,      // +35 % shell thickness (and scale heights) at full effect
  closeBrighten: 0.3,      // +30 % atmosphere intensity at full effect
  detailNear: 140,         // Earth's on-screen radius (px) above which glint + cloud shadows are at full detail
  detailFar: 45,           //   … and below which they are fully faded (overview distances: avoids shimmer)
  cloudOpacity: 0.95,
  cloudLimb: 1.0,          // limb cloud thickening + cloud-top lift (clouds.js); 0 = previous look
  cloudLimbFar: 0.5,       //   … fraction of it at overview distances (full from closeFrom→closeTo, like the halo boost)
  cloudSlantMax: 4.0,      //   cap on the 1/μ slant-path factor
  cloudLimbLift: 0.22,     //   max brightness lift of limb cloud tops (they sit above most of the haze)
  cloudSilver: 1.2,        // forward-scattered "silver lining" on thin sunlit cloud when looking towards the Sun (clouds.js); 0 = previous look
  cloudSilverG: 0.6,       //   Henyey–Greenstein asymmetry of that lobe
  cloudShadow: 0.45,
  nightGain: 1.7,          // city lights (warm); night side is otherwise near-black
  cityLights: 1.0,         // richer city lights (earthMaterial.js): dim towns/suburbs, metro glow halo, sodium-orange
                           // edges vs whiter cores, cloud-diffused glow; 0 = previous look (bright cores only)
  specular: 0.15,         // glint strength (calm-sea peak ≈ 0.5 × sun before the knee → stays peaked)
  glintCap: 0.5,           // max glint radiance relative to the sun colour (desktop) — never a white disc
  glintCapMobile: 0.32,    // lower on the iPad tier (1K water mask, bigger blurrier hotspot)
  glintShininess: 5000,    // reference exponent (tight, small glint, ~1° lobe); the sea-state map scales it ×0.25…×1.6
  seaState: 1.0,           // sea-state roughness map strength (calm gulfs / rough westerlies); 0 = uniform sea
  sheen: 0.5,              // broad wind-roughened glint around the core (Cox–Munk-like); 0 = tight core only
  normalStrength: 1.0,     // × the baked relief (GEBCO_08, 20× vertical exaggeration; see SOURCES.md), land only
  aurora: 0.55,            // auroral ovals on the night side (atmosphere.js); 0 = previous look
  auroraPoleLat: 80.8,     //   north geomagnetic (dipole) pole, IGRF ~2025
  auroraPoleLon: -72.6,
  auroraSpeed: 1.0,        //   curtain drift speed (real time)
  auroraSamples: 8,        //   emission samples per pixel (mobile: auroraSamplesMobile)
  auroraSamplesMobile: 5,
  season: 1.0,             // seasonal day map: blends the December and July Blue Marble maps by the Sun's position
                           // (snow line advancing/retreating with latitude); 0 = December map only (previous look)
  seasonWeight: null,      //   force the December-map weight 0..1 (testing); null = from the Sun's ecliptic longitude
  ambient: 0.015,          // a bit below the scene's MeshStandard ambient so city lights read on the night side
};

/**
 * @param {object}  o
 * @param {number}  o.radius        planet radius in scene units
 * @param {THREE.Light} o.sunLight  the Sun's light (world position + colour/intensity are read every frame)
 * @param {boolean} [o.isMobile]    smaller textures, fewer segments, no normal map
 * @param {THREE.WebGLRenderer} [o.renderer]  anisotropy, 4K capability check / pre-upload, LOD (buffer height)
 * @param {THREE.Mesh} [o.mesh]     existing ground mesh to adopt (its material is replaced; its old map is shown
 *                                  until the real day map arrives). If omitted a new sphere is created.
 * @param {object}  [o.params]      overrides for DEFAULTS
 */
export function createEarth({ radius, sunLight, isMobile = false, renderer = null, mesh = null, params = {} }) {
  const P = { ...DEFAULTS, ...params };
  const segs = isMobile ? 64 : 96;

  // ---- shared uniforms (one object, referenced by all three materials) --------------------------------------
  const placeholderDay = mesh?.material?.map || solidTexture(30, 70, 140, true);
  const black = solidTexture(0, 0, 0);
  const U = {
    uDayMap:        { value: placeholderDay },
    uDayMapJul:     { value: black },
    uDayJulReady:   { value: 0 },
    uSeasonW:       { value: 1 },   // December-map weight (1 = northern winter … 0 = northern summer)
    uSeason:        { value: P.season },
    uNightMap:      { value: black },
    uWaterMap:      { value: black },
    uCloudMap:      { value: black },
    uNormalMap:     { value: solidTexture(128, 128, 255) },
    uSunDir:        { value: new THREE.Vector3(1, 0, 0) },
    uSunDirObj:     { value: new THREE.Vector3(1, 0, 0) },
    uSunColor:      { value: new THREE.Color(1, 1, 1) },
    uAmbient:       { value: P.ambient },
    uGroundToCloud: { value: new THREE.Matrix3() },
    uCloudsReady:   { value: 0 },
    uCloudShadow:   { value: P.cloudShadow },
    uCloudOpacity:  { value: P.cloudOpacity },
    uCloudLimb:     { value: P.cloudLimb * P.cloudLimbFar },
    uCloudSlantMax: { value: P.cloudSlantMax },
    uCloudLimbLift: { value: P.cloudLimbLift },
    uCloudSilver:   { value: P.cloudSilver },
    uCloudSilverG:  { value: P.cloudSilverG },
    uNightGain:     { value: P.nightGain },
    uCityLights:    { value: P.cityLights },
    uSpecular:      { value: P.specular },
    uGlintCap:      { value: isMobile ? P.glintCapMobile : P.glintCap },
    uGlintShininess:{ value: P.glintShininess },
    uSeaState:      { value: P.seaState },
    uSheen:         { value: P.sheen },
    uNormalStrength:{ value: P.normalStrength },
    uAtmoColor:     { value: P.atmoColor },
    uAtmoIntensity: { value: P.atmoIntensity },
    uRayleigh:      { value: P.rayleigh },
    uMie:           { value: P.mie },
    uMieG:          { value: P.mieG },
    uMieGain:       { value: P.mieGain },
    uScaleR:        { value: P.scaleR },
    uScaleM:        { value: P.scaleM },
    uAerial:        { value: P.aerial },
    uDetail:        { value: 1 },
    uCloudPhase:    { value: 0 },
    uCloudBase:     { value: 0 },
    uCloudFlowPeriod:{ value: P.cloudFlowPeriod },
    uCloudWinds:    { value: new THREE.Vector3(P.cloudTrades, P.cloudWesterlies, P.cloudSolid) },
    uCenter:        { value: new THREE.Vector3() },
    uR:             { value: radius },
    uRa:            { value: radius * (1 + P.atmoThickness) },
    uEarthTint:     { value: EARTH_TINT.clone() },
    uAurora:        { value: P.aurora },
    uAuroraPole:    { value: new THREE.Vector3(0, 1, 0) },
    uAuroraTime:    { value: 0 },
    uWorldToGround: { value: new THREE.Matrix3() },
  };

  // ---- meshes ------------------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'Earth';
  const { hasNormal, info: textureInfo } = loadEarthTextures({
    isMobile,
    renderer,
    onLoad(key, tex) {
      const uni = { day: U.uDayMap, dayJul: U.uDayMapJul, night: U.uNightMap, water: U.uWaterMap, clouds: U.uCloudMap, normal: U.uNormalMap }[key];
      const old = uni.value;
      uni.value = tex;
      if (key === 'clouds') U.uCloudsReady.value = 1;
      if (key === 'dayJul') U.uDayJulReady.value = 1;
      if (old && old !== tex && old !== black) disposeTex(old);
    },
  });

  const surfaceMat = createEarthMaterial(U, hasNormal);
  let surface = mesh;
  if (surface) {
    surface.material.dispose();           // (its map lives on as the placeholder day map)
    surface.material = surfaceMat;
  } else {
    surface = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, segs * 0.75), surfaceMat);
    group.add(surface);
  }
  surface.name ||= 'EarthSurface';

  const clouds = createCloudMesh(radius * (1 + P.cloudAltitude), U, segs);
  const atmosphere = createAtmosphere(radius, U, P.atmoThickness, isMobile ? 48 : 64,
    isMobile ? P.atmoSamplesMobile : P.atmoSamples, isMobile ? P.auroraSamplesMobile : P.auroraSamples);
  group.add(clouds, atmosphere);

  // ---- per-frame update ---------------------------------------------------------------------------------------
  const _sun = new THREE.Vector3(), _earth = new THREE.Vector3(), _q = new THREE.Quaternion(),
        _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _cam = new THREE.Vector3(), _buf = new THREE.Vector2();
  const _axis = new THREE.Vector3(), _gam = new THREE.Vector3(), _e2 = new THREE.Vector3(), _ecl = new THREE.Vector3(0, 1, 0);
  const season = { lambda: 0, month: 0, w: 1 };   // Sun's ecliptic longitude (deg), month (0 = 1 Jan), Dec weight
  // Season from geometry, so it always matches the lighting on screen (and follows the time slider): the Sun's
  // ecliptic longitude λ is measured from the March-equinox direction γ (node of the equator on the ecliptic,
  // scene +Y = ecliptic north). λ → date (equinox ≈ 20 Mar, mean motion) → December-map weight from the
  // northern snow-cover cycle, so autumn snow arrives late (Oct–Nov) and melts in Apr–Jun, not as a sine wave.
  function updateSeason(dir, axis) {
    _gam.crossVectors(axis, _ecl);
    if (_gam.lengthSq() < 1e-10) _gam.set(1, 0, 0);
    _gam.normalize();
    _e2.crossVectors(_ecl, _gam);
    if (_e2.dot(axis) < 0) { _gam.negate(); _e2.negate(); }       // λ = 90° must be the June solstice (δ > 0)
    const lam = Math.atan2(dir.dot(_e2), dir.dot(_gam));
    season.lambda = ((THREE.MathUtils.radToDeg(lam) % 360) + 360) % 360;
    season.month = (((79.5 + season.lambda / 360 * 365.25) / 365.25 * 12) % 12 + 12) % 12;
    const m = season.month - 0.5, i = Math.floor(m), f = m - i;          // table is at mid-month
    const a = SNOW_W[(i + 12) % 12], b = SNOW_W[(i + 13) % 12];
    season.w = P.seasonWeight ?? (a + (b - a) * f);
    U.uSeasonW.value = season.w;
    U.uSeason.value = P.season;
  }
  const lod = { px: 0 };          // last measured on-screen radius (device px), for debugging/tests
  function update(camera) {
    sunLight.getWorldPosition(_sun);
    surface.getWorldPosition(_earth);
    const dir = U.uSunDir.value.copy(_sun).sub(_earth);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
    dir.normalize();
    // Sun direction in the ground's object frame (removes axial tilt + daily spin)
    surface.getWorldQuaternion(_q);
    updateSeason(dir, _axis.set(0, 1, 0).applyQuaternion(_q));
    U.uSunDirObj.value.copy(dir).applyQuaternion(_q.invert());
    U.uWorldToGround.value.setFromMatrix4(_m.makeRotationFromQuaternion(_q));   // _q is now the inverse
    // aurora: geomagnetic pole in the ground frame (same lat/lon convention as latLonToWorld), slow real-time drift
    {
      const la = THREE.MathUtils.degToRad(P.auroraPoleLat), ph = THREE.MathUtils.degToRad(P.auroraPoleLon + 180);
      U.uAuroraPole.value.set(-Math.cos(ph) * Math.cos(la), Math.sin(la), Math.sin(ph) * Math.cos(la));
      const now = performance.now();
      U.uAuroraTime.value = (U.uAuroraTime.value + Math.min((now - (auroraClock.t || now)) / 1000, 0.1) * P.auroraSpeed) % 1000;
      auroraClock.t = now;
      U.uAurora.value = P.aurora;
      U.uCityLights.value = P.cityLights;
    }
    // Cloud deck: locked to the ground frame. main.js still writes clouds.rotation.y = spin × 1.15 every frame
    // (updateBodies); that solid-body spin-up is overridden here, right before drawing, and replaced by the
    // latitude-dependent drift in the shaders (CLOUD_FLOW). No main.js change needed.
    lockClouds();
    advanceCloudClock();
    // ground object space → cloud object space (identity now that both share a frame; kept for generality)
    _m.copy(clouds.matrixWorld).invert().multiply(surface.matrixWorld);
    U.uGroundToCloud.value.setFromMatrix4(_m);
    // world-space size/centre for the halo (handles any parent scale)
    U.uCenter.value.copy(_earth);
    surface.getWorldScale(_s);
    U.uR.value = radius * _s.x;
    const thick = P.atmoThickness * (1 + P.closeThicken * close.k);
    U.uRa.value = radius * (1 + thick) * _s.x;
    atmosphere.scale.setScalar((1 + thick) / (1 + P.atmoThickness));   // mesh must still enclose the shell
    U.uAtmoIntensity.value = P.atmoIntensity * (1 + P.closeBrighten * close.k);
    U.uCloudLimb.value = P.cloudLimb * (P.cloudLimbFar + (1 - P.cloudLimbFar) * close.k);
    U.uCloudSlantMax.value = P.cloudSlantMax;
    U.uCloudLimbLift.value = P.cloudLimbLift;
    U.uCloudSilver.value = P.cloudSilver;
    U.uCloudSilverG.value = P.cloudSilverG;
    // match MeshStandardMaterial's response to the same light: colour × intensity / π
    U.uSunColor.value.copy(sunLight.color).multiplyScalar(sunLight.intensity / Math.PI);
    // Level of detail for the high-frequency terms (ocean glint, cloud shadows): from Earth's projected radius
    // in device pixels. Far away the glint lobe and the offset shadow lookup are sub-pixel and shimmer.
    if (camera?.isPerspectiveCamera) {
      const dist = Math.max(camera.getWorldPosition(_cam).distanceTo(_earth), U.uR.value * 1.001);
      const h = renderer ? renderer.getDrawingBufferSize(_buf).y : 800;
      const px = Math.asin(U.uR.value / dist) / THREE.MathUtils.degToRad(camera.fov * 0.5) * h * 0.5 * (camera.zoom || 1);
      const x = THREE.MathUtils.clamp((px - P.detailFar) / (P.detailNear - P.detailFar), 0, 1);
      U.uDetail.value = x * x * (3 - 2 * x);
      lod.px = px;
      // close-approach boost, from the on-screen radius in CSS px (independent of devicePixelRatio); eased and
      // smoothed over frames so it never pops. Takes effect from the next frame's uRa / intensity.
      const css = px / (renderer ? renderer.getPixelRatio() : 1);
      const c = THREE.MathUtils.clamp((css - P.closeFrom) / (P.closeTo - P.closeFrom), 0, 1);
      const target = c * c * (3 - 2 * c);
      const now = performance.now(), dt = Math.min((now - close.t) / 1000, 0.25);
      close.t = now;
      close.k += (target - close.k) * (1 - Math.exp(-dt / 0.35));          // ~0.35 s ease, frame-rate independent
      if (Math.abs(target - close.k) < 1e-3) close.k = target;
    }
  }

  // ---- cloud drift clock ----------------------------------------------------------------------------------------
  // Clock unit = radians of ground spin, so drift follows the simulation (pauses when paused, runs with the time
  // slider). It is rate-limited to P.cloudMaxRate per real second, so at huge time speeds the clouds keep moving
  // smoothly instead of strobing; big jumps (tab switch, date change) are absorbed the same way.
  const close = { k: 0, t: performance.now() };
  const auroraClock = { t: 0 };
  const cloudClock = { t: 0, lastSpin: null, lastNow: 0 };
  function lockClouds() {
    if (clouds.rotation.y !== surface.rotation.y || clouds.rotation.x !== surface.rotation.x || clouds.rotation.z !== surface.rotation.z) {
      clouds.rotation.copy(surface.rotation);
      clouds.updateMatrixWorld(true);
    }
  }
  function advanceCloudClock() {
    const now = performance.now();
    const spin = surface.rotation.y;
    if (cloudClock.lastSpin !== null) {
      const dReal = Math.min((now - cloudClock.lastNow) / 1000, 0.1);
      const dSpin = spin - cloudClock.lastSpin;
      const lim = P.cloudMaxRate * dReal;
      cloudClock.t += THREE.MathUtils.clamp(dSpin, -lim, lim);
    }
    cloudClock.lastSpin = spin; cloudClock.lastNow = now;
    const T = P.cloudFlowPeriod;
    U.uCloudFlowPeriod.value = T;
    U.uCloudPhase.value = ((cloudClock.t / T) % 1 + 1) % 1;
    U.uCloudBase.value = (P.cloudSolid * cloudClock.t) % (Math.PI * 2);
    U.uCloudWinds.value.set(P.cloudTrades, P.cloudWesterlies, P.cloudSolid);
  }
  // If the ground is culled but the deck is not, still keep the deck in the ground frame.
  clouds.onBeforeRender = () => lockClouds();
  // Refresh uniforms just before the ground is drawn (matrices are already up to date at that point).
  const prevBefore = surface.onBeforeRender;
  surface.onBeforeRender = function (...args) { update(args[2]); prevBefore.apply(this, args); };

  function disposeTex(t) {
    if (t.userData?.bitmap) t.source?.data?.close?.();   // ImageBitmap (4K maps)
    t.dispose();
  }
  function dispose() {
    for (const u of Object.values(U)) if (u.value?.isTexture) disposeTex(u.value);
    for (const m of [clouds, atmosphere]) { m.geometry.dispose(); m.material.dispose(); }
    surfaceMat.dispose();
  }

  const api = { radius, group, surface, clouds, atmosphere, uniforms: U, uEarthTint: U.uEarthTint, params: P, textureInfo, lod,
    cloudClock, season, update, dispose };
  api.getCinematicStart = (out, opts) => getCinematicStart(api, sunLight, out, opts);
  api.latLonToWorld = (latDeg, lonDeg, altitudeKm = 0, out) => latLonToWorld(api, latDeg, lonDeg, altitudeKm, out);
  return api;
}

// ---- cinematic framing helper ------------------------------------------------------------------------------------
// Module-level scratch (no per-call allocations).
const _cC = new THREE.Vector3(), _cS = new THREE.Vector3(), _cA = new THREE.Vector3(), _cE = new THREE.Vector3(),
  _cUp = new THREE.Vector3(), _cQ = new THREE.Quaternion();
const OPT_KEYS = ['distance', 'sunAngleDeg', 'elevationDeg', 'driftSpeed'];

/**
 * Is `a` an options object rather than an `out` object? An out object either already carries one of the output
 * vectors (offset / target / driftAxis) or carries no option keys at all (e.g. a fresh `{}`); anything else with an
 * option key (distance, sunAngleDeg, elevationDeg, driftSpeed) is options. With MoonBot's helper the first argument is
 * always `out`; the two agree for every out-object call and for the no-argument call.
 */
function isOptsObject(a) {
  if (!a || typeof a !== 'object') return false;
  if (a.offset !== undefined || a.target !== undefined || a.driftAxis !== undefined) return false;
  return OPT_KEYS.some((k) => a[k] !== undefined);
}

/**
 * Suggested "cinematic" framing for the end of a fly-to: the terminator runs across the disc with the Sun off to
 * one side (~75° from the view axis, so a bit more day than night is visible), the camera raised ~15° towards
 * Earth's north pole, plus a slow drift that carries the view across the terminator towards the night side.
 *
 * Signatures:
 *   earth.getCinematicStart()                      → new object (unchanged behaviour)
 *   earth.getCinematicStart(out, opts?)            → fills `out` in place and returns it (no allocations once
 *                                                     out.offset/target/driftAxis exist; they are created on `out`
 *                                                     the first time). Options are only read from `opts`, never from `out`.
 *   earth.getCinematicStart(opts)                  → a plain options object first (has an option key, no output vectors)
 *                                                     is treated as opts; returns a new object (backward compatible)
 *   getCinematicStart(earth, sunLight, out?, opts?) → module function, same rules for the last two arguments
 *
 * Result fields (all world space, relative to Earth's centre):
 *   offset     THREE.Vector3  camera position minus Earth centre, in EARTH RADII (scale by the live world radius;
 *                             default length opts.distance)
 *   target     THREE.Vector3  look-at point minus Earth centre, in Earth radii (zero: look at the centre)
 *   driftSpeed number         orbit rate of the camera about driftAxis, in RADIANS PER SECOND OF REAL TIME;
 *                             positive = the view moves from the day side towards the night side
 *   driftAxis  THREE.Vector3  unit world-space axis through Earth's centre to rotate the camera offset about
 *                             (perpendicular to the Sun direction and the view direction, so the Sun angle sweeps)
 * Usage: const c = body.earth.getCinematicStart(reusedOut);
 *   cam.position.copy(earthCentre).addScaledVector(c.offset, earthWorldRadius); per frame
 *   c.offset.applyAxisAngle(c.driftAxis, c.driftSpeed * dtReal). Depends on the Sun's current position.
 *
 * @param {object} earth        object returned by createEarth (uses earth.surface)
 * @param {THREE.Object3D} sunLight
 * @param {object} [out]        reusable result object (or an options object, see above)
 * @param {object} [opts]       { distance = 2.8 (Earth radii), sunAngleDeg = 75, elevationDeg = 15, driftSpeed = 0.02 }
 * @returns {{offset: THREE.Vector3, target: THREE.Vector3, driftSpeed: number, driftAxis: THREE.Vector3}}
 */
export function getCinematicStart(earth, sunLight, out, opts) {
  if (isOptsObject(out)) { opts = out; out = undefined; }
  if (!out || typeof out !== 'object') out = {};
  const { distance = 2.8, sunAngleDeg = 75, elevationDeg = 15, driftSpeed = 0.02 } = opts || {};
  const offset = out.offset || (out.offset = new THREE.Vector3());
  const target = out.target || (out.target = new THREE.Vector3());
  const driftAxis = out.driftAxis || (out.driftAxis = new THREE.Vector3());
  const c = earth.surface.getWorldPosition(_cC);
  const S = sunLight.getWorldPosition(_cS).sub(c);
  if (S.lengthSq() < 1e-12) S.set(1, 0, 0);
  S.normalize();
  // Earth's spin axis in world space (ground mesh +Y)
  const A = _cA.set(0, 1, 0).applyQuaternion(earth.surface.getWorldQuaternion(_cQ)).normalize();
  // a direction perpendicular to the Sun (where the terminator crosses the "equator" seen from the Sun)
  const E = _cE.crossVectors(A, S);
  if (E.lengthSq() < 1e-8) E.set(0, 0, 1).cross(S);
  E.normalize();
  const a = THREE.MathUtils.degToRad(sunAngleDeg);
  const dir = offset.copy(S).multiplyScalar(Math.cos(a)).addScaledVector(E, Math.sin(a)).normalize();
  // raise towards the north pole
  const up = _cUp.copy(A).addScaledVector(dir, -A.dot(dir));
  if (up.lengthSq() > 1e-8) {
    const e = THREE.MathUtils.degToRad(elevationDeg);
    dir.multiplyScalar(Math.cos(e)).addScaledVector(up.normalize(), Math.sin(e)).normalize();
  }
  // rotating dir about S × dir by a positive angle moves it away from the Sun, i.e. towards the night side
  driftAxis.crossVectors(S, dir).normalize();
  dir.multiplyScalar(distance);
  target.set(0, 0, 0);
  out.driftSpeed = driftSpeed;
  return out;
}

// ---- geographic positions ---------------------------------------------------------------------------------------
export const EARTH_RADIUS_KM = 6371;
/**
 * World-space point at geographic latitude/longitude (degrees; north and east positive, lon −180…180 like the day
 * map) and altitude (km above the surface; the drawn radius = 6371 km, so altitude scales with it). Follows Earth's
 * current axial tilt, daily spin, orbit position and any parent scale. Fills and returns `out` (allocates only when
 * `out` is omitted).
 */
export function latLonToWorld(earth, latDeg, lonDeg, altitudeKm = 0, out = new THREE.Vector3()) {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const phi = THREE.MathUtils.degToRad(lonDeg + 180);    // SphereGeometry azimuth: u = phi / 2π, lon −180° at u = 0
  const r = earth.radius * (1 + altitudeKm / EARTH_RADIUS_KM);
  const cl = Math.cos(lat);
  out.set(-Math.cos(phi) * cl * r, Math.sin(lat) * r, Math.sin(phi) * cl * r);   // ground mesh object space
  earth.surface.updateWorldMatrix(true, false);          // current tilt/spin even if called mid-frame
  return out.applyMatrix4(earth.surface.matrixWorld);
}
