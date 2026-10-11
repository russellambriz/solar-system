// earth/earthMaterial.js — the Earth ground shader.
//
// Per fragment:
//   • day map lit by the Sun (Lambert, optional normal map on land), with a soft, slightly reddened terminator
//   • night city lights that fade in across the terminator (and are dimmed under thick cloud)
//   • ocean sun glint (normalised Blinn-Phong + Fresnel, noise-varied roughness) masked by the water map
//   • soft cloud shadows: the cloud texture is sampled a little "towards the Sun" from each point, in the cloud
//     layer's own (separately rotating) frame, so the shadows slide with the clouds and fall on the anti-sun side
//   • level of detail: uDetail (from Earth's on-screen size, see index.js) fades the cloud shadows and widens /
//     dims the glint at overview distances, where the tight lobe and the offset shadow lookup would shimmer
// The blue limb haze over the disc is no longer faked here: earth/atmosphere.js adds physically-based aerial
// perspective (single scattering) on top of ground + clouds.
//
// Lighting units follow MeshStandardMaterial under three r155+ physical lights: radiance = albedo · (I/π) · N·L,
// so Earth matches the brightness of the other planets lit by the same PointLight.
import * as THREE from 'three';
import { DIR_TO_UV, CLOUD_CURVE, VALUE_NOISE } from './glsl.js';

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
uniform float uGlintShininess;  // Blinn-Phong exponent of the calmest sea
uniform float uNormalStrength;  // land relief strength (desktop only)
uniform float uGlintCap;        // peak glint radiance (× sun colour); soft knee below it, never a flat white disc
uniform float uDetail;          // 1 = close-up detail, 0 = overview (glint broadened, cloud shadows off)

varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vTangentW;
varying vec3 vWorldPos;

${DIR_TO_UV}
${CLOUD_CURVE}
${VALUE_NOISE}

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
  float term = smoothstep(-0.06, 0.20, NdLgeo);
  float diff = max(NdL, 0.0) * term;
  // sunlight reddens as it grazes through more air near the terminator
  vec3 sunTint = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), smoothstep(0.0, 0.35, NdLgeo));

  // ---- cloud shadows ----------------------------------------------------------------------------------------
  // The cloud deck sits ~2% of a radius up, so the cloud that shades a point lies slightly towards the Sun.
  float overhead = cloudCover(vObjDir);
  float shadow = uDetail > 0.001 ? cloudCover(vObjDir + normalize(uSunDirObj) * 0.03) * uCloudShadow * uDetail : 0.0;

  vec3 col = day * uSunColor * sunTint * diff * (1.0 - shadow);
  col += day * uAmbient * smoothstep(-0.3, 0.1, NdLgeo);   // no ambient fill deep on the night side

  // ---- ocean glint ------------------------------------------------------------------------------------------
  // Energy-conserving (normalised) Blinn-Phong with Schlick Fresnel (water F0 ≈ 0.02). The exponent is high, so
  // the lobe is a tight glint rather than a broad white blob, and it varies a little with a cheap 3-D value noise
  // (patches of calmer / rougher sea). Fresnel brightens it towards the limb; 1 − exp(−x) soft-clips the result
  // so it can never flatten into a saturated white disc.
  vec3  H    = normalize(L + V);
  float NdH  = max(dot(N, H), 0.0);
  float VdH  = max(dot(V, H), 0.0);
  float sea  = vnoise(vObjDir * 22.0) * 0.65 + vnoise(vObjDir * 61.0) * 0.35;  // 0..1 "calmness"
  sea = mix(0.5, sea, uDetail);                                                 // no sub-pixel noise far away
  float shin = mix(uGlintShininess * 0.6, uGlintShininess, sea);
  // overview: a broad, dim sheen instead of a sub-pixel glint (the normalisation keeps the energy comparable)
  shin = mix(60.0, shin, uDetail);
  float norm = (shin + 8.0) * 0.03978874;                                       // (n + 8) / (8π)
  float fres = 0.02 + 0.98 * pow(1.0 - VdH, 5.0);
  float glint = norm * pow(NdH, shin) * fres * max(NdLgeo, 0.0) * uSpecular;
  glint *= water * term * (1.0 - shadow) * (1.0 - 0.85 * overhead) * mix(0.6, 1.0, uDetail);
  // Gentle (Reinhard) knee with a low ceiling: ≈ linear for small values, approaches uGlintCap only very slowly,
  // so the lobe keeps its peaked profile instead of flattening into a uniform white plateau. The lobe is tight
  // (high exponent) and the strength low, so the typical peak stays below the knee; the colour is the Sun's
  // (warm), never clipped white.
  col += uSunColor * sunTint * vec3(1.0, 0.86, 0.62) * (glint / (1.0 + glint / uGlintCap));

  // ---- night lights -------------------------------------------------------------------------------------------
  // The source map has a faint blue base layer; keep only the bright city cores and warm them up a little.
  vec3 night = texture2D(uNightMap, vUv).rgb;
  float lights = smoothstep(0.06, 0.55, max(night.r, night.g));
  float nightSide = 1.0 - smoothstep(-0.16, 0.0, NdLgeo);
  col += vec3(1.0, 0.74, 0.42) * lights * nightSide * (1.0 - 0.6 * overhead) * uNightGain;

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
