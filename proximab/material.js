// proximab/material.js — procedural "eyeball" surface for tidally-locked Proxima b.
// Object-space convention: +Z is the substellar point (always faces Proxima; index.js orients the mesh).
// Layout along the star axis (μ = dot(normal, +Z)):
//   • μ ≳ oceanEdge  → substellar ocean "eye" (dark water under dim red light, soft specular)
//   • oceanEdge → iceEdge → rocky basalt day side with procedural craters / ridges
//   • across the terminator → cold ice night side (permanently dark)
// No textures — fBm value noise only (mobile-safe). Ideas adapted from earth/ / mars/ (copied, not imported).
import * as THREE from 'three';
import { VALUE_NOISE } from './glsl.js';

const vertexShader = /* glsl */ `
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vObjDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3  uStarDir;        // world unit vector planet → Proxima
uniform vec3  uStarDirObj;     // same in mesh object space (= +Z when tidally locked)
uniform vec3  uStarColor;      // star colour × intensity / π (MeshStandard-compatible)
uniform float uAmbient;
uniform float uOceanEdge;      // cos(angle) of ocean rim from substellar (~0.55–0.75)
uniform float uIceEdge;        // cos(angle) where day-side ice begins (~0.05–0.25)
uniform float uOceanSpec;      // specular strength on the ocean eye
uniform float uRockRough;      // rock albedo variation strength
uniform float uIceBright;      // night/day ice brightness
uniform float uTerminator;     // width of the soft terminator band
uniform vec3  uRockColor;
uniform vec3  uOceanColor;
uniform vec3  uIceColor;
uniform vec3  uHazeColor;
uniform float uHaze;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vWorldPos;
${VALUE_NOISE}

void main() {
  vec3 d = normalize(vObjDir);
  // Star axis in object space: after tidal lock this is ~+Z; keep using the uniform so a missed
  // orientation frame still lights correctly.
  vec3 S = normalize(uStarDirObj);
  float mu = dot(d, S);                                       // 1 = substellar, −1 = antistellar

  // ---- procedural surface type ---------------------------------------------------------------------------------
  float n1 = fbm(d * 4.0);
  float n2 = fbm(d * 11.0 + 3.7);
  float n3 = vnoise(d * 28.0);
  // Ocean eye: circular around the substellar point, with a noisy coastline
  float coastJag = (n1 - 0.5) * 0.08 + (n2 - 0.5) * 0.04;
  float ocean = smoothstep(uOceanEdge - 0.04, uOceanEdge + 0.02, mu + coastJag);
  // Day-side ice fringe between ocean and rock / past the rock toward the terminator
  float iceDay = smoothstep(uIceEdge + 0.08, uIceEdge - 0.02, mu + coastJag * 0.5)
               * (1.0 - ocean);
  // Permanent night-side ice (and a little past the terminator onto the cold dusk)
  float night = 1.0 - smoothstep(-uTerminator, uTerminator * 1.4, mu);
  float iceNight = night * (0.85 + 0.15 * n2);

  // Rock albedo: dark basalt with subtle reddish dust under an M-dwarf spectrum
  float crater = smoothstep(0.62, 0.78, n2) * (0.15 + 0.85 * smoothstep(0.55, 0.85, n3));
  float ridge  = abs(n1 - 0.5) * 2.0;
  vec3 rock = uRockColor * (0.72 + uRockRough * (n1 * 0.35 + n2 * 0.25 - crater * 0.45 + ridge * 0.08));
  // Slight warm dust on the day rock (M-dwarf photochemistry vibes)
  rock = mix(rock, rock * vec3(1.15, 0.85, 0.7), 0.25 * clamp(mu, 0.0, 1.0));

  // Ocean: deep, slightly green-blue under red light (absorbs red → looks darker / teal)
  float foam = smoothstep(uOceanEdge - 0.02, uOceanEdge, mu + coastJag) *
               (1.0 - smoothstep(uOceanEdge, uOceanEdge + 0.06, mu + coastJag));
  vec3 oceanCol = uOceanColor * (0.85 + 0.2 * n3) + vec3(0.12, 0.14, 0.12) * foam;

  // Ice: cold blue-white with faint cracks
  float crack = smoothstep(0.55, 0.85, abs(n2 - n3));
  vec3 ice = uIceColor * (0.75 + 0.25 * n1) * (1.0 - crack * 0.18) * uIceBright;

  vec3 albedo = rock;
  albedo = mix(albedo, oceanCol, ocean);
  albedo = mix(albedo, ice, clamp(max(iceDay * 0.9, iceNight), 0.0, 1.0));

  // ---- lighting (Lambert + soft terminator, MeshStandard-compatible units) ------------------------------------
  float muLit = mu;                                           // geometric incidence (= star cosine when locked)
  float twilight = smoothstep(-uTerminator, uTerminator * 0.9, muLit);
  float diff = max(muLit, 0.0) * twilight;
  // Dim night: starlight ambient is tiny; ice still faintly readable
  float amb = uAmbient * (0.6 + 0.4 * iceNight);
  vec3 col = albedo * uStarColor * diff + albedo * amb;

  // Ocean specular glint (Blinn-Phong, warm from the red star)
  if (ocean > 0.01 && muLit > 0.0) {
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uStarDir);
    vec3 H = normalize(L + V);
    float ndh = max(dot(normalize(vNormalW), H), 0.0);
    float spec = pow(ndh, 120.0) * uOceanSpec * ocean * twilight;
    // Fresnel-ish: brighter glancing glint
    float fres = pow(1.0 - max(dot(normalize(vNormalW), V), 0.0), 3.0);
    col += uStarColor * spec * (0.55 + 0.9 * fres);
  }

  // Thin day-side limb haze (atmosphere shell carries the real rim; this is a cheap disc cue)
  vec3 V2 = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(normalize(vNormalW), V2), 0.0), 2.8);
  col += uHazeColor * uStarColor * rim * smoothstep(-0.05, 0.4, muLit) * uHaze;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createProximaBMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    name: 'ProximaBSurface',
    uniforms,
    vertexShader,
    fragmentShader,
  });
}
