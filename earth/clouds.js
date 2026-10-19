// earth/clouds.js — the cloud deck: a slightly larger sphere using the real cloud map as alpha (with latitude-dependent
// drift, CLOUD_FLOW in glsl.js), lit by the Sun
// with the same soft terminator as the ground (so clouds go dark — not glowing white — on the night side).
//
// Limb (uCloudLimb, 0 = the pre-2026-10-18 look): towards the horizon the line of sight crosses the deck on a slant,
// so its optical depth grows ~1/μ (μ = N·V) — thin cloud and the gaps between cells close up into a denser, whiter
// band, as in photos from orbit. Cloud tops also sit above most of the air, so the haze pass (atmosphere.js, which
// treats them like ground) is pre-compensated with a small lift there. Both fade out before μ ≈ 0.2, where rays on
// the (exaggerated-altitude) deck start to miss the ground, so the floating rim beyond the ground silhouette keeps
// its old soft look and never turns into a hard white ring. index.js scales the strength up on close approach.
import * as THREE from 'three';
import { CLOUD_CURVE, CLOUD_FLOW } from './glsl.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uCloudMap;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uAmbient;
uniform float uCloudsReady;
uniform float uCloudOpacity;
uniform vec3  uAtmoColor;
uniform float uCloudLimb;      // 0..1 slant-path thickening + cloud-top lift towards the limb (see header)
uniform float uCloudSlantMax;  // cap on the 1/μ slant factor
uniform float uCloudLimbLift;  // max brightness lift of limb cloud tops (fraction)
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
${CLOUD_CURVE}
${CLOUD_FLOW}
void main() {
  float a = cloudFlow(vUv, dFdx(vUv), dFdy(vUv)) * uCloudsReady * uCloudOpacity;   // latitude drift, see glsl.js
  if (a < 0.003) discard;
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdL = dot(N, L);
  // clouds scatter light, so use a slightly wrapped Lambert; same reddened twilight as the ground
  // (only a few degrees of wrap past the terminator, so the night-side deck is essentially black)
  float diff = smoothstep(-0.06, 0.22, NdL) * clamp((NdL + 0.08) / 1.08, 0.0, 1.0);
  vec3 sunTint = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), smoothstep(0.0, 0.35, NdL));
  vec3 col = vec3(0.95) * (uSunColor * sunTint * diff + uAmbient * 0.12); // night side: faint ambient only
  float mu = max(dot(N, V), 0.0);
  // thin clouds at the limb pick up a little sky blue
  float fres = pow(1.0 - mu, 3.0);
  col = mix(col, uAtmoColor * diff * 1.6, fres * 0.15);   // most of the limb haze now comes from atmosphere.js
  // limb: slant-path optical depth (τ·s, s = 1/μ capped) and a cloud-top lift; off beyond the ground silhouette
  float limb = uCloudLimb * smoothstep(0.19, 0.28, mu);
  float s = mix(1.0, min(1.0 / max(mu, 1e-3), uCloudSlantMax), limb);
  a = 1.0 - pow(1.0 - min(a, 0.995), s);
  col *= 1.0 + uCloudLimbLift * limb * (1.0 - smoothstep(0.25, 0.75, mu));
  // On the night side the deck is drawn thinner so the (already cloud-dimmed) city lights below stay visible.
  float nightThin = mix(0.55, 1.0, smoothstep(-0.25, 0.05, NdL));
  gl_FragColor = vec4(col, a * mix(1.0, 0.6, fres * (1.0 - limb)) * nightThin);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createCloudMesh(radius, uniforms, segments) {
  const mat = new THREE.ShaderMaterial({
    name: 'EarthClouds',
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments * 0.75), mat);
  mesh.name = 'EarthClouds';
  mesh.renderOrder = 1;
  return mesh;
}
