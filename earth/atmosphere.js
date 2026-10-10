// earth/atmosphere.js — thin atmospheric halo around the limb.
//
// A back-faced shell slightly larger than the planet, drawn additively. For each pixel we find how close the
// view ray passes to Earth's centre (impact parameter d). Brightness falls off from the surface (d = R) to the
// top of the shell (d = Ra), and the colour/brightness depends on whether that point of closest approach is on
// the day side (blue), near the terminator (a hint of sunset orange) or on the night side (almost nothing).
// Rays that hit the planet are hidden by the depth test (the ground writes depth), so only the halo shows.
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
uniform vec3  uCenter;        // Earth centre, world space
uniform float uR;             // planet radius, world units
uniform float uRa;            // shell (top of atmosphere) radius, world units
uniform vec3  uSunDir;
uniform vec3  uAtmoColor;
uniform float uAtmoIntensity;
varying vec3 vWorldPos;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  float b = max(dot(uCenter - ro, rd), 0.0);        // closest approach along the ray (not behind the camera)
  vec3 cp = ro + rd * b;
  float d = length(cp - uCenter);
  float h = clamp((uRa - d) / (uRa - uR), 0.0, 1.0); // 1 at the surface, 0 at the shell edge
  // Falloff concentrated right at the limb: density ~ exp(-altitude), normalised so the shell edge is 0.
  float glow = (exp(-4.0 * (1.0 - h)) - 0.0183) / 0.9817;
  glow *= glow;
  vec3 up = (cp - uCenter) / max(d, 1e-5);
  float mu = dot(up, normalize(uSunDir));
  float dayF = smoothstep(-0.12, 0.40, mu);                                   // ~0 on the night side
  float sunset = (1.0 - smoothstep(0.0, 0.18, abs(mu + 0.06))) * 0.28;         // faint, just at the terminator
  vec3 col = mix(uAtmoColor, vec3(1.0, 0.45, 0.2), sunset);
  gl_FragColor = vec4(col * glow * dayF * uAtmoIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createAtmosphere(radius, uniforms, thickness, segments) {
  const mat = new THREE.ShaderMaterial({
    name: 'EarthAtmosphere',
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * (1 + thickness), segments, segments * 0.75), mat);
  mesh.name = 'EarthAtmosphere';
  mesh.renderOrder = 2;
  mesh.raycast = () => {};    // never intercept picking rays
  return mesh;
}
