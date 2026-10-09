// earth/earthMaterial.js — the Earth ground shader.
//
// Per fragment:
//   • day map lit by the Sun (Lambert, optional normal map on land), with a soft, slightly reddened terminator
//   • night city lights that fade in across the terminator (and are dimmed under thick cloud)
//   • ocean specular glint (Blinn-Phong) masked by the water map
//   • soft cloud shadows: the cloud texture is sampled a little "towards the Sun" from each point, in the cloud
//     layer's own (separately rotating) frame, so the shadows slide with the clouds and fall on the anti-sun side
//   • a thin blue Fresnel rim (the atmosphere seen against the disc), brighter on the day side
//
// Lighting units follow MeshStandardMaterial under three r155+ physical lights: radiance = albedo · (I/π) · N·L,
// so Earth matches the brightness of the other planets lit by the same PointLight.
import * as THREE from 'three';
import { DIR_TO_UV, CLOUD_CURVE } from './glsl.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjDir;     // unit direction in the ground mesh's object space (for the cloud-shadow lookup)
varying vec3 vNormalW;    // world-space geometric normal
varying vec3 vTangentW;   // world-space east-pointing tangent (for the normal map)
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vObjDir = normalize(position);
  mat3 m = mat3(modelMatrix);                       // Earth is uniformly scaled, so no normal matrix needed
  vNormalW = normalize(m * normal);
  // east tangent = ∂position/∂u for SphereGeometry ∝ (z, 0, −x); falls back to +x at the poles
  vec3 t = vec3(position.z, 0.0, -position.x);
  vTangentW = m * (dot(t, t) > 1e-8 ? normalize(t) : vec3(1.0, 0.0, 0.0));
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uWaterMap;
uniform sampler2D uCloudMap;
uniform sampler2D uNormalMap;

uniform vec3  uSunDir;          // world-space unit vector Earth → Sun (updated each frame)
uniform vec3  uSunDirObj;       // same, in the ground mesh's object space (tilt + spin removed)
uniform vec3  uSunColor;        // sun colour × intensity / π (linear)
uniform float uAmbient;         // scene ambient, as a fraction of albedo
uniform mat3  uGroundToCloud;   // ground object space → cloud object space (clouds rotate faster than ground)

uniform float uCloudsReady;     // 0 until the cloud texture has loaded
uniform float uCloudShadow;     // max darkening under full cloud (0..1)
uniform float uNightGain;       // city-light brightness
uniform float uSpecular;        // ocean glint strength
uniform float uNormalStrength;  // land relief strength (desktop only)
uniform vec3  uAtmoColor;       // linear sky colour used for the limb rim

varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vTangentW;
varying vec3 vWorldPos;

${DIR_TO_UV}
${CLOUD_CURVE}

// Cloud coverage above a ground direction (object space). textureGrad with the ground UV derivatives avoids
// the mip-level glitch an atan()-generated UV would otherwise show along the date-line seam.
float cloudCover(vec3 groundDir) {
  vec2 uv = dirToUv(normalize(uGroundToCloud * groundDir));
  return cloudCurve(textureGrad(uCloudMap, uv, dFdx(vUv), dFdy(vUv)).r) * uCloudsReady;
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdLgeo = dot(N, L);

  vec3  day   = texture2D(uDayMap, vUv).rgb;
  float water = texture2D(uWaterMap, vUv).r;

  // ---- relief (land only; oceans stay mirror-smooth) -------------------------------------------------
  vec3 Nb = N;
#ifdef USE_EARTH_NORMALMAP
  vec3 T = normalize(vTangentW - N * dot(N, vTangentW));
  vec3 B = cross(N, T);                              // north
  vec3 tn = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  tn.xy *= uNormalStrength * (1.0 - water);
  Nb = normalize(mat3(T, B, N) * tn);
#endif
  float NdL = dot(Nb, L);

  // ---- soft terminator ------------------------------------------------------------------------------------
  // Lambert, multiplied by a smooth ramp across the terminator so the edge is a band, not a hard line.
  float term = smoothstep(-0.10, 0.20, NdLgeo);
  float diff = max(NdL, 0.0) * term;
  // sunlight reddens as it grazes through more air near the terminator
  vec3 sunTint = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), smoothstep(0.0, 0.35, NdLgeo));

  // ---- cloud shadows ----------------------------------------------------------------------------------------
  // The cloud deck sits ~2% of a radius up, so the cloud that shades a point lies slightly towards the Sun.
  float shadow = cloudCover(vObjDir + normalize(uSunDirObj) * 0.03) * uCloudShadow;
  float overhead = cloudCover(vObjDir);

  vec3 col = day * uSunColor * sunTint * diff * (1.0 - shadow);
  col += day * uAmbient;

  // ---- ocean glint ------------------------------------------------------------------------------------------
  vec3 H = normalize(L + V);
  float NdH = max(dot(N, H), 0.0);
  float glint = (pow(NdH, 220.0) * 1.6 + pow(NdH, 24.0) * 0.05) * uSpecular;
  col += uSunColor * sunTint * glint * water * term * (1.0 - shadow) * (1.0 - 0.8 * overhead);

  // ---- night lights -------------------------------------------------------------------------------------------
  // The source map has a faint blue base layer; keep only the bright city cores and warm them up a little.
  vec3 night = texture2D(uNightMap, vUv).rgb;
  float lights = smoothstep(0.06, 0.55, max(night.r, night.g));
  float nightSide = 1.0 - smoothstep(-0.20, 0.02, NdLgeo);
  col += vec3(1.0, 0.78, 0.48) * lights * nightSide * (1.0 - 0.75 * overhead) * uNightGain;

  // ---- atmosphere rim on the disc + faint day-side haze -------------------------------------------------------
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float dayRim = smoothstep(-0.25, 0.55, NdLgeo);
  col += uAtmoColor * (fres * 0.9 + 0.04) * dayRim;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * @param {object} uniforms   shared uniform object from earth/index.js
 * @param {boolean} useNormalMap
 */
export function createEarthMaterial(uniforms, useNormalMap) {
  return new THREE.ShaderMaterial({
    name: 'EarthSurface',
    uniforms,
    vertexShader,
    fragmentShader,
    defines: useNormalMap ? { USE_EARTH_NORMALMAP: '' } : {},
  });
}
