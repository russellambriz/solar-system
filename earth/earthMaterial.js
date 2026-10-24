// earth/earthMaterial.js — the Earth ground shader.
//
// Per fragment:
//   • day map lit by the Sun (Lambert, optional normal map on land), with a soft, slightly reddened terminator
//   • night city lights that fade in across the terminator (and are dimmed under thick cloud)
//   • ocean sun glint (normalised Blinn-Phong + Fresnel) masked by the water map, with a sea-state roughness map:
//     calm enclosed seas / sheltered coasts (from a blurred lookup of the water mask), rough trade-wind belts and
//     Southern Ocean westerlies, choppier water under cloud (storms), small noise patches, and no glint on sea ice;
//     a tight core lobe plus a broad wind-roughened sheen around it whose width follows that roughness
//   • soft cloud shadows: the cloud texture is sampled a little "towards the Sun" from each point, in the cloud
//     layer's frame with the same latitude drift (CLOUD_FLOW), so the shadows move with the clouds and fall on the
//     anti-sun side
//   • city lights switch on at dusk in clusters: each spot has its own noise threshold on "how far past the
//     terminator" it must be before it lights up
//   • richer city lights (uCityLights): faint towns / suburbs below the old core threshold, a soft metro glow halo
//     (light scattered by low haze, read from coarse mips of the night map), whiter cores fading to sodium-orange
//     edges, and under cloud the sharp cores give way to a blurred, dimmer glow (cloud diffuses the light)
//   • level of detail: uDetail (from Earth's on-screen size, see index.js) fades the cloud shadows and widens /
//     dims the glint at overview distances, where the tight lobe and the offset shadow lookup would shimmer
//   • seasons: the December 2004 and July 2004 Blue Marble maps are blended by the date (uSeasonW, from the
//     Sun's position in index.js). Above ~25° latitude the blend is progressive with latitude, so the snow line
//     sweeps south across Canada / Siberia in autumn and back north in spring, with a noisy, uneven edge; the
//     southern hemisphere runs the other way round (Patagonian snow, winter sea ice round Antarctica). The tropics
//     cross-fade evenly (wet / dry season greening).
//   • true-colour ocean (uOceanColor): the day maps' painted sea-floor relief is replaced past the shelf break by a
//     uniform deep ocean blue (GEBCO depth map), shelves keep their lighter colour
// The blue limb haze over the disc is no longer faked here: earth/atmosphere.js adds physically-based aerial
// perspective (single scattering) on top of ground + clouds.
//
// Lighting units follow MeshStandardMaterial under three r155+ physical lights: radiance = albedo · (I/π) · N·L,
// so Earth matches the brightness of the other planets lit by the same PointLight.
import * as THREE from 'three';
import { DIR_TO_UV, CLOUD_CURVE, CLOUD_FLOW, VALUE_NOISE } from './glsl.js';

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
uniform sampler2D uDayMapJul;     // July day map (seasonal partner of uDayMap = December)
uniform float uDayJulReady;       // 0 until it has loaded
uniform float uSeasonW;           // December-map weight for the current date (1 = northern winter, 0 = summer)
uniform float uSeason;            // seasonal blend strength (0 = December map only)
uniform sampler2D uDepthMap;      // sea-floor depth, sqrt(depth / 8 km), 0 on land (GEBCO_08, 2K / 1K)
uniform float uDepthReady;        // 0 until it has loaded
uniform float uOceanColor;        // true-colour ocean strength (0 = the day map's painted sea-floor relief)

uniform vec3  uSunDir;          // world-space unit vector Earth → Sun (updated each frame)
uniform vec3  uSunDirObj;       // same, in the ground mesh's object space (tilt + spin removed)
uniform vec3  uSunColor;        // sun colour × intensity / π (linear)
uniform float uAmbient;         // scene ambient, as a fraction of albedo
uniform mat3  uGroundToCloud;   // ground object space → cloud object space (clouds rotate faster than ground)

uniform float uCloudsReady;     // 0 until the cloud texture has loaded
uniform float uCloudShadow;     // max darkening under full cloud (0..1)
uniform float uNightGain;       // city-light brightness
uniform float uCityLights;      // richer city lights (dim towns, glow halo, colour, cloud diffusion); 0 = cores only
uniform float uSpecular;        // ocean glint strength
uniform float uGlintShininess;  // Blinn-Phong exponent of the calmest sea
uniform float uNormalStrength;  // land relief strength (desktop only)
uniform float uGlintCap;        // peak glint radiance (× sun colour); soft knee below it, never a flat white disc
uniform float uDetail;          // 1 = close-up detail, 0 = overview (glint broadened, cloud shadows off)
uniform float uSeaState;        // strength of the sea-state roughness map (0 = uniform sea, 1 = full)
uniform float uSheen;           // strength of the broad wind-roughened glint (Cox–Munk-like sheen) around the core

varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vTangentW;
varying vec3 vWorldPos;

${DIR_TO_UV}
${CLOUD_CURVE}
${CLOUD_FLOW}
${VALUE_NOISE}

// Cloud coverage above a ground direction (object space). textureGrad with the ground UV derivatives avoids
// the mip-level glitch an atan()-generated UV would otherwise show along the date-line seam.
float cloudCover(vec3 groundDir) {
  vec2 uv = dirToUv(normalize(uGroundToCloud * groundDir));
  return cloudFlow(uv, dFdx(vUv), dFdy(vUv)) * uCloudsReady;      // same drift as the cloud deck → shadows follow
}

// Sea-state roughness (0 = glassy, 1 = rough), driving the glint exponent. Large-scale terms only use data we
// already have, so it costs two extra (coarse-mip) texture reads and no new maps:
//   • wind climatology by latitude: calm doldrums (~0°) and horse latitudes (~30°), breezy trade-wind belts
//     (~15°), rough westerlies (~50°), roughest in the Southern Ocean's "roaring forties / furious fifties"
//   • storms: water under cloud is choppier (cloud cover is a cheap proxy for wind)
//   • shelter: the water mask read at fixed coarse mip levels (~256 and ~64 texels around) is < 1 wherever land
//     is within a few hundred km, so enclosed seas, gulfs and lee coasts come out calm and glassy. Explicit LODs
//     (from textureSize) keep the blur radius the same on the 1K, 2K and 4K masks and at every zoom level.
float seaRoughness(float phi, float cloud, float noise) {
  float a = abs(phi);
  float trades = exp(-((a - 0.26) * (a - 0.26)) / 0.012);
  float west   = exp(-((a - 0.88) * (a - 0.88)) / 0.035) * (phi < 0.0 ? 1.0 : 0.7);
  float wind = 0.22 + 0.30 * trades + 0.55 * west;
  float lw = log2(max(float(textureSize(uWaterMap, 0).x), 1.0));
  float open = 0.5 * textureLod(uWaterMap, vUv, max(lw - 8.0, 0.0)).r
             + 0.5 * textureLod(uWaterMap, vUv, max(lw - 6.0, 0.0)).r;
  float shelter = 1.0 - smoothstep(0.55, 0.97, open);         // 1 = enclosed / right by the coast
  float r = wind + 0.30 * cloud + (noise - 0.5) * 0.45;
  return clamp(r * mix(1.0, 0.3, shelter), 0.0, 1.0);
}

// Weight of the December map at this latitude. x = seasonal weight (1 Dec … 0 Jul for the hemisphere's winter
// map); poleward places switch first: threshold 0.06 at 80°, 0.94 at 35°, jittered by value noise.
float seasonFront(float x, float alat, float n) {
  float th = clamp((80.0 - alat) / 45.0, 0.0, 1.0) * 0.88 + 0.06 + (n - 0.5) * 0.16;
  return smoothstep(th - 0.1, th + 0.1, x);
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdLgeo = dot(N, L);

  vec3  day   = texture2D(uDayMap, vUv).rgb;
  // ---- seasons (December ↔ July map) --------------------------------------------------------------------------
  {
    float k = uSeason * uDayJulReady;
    if (k > 0.001) {
      float lat = (vUv.y - 0.5) * 180.0, alat = abs(lat);
      float n = vnoise(vObjDir * 7.0) * 0.6 + vnoise(vObjDir * 23.0) * 0.4;
      float front = lat > 0.0 ? seasonFront(uSeasonW, alat, n)            // north: winter = December map
                              : 1.0 - seasonFront(1.0 - uSeasonW, alat, n); // south: winter = July map
      float wDec = mix(uSeasonW, front, smoothstep(15.0, 35.0, alat));
      day = mix(day, texture2D(uDayMapJul, vUv).rgb, (1.0 - wDec) * k);
    }
  }
  float water = texture2D(uWaterMap, vUv).r;
  // ---- true-colour ocean -----------------------------------------------------------------------------------------
  // The Blue Marble "topo.bathy" maps shade the sea floor into the ocean (mid-ocean ridges, fracture zones, trenches
  // show as pale bands and streaks), which no camera in orbit sees: past the shelf, ~1 km of water absorbs every
  // trace of the bottom. Beyond the shelf break the colour therefore becomes a uniform deep ocean blue (clear,
  // violet-blue in the subtropical gyres; darker and a touch greener in the productive high-latitude and equatorial
  // upwelling waters), while shallow shelves and lagoons keep the map's lighter turquoise. The continental slope
  // (~100 m … ~900 m) is the cross-fade, so shelves keep their real outlines, toned down (the map's shelf tint is
  // much brighter than in real photos). Sea ice and lakes (depth 0) untouched.
  {
    float k = uOceanColor * uDepthReady;
    if (k > 0.001) {
      float e = texture2D(uDepthMap, vUv).r;                       // sqrt(depth / 8 km)
      float deep = smoothstep(0.11, 0.33, e);
      float alat = abs(vUv.y - 0.5) * 180.0;
      vec3 deepCol = mix(vec3(0.0014, 0.0050, 0.0215), vec3(0.0017, 0.0060, 0.0160), smoothstep(30.0, 55.0, alat));
      deepCol = mix(deepCol, vec3(0.0017, 0.0060, 0.0160), 0.35 * exp(-alat * alat / 40.0));
      deepCol *= 0.94 + 0.12 * vnoise(vObjDir * 4.0);               // very faint basin-scale variation
      float ice0 = smoothstep(0.22, 0.45, min(day.r, min(day.g, day.b)));
      // shelves: the map's shelf tint is atlas-bright, so it is pulled part-way to the deep colour too (more on
      // the outer shelf, ~60-100 m, than in shallow coastal water / lagoons); lakes (depth 0) keep the map colour
      float w = mix(0.3 + 0.35 * smoothstep(0.05, 0.11, e), 1.0, deep) * smoothstep(0.0, 0.03, e);
      day = mix(day, deepCol, w * water * (1.0 - ice0) * k);
    }
  }

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
  float sea  = vnoise(vObjDir * 22.0) * 0.65 + vnoise(vObjDir * 61.0) * 0.35;  // 0..1 noise patches
  sea = mix(0.5, sea, uDetail);                                                 // no sub-pixel noise far away
  // sea state: glassy (×1.6 the exponent: smaller, brighter glint) … rough (×0.25: broad, dim sheen). The
  // normalisation keeps the reflected energy comparable, so roughness reshapes the glint rather than hiding it.
  float rough = seaRoughness((vUv.y - 0.5) * 3.14159265, overhead, sea);
  float shin = uGlintShininess * exp2(mix(-0.35, mix(0.7, -2.0, rough), uSeaState));
  // sea ice (white, unsaturated pixels in the day map that the water mask still calls ocean) has no glint
  float ice = smoothstep(0.22, 0.45, min(day.r, min(day.g, day.b)));
  // overview: a broad, dim sheen instead of a sub-pixel glint (the normalisation keeps the energy comparable)
  shin = mix(60.0, shin, uDetail);
  float norm = (shin + 8.0) * 0.03978874;                                       // (n + 8) / (8π)
  float fres = 0.02 + 0.98 * pow(1.0 - VdH, 5.0);
  float glint = norm * pow(NdH, shin) * fres * max(NdLgeo, 0.0) * uSpecular;
  // Broad sheen: a real sea is a mosaic of wave facets, so around the tight core the sunlight is also mirrored
  // over a wide area whose size follows the wave-slope spread (Cox & Munk: σ² ≈ 0.003 + 0.005·wind; Blinn-Phong
  // n ≈ 2/σ² → ~400 for a glassy gulf, ~50 for a gale). Rough water spreads it into a faint silvery haze, calm
  // patches and sheltered seas light up as bright, sharp-edged areas inside it, as in astronaut photos.
  // Wind streaks / slicks: value noise stretched ~3:1 along longitude (the mean wind runs roughly east–west), so
  // inside the sheen the calm and rough lanes read as elongated bands rather than round blobs.
  float streak = vnoise(vObjDir * vec3(26.0, 85.0, 26.0)) * 0.7 + vnoise(vObjDir * vec3(70.0, 210.0, 70.0)) * 0.3;
  float roughB = clamp(rough + (smoothstep(0.3, 0.7, streak) - 0.5) * 0.9 * uDetail, 0.0, 1.0);
  float nB = mix(420.0, 50.0, mix(0.45, roughB, uSeaState));
  glint += (nB + 8.0) * 0.03978874 * pow(NdH, nB) * fres * max(NdLgeo, 0.0) * uSheen;
  glint *= water * (1.0 - ice) * term * (1.0 - shadow) * (1.0 - 0.85 * overhead) * mix(0.6, 1.0, uDetail);
  // Gentle (Reinhard) knee with a low ceiling: ≈ linear for small values, approaches uGlintCap only very slowly,
  // so the lobe keeps its peaked profile instead of flattening into a uniform white plateau. The lobe is tight
  // (high exponent) and the strength low, so the typical peak stays below the knee; the colour is the Sun's
  // (warm), never clipped white.
  col += uSunColor * sunTint * vec3(1.0, 0.86, 0.62) * (glint / (1.0 + glint / uGlintCap));

  // ---- night lights -------------------------------------------------------------------------------------------
  // The source map has a faint blue base layer; keep only the bright city cores and warm them up a little.
  vec3 night = texture2D(uNightMap, vUv).rgb;
  float nm = max(night.r, night.g);
  float lights = smoothstep(0.06, 0.55, nm);
  vec3 lightCol = vec3(1.0, 0.74, 0.42);
  if (uCityLights > 0.001) {
    // Metro glow: the night map read at fixed coarse mips (~80 km and ~160 km around, the same on the 1K, 2K and
    // 4K maps), so big conurbations sit in a soft pool of scattered light and roads between towns merge.
    float lwN = log2(max(float(textureSize(uNightMap, 0).x), 1.0));
    vec3 b1 = textureLod(uNightMap, vUv, max(lwN - 9.0, 0.0)).rgb;
    vec3 b2 = textureLod(uNightMap, vUv, max(lwN - 8.0, 0.0)).rgb;
    float g1 = max(b1.r, b1.g), g2 = max(b2.r, b2.g);
    float glow = smoothstep(0.0, 0.22, g1) * 0.30 + smoothstep(0.0, 0.14, g2) * 0.16;
    // faint towns / suburbs that the old 0.06 threshold dropped (~2× the lit area of the cores alone)
    float dim = smoothstep(0.012, 0.09, nm) * 0.30;
    float rich = max(lights, dim) + glow * (1.0 - lights);
    // under cloud, the sharp pattern is diffused into a broader, dimmer glow
    float cl = smoothstep(0.15, 0.8, overhead);
    float diffused = (smoothstep(0.0, 0.2, g2) * 0.45 + smoothstep(0.0, 0.25, g1) * 0.25);
    rich = mix(rich, diffused, cl * 0.75);
    // colour: bright cores whiter (mixed LED / high-pressure sodium), dim edges and glow deeper sodium orange
    vec3 richCol = mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.86, 0.62), smoothstep(0.25, 0.9, lights));
    lights = mix(lights, rich, uCityLights);
    lightCol = mix(lightCol, richCol, uCityLights);
  }
  // Dusk switch-on: "darkness" goes 0 → 1 from just past the terminator to ~12° into the night. Each place gets
  // its own threshold from two octaves of value noise (town-sized clusters + finer grain), so as the terminator
  // sweeps over, cities come on in patches instead of one uniform fade. At overview distances the threshold
  // flattens to 0.5 (no sub-pixel noise).
  float dark = 1.0 - smoothstep(-0.21, -0.015, NdLgeo);
  float thr  = vnoise(vObjDir * 38.0) * 0.65 + vnoise(vObjDir * 140.0) * 0.35;
  thr = mix(0.5, clamp((thr - 0.22) / 0.56, 0.0, 1.0), uDetail) * 0.86 + 0.07;
  float on = smoothstep(thr - 0.05, thr + 0.05, dark);
  col += lightCol * lights * on * mix(0.55, 1.0, dark) * (1.0 - mix(0.6, 0.35, uCityLights) * overhead) * uNightGain;

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
