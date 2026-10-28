// earth/atmosphere.js — single-scattering atmosphere: limb halo + aerial perspective over the disc.
//
// A front-faced shell at the top of the atmosphere is drawn last (after ground and clouds). For every pixel the
// view ray is intersected analytically with the shell and the planet, and ATMO_SCATTER (earth/glsl.js) integrates
// Rayleigh + Mie single scattering along the part inside the air:
//   • rays that miss the planet → the limb halo: blue on the day side, orange/red near the terminator (sunlight
//     arrives through long, blue-depleted paths), a forward-scattering Mie glow when the Sun is behind Earth,
//     and nothing on the night side (sample points sit in Earth's shadow);
//   • rays that hit the planet → aerial perspective: the same inscatter (× uAerial) is added on top of ground and
//     clouds, and they are dimmed by the path's transmittance, so the ground hazes blue towards the limb.
// Blending is "inscatter + destination × transmittance" (premultiplied, alpha = grey transmittance).
// When the camera dips inside the shell the back faces are used instead (and the depth test is dropped).
//
// Aurora (uAurora, 0 = the pre-2026-10-20 look): a second, emission-only march through the same shell adds the
// auroral ovals around both geomagnetic poles (dipole axis ~80.8°N 72.6°W, uAuroraPole in the ground frame). The oval
// sits at ~67° magnetic latitude on the midnight side and shrinks poleward (and fades) towards magnetic noon, like
// the statistical oval; along it, slowly drifting value noise folds the band into curtains and rays. Emission is
// green (557.7 nm oxygen) low in the shell with a red (630 nm) top, only where the air above the ground is dark, so
// it shows as a glowing ring over the night-side polar regions and as curtains standing above the night limb.
//
// Airglow (uAirglow, 0 = the pre-2026-10-28 look): the whole night sky glows faintly in a thin layer around 90-100 km
// (oxygen 557.7 nm green) with a dimmer, higher red-orange (630 nm / sodium) layer. Seen from above it is a barely-there
// green veil, but along the limb the line of sight grazes the layer for ~40x the vertical path, so it shows as the thin
// green-gold arc that ISS night photos show hugging the dark limb. Each layer is an analytic spherical annulus: the
// emission is the ray's chord length inside it (soft-edged with two nested annuli), only where that air is dark.
import * as THREE from 'three';
import { ATMO_SCATTER, VALUE_NOISE } from './glsl.js';

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${ATMO_SCATTER}
uniform float uAerial;        // 0..1 strength of the haze over the ground (1 = physically the same as the limb)
uniform float uAurora;        // aurora brightness (0 = off)
uniform vec3  uAuroraPole;    // north geomagnetic pole, unit vector in the ground's object frame
uniform mat3  uWorldToGround; // world → ground object frame (tilt + daily spin removed; rotation only)
uniform float uAuroraTime;    // slow real-time clock for the curtain drift
uniform float uDetail;        // 1 close-up … 0 overview (curtain fine structure averaged out far away)
uniform float uAirglow;       // night-sky airglow brightness (0 = off)
varying vec3 vWorldPos;
${VALUE_NOISE}

vec3 ring(float a, float k, float z) { return vec3(cos(a) * k, sin(a) * k, z); }

// Auroral emission (linear rgb) integrated along the view ray inside the shell, from tA to tB (relative to centre).
vec3 aurora(vec3 ro, vec3 rd, float tA, float tB) {
  if (uAurora <= 0.0 || tB <= tA) return vec3(0.0);
  vec3 L = normalize(uSunDir);
  vec3 P = normalize(uAuroraPole);
  vec3 S = normalize(uWorldToGround * L);
  vec3 sPerp = S - P * dot(S, P);
  sPerp = dot(sPerp, sPerp) > 1e-6 ? normalize(sPerp) : vec3(1.0, 0.0, 0.0);
  vec3 sSide = cross(P, sPerp);
  float thick = uRa - uR;
  vec3 sum = vec3(0.0);
  float dt = (tB - tA) / float(AURORA_SAMPLES);
  for (int i = 0; i < AURORA_SAMPLES; i++) {
    float t = tA + (float(i) + 0.5) * dt;
    vec3 p = ro + rd * t;
    float r = length(p);
    vec3 up = p / r;
    float h = (r - uR) / thick;                                  // 0 ground … 1 top of the shell
    float dark = 1.0 - smoothstep(-0.12, 0.04, dot(up, L));      // sunlit air drowns it out
    if (dark <= 0.0 || h <= 0.0) continue;
    vec3 d = uWorldToGround * up;
    float mlat = asin(clamp(dot(d, P), -1.0, 1.0));
    float hemi = sign(mlat);
    float colat = 1.5707963 - abs(mlat);                         // magnetic colatitude (rad)
    vec3 e = d - P * dot(d, P);
    float el = length(e);
    if (el < 1e-4) continue;
    e /= el;
    float mid = -dot(e, sPerp);                                  // 1 at magnetic midnight, −1 at noon
    float mlon = atan(dot(e, sSide), dot(e, sPerp));             // magnetic local time angle
    float night = 0.5 + 0.5 * mid;
    // statistical oval: ~23° colatitude at midnight, ~14° at noon; wider and brighter on the night side
    float c0 = mix(0.245, 0.400, night);
    float w  = mix(0.020, 0.042, night);
    // curtains: the band's centre wiggles and its brightness breaks into rays along magnetic longitude.
    // Noise is read on circles (cos, sin of the drifting angle) so it wraps seamlessly around the pole.
    float tt = uAuroraTime;
    float fold = (vnoise(ring(mlon + tt * 0.037, 3.0, hemi * 7.0)) - 0.5) * 0.09
               + (vnoise(ring(mlon - tt * 0.026, 9.0, hemi * 7.0 + 3.0)) - 0.5) * 0.035 * uDetail;
    float x = (colat - c0 - fold) / w;
    float band = exp(-x * x);
    float rays = mix(0.55, 0.25 + 1.2 * vnoise(ring(mlon + tt * 0.01, 60.0, hemi * 5.0 + h * 1.5)), uDetail);
    float patchy = 0.35 + 0.9 * vnoise(ring(mlon - tt * 0.03, 1.6, hemi * 11.0 + 2.0));
    float act = band * rays * patchy * mix(0.15, 1.0, night * night) * dark;
    // vertical profile: sharp lower border (~100 km), green peak just above, long red tail to the top
    float green = smoothstep(0.18, 0.30, h) * exp(-max(h - 0.32, 0.0) * 5.5);
    float red   = smoothstep(0.35, 0.65, h) * (1.0 - smoothstep(0.80, 1.0, h));
    sum += act * (vec3(0.04, 1.0, 0.22) * green + vec3(0.80, 0.06, 0.30) * red * 0.4) * dt;
  }
  return sum / thick * uAurora;
}
// Length of the ray segment [0, tEnd] that lies inside the sphere of radius r (relative to centre).
float chordIn(vec3 ro, vec3 rd, float r, float tEnd) {
  vec2 t = raySphere(ro, rd, r);
  if (t.x > t.y) return 0.0;
  return max(min(t.y, tEnd) - max(t.x, 0.0), 0.0);
}
// Path length inside the annulus between heights h0 and h1 (fractions of the shell), plus its midpoint parameter.
float annulus(vec3 ro, vec3 rd, float h0, float h1, float tEnd, out float tMid) {
  float thick = uRa - uR;
  float r1 = uR + thick * h1;
  vec2 t = raySphere(ro, rd, r1);
  tMid = 0.5 * (max(t.x, 0.0) + min(t.y, tEnd));
  return chordIn(ro, rd, r1, tEnd) - chordIn(ro, rd, uR + thick * h0, tEnd);
}
float airDark(vec3 ro, vec3 rd, float t) {
  vec3 up = normalize(ro + rd * t);
  return 1.0 - smoothstep(-0.10, 0.06, dot(up, normalize(uSunDir)));
}
vec3 airglow(vec3 ro, vec3 rd, float tEnd, float hitGround) {
  if (uAirglow <= 0.0) return vec3(0.0);
  float thick = uRa - uR;
  float tm, tm2;
  // green O(1S) layer: soft core 0.27-0.33 inside a wider 0.22-0.38 skirt
  float g = 0.65 * annulus(ro, rd, 0.27, 0.33, tEnd, tm) + 0.35 * annulus(ro, rd, 0.22, 0.38, tEnd, tm2);
  float dg = airDark(ro, rd, tm);
  // red/orange O(1D) + Na layer a little higher and more diffuse
  float r = annulus(ro, rd, 0.40, 0.62, tEnd, tm);
  float dr = airDark(ro, rd, tm);
  vec3 col = vec3(0.10, 0.55, 0.16) * g * dg + vec3(0.30, 0.08, 0.04) * r * dr * 0.35;
  // over the disc the real veil is barely visible next to city lights, so keep it a hint; the limb arc carries it
  return col / thick * 0.02 * mix(1.0, 0.35, hitGround) * uAirglow;
}
void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  float ground, gNdL;
  vec3 mie;
  vec4 s = atmoScatter(cameraPosition, rd, ground, gNdL, mie);
  // Over the disc: a thin, mostly-Rayleigh (blue) veil that only exists where the ground below is sunlit.
  // The exaggerated shell stays lit a few degrees past the terminator, which otherwise lays a grey sheet over
  // the twilight/night side and drowns the city lights.
  float lit = smoothstep(-0.02, 0.25, gNdL);
  float k = mix(1.0, uAerial * lit, ground);
  vec3 col = (s.rgb + mie * mix(1.0, 0.25, ground)) * k;
  float trans = mix(1.0, s.a, mix(1.0, uAerial, ground));   // transmittance (dimming) applies day and night
  // aurora: emission along the in-shell segment (ending at the ground if the ray hits it)
  if (uAurora > 0.0 || uAirglow > 0.0) {
    vec3 ro = cameraPosition - uCenter;
    vec2 ta = raySphere(ro, rd, uRa);
    vec2 tp = raySphere(ro, rd, uR);
    float tB = (tp.x <= tp.y && tp.x > 0.0) ? tp.x : ta.y;
    col += aurora(ro, rd, max(ta.x, 0.0), tB);
    col += airglow(ro, rd, tB, (tp.x <= tp.y && tp.x > 0.0) ? 1.0 : 0.0);
  }
  gl_FragColor = vec4(col, trans);
  #include <colorspace_fragment>
}
`;

export function createAtmosphere(radius, uniforms, thickness, segments, samples = 6, auroraSamples = 8) {
  const mat = new THREE.ShaderMaterial({
    name: 'EarthAtmosphere',
    uniforms,
    vertexShader,
    fragmentShader,
    defines: { ATMO_SAMPLES: String(samples), AURORA_SAMPLES: String(auroraSamples) },
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,          // + inscattered light
    blendDst: THREE.SrcAlphaFactor,     // + what is behind × transmittance
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  // The polygon must enclose the analytic shell (chords sag inwards), so pad the mesh radius slightly.
  const pad = 1 / Math.cos(Math.PI / segments) + 0.002;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * (1 + thickness) * pad, segments, Math.round(segments * 0.75)), mat);
  mesh.name = 'EarthAtmosphere';
  mesh.renderOrder = 2;
  mesh.raycast = () => {};    // never intercept picking rays
  // camera inside the shell → render back faces without depth test (front faces would be behind the camera)
  const _c = new THREE.Vector3(), _p = new THREE.Vector3();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const inside = camera.getWorldPosition(_c).distanceTo(mesh.getWorldPosition(_p)) < uniforms.uRa.value * 1.02;
    const side = inside ? THREE.BackSide : THREE.FrontSide;
    if (mat.side !== side) { mat.side = side; mat.depthTest = !inside; mat.needsUpdate = true; }
  };
  return mesh;
}
