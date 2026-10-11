// mars/index.js — MarsBot's Mars: real USGS/NASA colour + MOLA relief, seasonal polar caps, dusty limb haze and a
// thin atmosphere rim, all lit from the Sun's actual position every frame. Follows the earth/ module pattern.
//
// Usage (main.js planet loop):
//   import { createMars } from './mars/index.js';
//   if (p.name === 'Mars') tiltGroup.add((body.mars = createMars({ radius, sunLight, isMobile: IS_TOUCH, renderer, mesh })).group);
//
// The existing planet mesh is adopted (its material is replaced; its procedural map stays on screen until the real
// colour map arrives), so main.js keeps spinning `body.mesh`, and Phobos/Deimos keep orbiting in the tilt group
// exactly as before. Uniforms refresh right before the ground is drawn (mesh.onBeforeRender): no render-loop call.
import * as THREE from 'three';
import { loadMarsTextures, solidTexture } from './textures.js';
import { createMarsMaterial, createMarsAtmosphere } from './shaders.js';

// South residual cap centre: ~87°S, 315°E (it is offset from the pole). Object space of THREE.SphereGeometry with
// longitude 0 at the texture centre: x = cos(lat)cos(lon), y = sin(lat), z = -cos(lat)sin(lon). Stored pointing south.
function southCapAxis() {
  const lat = THREE.MathUtils.degToRad(-87), lon = THREE.MathUtils.degToRad(315);
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).negate();
}

// Tunables (exposed on mars.params for console experiments)
const DEFAULTS = {
  atmoThickness: 0.035,    // halo shell radius = radius · (1 + atmoThickness); exaggerated (real dust haze ≈ 1.5%)
  atmoColor: new THREE.Color(0.62, 0.34, 0.17),   // linear butterscotch dust
  sunsetColor: new THREE.Color(0.25, 0.45, 1.0),  // Mars' blue twilight
  atmoIntensity: 0.9,
  hazeColor: new THREE.Color(0.80, 0.52, 0.32),   // limb haze over the day-side surface
  haze: 0.45,
  capColor: new THREE.Color(0.86, 0.85, 0.83),    // slightly dusty white
  capStrength: 1.0,
  normalStrength: 1.0,
  ambient: 0.03,           // ≈ what the scene's AmbientLight(0.12) gives a MeshStandardMaterial (0.12/π · albedo)
};

/**
 * @param {object}  o
 * @param {number}  o.radius        planet radius in scene units
 * @param {THREE.Light} o.sunLight  the Sun's light (world position + colour/intensity are read every frame)
 * @param {boolean} [o.isMobile]    smaller (1024-wide) textures, fewer atmosphere segments
 * @param {THREE.WebGLRenderer} [o.renderer]  only used to pick the anisotropy level
 * @param {THREE.Mesh} [o.mesh]     existing ground mesh to adopt. If omitted a new sphere is created in `group`.
 * @param {object}  [o.params]      overrides for DEFAULTS
 */
export function createMars({ radius, sunLight, isMobile = false, renderer = null, mesh = null, params = {} }) {
  const P = { ...DEFAULTS, ...params };
  const segs = isMobile ? 64 : 96;

  const placeholder = mesh?.material?.map || solidTexture(190, 100, 60, true);
  const U = {
    uMap:           { value: placeholder },
    uNormalMap:     { value: solidTexture(128, 128, 255) },
    uNormalStrength:{ value: P.normalStrength },
    uSunDir:        { value: new THREE.Vector3(1, 0, 0) },
    uSunDirObj:     { value: new THREE.Vector3(1, 0, 0) },
    uSunColor:      { value: new THREE.Color(1, 1, 1) },
    uAmbient:       { value: P.ambient },
    uCapColor:      { value: P.capColor },
    uCapStrength:   { value: P.capStrength },
    uSouthCapAxis:  { value: southCapAxis() },
    uHazeColor:     { value: P.hazeColor },
    uHaze:          { value: P.haze },
    uAtmoColor:     { value: P.atmoColor },
    uSunsetColor:   { value: P.sunsetColor },
    uAtmoIntensity: { value: P.atmoIntensity },
    uCenter:        { value: new THREE.Vector3() },
    uR:             { value: radius },
    uRa:            { value: radius * (1 + P.atmoThickness) },
  };

  const group = new THREE.Group();
  group.name = 'Mars';
  loadMarsTextures({
    isMobile,
    anisotropy: renderer ? renderer.capabilities.getMaxAnisotropy() : 1,
    onLoad(key, tex) {
      const uni = key === 'color' ? U.uMap : U.uNormalMap;
      const old = uni.value;
      uni.value = tex;
      if (old && old !== tex) old.dispose();   // procedural placeholder / 1×1 flat normal
    },
  });

  const surfaceMat = createMarsMaterial(U, true);
  let surface = mesh;
  if (surface) {
    surface.material.dispose();
    surface.material = surfaceMat;
  } else {
    surface = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, segs * 0.75), surfaceMat);
    group.add(surface);
  }
  surface.name ||= 'MarsSurface';

  const atmosphere = createMarsAtmosphere(radius, U, P.atmoThickness, isMobile ? 48 : 64);
  group.add(atmosphere);

  // ---- per-frame update ---------------------------------------------------------------------------------------
  const _sun = new THREE.Vector3(), _mars = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function update() {
    sunLight.getWorldPosition(_sun);
    surface.getWorldPosition(_mars);
    const dir = U.uSunDir.value.copy(_sun).sub(_mars);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
    dir.normalize();
    surface.getWorldQuaternion(_q);
    U.uSunDirObj.value.copy(dir).applyQuaternion(_q.invert());   // removes axial tilt + daily spin
    U.uCenter.value.copy(_mars);
    surface.getWorldScale(_s);
    U.uR.value = radius * _s.x;
    U.uRa.value = radius * (1 + P.atmoThickness) * _s.x;
    U.uSunColor.value.copy(sunLight.color).multiplyScalar(sunLight.intensity / Math.PI);
  }
  const prevBefore = surface.onBeforeRender;
  surface.onBeforeRender = function (...args) { update(); prevBefore.apply(this, args); };

  /** Mars season from the lit hemisphere: +1 northern summer solstice … -1 southern summer solstice. */
  const season = () => THREE.MathUtils.clamp(U.uSunDirObj.value.y / 0.4256, -1, 1);

  function dispose() {
    for (const u of Object.values(U)) if (u.value?.isTexture) u.value.dispose();
    atmosphere.geometry.dispose(); atmosphere.material.dispose();
    surfaceMat.dispose();
  }

  return { group, surface, atmosphere, uniforms: U, params: P, update, season, dispose };
}
