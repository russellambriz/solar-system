// earth/atmosphere.js — single-scattering atmosphere: limb halo + aerial perspective over the disc.
//
// A front-faced shell at the top of the atmosphere is drawn last (after ground and clouds). For every pixel the
// view ray is intersected analytically with the shell and the planet, and ATMO_SCATTER (earth/glsl.js) integrates
// Rayleigh + Mie single scattering along the part inside the air:
//   • rays that miss the planet → the limb halo: blue on the day side, orange/red near the terminator (sunlight
//     arrives through long, blue-depleted paths), a forward-scattering Mie glow when the Sun is behind Earth,
//     and nothing on the night side (sample points sit in Earth's shadow);
//   • rays that hit the planet → aerial perspective: the same inscatter (× uAerial) is added on top of ground and
//     clouds, and they are dimmed by the path's transmittance, so the ground hazes blue towards the limb.
// Blending is "inscatter + destination × transmittance" (premultiplied, alpha = grey transmittance).
// When the camera dips inside the shell the back faces are used instead (and the depth test is dropped).
import * as THREE from 'three';
import { ATMO_SCATTER } from './glsl.js';

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${ATMO_SCATTER}
uniform float uAerial;        // 0..1 strength of the haze over the ground (1 = physically the same as the limb)
varying vec3 vWorldPos;
void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  float ground;
  vec4 s = atmoScatter(cameraPosition, rd, ground);
  float k = mix(1.0, uAerial, ground);
  vec3 col = s.rgb * k;
  float trans = mix(1.0, s.a, k);
  gl_FragColor = vec4(col, trans);
  #include <colorspace_fragment>
}
`;

export function createAtmosphere(radius, uniforms, thickness, segments, samples = 6) {
  const mat = new THREE.ShaderMaterial({
    name: 'EarthAtmosphere',
    uniforms,
    vertexShader,
    fragmentShader,
    defines: { ATMO_SAMPLES: String(samples) },
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,          // + inscattered light
    blendDst: THREE.SrcAlphaFactor,     // + what is behind × transmittance
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  // The polygon must enclose the analytic shell (chords sag inwards), so pad the mesh radius slightly.
  const pad = 1 / Math.cos(Math.PI / segments) + 0.002;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * (1 + thickness) * pad, segments, Math.round(segments * 0.75)), mat);
  mesh.name = 'EarthAtmosphere';
  mesh.renderOrder = 2;
  mesh.raycast = () => {};    // never intercept picking rays
  // camera inside the shell → render back faces without depth test (front faces would be behind the camera)
  const _c = new THREE.Vector3(), _p = new THREE.Vector3();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const inside = camera.getWorldPosition(_c).distanceTo(mesh.getWorldPosition(_p)) < uniforms.uRa.value * 1.02;
    const side = inside ? THREE.BackSide : THREE.FrontSide;
    if (mat.side !== side) { mat.side = side; mat.depthTest = !inside; mat.needsUpdate = true; }
  };
  return mesh;
}
