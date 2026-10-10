// moon/shaders.js — lunar surface shading.
// Photometry: Lunar-Lambert (McEwen) blend of Lambert and Lommel-Seeliger, which is why the full Moon looks
// flat and evenly bright instead of shaded like a ball, plus a small opposition surge near full phase.
// Relief: LOLA-derived normal map in an analytic east/north tangent frame (exact for a UV sphere).

export const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjN;      // unit position on the sphere (object space) = geometric normal
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vObjN = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const FRAG = /* glsl */ `
uniform mat4 modelMatrix;   // three.js only predeclares it for the vertex stage
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform float uNormalStrength;
uniform vec3 uSunPos;
uniform float uSunIntensity;
uniform vec3 uEarthPos;
uniform float uEarthLit;
uniform vec3 uEarthTint;
uniform float uEarthshine;
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vWorldPos;

void main() {
  vec3 n = normalize(vObjN);
  // three.js SphereGeometry: +u runs east along cross(up, n), +v runs north.
  vec3 east = cross(vec3(0.0, 1.0, 0.0), n);
  east = length(east) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(east);
  vec3 north = cross(n, east);
  vec3 tn = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  tn.xy *= uNormalStrength;
  vec3 pn = normalize(east * tn.x + north * tn.y + n * tn.z);

  mat3 m = mat3(modelMatrix);
  vec3 Ng = normalize(m * n);          // smooth sphere normal (for the terminator)
  vec3 N = normalize(m * pn);          // relief normal (for crater shading)
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 albedo = texture2D(uMap, vUv).rgb;   // sRGB texture -> linear on fetch

  float cosI = max(dot(N, L), 0.0);
  float cosE = max(dot(N, V), 0.0);
  float g = acos(clamp(dot(L, V), -1.0, 1.0));         // phase angle
  float Lw = mix(1.0, 0.35, smoothstep(0.0, 2.2, g));  // Lommel-Seeliger weight: strong near full, Lambert-ish at crescent
  float ls = 2.0 * cosI / (cosI + cosE + 1e-4);
  float photo = mix(cosI, ls, Lw);
  photo *= 1.0 + 0.25 * exp(-g / 0.06);                // opposition surge
  // Sharp but not aliased terminator on the smooth sphere; relief adds the long crater shadows inside it.
  photo *= smoothstep(-0.015, 0.04, dot(Ng, L));
  vec3 color = albedo * photo * uSunIntensity;

  // Earthshine: sunlight bounced off Earth lights the night side, strongest when Earth looks full from here.
  vec3 Le = normalize(uEarthPos - vWorldPos);
  float night = 1.0 - smoothstep(-0.05, 0.1, dot(Ng, L));
  color += albedo * uEarthTint * uEarthshine * uEarthLit * max(dot(Ng, Le), 0.0) * night;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
