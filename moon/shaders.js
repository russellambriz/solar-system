// moon/shaders.js — lunar surface shading.
// Photometry: Lunar-Lambert (McEwen) blend of Lambert and Lommel-Seeliger, which is why the full Moon looks
// flat and evenly bright instead of shaded like a ball, plus a small opposition surge near full phase.
// Relief: LOLA-derived normal map in an analytic east/north tangent frame (exact for a UV sphere).
// Rays: analytic bright ray systems for Tycho, Copernicus, Kepler and Aristarchus, plus a second tier of younger
// bright craters (Proclus with its ray-free arc to the southwest, Messier A's twin westward rays, Anaxagoras, Thales,
// Glushko, Byrgius A, Stevinus A, Furnerius A, and Censorinus's bright spot), laid over the LRO albedo. Ray material is fresh,
// immature ejecta, so it stands out most at full Moon (no shadows, albedo contrast only) and nearly vanishes
// near the terminator. Cost: ~7 hash lookups per ray system, skipped outright beyond each system's reach.
// Close-up craters: when the camera is close enough that the colour/relief maps are magnified (one texel spread
// over several pixels), a procedural field of small simple craters (bowls with raised rims, ~1-20 km across) fades
// in below the maps' resolution, with analytic bowl shadows at low Sun. Denser on the bright highlands than on the
// maria (the maria are younger, so they've collected fewer impacts). Each size band only appears where the map
// can't already show real craters that size and where it's at least a few pixels wide, so nothing is doubled and
// nothing shimmers. Skipped entirely at normal viewing distances.
// Terrain shadows: near the terminator each pixel looks toward the Sun across the real LOLA elevation map and
// finds its horizon, so mountains and crater rims cast long shadows, sunlit peaks and rims stand out past the
// terminator (a peak 5 km up still sees the Sun when it has set ~4 degrees away on the flat), and deep basins go
// dark early. The terminator is ragged, as it is through a telescope, instead of a clean curve. The edge of
// every shadow is softened by the Sun's real size (half a degree across). Cost: up to SHADOW_STEPS height
// lookups, only where the Sun is less than ~17 degrees up or just below the horizon; everywhere else is free.

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
uniform vec3 uKepler;
uniform vec3 uAristarchus;
uniform vec3 uTychoRayDir;    // far point of Tycho's long ray across Mare Serenitatis (past Bessel)
uniform float uRayMinor;      // 0 turns the second-tier ray craters off (see MINOR_RAYS in moon/index.js)
uniform vec3 uMinorC[MINOR_RAYS];   // crater centres, unit vectors in mesh space
uniform vec4 uMinorP[MINOR_RAYS];   // crater radius (rad), longest ray (rad), rays around the rim, strength
uniform vec4 uMinorA[MINOR_RAYS];   // ray-free arc: centre azimuth (rad, clockwise from north), half-width (rad, 0 = none); seed; ray width radius (rad)
uniform vec3 uMessierA;       // Messier A and the far ends of its two westward rays
uniform vec3 uMessierT1;
uniform vec3 uMessierT2;
uniform float uDetail;        // 0 turns the close-up crater field off
uniform float uMapTexel;      // arc of one colour/relief texel at the equator (radians = 2*pi / map width)
uniform sampler2D uHeightMap; // LOLA elevation, 10-bit in red (high byte) + green (low byte), see SOURCES.md
uniform float uHeightTexel;   // arc of one height texel (radians = 2*pi / map width)
uniform float uShadow;        // 0 = the old smooth terminator, 1 = terrain shadows from the height map
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vWorldPos;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vnoise(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// One crater's ray fan. c = crater centre, R = crater radius, len = longest ray (both radians of arc on the
// sphere), nR = rays around the rim, seed = per-crater offset. Rays start at the rim, fan out a little, break
// into streaky clumps (secondary-crater chains) and fade out at a random length; plus a bright ejecta nimbus.
// avoid = (azimuth, half-width) of an arc with no ejecta (oblique impacts leave one uprange; half-width 0 = none).
// Rw sets the ray width (the crater radius for big craters; small young craters throw rays wider than their size
// alone suggests). pix = arc of one screen pixel: a ray narrower than about a pixel is widened and dimmed to match, so small
// craters' thin rays don't shimmer from orbit.
float raySystem(vec3 n, vec3 c, float R, float len, float nR, float seed, vec2 avoid, float pix, float Rw) {
  float cd = dot(n, c);
  if (cd < cos(len)) return 0.0;
  float d = acos(clamp(cd, -1.0, 1.0));
  vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 e2 = cross(c, e1);
  float x1 = dot(n, e1), x2 = dot(n, e2);
  float mask = 1.0;
  if (avoid.y > 0.0) {
    float da = abs(mod(atan(x1, x2) - avoid.x + 3.1415927, 6.2831853) - 3.1415927);   // angle from the arc's centre
    mask = smoothstep(avoid.y, avoid.y + 0.35, da);
    if (mask <= 0.0) return 0.0;
  }
  float a = (atan(x2, x1) / 6.2831853 + 0.5) * nR;
  float cell = floor(a), f = a - cell, sd = sin(d), s = 0.0;
  for (int k = -1; k <= 1; k++) {
    float id = mod(cell + float(k), nR) + seed;
    float h1 = h11(id * 1.37), h2 = h11(id * 2.71 + 5.3), h3 = h11(id * 4.13 + 9.1);
    float perp = abs(f - float(k) - (0.15 + 0.7 * h1)) * 6.2831853 / nR * sd;   // cross-track distance
    float L = len * (0.12 + 0.88 * h2 * h2 * h2);                                // many short rays, a few long
    float w = Rw * (0.1 + 0.25 * h3) * (1.0 + 2.5 * d / len);                    // narrow at the rim, fanning out
    float wp = max(w, pix);
    float along = smoothstep(R, 2.2 * R, d) * (1.0 - smoothstep(0.35 * L, L, d)) / (1.0 + 2.0 * d / L);
    float clump = 0.25 + 0.75 * vnoise(d / R * 0.9 + id * 7.0);
    s += exp(-perp * perp / (wp * wp)) * (w / wp) * along * clump * (0.3 + 0.7 * fract(h2 * 7.3 + h3));
  }
  float Rn = max(R, pix);                              // nimbus: same widen-and-dim rule as the rays
  float x = max(d - R, 0.0) / (1.4 * Rn);
  return mask * (s + 0.6 * (R / Rn) * (R / Rn) * exp(-x * x) * smoothstep(0.7 * R, 1.05 * R, d + Rn - R));
}

// A single named great-circle ray from crater c toward point t, length len (rad). pix as in raySystem.
float longRay(vec3 n, vec3 c, vec3 t, float R, float len, float pix) {
  vec3 p = normalize(cross(c, t));
  float off = dot(n, p);
  vec3 q = n - p * off;
  float along = atan(dot(q, cross(p, c)), dot(q, c));
  if (along < 0.0 || along > len) return 0.0;
  float w = R * (0.25 + 0.9 * along / len), wp = max(w, pix);
  float clump = 0.3 + 0.7 * vnoise(along / R * 1.1 + 3.0);
  return exp(-off * off / (wp * wp)) * (w / wp) * smoothstep(1.0 * R, 2.0 * R, along) * (1.0 - smoothstep(0.55 * len, len, along)) * clump;
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// One size band of small simple craters. Crater centres are jittered points of a 3D grid (F cells per Moon radius)
// that lie close to the sphere's surface; only the 2x2x2 nearest cells are searched, which is exact because each
// crater's reach (1.6 radii) stays under the 0.43-cell gap to any skipped point. Adds the slope (grad, a tangent
// vector; the surface normal tilts away from it), the bowl's shadow at low Sun (shade) and fresh bright rims (bright).
const float CR_DEPTH = 0.4, CR_RIM = 0.07;   // depth and rim height in crater radii (depth/diameter ~0.2, like real bowls)
void craterBand(vec3 n, float F, float Rm, float amp, vec3 sunT, vec3 sunB, float tanE,
                inout vec3 grad, inout float shade, inout float bright) {
  vec3 base = floor(n * F - 0.5);
  for (int i = 0; i < 8; i++) {
    vec3 cell = base + vec3(mod(float(i), 2.0), mod(floor(float(i) * 0.5), 2.0), floor(float(i) * 0.25));
    vec3 q = cell + hash33(cell);
    float keep = 1.0 - smoothstep(0.17, 0.25, abs(length(q) - F));   // only points near the surface shell
    if (keep <= 0.0) continue;
    vec3 c = q / length(q);
    vec3 h = hash33(cell + 17.31);
    float R = Rm * (0.35 + h.x * h.x * h.x);                       // many small, a few large (reach stays < 0.43 cell)
    vec3 dv = (n - c) - n * dot(n - c, n);                         // tangent offset from the crater centre
    float r = length(dv) / R;
    if (r >= 1.6) continue;
    float fade = amp * keep;
    float a = fade * (0.25 + 0.75 * h.y * h.y);                    // most are old, softened and shallow; a few are fresh
    vec3 dir = dv / max(length(dv), 1e-9);
    float slope;
    if (r < 1.0) slope = 2.0 * CR_DEPTH * r;                       // parabolic bowl
    else { float x = (r - 1.0) / 0.28; slope = -CR_RIM * 2.0 * x / 0.28 * exp(-x * x); }   // rim crest, falling away
    grad += dir * slope * a * (1.0 - smoothstep(1.3, 1.6, r));
    if (r < 1.0 && tanE > 0.0) {
      // Bowl shadow: the sunward rim hides the floor until the Sun climbs above it. The ray from here toward the
      // Sun meets the rim after (sr - s) radii and must have risen above the depth below the rim by then.
      vec2 st = vec2(dot(dv, sunT), dot(dv, sunB)) / R;
      float sr = sqrt(max(1.0 - st.y * st.y, 0.0));
      float clear = tanE * (sr - st.x) - (CR_DEPTH * (1.0 - r * r) + CR_RIM) * a;
      shade = min(shade, mix(1.0, smoothstep(-0.03, 0.03, clear), min(fade, 1.0)));
    }
    if (h.z > 0.86) bright += fade * h.y * exp(-r * r * 1.4) * (h.z - 0.86) * 7.0;   // a few young craters with bright ejecta
  }
}

// Height above the 1737.4 km reference sphere, in Moon radii, at unit mesh-space direction p. Linear filtering of
// the two bytes separately is still exact linear filtering of the 16-bit value (it's a weighted sum of both).
const float H_LO = -9.5 / 1737.4, H_SPAN = 20.5 / 1737.4;   // the map's encoding range
float heightAt(vec3 p) {
  vec2 uv = vec2(0.5 + atan(-p.z, p.x) / 6.2831853, 0.5 + asin(clamp(p.y, -1.0, 1.0)) / 3.1415927);
  vec2 rg = texture2D(uHeightMap, uv).rg;
  return H_LO + H_SPAN * (rg.r * 65280.0 + rg.g * 255.0) / 65472.0;
}

// How much of the Sun's disc this point sees over the terrain (1 = all, 0 = in shadow). n = the point (unit, mesh
// space), sunT = unit tangent pointing at the Sun, e = Sun elevation above the smooth-sphere horizon (radians),
// pen = half-width of the shadow edge (the Sun's angular radius, or one pixel if that's wider). Walks the great
// circle toward the Sun with growing steps (half a texel out to ~380 km) and keeps the highest horizon angle seen;
// the Moon's curvature is in the geometry, so a high point sees past the smooth terminator.
float sunVisibility(vec3 n, vec3 sunT, float e, float pen) {
  if (e > 0.3) return 1.0;            // no slope in a ~5 km/texel map hides a Sun this high
  if (e < -0.13) return 0.0;          // below the horizon even from the highest peak (dip = sqrt(2 h / R))
  float r0 = 1.0 + heightAt(n);
  float s = 0.5 * uHeightTexel;
  float k = pow(0.22 / s, 1.0 / float(SHADOW_STEPS - 1));
  float tanE = tan(e), tanStop = tan(e + pen), maxT = -1e3;
  for (int i = 0; i < SHADOW_STEPS; i++) {
    vec3 p = n * cos(s) + sunT * sin(s);
    float r = 1.0 + heightAt(p);
    maxT = max(maxT, (r * cos(s) - r0) / (r * sin(s)));   // tan of the elevation of that terrain point, seen from here
    if (maxT > tanStop) return 0.0;   // the whole Sun is already hidden
    s *= k;
  }
  return smoothstep(-pen, pen, e - atan(maxT));
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
  vec3 albedo = texture2D(uMap, vUv).rgb;   // sRGB texture -> linear on fetch

  // Close-up crater field (see craterBand). pixArc = Moon radii covered by one screen pixel here.
  float crShade = 1.0, crBright = 0.0;
  float pixArc = max(length(dFdx(vObjN)), length(dFdy(vObjN)));
  if (uDetail > 0.0 && pixArc < 2.1 * uMapTexel) {   // beyond this no band can have weight (Rm > 1.2 px and < 2.5 texels)
    vec3 Lo = normalize(transpose(m) * normalize(uSunPos - vWorldPos));   // Sun direction in mesh space
    float up = dot(Lo, n);
    vec3 sunT = Lo - n * up;
    float th = length(sunT);
    sunT = th > 1e-5 ? sunT / th : east;
    vec3 sunB = cross(n, sunT);
    float tanE = up / max(th, 1e-4);
    float lum = dot(albedo, vec3(0.3, 0.59, 0.11));
    float terrain = mix(0.4, 1.0, smoothstep(0.1, 0.24, lum));          // maria: well under half the highland crater count
    vec3 grad = vec3(0.0);
    float Rm = 0.012;                                                   // ~21 km craters, then 8, 3.3, 1.3 km
    for (int k = 0; k < DETAIL_BANDS; k++) {
      float w = smoothstep(1.2, 3.0, Rm / pixArc)                        // at least a few pixels across
              * (1.0 - smoothstep(1.0, 2.5, Rm / uMapTexel));            // ...and finer than the map shows
      if (w > 0.01) craterBand(n, 0.2 / Rm, Rm, w * terrain * uDetail, sunT, sunB, tanE, grad, crShade, crBright);
      Rm *= 0.4;
    }
    pn = normalize(pn - grad);
    albedo *= 1.0 + 0.6 * crBright;
  }

  vec3 Ng = normalize(m * n);          // smooth sphere normal (for the terminator)
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  // Relief fades out toward the disc's edge. There the normal map is squashed to a few pixels and a facet can tilt
  // away from both the Sun and the eye, which made black and white speckles along the limb at full Moon. The
  // smooth-sphere photometry (no limb darkening) takes over there, as on the real full Moon.
  float relief = smoothstep(0.04, 0.3, dot(Ng, V));
  vec3 N = normalize(mix(Ng, normalize(m * pn), relief));   // relief normal (for crater shading)

  float cosI = max(dot(N, L), 0.0);
  float cosE = max(dot(N, V), 0.02);   // floor: a facet turned edge-on to the eye must not blow Lommel-Seeliger up to 2x
  float g = acos(clamp(dot(L, V), -1.0, 1.0));         // phase angle

  // Ray craters: Tycho (86 km, rays to ~1,800 km), Copernicus (93 km, rays to ~800 km), Kepler (31 km, rays to
  // ~400 km, crossing Copernicus's) and Aristarchus (40 km, the brightest spot on the Moon, short rays). Strong near
  // full, a faint trace at quarter, gone at crescent (where the LRO albedo already carries what little shows).
  if (uRayStrength > 0.0) {
    vec2 none = vec2(0.0);
    float rays = raySystem(n, uTycho, 0.0248, 1.05, 30.0, 11.0, none, pixArc, 0.0248) + 1.2 * longRay(n, uTycho, uTychoRayDir, 0.0248, 1.45, pixArc)
               + 0.55 * raySystem(n, uCopernicus, 0.0268, 0.45, 44.0, 57.0, none, pixArc, 0.0268)
               + 0.42 * raySystem(n, uKepler, 0.0089, 0.23, 22.0, 83.0, none, pixArc, 0.0089)
               + 0.38 * raySystem(n, uAristarchus, 0.0115, 0.16, 20.0, 131.0, none, pixArc, 0.0115);
    // Second tier: younger, smaller bright craters that stand out at full Moon (see MINOR_RAYS in moon/index.js).
    if (uRayMinor > 0.0) {
      float minor = 0.0;
      for (int i = 0; i < MINOR_RAYS; i++) {
        vec4 P = uMinorP[i], A = uMinorA[i];
        minor += P.w * raySystem(n, uMinorC[i], P.x, P.y, P.z, A.z, A.xy, pixArc, max(P.x, A.w));
      }
      // Messier A: a low-angle impact that threw two nearly straight rays west across Mare Fecunditatis (the "comet").
      minor += 1.8 * (longRay(n, uMessierA, uMessierT1, 0.006, 0.085, pixArc) + longRay(n, uMessierA, uMessierT2, 0.006, 0.075, pixArc));
      rays += uRayMinor * minor;
    }
    rays = 1.0 - exp(-1.3 * rays);                         // soft cap where rays overlap near the rims
    float full = 1.0 - smoothstep(0.2, 1.35, g);
    float r = uRayStrength * rays * mix(0.1, 1.0, full);
    albedo = albedo * (1.0 + 0.9 * r) + vec3(0.04, 0.042, 0.047) * r;   // fresh ejecta: brighter, a touch bluer
  }
  float Lw = mix(1.0, 0.35, smoothstep(0.0, 2.2, g));  // Lommel-Seeliger weight: strong near full, Lambert-ish at crescent
  float ls = 2.0 * cosI / (cosI + cosE + 1e-4);
  float photoRelief = mix(cosI, ls, Lw);
  // Same photometry on the smooth sphere. Near full Moon the eye looks down the sunbeam, so a slope turned away
  // from the Sun is also turned away from us and hardly shows: the real full Moon looks flat. A normal map can't
  // hide those slopes, so they came out as black dashes. Relief contrast therefore grows with phase angle:
  // a quarter of it at full, all of it by about 35 degrees (where crater shadows start to read).
  float cosI0 = max(dot(Ng, L), 0.0), cosE0 = max(dot(Ng, V), 0.02);
  float photoSmooth = mix(cosI0, 2.0 * cosI0 / (cosI0 + cosE0 + 1e-4), Lw);
  float photo = mix(photoSmooth, photoRelief, relief * mix(0.25, 1.0, smoothstep(0.08, 0.6, g)));
  photo *= 1.0 + 0.25 * exp(-g / 0.06);                // opposition surge
  // Terminator. The smooth-sphere version (sharp but not aliased) is the fallback; terrain shadows replace it with
  // the real ragged edge, long mountain shadows and sunlit peaks past it (see sunVisibility).
  float term = smoothstep(-0.015, 0.04, dot(Ng, L));
  if (uShadow > 0.0) {
    vec3 Lm = normalize(transpose(m) * L);                  // Sun direction in mesh space
    float up = dot(Lm, n);
    vec3 sT = Lm - n * up;
    sT = length(sT) > 1e-5 ? normalize(sT) : east;
    float pen = max(0.00465, 0.7 * pixArc);                 // the Sun is 0.53 degrees across
    term = mix(term, sunVisibility(n, sT, asin(clamp(up, -1.0, 1.0)), pen), uShadow);
  }
  photo *= term;
  photo *= mix(1.0, crShade, relief);                  // small-crater bowl shadows (1 unless close up at low Sun)
  vec3 color = albedo * photo * uSunIntensity;

  // Earthshine: sunlight bounced off Earth lights the night side, strongest when Earth looks full from here.
  vec3 Le = normalize(uEarthPos - vWorldPos);
  float night = 1.0 - smoothstep(-0.05, 0.1, dot(Ng, L));
  color += albedo * uEarthTint * uEarthshine * uEarthLit * max(dot(Ng, Le), 0.0) * night;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
