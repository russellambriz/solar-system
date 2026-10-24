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
//
// Silver lining (uCloudSilver, 0 = the pre-2026-10-19 look): cloud droplets scatter strongly forwards, so when you
// look roughly towards the Sun through sunlit cloud (a crescent Earth, the Sun just behind the planet) the thin
// cloud edges light up. A Henyey–Greenstein lobe (g = uCloudSilverG, normalised to 0 side-on … 1 straight into the
// Sun) adds sunlight weighted towards mid-thickness cloud — optically thick cores stay put, edges and thin veils
// glow. It only exists where the deck is sunlit, so the day disc seen with the Sun behind the camera is unchanged.
import * as THREE from 'three';
import { CLOUD_CURVE, CLOUD_FLOW, TWILIGHT } from './glsl.js';

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
uniform float uCloudSilver;    // forward-scatter (silver lining) strength, × sunlight at the lobe peak
uniform float uCloudSilverG;   // Henyey–Greenstein asymmetry of that lobe (0.5 broad … 0.8 tight)
uniform float uTwilight;       // twilight band (glsl.js TWILIGHT); 0 = the pre-2026-10-24 look
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
${CLOUD_CURVE}
${CLOUD_FLOW}
${TWILIGHT}
float hgPhase(float g, float c) { float d = 1.0 + g * g - 2.0 * g * c; return (1.0 - g * g) / (d * sqrt(d)); }
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
  // twilight: cloud tops sit a few km up, so they see the Sun ~2° longer (μ + 0.035) and glow sunset orange/pink,
  // then catch the scattered twilight sky a little past the ground's terminator (glsl.js TWILIGHT)
  sunTint = mix(sunTint, twSunTint(NdL + 0.035), uTwilight);
  vec3 col = vec3(0.95) * (uSunColor * sunTint * diff + uAmbient * 0.12); // night side: faint ambient only
  col += vec3(0.95) * uSunColor * twGlow(NdL + 0.035) * (0.22 * uTwilight);
  float mu = max(dot(N, V), 0.0);
  // thin clouds at the limb pick up a little sky blue
  float fres = pow(1.0 - mu, 3.0);
  col = mix(col, uAtmoColor * diff * 1.6, fres * 0.15);   // most of the limb haze now comes from atmosphere.js
  // limb: slant-path optical depth (τ·s, s = 1/μ capped) and a cloud-top lift; off beyond the ground silhouette
  float limb = uCloudLimb * smoothstep(0.19, 0.28, mu);
  float s = mix(1.0, min(1.0 / max(mu, 1e-3), uCloudSlantMax), limb);
  float aEdge = clamp(a / max(uCloudsReady * uCloudOpacity, 1e-3), 0.0, 1.0);   // coverage before slant/opacity
  a = 1.0 - pow(1.0 - min(a, 0.995), s);
  col *= 1.0 + uCloudLimbLift * limb * (1.0 - smoothstep(0.25, 0.75, mu));
  // silver lining: forward scattering towards the camera (cosθ = −V·L), on sunlit thin/mid cloud (see header)
  float hg1 = hgPhase(uCloudSilverG, 1.0), hg0 = hgPhase(uCloudSilverG, 0.0);
  float fwd = clamp((hgPhase(uCloudSilverG, -dot(V, L)) - hg0) / (hg1 - hg0), 0.0, 1.0);
  float litTop = smoothstep(-0.05, 0.12, NdL);                          // cloud tops catch the Sun a little past the ground terminator
  float thin = mix(0.12, 1.0, clamp(4.0 * aEdge * (1.0 - aEdge), 0.0, 1.0));
  float rimSoft = mix(0.35, 1.0, smoothstep(0.0, 0.22, mu));             // no hard white ring on the floating rim
  col += uSunColor * sunTint * (uCloudSilver * fwd * litTop * thin * rimSoft);
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
