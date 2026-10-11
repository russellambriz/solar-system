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
  aerial: 0.35,            // strength of the haze over the ground relative to the limb
  atmoSamples: 6,          // view-ray samples (mobile: atmoSamplesMobile)
  atmoSamplesMobile: 4,
  detailNear: 140,         // Earth's on-screen radius (px) above which glint + cloud shadows are at full detail
  detailFar: 45,           //   … and below which they are fully faded (overview distances: avoids shimmer)
  cloudOpacity: 0.95,
  cloudShadow: 0.45,
  nightGain: 1.25,
  specular: 1.6,
  glintShininess: 900,     // calm-sea exponent; rough patches drop to ~35% of this
  normalStrength: 0.9,
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
    uNightGain:     { value: P.nightGain },
    uSpecular:      { value: P.specular },
    uGlintShininess:{ value: P.glintShininess },
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
    uCenter:        { value: new THREE.Vector3() },
    uR:             { value: radius },
    uRa:            { value: radius * (1 + P.atmoThickness) },
    uEarthTint:     { value: EARTH_TINT.clone() },
  };

  // ---- meshes ------------------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'Earth';
  const { hasNormal, info: textureInfo } = loadEarthTextures({
    isMobile,
    renderer,
    onLoad(key, tex) {
      const uni = { day: U.uDayMap, night: U.uNightMap, water: U.uWaterMap, clouds: U.uCloudMap, normal: U.uNormalMap }[key];
      const old = uni.value;
      uni.value = tex;
      if (key === 'clouds') U.uCloudsReady.value = 1;
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
    isMobile ? P.atmoSamplesMobile : P.atmoSamples);
  group.add(clouds, atmosphere);

  // ---- per-frame update ---------------------------------------------------------------------------------------
  const _sun = new THREE.Vector3(), _earth = new THREE.Vector3(), _q = new THREE.Quaternion(),
        _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _cam = new THREE.Vector3(), _buf = new THREE.Vector2();
  const lod = { px: 0 };          // last measured on-screen radius (device px), for debugging/tests
  function update(camera) {
    sunLight.getWorldPosition(_sun);
    surface.getWorldPosition(_earth);
    const dir = U.uSunDir.value.copy(_sun).sub(_earth);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
    dir.normalize();
    // Sun direction in the ground's object frame (removes axial tilt + daily spin)
    surface.getWorldQuaternion(_q);
    U.uSunDirObj.value.copy(dir).applyQuaternion(_q.invert());
    // ground object space → cloud object space (both are pure rotations of the same tilt frame)
    _m.copy(clouds.matrixWorld).invert().multiply(surface.matrixWorld);
    U.uGroundToCloud.value.setFromMatrix4(_m);
    // world-space size/centre for the halo (handles any parent scale)
    U.uCenter.value.copy(_earth);
    surface.getWorldScale(_s);
    U.uR.value = radius * _s.x;
    U.uRa.value = radius * (1 + P.atmoThickness) * _s.x;
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
    }
  }
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

  return { group, surface, clouds, atmosphere, uniforms: U, uEarthTint: U.uEarthTint, params: P, textureInfo, lod, update, dispose };
}
