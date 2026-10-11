// mars/shaders.js — GLSL for the Mars surface and its thin dusty atmosphere rim.
import * as THREE from 'three';

const VALUE_NOISE = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------------------------------------------
const surfaceVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vObjDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const surfaceFrag = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform float uNormalStrength;
uniform vec3  uSunDir;          // world-space unit vector Mars → Sun
uniform vec3  uSunDirObj;       // same, in the ground mesh's object space (tilt + spin removed)
uniform vec3  uSunColor;        // sun colour × intensity / π (linear), matches MeshStandardMaterial
uniform float uAmbient;
uniform vec3  uCapColor;
uniform float uCapStrength;
uniform vec3  uSouthCapAxis;    // the south residual cap sits ~3° off the pole
uniform vec3  uHazeColor;
uniform float uHaze;
varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying vec3 vWorldPos;
${VALUE_NOISE}

void main() {
  vec3 d = normalize(vObjDir);
  vec3 albedo = texture2D(uMap, vUv).rgb;

  // Local east/north frame on the sphere (object space), matching THREE.SphereGeometry's UVs (u grows eastward).
  vec3 T = vec3(d.z, 0.0, -d.x);
  float tl = length(T);
  T = tl > 1e-4 ? T / tl : vec3(1.0, 0.0, 0.0);
  vec3 B = cross(d, T);
  vec3 n = d;
#ifdef USE_MARS_NORMALMAP
  vec3 nm = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  nm.xy *= uNormalStrength;
  n = normalize(T * nm.x + B * nm.y + d * max(nm.z, 0.05));
#endif

  // ---- polar caps: CO2/water frost whose extent follows Mars' season --------------------------------------------
  // s = +1 at the northern summer solstice (subsolar point at +25.2°), -1 at the southern one.
  float s = clamp(uSunDirObj.y / 0.4256, -1.0, 1.0);
  float edgeN = radians(71.0 + 11.0 * s);     // 82° in northern summer (residual cap) .. 60° in northern winter
  float edgeS = radians(72.0 - 13.0 * s);     // 85° in southern summer (small, offset residual cap) .. 59° in winter
  float jag = (vnoise(d * 9.0) * 0.6 + vnoise(d * 23.0) * 0.4 - 0.5) * radians(6.0);
  float latN = asin(clamp(d.y, -1.0, 1.0));
  float latS = asin(clamp(dot(d, uSouthCapAxis), -1.0, 1.0));
  float w = radians(1.6);
  float capN = smoothstep(edgeN - w, edgeN + w, latN + jag);
  float capS = smoothstep(edgeS - w, edgeS + w, latS + jag);
  // thin seasonal frost fringe just outside the bright cap
  float fringe = max(smoothstep(edgeN - radians(6.0), edgeN, latN + jag), smoothstep(edgeS - radians(6.0), edgeS, latS + jag));
  float cap = max(max(capN, capS), fringe * 0.35) * uCapStrength;
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  vec3 ice = uCapColor * (0.8 + 0.25 * vnoise(d * 60.0)) * (0.75 + 0.25 * smoothstep(0.0, 0.25, lum));  // dusty swirls show through
  albedo = mix(albedo, ice, cap);

  // ---- lighting -------------------------------------------------------------------------------------------------
  float mu0g = dot(d, uSunDirObj);                           // geometric (smooth sphere) incidence
  float mu0 = dot(n, uSunDirObj);                            // with relief
  float twilight = smoothstep(-0.07, 0.10, mu0g);            // dust scattering softens the terminator a little
  float diff = max(mu0, 0.0) * twilight + 0.02 * twilight;
  vec3 col = albedo * uSunColor * diff + albedo * uAmbient;

  // ---- dusty haze toward the limb on the day side ---------------------------------------------------------------
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(normalize(vNormalW), V), 0.0, 1.0);
  float hz = pow(1.0 - mu, 3.0) * smoothstep(-0.05, 0.35, mu0g) * uHaze;
  col = mix(col, uHazeColor * uSunColor * max(mu0g, 0.0) * 1.6, clamp(hz, 0.0, 0.6));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createMarsMaterial(uniforms, useNormalMap) {
  return new THREE.ShaderMaterial({
    name: 'MarsSurface',
    uniforms,
    vertexShader: surfaceVert,
    fragmentShader: surfaceFrag,
    defines: useNormalMap ? { USE_MARS_NORMALMAP: '' } : {},
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Atmosphere rim: a back-faced shell drawn additively (same technique as earth/atmosphere.js).
// For each pixel we find how close the view ray passes to Mars' centre; brightness falls off from the surface to
// the top of the shell. Day side: butterscotch dust haze. Terminator: a hint of Mars' famous blue sunset
// (fine dust forward-scatters blue light around the Sun). Night side: almost nothing.
// ---------------------------------------------------------------------------------------------------------------
const atmoVert = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const atmoFrag = /* glsl */ `
uniform vec3  uCenter;
uniform float uR;
uniform float uRa;
uniform vec3  uSunDir;
uniform vec3  uAtmoColor;
uniform vec3  uSunsetColor;
uniform float uAtmoIntensity;
varying vec3 vWorldPos;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  float b = max(dot(uCenter - ro, rd), 0.0);
  vec3 cp = ro + rd * b;
  float d = length(cp - uCenter);
  float h = clamp((uRa - d) / (uRa - uR), 0.0, 1.0);        // 1 at the surface, 0 at the shell edge
  float glow = (exp(-3.0 * (1.0 - h)) - 0.0498) / 0.9502;   // thin: scale height ~ a third of the shell
  glow *= glow;
  vec3 up = (cp - uCenter) / max(d, 1e-5);
  float mu = dot(up, normalize(uSunDir));
  float dayF = smoothstep(-0.15, 0.35, mu);
  float sunset = (1.0 - smoothstep(0.0, 0.22, abs(mu + 0.04))) * 0.45;
  vec3 col = mix(uAtmoColor, uSunsetColor, sunset);
  // Dust scatters strongly forward: with the Sun behind Mars the whole limb lights up as a thin ring.
  float fwd = pow(max(dot(rd, normalize(uSunDir)), 0.0), 8.0) * smoothstep(-0.35, 0.0, mu) * 1.6;
  gl_FragColor = vec4(col * glow * (dayF + fwd) * uAtmoIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createMarsAtmosphere(radius, uniforms, thickness, segments) {
  const mat = new THREE.ShaderMaterial({
    name: 'MarsAtmosphere',
    uniforms,
    vertexShader: atmoVert,
    fragmentShader: atmoFrag,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * (1 + thickness), segments, segments * 0.75), mat);
  mesh.name = 'MarsAtmosphere';
  mesh.renderOrder = 2;
  mesh.raycast = () => {};    // never intercept picking rays
  return mesh;
}
