// TON 618 — a hyperluminous quasar ~10.8 billion light-years away — for the galaxy scene of /workspace/solar-system
// (1 unit = 100 ly, galactic plane = XZ, +y = north galactic pole). Standalone: needs only `three` and the CSS2DRenderer
// addon (both already in the repo's import map). No build step.
//
//   import { addTon618, TON618_INFO } from './ton618.js';
//   const ton = addTon618(galaxy, { isTouch, labels: true });       // galaxy = createGalaxy(...)
//   ...each frame (galaxy scene active, after galaxy.update): ton.update(camera, renderer);
//
// DISTANCE / SCALE SCHEME
//  * Position is TRUE: light-travel distance 10.8 billion ly = 108,000,000 units from the Sun, direction galactic
//    l = 170.64°, b = +83.36° (from J2000 RA 12h28m24.9s, Dec +31°28′38″, converted with the same frame galaxy.js uses
//    for M31 and sombrero.js for M104). That is ~350× the Sombrero's distance and ~4,300× Andromeda's — almost straight
//    "up" out of the Milky Way's disk.
//  * Float precision: three.js composes modelViewMatrix = viewMatrix · modelMatrix on the CPU in float64 and only then
//    uploads it, so ordinary meshes/points/sprites near the camera stay rock steady even 1e8 units from the origin.
//    The only thing that would jitter is shader math on raw world coordinates (cameraPosition, world-space ray origins),
//    so the ray-traced black hole here works entirely in VIEW space with camera-relative uniforms computed in float64 on
//    the CPU. No depth buffer is involved (every galaxy-scene material has depthWrite:false), so no z-fighting either.
//  * Far-plane independence: beacons, labels and the distance line are "sky-projected": anything farther than ~0.45 ×
//    camera.far is moved along its own camera ray to that distance (same pixel on screen, inside the frustum). So the far
//    view works with the Sombrero integration's GALAXY_FAR = 2,000,000 — no 1e8+ far plane needed. The quasar's own
//    geometry is only drawn within 300,000 units of it (beyond that it is sub-pixel; the beacon takes over).
//  * Nested sizes: the host galaxy, the jets and the giant Lyman-α nebula are drawn roughly to scale (host illustrative —
//    it has never been seen directly). The black hole + accretion disk would be tiny (Rs ≈ 800 AU ≈ 0.013 ly ≈ 1/8,000 of a unit), so
//    that core is ENLARGED (Rs = RS_WORLD units, default 2 ≈ 16,000×; a note says so). Inside the core everything is
//    self-consistent: the shadow has its true size relative to the disk, and a ghost ring of Neptune's orbit
//    (30 AU, with the Sun as a dot) is drawn to the same scale inside the shadow, just above its center.
//
// RENDERING (close-up): same technique as sgra.js — one camera-facing quad ray-traces photon geodesics through the
// Schwarzschild metric (x'' = −1.5·h²·x/r⁵), accumulating a Doppler-beamed (g⁴) blackbody accretion disk (hotter and
// bigger than Sgr A*'s: blue-white, out to 20 Rs), a photon ring, and lensing of the frame drawn so far
// (renderer.copyFramebufferToTexture). Before the quad: twin relativistic jets (animated knots, tapered, Doppler
// boosted/dimmed by viewing angle), the broad-line region (thousands of fast emission-line clouds), the
// host galaxy and the Lyman-α nebula — all of which get lensed. After it: a ring-shaped bloom whose hole matches the
// shadow (glare without washing out the black hole). LOD: the quad + frame copy only run within ~520 units;
// touch devices use fewer ray steps and noise octaves; without WebGL2 (or opts.lite) a sprite fallback is used.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const D2R = Math.PI / 180;
const LY_KM = 9.4607e12, UNIT_KM = 100 * LY_KM, AU_KM = 1.495978707e8;
export const TON618_DIST_LY = 10.8e9;                  // light-travel distance (comoving ≈ 18.2 Gly)
export const TON618_L = 170.64, TON618_B = 83.36;      // galactic coords from J2000 RA 12h28m24.9s, Dec +31°28′38″
export const TON618_MASS_SUN = 4.07e10;                // Ge et al. 2019 (C IV); older Hβ estimate 6.6e10
export const TON618_RS_KM = 2.9532 * TON618_MASS_SUN;  // 2GM/c² ≈ 1.20e11 km ≈ 803 AU
const RS_AU = TON618_RS_KM / AU_KM;                    // ≈ 803
const NEPTUNE_AU = 30.07;

export const TON618_INFO = {
  name: 'TON 618', type: 'Hyperluminous quasar · one of the most massive black holes known', color: '#bcd8ff',
  rows: [
    ['Distance', '~10.8 billion light-years (light-travel time) · ~18 billion ly today (comoving) · redshift z ≈ 2.22'],
    ['Black hole mass', '~40 billion times the Sun (2019 estimate; an older one says ~66 billion, so it is uncertain)'],
    ['Event horizon', `~1,600 AU across (radius ≈ 800 AU), about 27× the width of Neptune’s orbit`],
    ['Where in the sky', 'Canes Venatici (near Coma Berenices), far above the Milky Way’s disk · ~350× farther than the Sombrero'],
  ],
  fact: 'TON 618 is a quasar: a giant black hole swallowing gas so fast that the disk around it outshines its whole galaxy, ' +
        'more than 100 trillion times brighter than the Sun. Its light left about 10.8 billion years ago, when the universe was only ' +
        '~3 billion years old, so we see it as it was back then. Its event horizon is so big that our whole Solar System, out to ' +
        'Neptune, would fit across it more than 25 times.',
};

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ------------------------------------------------------------------------------------------------------------
// Ray-traced lens quad, VIEW-SPACE version of sgra.js (camera at the origin; no world coordinates in the shader)
const LENS_VERT = /* glsl */`
  uniform vec3 uCenterV; uniform float uHalf; uniform float uFull; uniform mat4 uInvProj;
  varying vec3 vView;
  void main() {
    if (uFull > 0.5) {                               // camera inside the bounding sphere: full-screen quad
      vec4 w = uInvProj * vec4(position.xy, 1.0, 1.0);
      vView = w.xyz / w.w;
      gl_Position = vec4(position.xy, 0.0, 1.0);
      return;
    }
    vec3 vp = uCenterV + vec3(position.xy * uHalf, 0.0);
    vView = vp;
    gl_Position = projectionMatrix * vec4(vp, 1.0);
  }`;

const LENS_FRAG = (steps, stepK, octaves) => /* glsl */`
  precision highp float;
  #define STEPS ${steps}
  #define STEP_K ${stepK.toFixed(3)}
  #define OCT ${octaves}
  #define MAXB 0.22
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform mat4 uProj;
  uniform mat3 uViewToLocal, uLocalToView;
  uniform vec3 uCamLocal;                      // camera position in the disk frame, units of Rs (computed in float64)
  uniform float uRb, uRin, uRout, uTime, uFade, uTemp, uExposure, uLens;
  varying vec3 vView;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * noise(p); p = p * 2.07 + 7.3; a *= 0.5; } return s; }

  vec3 blackbody(float t) {                    // T in units of 100 K (Tanner Helland fit), 0..1
    t = clamp(t, 10.0, 400.0);
    float r = t <= 66.0 ? 1.0 : clamp(1.2929 * pow(t - 60.0, -0.1332), 0.0, 1.0);
    float g = t <= 66.0 ? clamp(0.3901 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(t - 60.0, -0.0755), 0.0, 1.0);
    float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(t - 10.0) - 1.1963, 0.0, 1.0));
    return vec3(r, g, b);
  }

  vec4 disk(vec3 q, vec3 vdir) {
    float r = length(q.xz);
    float x = r / uRin;
    float prof = pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0) + 0.04, 0.25) / 0.52;
    float beta = min(sqrt(0.5 / max(r - 1.0, 0.5)), 0.7);
    vec3 vel = beta * normalize(vec3(-q.z, 0.0, q.x));
    vec3 k = -vdir;
    float gam = inversesqrt(1.0 - beta * beta);
    float g = sqrt(max(1.0 - 1.0 / r, 0.02)) / (gam * (1.0 - dot(vel, k)));
    float phi = atan(q.z, q.x);
    float om = 0.9 * beta / r;
    float T = uTime;
    float p1 = fract(T / 8.0), p2 = fract(T / 8.0 + 0.5);
    float w = abs(2.0 * p1 - 1.0);
    float a1 = phi + om * p1 * 8.0 * 7.0, a2 = phi + om * p2 * 8.0 * 7.0 + 1.7;
    float lr = log(r) * 8.0;
    float n1 = fbm(vec3(cos(a1) * 2.6, sin(a1) * 2.6, lr));
    float n2 = fbm(vec3(cos(a2) * 2.6, sin(a2) * 2.6, lr + 3.1));
    float tex = mix(n1, n2, w);
    float rings = 0.86 + 0.14 * sin(lr * 2.3 + 3.0 * tex * 6.2831);
    float fine = fbm(vec3(cos(a1) * 9.0, sin(a1) * 9.0, lr * 3.0 + 11.0));
    float dens = smoothstep(0.2, 0.8, tex * 0.8 + fine * 0.35) * rings;
    float I = prof * prof * (0.35 + 1.4 * dens) + 0.06 * prof * dens;   // + faint outer gas so the big disk reads to its edge
    // colour shift exaggerated (g^1.6) so the approaching side reads blue-white and the receding side warm
    vec3 col = blackbody(uTemp * pow(prof, 0.55) * pow(g, 1.6)) * I * pow(g, 4.0) * 2.4;
    float edge = smoothstep(uRin * 0.92, uRin * 1.06, r) * (1.0 - smoothstep(uRout * 0.6, uRout, r));
    float a = edge * clamp(0.3 + 0.6 * dens + 0.7 * prof, 0.0, 1.0);
    a *= 0.15 + 0.85 * smoothstep(0.0, 0.5, dot(col, vec3(0.3, 0.55, 0.15)) * uExposure);   // faint gas: thin veil, not grey fog
    return vec4(col * edge, a);
  }

  void main() {
    vec3 dirV = normalize(vView);
    vec3 ro = uCamLocal;
    vec3 rd = normalize(uViewToLocal * dirV);
    float b = dot(ro, rd), c = dot(ro, ro) - uRb * uRb, disc = b * b - c;
    if (disc <= 0.0) discard;
    float t0 = max(-b - sqrt(disc), 0.0);
    vec3 p = ro + rd * t0, v = rd;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv), imp = sqrt(h2);

    vec3 emis = vec3(0.0); float alpha = 0.0;
    bool captured = false;
    for (int i = 0; i < STEPS; i++) {
      float r2 = dot(p, p), r = sqrt(r2);
      if (r < 1.0) { captured = true; break; }
      if (r > uRb + 0.01 && dot(p, v) > 0.0) break;
      if (alpha > 0.985) break;
      float dt = clamp(STEP_K * (r - 0.85), 0.012, 2.5);
      vec3 pPrev = p;
      v += (-1.5 * h2 / (r2 * r2 * r)) * p * dt;
      p += v * dt;
      if (pPrev.y * p.y < 0.0) {
        vec3 q = mix(pPrev, p, pPrev.y / (pPrev.y - p.y));
        float rq = length(q.xz);
        if (rq > uRin * 0.9 && rq < uRout) {
          vec4 d = disk(q, normalize(v));
          emis += (1.0 - alpha) * d.rgb;
          alpha += (1.0 - alpha) * d.a;
        }
      }
    }
    if (!captured && dot(p, p) < 2.25) captured = true;

    vec3 bg = vec3(0.0);
    if (!captured) {
      vec3 dOut = normalize(uLocalToView * normalize(v));
      float taper = smoothstep(3.5, uRb * 0.85, imp);
      float ang = acos(clamp(dot(dirV, dOut), -1.0, 1.0));
      float angC = MAXB * tanh(ang * 0.5 / MAXB) * (1.0 - taper) * uLens;
      vec3 ax = cross(dirV, dOut); float la = length(ax);
      if (la > 1e-5 && ang > 1e-5) { ax /= la; dOut = dirV * cos(angC) + cross(ax, dirV) * sin(angC); }
      else dOut = dirV;
      vec4 clip = uProj * vec4(dOut * 10.0, 1.0);
      if (clip.w > 0.0) {
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        uv = 1.0 - abs(1.0 - mod(uv, 2.0));
        bg = texture2D(tScene, uv).rgb;
        bg *= 1.0 + 0.35 * exp(-pow((imp - 2.75) / 0.7, 2.0));
      } else {
        bg = texture2D(tScene, gl_FragCoord.xy / uRes).rgb * 0.5;
      }
    }
    float ring = exp(-pow((imp - 2.598) / 0.03, 2.0)) * 2.2 + exp(-pow((imp - 2.66) / 0.25, 2.0)) * 0.35;
    vec3 ringCol = mix(blackbody(uTemp * 1.1), vec3(1.0), 0.35) * ring * (1.0 - alpha);

    vec3 hdr = (emis + ringCol) * uExposure;
    vec3 ldr = 1.0 - exp(-hdr);
    ldr = clamp(mix(vec3(dot(ldr, vec3(0.3, 0.55, 0.15))), ldr, 1.45), 0.0, 1.0);
    vec3 col = bg * (1.0 - alpha) + ldr;
    if (captured) col = ldr;
    gl_FragColor = vec4(col, uFade);
  }`;

// ---- relativistic jets: flared tube, intensity from view-space normals, knots streaming outward in log-distance -------
const JET_VERT = /* glsl */`
  attribute float aT; attribute float aY; attribute float aAng;
  varying float vT; varying float vY; varying float vAng; varying vec3 vN; varying vec3 vV;
  void main() {
    vT = aT; vY = aY; vAng = aAng;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normalize(vec3(position.x, 0.0, position.z) + vec3(1e-6)));
    gl_Position = projectionMatrix * mv;
  }`;
const JET_FRAG = /* glsl */`
  uniform float uTime, uBoost, uOpacity, uY0, uSeed, uPow;
  varying float vT; varying float vY; varying float vAng; varying vec3 vN; varying vec3 vV;
  float h1(float x) { return fract(sin(x * 127.1 + uSeed) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float core = 0.08 * f + 0.92 * pow(f, uPow);                   // bright spine, soft limb
    float ly = log(max(vY / uY0, 1.0));
    float flow = ly * 6.0 - uTime * 1.6;                           // knots move outward (faster in real distance farther out)
    float knots = 0.45 + 1.4 * pow(n1(flow), 3.0) + 0.6 * pow(0.5 + 0.5 * sin(flow * 2.1 + uSeed), 6.0);
    float streak = 0.75 + 0.25 * n1(vAng * 3.0 + ly * 2.0 - uTime * 0.7);
    float along = pow(vY / uY0, -0.42) * smoothstep(0.0, 0.025, vT) * (1.0 - smoothstep(0.82, 1.0, vT));
    vec3 col = mix(vec3(0.85, 0.92, 1.0), vec3(0.55, 0.62, 1.0), smoothstep(0.0, 0.6, vT));
    float I = core * knots * streak * along * uBoost * uOpacity;
    gl_FragColor = vec4(col * I, 1.0);
  }`;

// ---- generic soft points (BLR clouds, host stars, Lyα nebula blobs) ------------------------------------------
const PT_VERT = /* glsl */`
  attribute float size; attribute vec3 aColor;
  uniform float uScale, uBright, uMaxPt, uNear, uTime, uSpin, uHole;
  varying vec3 vColor; varying float vFade;
  void main() {
    vec3 p = position;
    if (uSpin != 0.0) {                                              // differential rotation (BLR clouds orbit)
      float r = length(p.xz); float a = uSpin * uTime * pow(max(r, 1.0), -1.5);
      float c = cos(a), s = sin(a); p.xz = mat2(c, -s, s, c) * p.xz;
    }
    vColor = aColor * uBright;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float ps = size * uScale / max(-mv.z, 1e-3);
    vFade = clamp(ps * ps, 0.0, 1.0) * smoothstep(uNear * 0.4, uNear, -mv.z);
    if (uHole > 0.0) vFade *= smoothstep(uHole * 0.3, uHole, length(position));   // clear the enlarged core region
    gl_PointSize = clamp(ps, 1.0, uMaxPt);
    gl_Position = projectionMatrix * mv;
  }`;
const PT_FRAG = /* glsl */`
  uniform float uSoft; varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
    float a = mix(pow(1.0 - d, 1.8), exp(-d * d * 4.0) * (1.0 - d), uSoft);
    gl_FragColor = vec4(vColor * a * vFade, 1.0); }`;
// smooth host-galaxy light: camera-facing quad evaluating a projected Sérsic-like spheroid
const HOST_VERT = /* glsl */`
  varying vec3 vOff;
  void main() { vOff = mat3(modelMatrix) * position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HOST_FRAG = /* glsl */`
  uniform vec3 uAxis, uWarm, uHot; uniform float uA, uFlat, uGain, uRmax, uOpacity;
  varying vec3 vOff;
  void main() {
    float h = dot(vOff, uAxis); vec3 p = vOff - h * uAxis;
    float q = sqrt(dot(p, p) + h * h / (uFlat * uFlat)) / uA;
    float I = uGain * exp(-2.2 * pow(q, 0.5));
    vec3 col = mix(uWarm, uHot, smoothstep(0.4, 2.5, I)) * (1.0 - exp(-I));
    float edge = 1.0 - smoothstep(0.6, 1.0, length(vOff) / uRmax);
    gl_FragColor = vec4(col * edge * uOpacity, 1.0);
  }`;

function canvasTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const radialTex = (stops, size = 128) => canvasTex(size, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, s] of stops) gr.addColorStop(o, s);
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});
// bright point source with telescope diffraction spikes (4 long + 4 faint diagonal), bluish white
function spikeTex(size) {
  return canvasTex(size, (g, n) => {
    const c = n / 2;
    g.globalCompositeOperation = 'lighter';
    let gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.035, 'rgba(240,248,255,0.95)'); gr.addColorStop(0.09, 'rgba(190,215,255,0.45)');
    gr.addColorStop(0.25, 'rgba(120,160,255,0.12)'); gr.addColorStop(0.6, 'rgba(80,110,255,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    const spike = (ang, len, w, a) => {
      g.save(); g.translate(c, c); g.rotate(ang);
      const lg = g.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, `rgba(235,242,255,${a})`); lg.addColorStop(0.3, `rgba(180,205,255,${a * 0.45})`); lg.addColorStop(1, 'rgba(120,150,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
      g.restore();
    };
    for (let k = 0; k < 4; k++) spike(k * Math.PI / 2, c * 0.98, n * 0.012, 0.95);
    for (let k = 0; k < 4; k++) spike(Math.PI / 4 + k * Math.PI / 2, c * 0.42, n * 0.006, 0.35);
  });
}

/**
 * @param galaxy  object returned by createGalaxy(): needs { scene, SUN_POS }
 * @param opts    { isTouch=false, labels=true, lite=false, rsWorld=2, distanceLy=10.8e9, homeBeacon=true }
 */
export function addTon618(galaxy, opts = {}) {
  const isTouch = !!opts.isTouch;
  const scene = galaxy.scene;
  const SUN_POS = galaxy.SUN_POS.clone();
  const DIST = (opts.distanceLy ?? TON618_DIST_LY) / 100;          // 108,000,000 units
  const RS = opts.rsWorld ?? 2.0;                                   // Schwarzschild radius in scene units (core enlarged)
  const RB = 26, RIN = 3.0, ROUT = 20.0;                            // lens sphere, ISCO, disk outer edge (units of Rs)
  const NEAR_ON = RS * 260, NEAR_FULL = RS * 110;                   // close-up fades in between these camera distances
  const CORE_MAX = 300000;                                          // beyond this the quasar's geometry is skipped (sub-pixel)
  const JET_L = 760;                                                // jet length (units) — ~76,000 ly, radio-galaxy scale
  const HOST_R = 300;                                               // host galaxy radius (~30,000 ly; illustrative)
  const NEB_R = 1650;                                               // Lyman-α nebula ≥ 330,000 ly across (ALMA 2021)
  const exaggeration = RS * UNIT_KM / TON618_RS_KM;                 // ≈ 15,700

  // ---- position (same galactic frame as galaxy.js / sombrero.js) ----------------------------------------------
  const gcDir = SUN_POS.clone().negate().normalize();
  const l90Dir = new THREE.Vector3(0, 1, 0).cross(gcDir).normalize();
  const Lr = TON618_L * D2R, Br = TON618_B * D2R;
  const dir = gcDir.clone().multiplyScalar(Math.cos(Br) * Math.cos(Lr)).addScaledVector(l90Dir, Math.cos(Br) * Math.sin(Lr))
    .addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(Br)).normalize();
  const POS = SUN_POS.clone().addScaledVector(dir, DIST);

  const group = new THREE.Group();                                  // non-rotating scene, like Andromeda / M104
  group.name = 'TON 618';
  group.position.copy(POS);
  scene.add(group);

  // jet axis: we see TON 618 as a type-1 (broad-line) quasar, i.e. roughly down the jet — so the axis is put 25° from
  // our line of sight (the real angle is unknown). The approaching jet points back toward the Milky Way.
  const tiltAxis = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize();
  const nrm = dir.clone().applyAxisAngle(tiltAxis, 25 * D2R).normalize();
  const diskQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
  const core = new THREE.Group();                                   // disk frame: local +y = jet axis
  core.quaternion.copy(diskQuat);
  group.add(core);
  // in-disk direction whose projection is "up" on screen for a camera with up = +y (keeps the jets vertical on screen)
  const hUp = new THREE.Vector3(0, 1, 0).addScaledVector(nrm, -nrm.y).normalize();

  // ---- close-up: ray-traced lens quad ------------------------------------------------------------------------------
  const fbTex = new THREE.FramebufferTexture(4, 4);
  fbTex.minFilter = fbTex.magFilter = THREE.LinearFilter;
  const uniforms = {
    tScene: { value: fbTex }, uRes: { value: new THREE.Vector2(1, 1) },
    uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uViewToLocal: { value: new THREE.Matrix3() }, uLocalToView: { value: new THREE.Matrix3() },
    uCenterV: { value: new THREE.Vector3() }, uCamLocal: { value: new THREE.Vector3() }, uHalf: { value: 1 }, uFull: { value: 0 },
    uRb: { value: RB }, uRin: { value: RIN }, uRout: { value: ROUT },
    uTime: { value: 0 }, uFade: { value: 0 }, uTemp: { value: 100 }, uExposure: { value: 1.0 }, uLens: { value: 1 },
  };
  const lensMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: LENS_VERT,
    fragmentShader: LENS_FRAG(isTouch ? 80 : 170, isTouch ? 0.12 : 0.07, isTouch ? 3 : 4),
    transparent: true, depthTest: false, depthWrite: false,
  });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat);
  lens.frustumCulled = false; lens.renderOrder = 1010; lens.visible = false;
  core.add(lens);

  const _size = new THREE.Vector2(), _origin = new THREE.Vector2(0, 0);
  const _mL = new THREE.Matrix4(), _m3a = new THREE.Matrix3(), _m3b = new THREE.Matrix3(), _cw = new THREE.Vector3(), _ccam = new THREE.Vector3();
  let lite = !!opts.lite, checked = false, copies = 0;
  lens.onBeforeRender = (renderer, _scene, camera) => {
    if (!checked) { checked = true; if (!renderer.capabilities.isWebGL2) lite = true; }
    renderer.getDrawingBufferSize(_size);
    if (fbTex.image.width !== _size.x || fbTex.image.height !== _size.y) {
      fbTex.image.width = _size.x; fbTex.image.height = _size.y; fbTex.dispose(); fbTex.needsUpdate = true;
    }
    uniforms.uRes.value.copy(_size);
    renderer.copyFramebufferToTexture(_origin, fbTex);
    copies++;
    // all view-dependent uniforms in float64 from the matrices the renderer just updated (camera-relative → no jitter)
    core.matrixWorld.decompose(_cw, _q, _sc);
    _ccam.setFromMatrixPosition(camera.matrixWorld);
    const rel = _ccam.sub(_cw);                                     // camera − center (double precision on the CPU)
    _m3a.setFromMatrix4(_mL.makeRotationFromQuaternion(_q));        // local → world
    _m3b.setFromMatrix4(camera.matrixWorld);                        // view → world (camera has no scale)
    uniforms.uViewToLocal.value.copy(_m3a).transpose().multiply(_m3b);
    uniforms.uLocalToView.value.copy(uniforms.uViewToLocal.value).transpose();
    uniforms.uCamLocal.value.copy(rel).applyMatrix3(_m3a.transpose()).multiplyScalar(1 / RS);
    uniforms.uCenterV.value.copy(_cw).applyMatrix4(camera.matrixWorldInverse);
    uniforms.uInvProj.value.copy(camera.projectionMatrixInverse); uniforms.uProj.value.copy(camera.projectionMatrix);
    const d = rel.length(), R = RB * RS;
    uniforms.uFull.value = d < R * 1.02 ? 1 : 0;
    const cosT = Math.max(0.35, -uniforms.uCenterV.value.z / Math.max(d, 1e-9));   // off-axis → the projected sphere grows
    uniforms.uHalf.value = (d > R * 1.02 ? R * d / Math.sqrt(d * d - R * R) * 1.02 : R) / (cosT * cosT);
  };
  const _q = new THREE.Quaternion(), _sc = new THREE.Vector3(), _q2 = new THREE.Quaternion();

  // hot blue-white aura (lite fallback only)
  const auraTex = radialTex([[0, 'rgba(225,238,255,0.85)'], [0.12, 'rgba(170,200,255,0.42)'], [0.4, 'rgba(110,140,255,0.12)'], [1, 'rgba(0,0,0,0)']]);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  aura.scale.setScalar(RS * ROUT * 3.4); aura.renderOrder = 1005; aura.visible = false;
  core.add(aura);
  // bloom drawn AFTER the quad: a ring-shaped glow with a hole the size of the shadow, so the quasar glares without
  // washing out the black hole
  const bloomTex = radialTex([[0, 'rgba(0,0,0,0)'], [0.075, 'rgba(0,0,0,0)'], [0.11, 'rgba(200,220,255,0.55)'], [0.2, 'rgba(160,190,255,0.28)'],
    [0.45, 'rgba(110,140,255,0.08)'], [1, 'rgba(0,0,0,0)']], 256);
  const bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: bloomTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  bloom.scale.setScalar(RS * 2.75 * 2 / 0.11);                       // hole edge (0.11) = shadow edge bloom.renderOrder = 1011; bloom.visible = false;
  core.add(bloom);

  // ---- shared point-material uniforms (calibrated from the renderer each frame) ---------------------------------
  const ptShared = { uScale: { value: 800 }, uMaxPt: { value: 256 }, uTime: { value: 0 } };
  const materials = [lensMat];
  const mkPts = (geo, { bright = 1, near = 0, soft = 0, spin = 0, order }) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...ptShared, uBright: { value: bright }, uNear: { value: near }, uSoft: { value: soft }, uSpin: { value: spin }, uHole: { value: 0 } },
      vertexShader: PT_VERT, fragmentShader: PT_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    materials.push(m);
    const p = new THREE.Points(geo, m); p.frustumCulled = false; p.renderOrder = order; return p;
  };
  const cloud = (n, fill) => {
    const p = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), o = { p: [0, 0, 0], c: new THREE.Color(), s: 1 };
    for (let i = 0; i < n; i++) { fill(i, o); p.set(o.p, i * 3); col.set([o.c.r, o.c.g, o.c.b], i * 3); sz[i] = o.s; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    return geo;
  };
  const geos = [];

  // (a) host galaxy: dim, fuzzy, slightly irregular elliptical (never actually seen — the quasar outshines it)
  const NH = isTouch ? 9000 : 26000, HOLE = RS * RB * 1.0;
  const hostGeo = cloud(NH, (i, o) => {
    let x, y, z, r;
    if (i % 9 !== 0) {
      r = 42 * Math.pow(-Math.log(1 - Math.random() * 0.9995), 1.35); if (r > HOST_R) r = Math.random() * HOST_R;
      const ct = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, st = Math.sqrt(1 - ct * ct);
      x = r * st * Math.cos(ph) * 1.15; y = r * ct * 0.7; z = r * st * Math.sin(ph) * 0.9;
      o.c.setRGB(1.0, 0.82 - 0.12 * Math.random(), 0.62 - 0.15 * Math.random()).multiplyScalar(0.18 + 0.12 * Math.random());
      o.s = 2 + Math.random() * 3;
    } else {                                                      // tidal debris / clumpy star-forming knots (merger-ish)
      const k = (i / 9) % 3 | 0, cx = [140, -110, 60][k], cz = [-60, 90, 170][k], sp = [28, 22, 18][k];
      x = cx + gauss() * sp + (k === 0 ? gauss() * 40 : 0); y = gauss() * sp * 0.5; z = cz + gauss() * sp;
      o.c.setRGB(0.72, 0.8, 1.0).multiplyScalar(0.16 + 0.2 * Math.random() ** 2); o.s = 2 + Math.random() * 2.5;
    }
    o.p[0] = x; o.p[1] = y; o.p[2] = z;
  });
  geos.push(hostGeo);
  const HOST_BRIGHT = isTouch ? 3.0 : 2.4;
  const host = mkPts(hostGeo, { bright: HOST_BRIGHT, near: 140, order: 901 });
  group.add(host);
  const hostGlow = new THREE.Mesh(new THREE.PlaneGeometry(HOST_R * 2.2, HOST_R * 2.2), new THREE.ShaderMaterial({
    uniforms: { uAxis: { value: nrm.clone() }, uWarm: { value: new THREE.Color(0.95, 0.68, 0.45) }, uHot: { value: new THREE.Color(1.0, 0.9, 0.8) },
      uA: { value: 45 }, uFlat: { value: 0.7 }, uGain: { value: 22.0 }, uRmax: { value: HOST_R }, uOpacity: { value: 1 } },
    vertexShader: HOST_VERT, fragmentShader: HOST_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  hostGlow.renderOrder = 900; hostGlow.frustumCulled = false;
  hostGlow.onBeforeRender = (_r, _s, camera) => { hostGlow.quaternion.copy(camera.quaternion); hostGlow.updateMatrixWorld(); };
  group.add(hostGlow); materials.push(hostGlow.material);

  // (b) the enormous Lyman-α nebula (≥ 330,000 ly), elongated along the jet axis — very faint
  const NN = isTouch ? 700 : 1800;
  const nebGeo = cloud(NN, (i, o) => {
    const along = gauss() * 0.55, rr = Math.abs(gauss()) * 0.35 + 0.05, th = Math.random() * Math.PI * 2;
    const fil = Math.sin(th * 3 + along * 4) * 0.12;
    o.p[0] = Math.cos(th) * (rr + fil) * NEB_R * 0.6; o.p[1] = along * NEB_R; o.p[2] = Math.sin(th) * (rr + fil) * NEB_R * 0.6;
    o.c.setRGB(0.42, 0.58, 1.0).lerp(new THREE.Color(0.7, 0.45, 1.0), Math.random() * 0.6).multiplyScalar(0.02 + 0.03 * Math.random());
    o.s = 90 + Math.random() * 220;
  });
  geos.push(nebGeo);
  const nebula = mkPts(nebGeo, { bright: 1, near: 500, soft: 1, order: 899 });
  core.add(nebula);

  // (c) broad-line region: thousands of fast-orbiting, emission-line-lit clouds in a thick flared disk around the core
  const NBLR = isTouch ? 1400 : 4000;
  const blrGeo = cloud(NBLR, (i, o) => {
    const r = RS * (24 + 70 * Math.pow(Math.random(), 1.3)), th = Math.random() * Math.PI * 2;
    o.p[0] = Math.cos(th) * r; o.p[2] = Math.sin(th) * r; o.p[1] = gauss() * r * 0.28;
    const u = Math.random();
    if (u < 0.55) o.c.setRGB(0.55, 0.72, 1.0); else if (u < 0.85) o.c.setRGB(0.7, 0.62, 1.0); else o.c.setRGB(0.95, 0.75, 0.9);
    o.c.multiplyScalar(0.25 + 0.6 * Math.random() ** 2);
    o.s = RS * (0.6 + Math.random() * 1.6);
  });
  geos.push(blrGeo);
  const blr = mkPts(blrGeo, { bright: 0.32, near: RS * 6, soft: 1, spin: 60 * Math.pow(RS, 1.5) / 40, order: 990 });
  core.add(blr);

  // (d) twin relativistic jets
  const JET_Y0 = RS * 2.2;
  function jetGeometry() {
    const RAD = isTouch ? 14 : 22, SEG = isTouch ? 90 : 160;
    const pos = [], aT = [], aY = [], aAng = [], idx = [];
    for (let j = 0; j <= SEG; j++) {
      const t = j / SEG, y = JET_Y0 * Math.pow(JET_L / JET_Y0, t);
      const r = RS * 0.11 * Math.pow(y / JET_Y0, 0.7) + RS * 0.03;
      for (let k = 0; k <= RAD; k++) {
        const a = (k / RAD) * Math.PI * 2;
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r); aT.push(t); aY.push(y); aAng.push(k / RAD);
      }
    }
    for (let j = 0; j < SEG; j++) for (let k = 0; k < RAD; k++) {
      const a = j * (RAD + 1) + k, b = a + RAD + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    g.setAttribute('aY', new THREE.Float32BufferAttribute(aY, 1));
    g.setAttribute('aAng', new THREE.Float32BufferAttribute(aAng, 1));
    g.setIndex(idx);
    return g;
  }
  const jetGeo = jetGeometry(); geos.push(jetGeo);
  const jets = [];
  for (const sgn of [1, -1]) {
    // bright spine + a 4× wider, faint cocoon (same geometry, scaled radially) for a soft, glowing edge
    for (const [w, pw, k] of [[1, 4.0, 1.0], [4, 1.6, 0.16]]) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: ptShared.uTime, uBoost: { value: 1 }, uOpacity: { value: 1 }, uY0: { value: JET_Y0 }, uSeed: { value: sgn > 0 ? 1.3 : 7.9 }, uPow: { value: pw } },
        vertexShader: JET_VERT, fragmentShader: JET_FRAG, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      materials.push(m);
      const mesh = new THREE.Mesh(jetGeo, m);
      mesh.scale.set(w, 1, w);
      if (sgn < 0) mesh.rotation.x = Math.PI;                     // counter-jet along −y (toward the Milky Way)
      mesh.renderOrder = 995 - (w > 1 ? 1 : 0); mesh.frustumCulled = false;
      core.add(mesh); jets.push({ mesh, m, sgn, k });
    }
  }
  // radio lobes / hotspots where the jets ram into intergalactic gas (illustrative)
  const lobeTex = radialTex([[0, 'rgba(225,205,255,0.9)'], [0.12, 'rgba(180,150,255,0.45)'], [0.45, 'rgba(120,90,230,0.12)'], [1, 'rgba(0,0,0,0)']]);
  const lobes = [1, -1].map((s) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lobeTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    sp.position.set(0, s * JET_L * 1.0, 0); sp.scale.setScalar(JET_L * 0.32); sp.renderOrder = 902; core.add(sp); return sp;
  });

  // ---- lite fallback (no WebGL2): black disk + glowing ring sprites ---------------------------------------------
  const liteGroup = new THREE.Group(); liteGroup.visible = false; core.add(liteGroup);
  const shadowTex = radialTex([[0, 'rgba(0,0,0,1)'], [0.84, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  const ringTex = canvasTex(256, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(230,240,255,0)'); gr.addColorStop(0.04, 'rgba(240,248,255,1)'); gr.addColorStop(0.22, 'rgba(170,200,255,0.6)');
    gr.addColorStop(0.65, 'rgba(110,140,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    const lg = g.createLinearGradient(0, 0, s, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = lg; g.fillRect(0, 0, s, s);
  });
  const liteRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const liteShadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false, depthTest: false }));
  liteRing.scale.setScalar(RS * 2 * 10); liteShadow.scale.setScalar(RS * 2 * 2.6 / 0.84);
  liteRing.renderOrder = 1010; liteShadow.renderOrder = 1011;
  liteGroup.add(liteRing, liteShadow);
  // flat disk in the disk plane, split into far half (before the shadow) and near half (after it)
  const LITE_DISK_FRAG = /* glsl */`
    uniform vec3 uCamDir; uniform float uFront, uOpacity; varying vec3 vL;
    void main() {
      float side = dot(vL.xz, uCamDir.xz);
      if ((uFront > 0.5) != (side > 0.0)) discard;
      float r = length(vL.xz) / ${(RS).toFixed(4)};
      float I = smoothstep(2.9, 3.4, r) * (1.0 - smoothstep(12.0, 20.0, r)) * pow(3.0 / r, 1.4);
      float dop = 1.0 + 0.6 * dot(normalize(vec2(-vL.z, vL.x)), normalize(vec2(uCamDir.z, -uCamDir.x)));   // approaching side brighter
      vec3 col = mix(vec3(1.0, 0.75, 0.5), vec3(0.8, 0.9, 1.0), clamp(dop - 0.5, 0.0, 1.0)) * I * dop * 1.6;
      gl_FragColor = vec4(col * uOpacity, 1.0);
    }`;
  const liteDiskGeo = new THREE.RingGeometry(RS * 2.9, RS * ROUT, 96, 1).rotateX(-Math.PI / 2);
  const liteDisks = [0, 1].map((front) => {
    const m = new THREE.ShaderMaterial({ uniforms: { uCamDir: { value: new THREE.Vector3(0, 0, 1) }, uFront: { value: front }, uOpacity: { value: 1 } },
      vertexShader: 'varying vec3 vL; void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: LITE_DISK_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(liteDiskGeo, m); mesh.renderOrder = front ? 1012 : 1009.5; mesh.frustumCulled = false;
    liteGroup.add(mesh); return mesh;
  });

  // ---- Neptune's orbit, to scale, drawn inside the shadow ---------------------------------------------------------
  const NEP_R = RS * NEPTUNE_AU / RS_AU;                              // ≈ 0.0374 Rs
  const nepTex = canvasTex(64, (g, n) => {
    g.strokeStyle = 'rgba(200,225,255,0.95)'; g.lineWidth = n * 0.07;
    g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,220,150,1)'; g.beginPath(); g.arc(n / 2, n / 2, n * 0.06, 0, Math.PI * 2); g.fill();   // the Sun
  });
  const nep = new THREE.Sprite(new THREE.SpriteMaterial({ map: nepTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  nep.renderOrder = 1012; nep.visible = false;
  core.add(nep);

  // ---- sky-projected things (beacons, labels, distance line): children of a root that sits at the camera ----------
  const proxyRoot = new THREE.Group(); proxyRoot.name = 'TON 618 sky-projected';
  scene.add(proxyRoot);
  const glareTex = spikeTex(isTouch ? 256 : 512);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
  glare.renderOrder = 1013; glare.frustumCulled = false;
  proxyRoot.add(glare);
  const homeTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const home = new THREE.Sprite(new THREE.SpriteMaterial({ map: homeTex, color: 0xd6dcff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
  home.renderOrder = 91; home.visible = false; home.frustumCulled = false;
  proxyRoot.add(home);
  // dashed line, one dash per billion light-years, rebuilt per frame from projected endpoints (perspective-correct)
  const NDASH = Math.ceil(TON618_DIST_LY / 1e9);
  const linePos = new Float32Array(NDASH * 2 * 3);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const distLine = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }));
  distLine.frustumCulled = false; distLine.renderOrder = 89; distLine.visible = false;
  proxyRoot.add(distLine); geos.push(lineGeo);

  // ---- labels -------------------------------------------------------------------------------------------------------
  const labelEls = [];
  let label = null, note = null, distLabel = null, homeLabel = null, nepLabel = null;
  const anchors = { label: new THREE.Object3D(), dist: new THREE.Object3D(), home: new THREE.Object3D(), note: new THREE.Object3D(), nep: new THREE.Object3D() };
  for (const a of Object.values(anchors)) proxyRoot.add(a);
  if (opts.labels !== false) {
    const make = (html, cls, anchor) => {
      const wrap = document.createElement('div'); wrap.className = 'galaxy-label-wrap';
      const el = document.createElement('div'); el.className = 'label galaxy-label ' + cls; el.innerHTML = html;
      wrap.appendChild(el); labelEls.push(el);
      const obj = new CSS2DObject(wrap); anchor.add(obj);
      return { obj, el };
    };
    label = make('TON 618 · <b>quasar</b>', 'ton-label', anchors.label);
    distLabel = make('≈ 10.8 billion light-years (light-travel) · ~350× farther than the Sombrero · each dash = 1 billion ly', 'small dist-label ton-dist off', anchors.dist);
    homeLabel = make('Milky Way, Andromeda &amp; Sombrero · all inside this dot', 'small ton-home off', anchors.home);
    note = make(`Core enlarged ~${(Math.round(exaggeration / 1000) * 1000).toLocaleString('en-US')}× · black-hole shadow ≈ ${Math.round(2 * 2.598 * RS_AU / 100) * 100} AU across (true size vs. the disk)`, 'small ton-note off', anchors.note);
    nepLabel = make('◦ Neptune’s orbit, to scale', 'small ton-nep off', anchors.nep);
  }

  // ---- per-frame ----------------------------------------------------------------------------------------------------
  const _cam = new THREE.Vector3(), _c = new THREE.Vector3(), _rel = new THREE.Vector3(), _fwd = new THREE.Vector3(), _up = new THREE.Vector3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v2 = new THREE.Vector2(), _right = new THREE.Vector3();
  let visible = true, t = 0, last = performance.now(), state = 'far', dist = Infinity, maxPtChecked = false;
  let pxToScale = 0.001;                                         // sprite scale per CSS pixel (sizeAttenuation:false)

  // move a world point along its own camera ray to ≤ maxD from the camera; returns camera-relative vector
  const project = (p, cam, maxD, out) => { out.subVectors(p, cam); const d = out.length(); if (d > maxD) out.multiplyScalar(maxD / d); return out; };

  host.onBeforeRender = (renderer, _s, camera) => {
    if (!maxPtChecked) { const gl = renderer.getContext(); const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); ptShared.uMaxPt.value = Math.min(256, r ? r[1] : 64); maxPtChecked = true; }
    renderer.getDrawingBufferSize(_v2);
    ptShared.uScale.value = _v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 50) / 2));
  };

  function update(camera, renderer) {
    const now = performance.now(); t += Math.min((now - last) / 1000, 0.1); last = now;
    if (renderer && !checked) { checked = true; if (!renderer.capabilities.isWebGL2) lite = true; }
    if (!visible) return;
    ptShared.uTime.value = t; uniforms.uTime.value = t;
    camera.getWorldPosition(_cam);
    camera.getWorldDirection(_fwd);
    const cssH = renderer?.domElement?.clientHeight || window.innerHeight;
    const tanH = Math.tan((camera.fov ?? 50) * D2R / 2);
    pxToScale = 2 * tanH / cssH;
    const maxD = camera.far * 0.45;
    proxyRoot.position.copy(_cam);
    _c.copy(POS);
    dist = _cam.distanceTo(_c);
    const dMW = _cam.length();
    const near = 1 - THREE.MathUtils.smoothstep(dist, NEAR_FULL, NEAR_ON);          // 0 far … 1 close-up

    // the quasar's own geometry only within CORE_MAX (sub-pixel beyond; the glare/beacon takes over)
    group.visible = dist < CORE_MAX;
    const inFront = _fwd.dot(_rel.subVectors(_c, _cam)) > -RB * RS;
    const closeOn = group.visible && near > 0.001 && inFront;
    state = !group.visible ? 'far' : !closeOn ? 'approach' : (lite ? 'lite' : (near < 1 ? 'transition' : 'close'));
    lens.visible = closeOn && !lite;
    liteGroup.visible = closeOn && lite;
    aura.visible = closeOn && lite; aura.material.opacity = 0.5 * near;   // only for the lite fallback: when lensed, its center would form a fake Einstein ring
    bloom.visible = lens.visible; bloom.material.opacity = 0.28 * near;
    if (lite) {
      liteRing.material.opacity = 0.6 * near; liteShadow.material.opacity = near;
      _b.subVectors(_cam, _c).applyQuaternion(_q2.copy(diskQuat).invert()).normalize();     // camera direction in the disk frame
      for (const d of liteDisks) { d.material.uniforms.uCamDir.value.copy(_b); d.material.uniforms.uOpacity.value = near; }
    }
    if (lens.visible) { uniforms.uFade.value = near; uniforms.uLens.value = THREE.MathUtils.smoothstep(near, 0.2, 0.9); }
    // nebula fades out once we are inside it, host dims a little up close (the quasar dominates)
    const inNeb = THREE.MathUtils.smoothstep(dist, 900, 4000);
    nebula.material.uniforms.uBright.value = 0.35 + 0.65 * inNeb;
    // like a camera stopping down near the blazing core: the host galaxy fades so the disk + lensing read clearly
    const stop = 0.05 + 0.95 * THREE.MathUtils.smoothstep(dist, RS * 40, RS * 600);
    host.material.uniforms.uBright.value = HOST_BRIGHT * stop;
    // host stars inside the ENLARGED core would sit right behind the hole and form a fake Einstein ring → fade them out close up
    host.material.uniforms.uHole.value = HOLE * (1 - THREE.MathUtils.smoothstep(dist, NEAR_ON, NEAR_ON * 2));
    hostGlow.material.uniforms.uOpacity.value = 0.1 + 0.9 * stop;
    // jets: relativistic Doppler boosting (β = 0.95) from the actual viewing angle, normalised to 1 at 90°
    _a.copy(nrm);
    _b.subVectors(_cam, _c).normalize();
    for (const j of jets) {
      const cosT = j.sgn * _a.dot(_b);
      const Dn = 1 / (1 - 0.95 * cosT);                          // D·Γ
      j.m.uniforms.uBoost.value = THREE.MathUtils.clamp(Math.pow(Dn, 1.6), 0.22, 3.2) * j.k;
      j.m.uniforms.uOpacity.value = 0.55 + 0.45 * (1 - near * 0.3);
    }
    // Neptune's orbit (true scale relative to the shadow; at least a few px so it can be found), centered on the hole
    nep.visible = closeOn && !lite && near > 0.6;
    if (nep.visible) {
      const pxPerUnit = 1 / (pxToScale * dist);
      const sz = Math.max(NEP_R * 2 / 0.84, 7 / pxPerUnit);
      nep.scale.setScalar(sz); nep.material.opacity = THREE.MathUtils.smoothstep(near, 0.6, 1);
      // sit in the clearly black upper half of the shadow (the near side of the disk crosses its center)
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      nep.position.copy(_up).multiplyScalar(RS * 1.45).applyQuaternion(_q2.copy(core.quaternion).invert());
    }

    // glare / beacon: fixed-size bright star with spikes when far, grows on approach, hands over to the close-up
    project(_c, _cam, maxD, _rel);
    glare.position.copy(_rel);
    const base = isTouch ? 76 : 64;
    const grow = Math.pow(THREE.MathUtils.clamp(200000 / Math.max(dist, 1), 1, 400), 0.42);
    const twinkle = 1 + 0.04 * Math.sin(t * 2.3) + 0.03 * Math.sin(t * 5.1);
    const nearMW = 1 - THREE.MathUtils.smoothstep(dMW, 2000, 20000);   // smaller while exploring the Milky Way (it's just a faint star from here)
    glare.scale.setScalar(base * grow * twinkle * (1 - 0.45 * nearMW) * pxToScale);
    glare.material.opacity = (1 - near) * (inFront || dist > NEAR_ON ? 1 : 0);
    glare.visible = glare.material.opacity > 0.01;

    // home beacon (Milky Way + Andromeda + Sombrero) when TON-scale far
    const showHome = opts.homeBeacon !== false && dMW > 2e6 && dist > 2e6;
    home.visible = showHome;
    if (showHome) { project(_a.set(0, 0, 0), _cam, maxD, _rel); home.position.copy(_rel); home.scale.setScalar((isTouch ? 22 : 18) * pxToScale); }

    // distance line: one dash per billion ly, each dash's endpoints sky-projected (exact on screen)
    const showLine = dMW > 2e6 && dist > 2e6;
    distLine.visible = showLine;
    if (showLine) {
      let n = 0;
      const start = SUN_POS, nearZ = (camera.near || 1) * 4;
      for (let k = 0; k < NDASH; k++) {
        const g0 = (k + 0.14) * 1e7, g1 = Math.min((k + 0.86) * 1e7, DIST * 0.985);
        if (g0 >= g1) continue;
        _a.copy(start).addScaledVector(dir, g0); _b.copy(start).addScaledVector(dir, g1);
        if (_fwd.dot(_rel.subVectors(_a, _cam)) < nearZ || _fwd.dot(_rel.subVectors(_b, _cam)) < nearZ) continue;
        project(_a, _cam, maxD, _rel); linePos.set([_rel.x, _rel.y, _rel.z], n * 6);
        project(_b, _cam, maxD, _rel); linePos.set([_rel.x, _rel.y, _rel.z], n * 6 + 3);
        n++;
      }
      lineGeo.setDrawRange(0, n * 2); lineGeo.attributes.position.needsUpdate = true;
    }

    if (label) {
      // label above the glare (far) / parked above the disk (close)
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const lift = THREE.MathUtils.smoothstep(near, 0.3, 1) * Math.min(RS * ROUT * 0.75, dist * tanH * 0.62);
      anchors.label.position.copy(project(_c, _cam, maxD, _rel)).addScaledVector(_up, lift * Math.min(1, maxD / dist));
      anchors.note.position.copy(_rel).addScaledVector(_up, -lift * 1.05 * Math.min(1, maxD / dist));
      note.el.classList.toggle('off', near < 0.6);
      label.el.classList.toggle('off', dMW < 4500 && dist > 20000);    // hide while exploring the Milky Way (like M104)
      // Neptune label: just right of the little ring
      nepLabel.el.classList.toggle('off', !nep.visible);
      if (nep.visible) anchors.nep.position.copy(_rel).addScaledVector(_up, RS * 1.45).addScaledVector(_right, Math.max(NEP_R * 1.2, 4 * pxToScale * dist));
      distLabel.el.classList.toggle('off', !showLine);
      if (showLine) { _a.copy(SUN_POS).lerp(POS, 0.5); anchors.dist.position.copy(project(_a, _cam, maxD, _rel)); }
      homeLabel.el.classList.toggle('off', !showHome);
      if (showHome) anchors.home.position.copy(home.position);
    }
  }

  function setVisible(v) {
    visible = !!v; group.visible = visible; proxyRoot.visible = visible;
    for (const el of labelEls) el.classList.toggle('off', !visible || el !== label?.el);
  }

  // screen-space pick on the glare / disk; slop in CSS px
  const _p = new THREE.Vector3();
  function pick(clientX, clientY, camera, domElement, slop = 12) {
    if (!visible) return false;
    const r = domElement.getBoundingClientRect();
    camera.getWorldPosition(_cam);
    const d = _cam.distanceTo(POS);
    _p.copy(project(POS, _cam, camera.far * 0.45, _rel)).add(_cam).project(camera);
    if (_p.z > 1 || _p.z < -1) return false;
    const sx = r.left + (_p.x * 0.5 + 0.5) * r.width, sy = r.top + (-_p.y * 0.5 + 0.5) * r.height;
    const pxPerUnit = r.height / (2 * Math.tan((camera.fov ?? 50) * D2R / 2)) / d;
    const rad = Math.max(slop, 14, Math.min(RS * ROUT * 0.9, HOST_R * 0.5) * pxPerUnit);
    return Math.hypot(clientX - sx, clientY - sy) <= rad;
  }

  // camera poses. 'close': 10° above the disk, jets vertical on screen; 'approach': host galaxy + jets + glare
  function focusView(camera, { view = 'close', distance, elevationDeg, azimuthDeg = 0 } = {}) {
    const target = POS.clone();
    const tanH = Math.tan((camera.fov ?? 50) * D2R / 2), aspect = camera.aspect ?? 1.6;
    if (view === 'far') return farView(camera);
    const el = (elevationDeg ?? (view === 'approach' ? 18 : 10)) * D2R;
    let d = distance;
    if (d == null) {
      if (view === 'approach') d = JET_L * 1.3 / tanH;
      else { const halfW = RS * ROUT * (aspect < 1 ? 0.9 : 1.22); d = Math.max(RS * 30, halfW / tanH / Math.min(aspect, 1.6)); }
    }
    const h = hUp.clone().applyAxisAngle(nrm, azimuthDeg * D2R);
    const dirC = h.multiplyScalar(Math.cos(el)).addScaledVector(nrm, Math.sin(el)).normalize();
    return { position: target.clone().addScaledVector(dirC, d), target, minDistance: RS * 7, maxDistance: CORE_MAX * 0.5 };
  }
  // far view: Milky Way (bottom) … TON 618 (top) — looking horizontally, perpendicular to the line
  function farView(camera) {
    const tanH = Math.tan((camera.fov ?? 50) * D2R / 2), aspect = camera.aspect ?? 1.6;
    const mid = SUN_POS.clone().lerp(POS, 0.5);
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const view = new THREE.Vector3().crossVectors(dir, side).normalize();   // ⟂ to the line, ~horizontal
    if (view.y > 0) view.negate();
    view.addScaledVector(new THREE.Vector3(0, 1, 0), -view.y).normalize();
    const half = DIST * 0.5 / 0.74;
    const d = Math.max(half / tanH, half / tanH / aspect * 0.5);
    return { position: mid.clone().addScaledVector(view, d), target: mid, minDistance: 1000, maxDistance: d * 2.5 };
  }

  function showInfo() {
    const $ = (id) => document.getElementById(id);
    if (!$('info-panel')) return false;
    const g = TON618_INFO;
    $('info-name').textContent = g.name; $('info-name').style.color = g.color; $('info-type').textContent = g.type;
    ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => {
      $(id + '-label').textContent = g.rows[k][0]; $(id).textContent = g.rows[k][1];
    });
    $('info-fact').textContent = '💡 ' + g.fact;
    $('info-panel').classList.remove('hidden'); $('info-panel').scrollTop = 0;
    document.body.classList.add('info-open');
    return true;
  }

  function dispose() {
    group.removeFromParent(); proxyRoot.removeFromParent();
    lens.geometry.dispose(); hostGlow.geometry.dispose(); fbTex.dispose();
    for (const m of materials) m.dispose();
    for (const g of geos) g.dispose();
    for (const s of [aura, bloom, liteRing, liteShadow, nep, glare, home, ...lobes, ...liteDisks]) s.material.dispose();
    liteDiskGeo.dispose();
    distLine.material.dispose();
    for (const tx of [auraTex, bloomTex, shadowTex, ringTex, nepTex, glareTex, homeTex, lobeTex]) tx.dispose();
    for (const el of labelEls) el.parentElement?.remove();
  }

  return {
    group, update, setVisible, dispose, pick, focusView, farView, showInfo,
    info: { ...TON618_INFO, exaggeration, rsWorld: RS, rsAU: RS_AU, distanceUnits: DIST, direction: dir.clone(), jetAxis: nrm.clone(),
      radius: RS * ROUT, bounds: RS * RB, hostRadius: HOST_R, jetLength: JET_L },
    position: POS.clone(), POS, dir,
    labelEl: label?.el ?? null, labelEls,
    get focusTarget() { return POS.clone(); },
    stats: () => ({ state, dist, lite, copies }),
    uniforms,
    parts: { lens, host, hostGlow, nebula, blr, jets: jets.map((j) => j.mesh), lobes, bloom, aura, glare, nep },   // debug / tuning
  };
}
