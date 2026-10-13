// moon/shaders.js — lunar surface shading.
// Photometry: Lunar-Lambert (McEwen) blend of Lambert and Lommel-Seeliger, which is why the full Moon looks
// flat and evenly bright instead of shaded like a ball, plus a small opposition surge near full phase.
// Relief: LOLA-derived normal map in an analytic east/north tangent frame (exact for a UV sphere).
// Rays: analytic bright ray systems for Tycho and Copernicus, laid over the LRO albedo. Ray material is fresh,
// immature ejecta, so it stands out most at full Moon (no shadows, albedo contrast only) and nearly vanishes
// near the terminator. Cost: ~7 hash lookups per ray system, skipped outright beyond each system's reach.

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
uniform float uRayStrength;   // 0 turns the analytic ray systems off
uniform vec3 uTycho;          // crater centres, unit vectors in mesh space (see moon/index.js)
uniform vec3 uCopernicus;
uniform vec3 uTychoRayDir;    // far point of Tycho's long ray across Mare Serenitatis (past Bessel)
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vWorldPos;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vnoise(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// One crater's ray fan. c = crater centre, R = crater radius, len = longest ray (both radians of arc on the
// sphere), nR = rays around the rim, seed = per-crater offset. Rays start at the rim, fan out a little, break
// into streaky clumps (secondary-crater chains) and fade out at a random length; plus a bright ejecta nimbus.
float raySystem(vec3 n, vec3 c, float R, float len, float nR, float seed) {
  float cd = dot(n, c);
  if (cd < cos(len)) return 0.0;
  float d = acos(clamp(cd, -1.0, 1.0));
  vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 e2 = cross(c, e1);
  float a = (atan(dot(n, e2), dot(n, e1)) / 6.2831853 + 0.5) * nR;
  float cell = floor(a), f = a - cell, sd = sin(d), s = 0.0;
  for (int k = -1; k <= 1; k++) {
    float id = mod(cell + float(k), nR) + seed;
    float h1 = h11(id * 1.37), h2 = h11(id * 2.71 + 5.3), h3 = h11(id * 4.13 + 9.1);
    float perp = abs(f - float(k) - (0.15 + 0.7 * h1)) * 6.2831853 / nR * sd;   // cross-track distance
    float L = len * (0.12 + 0.88 * h2 * h2 * h2);                                // many short rays, a few long
    float w = R * (0.1 + 0.25 * h3) * (1.0 + 2.5 * d / len);                     // narrow at the rim, fanning out
    float along = smoothstep(R, 2.2 * R, d) * (1.0 - smoothstep(0.35 * L, L, d)) / (1.0 + 2.0 * d / L);
    float clump = 0.25 + 0.75 * vnoise(d / R * 0.9 + id * 7.0);
    s += exp(-perp * perp / (w * w)) * along * clump * (0.3 + 0.7 * fract(h2 * 7.3 + h3));
  }
  float x = max(d - R, 0.0) / (1.4 * R);
  return s + 0.6 * exp(-x * x) * smoothstep(0.7 * R, 1.05 * R, d);
}

// A single named great-circle ray from crater c toward point t, length len (rad).
float longRay(vec3 n, vec3 c, vec3 t, float R, float len) {
  vec3 p = normalize(cross(c, t));
  float off = dot(n, p);
  vec3 q = n - p * off;
  float along = atan(dot(q, cross(p, c)), dot(q, c));
  if (along < 0.0 || along > len) return 0.0;
  float w = R * (0.25 + 0.9 * along / len);
  float clump = 0.3 + 0.7 * vnoise(along / R * 1.1 + 3.0);
  return exp(-off * off / (w * w)) * smoothstep(1.0 * R, 2.0 * R, along) * (1.0 - smoothstep(0.55 * len, len, along)) * clump;
}

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

  // Ray craters: Tycho (86 km, rays to ~1,800 km) and Copernicus (93 km, rays to ~800 km). Strong near full,
  // a faint trace at quarter, gone at crescent (where the LRO albedo already carries what little shows).
  if (uRayStrength > 0.0) {
    float rays = raySystem(n, uTycho, 0.0248, 1.05, 30.0, 11.0) + 1.2 * longRay(n, uTycho, uTychoRayDir, 0.0248, 1.45)
               + 0.55 * raySystem(n, uCopernicus, 0.0268, 0.45, 44.0, 57.0);
    rays = 1.0 - exp(-1.3 * rays);                         // soft cap where rays overlap near the rims
    float full = 1.0 - smoothstep(0.2, 1.35, g);
    float r = uRayStrength * rays * mix(0.1, 1.0, full);
    albedo = albedo * (1.0 + 0.9 * r) + vec3(0.04, 0.042, 0.047) * r;   // fresh ejecta: brighter, a touch bluer
  }
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
