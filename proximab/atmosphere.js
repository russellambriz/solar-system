// proximab/atmosphere.js — thin atmosphere rim for Proxima b, tinted by the star's light.
// Technique adapted from mars/shaders.js / earth/atmosphere.js (copied, not imported): a back-faced shell drawn
// additively. Day side: warm orange-red haze under Proxima's ~3000 K light. Terminator: a soft brighter band.
// Night side: almost nothing (cold, dark).
import * as THREE from 'three';

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3  uCenter;
uniform float uR;
uniform float uRa;
uniform vec3  uStarDir;       // world unit vector planet → Proxima
uniform vec3  uStarColor;     // linear star colour × intensity (not /π — rim is emissive-style)
uniform float uAtmoIntensity;
uniform vec3  uAtmoTint;      // artistic tint on top of the star colour (usually near-white)
varying vec3 vWorldPos;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  float b = max(dot(uCenter - ro, rd), 0.0);
  vec3 cp = ro + rd * b;
  float d = length(cp - uCenter);
  float h = clamp((uRa - d) / max(uRa - uR, 1e-5), 0.0, 1.0);   // 1 at surface, 0 at shell edge
  float glow = (exp(-2.8 * (1.0 - h)) - 0.0608) / 0.9392;
  glow *= glow;
  vec3 up = (cp - uCenter) / max(d, 1e-5);
  float mu = dot(up, normalize(uStarDir));
  float dayF = smoothstep(-0.18, 0.30, mu);
  // Soft terminator brightening (scattered starlight just past the day edge)
  float term = (1.0 - smoothstep(0.0, 0.28, abs(mu + 0.02))) * 0.55;
  // Forward scatter when looking toward the star behind the planet
  float fwd = pow(max(dot(rd, normalize(uStarDir)), 0.0), 6.0) * smoothstep(-0.4, 0.05, mu) * 1.4;
  vec3 col = uStarColor * uAtmoTint * (0.85 + 0.35 * term);
  gl_FragColor = vec4(col * glow * (dayF + fwd * 0.7) * uAtmoIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * @param {number} radius planet radius
 * @param {object} uniforms shared / dedicated atmo uniforms
 * @param {number} thickness shell = radius · (1 + thickness)
 * @param {number} segments
 */
export function createProximaBAtmosphere(radius, uniforms, thickness, segments) {
  const mat = new THREE.ShaderMaterial({
    name: 'ProximaBAtmosphere',
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const pad = 1 / Math.cos(Math.PI / Math.max(segments, 8)) + 0.002;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * (1 + thickness) * pad, segments, Math.round(segments * 0.75)),
    mat,
  );
  mesh.name = 'ProximaBAtmosphere';
  mesh.renderOrder = 2;
  mesh.raycast = () => {};
  return mesh;
}
