// earth/glsl.js — GLSL snippets shared by the Earth surface and cloud shaders.

/**
 * Direction (unit vector in a sphere's object space) → equirectangular UV, matching THREE.SphereGeometry:
 *   x = -cos(phi)·sin(theta),  y = cos(theta),  z = sin(phi)·sin(theta),   uv = (phi / 2π, 1 − theta / π)
 * The u coordinate may fall outside [0,1]; textures use RepeatWrapping in S so that is fine.
 */
export const DIR_TO_UV = /* glsl */ `
vec2 dirToUv(vec3 d) {
  float u = atan(d.z, -d.x) * 0.15915494;           // 1 / (2π)
  float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) * 0.31830989; // 1 / π
  return vec2(u, v);
}
`;

/** Cloud texture value → coverage (0..1): crush the grey haze in the source image, keep soft edges. */
export const CLOUD_CURVE = /* glsl */ `
float cloudCurve(float c) { return smoothstep(0.08, 0.80, c); }
`;

/**
 * Latitude-dependent cloud drift, flow-map style (needs CLOUD_CURVE and uCloudMap declared first).
 * The cloud deck is locked to the ground frame (index.js); on top of that each latitude band drifts in longitude:
 * westward trade winds in the tropics, eastward westerlies around ±45°, almost nothing near the poles, plus a slow
 * solid-body eastward creep. A per-latitude offset that grew forever would shear the map into streaks, so two copies
 * are sampled with offsets that ramp over one period (half a period apart) and crossfade: the displacement is
 * bounded by rate × period and each copy resets while it is invisible.
 *
 * A plain linear mix of the two sheared copies doubles cloud edges mid-fade (ghosting) and dips contrast. The blend
 * below uses an S-curve weight (less time near 50/50) and an RMS mix (keeps mid-fade coverage from washing out).
 * Wind speeds are independent of period (offset = windRate·period·phase, phase = t/period); a short period caps how
 * far the two copies diverge so residual mid-fade shear stays within a soft cloud edge.
 *
 * Uniforms (set in index.js from a speed-limited clock): uCloudPhase = fract(clock / period), uCloudBase = solid-body
 * offset (radians, wrapped), uCloudFlowPeriod = period in clock units, uCloudWinds = (trades, westerlies, –) in
 * radians of longitude per clock unit (+ = east).
 */
export const CLOUD_FLOW = /* glsl */ `
uniform float uCloudPhase;
uniform float uCloudBase;
uniform float uCloudFlowPeriod;
uniform vec3  uCloudWinds;
float windRate(float phi) {                         // phi = latitude (radians)
  float a = abs(phi);
  return uCloudWinds.x * exp(-(phi * phi) / 0.12)                     // trades, |lat| ≲ 20°
       + uCloudWinds.y * exp(-((a - 0.8) * (a - 0.8)) / 0.09);        // westerlies, ~45°
}
float cloudFlow(vec2 uv, vec2 gx, vec2 gy) {
  float phi = (uv.y - 0.5) * 3.14159265;
  float rate = windRate(phi) * uCloudFlowPeriod;
  float p0 = uCloudPhase, p1 = fract(uCloudPhase + 0.5);
  // a pattern moving east by d radians is sampled at u − d / 2π
  vec2 uvA = vec2(uv.x - (uCloudBase + rate * p0) * 0.15915494, uv.y);
  vec2 uvB = vec2(uv.x - (uCloudBase + rate * p1) * 0.15915494, uv.y);
  float cA = cloudCurve(textureGrad(uCloudMap, uvA, gx, gy).r);
  float cB = cloudCurve(textureGrad(uCloudMap, uvB, gx, gy).r);
  // S-curve weight: endpoints stay a pure single copy (resets stay invisible); the equal-blend zone is
  // narrower in phase, so with a short period the two shears never sit as a long-lived double image.
  float w0 = abs(2.0 * p0 - 1.0);
  float w = w0 * w0 * (3.0 - 2.0 * w0);
  // RMS (not linear) mix: mid-fade coverage stays closer to a single opaque deck instead of washing out.
  return sqrt(mix(cA * cA, cB * cB, w));
}
`;

/** Cheap 3-D value noise (0..1), used for ocean roughness variation. */
export const VALUE_NOISE = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

/**
 * Single-scattering atmosphere (Rayleigh + a little Mie) for a thin exponential shell, used by earth/atmosphere.js
 * for both the limb halo and the aerial-perspective haze over the ground/clouds.
 *
 *   • density ρ(h) = exp(−h/H) with separate Rayleigh / Mie scale heights (fractions of the shell thickness)
 *   • optical depths towards the Sun and back towards the viewer come from an analytic Chapman-function
 *     approximation (C. Schüler, GPU Pro 3), so the march only needs ATMO_SAMPLES points along the view ray
 *     and no nested light march. Points in Earth's shadow get a huge sun optical depth → no light, so the night
 *     side fades to nothing and the terminator reddens by itself (long, blue-depleted sun paths).
 *   • samples are split either side of the ray's closest approach to the centre and bunched towards it
 *     (t = tc ± Δ·u²), where the limb density peaks — few samples, no banding.
 * Uniform units: uRayleigh = vertical optical depth of the whole column at the surface (RGB), uMie likewise (grey).
 */
export const ATMO_SCATTER = /* glsl */ `
#ifndef ATMO_SAMPLES
#define ATMO_SAMPLES 6
#endif
uniform vec3  uCenter;        // Earth centre, world space
uniform float uR;             // planet radius (world)
uniform float uRa;            // top of atmosphere (world)
uniform vec3  uSunDir;        // world unit vector Earth → Sun
uniform vec3  uSunColor;      // sun colour × intensity / π (linear)
uniform vec3  uRayleigh;      // vertical Rayleigh optical depth at the surface (RGB)
uniform float uMie;           // vertical Mie optical depth at the surface
uniform float uMieG;          // Henyey–Greenstein asymmetry (forward scattering)
uniform float uMieGain;       // artistic gain on Mie inscatter only (extinction untouched): readable backlit rim
uniform float uAtmoIntensity; // artistic exposure on top of the physical result
uniform float uScaleR;        // Rayleigh scale height / shell thickness
uniform float uScaleM;        // Mie scale height / shell thickness

vec2 raySphere(vec3 ro, vec3 rd, float r) {        // ro relative to the centre; returns (tNear, tFar)
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

// ∫ρ ds / H from altitude h (in scale heights) to infinity along a ray with zenith cosine coschi; X = R/H.
float chapman(float X, float h, float coschi) {
  float c = sqrt(1.5708 * (X + h));
  if (coschi >= 0.0) return c / (c * coschi + 1.0) * exp(-h);
  float x0 = sqrt(max(1.0 - coschi * coschi, 0.0)) * (X + h);
  float c0 = sqrt(1.5708 * x0);
  return 2.0 * c0 * exp(min(X - x0, 60.0)) - c / (1.0 - c * coschi) * exp(-h);
}

// Inscattered radiance (rgb, linear) along the part of the ray inside the shell, stopping at the ground.
// rgb = Rayleigh part, a = grey transmittance of that segment; mieCol = Mie part (kept separate so the aerial
// haze over the disc can use less of it). hitGround = 1 if the ray ends on the planet; groundNdL = sun cosine
// at that ground point (so callers can keep the haze off the night side).
vec4 atmoScatter(vec3 roW, vec3 rd, out float hitGround, out float groundNdL, out vec3 mieCol) {
  hitGround = 0.0;
  groundNdL = 1.0;
  mieCol = vec3(0.0);
  vec3 ro = roW - uCenter;
  vec2 ta = raySphere(ro, rd, uRa);
  if (ta.x > ta.y || ta.y <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = max(ta.x, 0.0), t1 = ta.y;
  vec2 tp = raySphere(ro, rd, uR);
  if (tp.x <= tp.y && tp.x > 0.0) { t1 = tp.x; hitGround = 1.0; }

  float thick = uRa - uR;
  float Hr = thick * uScaleR, Hm = thick * uScaleM;
  float Xr = uR / Hr, Xm = uR / Hm;
  vec3  L = normalize(uSunDir);
  float mu = dot(rd, L);
  float phR = 0.05968 * (1.0 + mu * mu);                                   // 3 / (16π) · (1 + μ²)
  float g = uMieG, g2 = g * g;
  float phM = 0.07958 * (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5); // HG / (4π)

  // view optical depth from the entry point back to infinity (subtracted so we get entry → sample)
  vec3  pe = ro + rd * t0;
  float re = length(pe);
  float ce = dot(pe, -rd) / re;
  float odR0 = chapman(Xr, (re - uR) / Hr, ce), odM0 = chapman(Xm, (re - uR) / Hm, ce);

  float tc = clamp(-dot(ro, rd), t0, t1);          // closest approach to the centre (densest point)
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  const int HALF = ATMO_SAMPLES / 2;
  for (int i = 0; i < ATMO_SAMPLES; i++) {
    bool far = i >= HALF;
    float u = (float(far ? i - HALF : i) + 0.5) / float(HALF);
    float span = far ? (t1 - tc) : (tc - t0);
    float t = far ? tc + span * u * u : tc - span * u * u;
    float dt = 2.0 * u * span / float(HALF);
    vec3  p = ro + rd * t;
    float r = length(p);
    vec3  up = p / r;
    float hr = (r - uR) / Hr, hm = (r - uR) / Hm;
    float cv = dot(up, -rd), cs = dot(up, L);
    float odRv = max(chapman(Xr, hr, cv) - odR0, 0.0), odMv = max(chapman(Xm, hm, cv) - odM0, 0.0);
    float odRs = chapman(Xr, hr, cs), odMs = chapman(Xm, hm, cs);
    vec3 T = exp(-(uRayleigh * (odRv + odRs) + uMie * 1.1 * (odMv + odMs)));
    sumR += exp(-hr) * T * dt;
    sumM += exp(-hm) * T * dt;
  }
  vec3 E = uSunColor * 3.14159265 * uAtmoIntensity;  // solar irradiance (uSunColor is I/π)
  vec3 col = E * (uRayleigh / Hr * phR * sumR);
  mieCol = E * (uMie * uMieGain / Hm * phM * sumM);

  vec3  pEnd = ro + rd * t1;
  float rEnd = length(pEnd);
  float cEnd = dot(pEnd, -rd) / rEnd;
  groundNdL = dot(pEnd / rEnd, L);
  vec3 Tv = exp(-(uRayleigh * max(chapman(Xr, (rEnd - uR) / Hr, cEnd) - odR0, 0.0) +
                  uMie * 1.1 * max(chapman(Xm, (rEnd - uR) / Hm, cEnd) - odM0, 0.0)));
  return vec4(col, dot(Tv, vec3(0.25, 0.5, 0.25)));
}
`;

/**
 * Twilight (uTwilight, 0 = the pre-2026-10-24 look). Shared by the ground and cloud shaders.
 * twSunTint(mu): colour of direct sunlight at a place where the Sun stands at elevation asin(mu). The light crosses
 *   an air mass m (Kasten & Young 1989) with vertical optical depth TW_TAU (Rayleigh + a little aerosol, R/G/B ≈
 *   680/550/440 nm), so T = exp(−τ·m); the hue (T / T.r) runs white → gold → orange → deep red as the Sun sets.
 *   It is pulled back to white from ~25° up, so the day disc is unchanged.
 * twGlow(mu): skylight just past the terminator. The ground under a twilight sky (Sun up to ~12° below the
 *   horizon) is still lit by sunlight scattered in the upper air: warm orange-pink near the terminator, fading
 *   through mauve into the deep blue of nautical twilight. Returns colour × strength (fraction of full sunlight).
 */
export const TWILIGHT = /* glsl */ `
const vec3 TW_TAU = vec3(0.075, 0.150, 0.300);
vec3 twSunTint(float mu) {
  float m0 = max(mu, 0.0);
  float elev = degrees(asin(clamp(m0, 0.0, 1.0)));
  float am = 1.0 / (m0 + 0.50572 * pow(elev + 6.07995, -1.6364));
  vec3 T = exp(-TW_TAU * am);
  vec3 hue = T / max(T.r, 1e-4);
  return mix(hue, vec3(1.0), smoothstep(0.12, 0.42, mu));
}
vec3 twGlow(float mu) {
  float d = clamp(-mu, -0.06, 0.25);                     // depth below the horizon (sine), a little day-side spill
  float k = exp(-max(d, 0.0) / 0.035) * smoothstep(-0.06, 0.0, d) * (1.0 - smoothstep(0.08, 0.15, d));
  vec3 c = mix(vec3(1.0, 0.46, 0.22), vec3(0.85, 0.36, 0.42), smoothstep(0.01, 0.05, d));
  c = mix(c, vec3(0.25, 0.30, 0.66), smoothstep(0.05, 0.11, d));
  return c * k;
}
`;
