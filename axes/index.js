// axes/: real spin-axis orientations. Each tilt group's +Y is turned to point at the body's IAU north pole
// (WGCCRE 2015, J2000 RA/Dec), converted to the scene's ecliptic frame (ecliptic = XZ, north = +Y, λ: x = cos λ, z = −sin λ).
// Earth's pole is the celestial pole (RA 0, Dec 90 → λ 90°, β 66.56°), i.e. it points at Polaris on the constellation sphere.
// Retrograde rotators (Venus, Uranus, Pluto) keep their negative spin periods, so they turn backwards about the IAU north pole.
import * as THREE from 'three';
import { raDecToScene } from '../constellations/index.js';

export const IAU_POLES = {       // [RA°, Dec°]
  Mercury: [281.0103, 61.4155],
  Venus: [272.76, 67.16],
  Earth: [0, 90],
  Mars: [317.269, 54.4325],
  Jupiter: [268.0566, 64.4953],
  Saturn: [40.589, 83.537],
  Uranus: [257.311, -15.175],
  Neptune: [299.36, 43.46],
  Pluto: [132.993, -6.163],
};

const _y = new THREE.Vector3(0, 1, 0);
export function poleVector(name, out = new THREE.Vector3()) {
  const p = IAU_POLES[name];
  return p ? raDecToScene(p[0], p[1], out) : null;
}

// Orients `tiltGroup` so its +Y is the body's north pole. Falls back to the old tilt about Z for bodies without a pole.
export function orientTilt(tiltGroup, name, fallbackTiltDeg = 0) {
  const pole = poleVector(name);
  if (pole) tiltGroup.quaternion.setFromUnitVectors(_y, pole);
  else tiltGroup.rotation.z = THREE.MathUtils.degToRad(fallbackTiltDeg);
  return tiltGroup;
}
