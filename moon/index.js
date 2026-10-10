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

const _sun = new THREE.Vector3(), _earth = new THREE.Vector3(), _moon = new THREE.Vector3();

function loadTex(file, srgb) {
  const t = new THREE.TextureLoader().load(new URL(file, BASE).href);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
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
    uEarthLit: { value: 0.5 },                              // how much of Earth's day side faces the Moon (0..1)
    uEarthTint: { value: new THREE.Color(0.55, 0.66, 0.9) }, // replaced by EarthBot's shared uniform when available
    uEarthshine: { value: 0.3 },                             // scaled for EarthBot's uEarthTint (~0.31 grey-blue)
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });

  const lod = new THREE.LOD();
  const levels = isTouch ? [[96, 64, 0], [48, 32, 8], [24, 16, 40]] : [[160, 112, 0], [72, 48, 8], [24, 16, 40]];
  for (const [w, h, d] of levels) lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(radius, w, h), material), d * radius);
  lod.userData.moonUniforms = uniforms;
  return lod;
}

/** Per frame: sun/Earth positions for lighting, earthshine, and the 0.5x -> 0.273x size easing. */
export function updateMoon(moonBody, camera, sunLight) {
  const u = moonBody.mesh.userData.moonUniforms;
  if (!u) return;
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
  u.uEarthLit.value = 0.5 * (1 + toSun.dot(toMoon));

  // Size easing: one camera distance (to the nearer of Earth/Moon) drives scale, tap target and label together.
  const d = Math.min(camera.position.distanceTo(_moon), camera.position.distanceTo(_earth));
  const base = moonBody.baseRadius || moonBody.radius;
  const far = base * 40, near = base * 8;                  // overview look beyond `far`, real ratio inside `near`
  const t = 1 - THREE.MathUtils.smoothstep(d, near, far);
  const s = THREE.MathUtils.lerp(1, REAL_RATIO / OVERVIEW_RATIO, t);
  moonBody.group.scale.setScalar(s);                       // mesh, pick sphere and label offset all live in this group
  moonBody.radius = base * s;
}
