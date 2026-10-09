// Sagittarius A* — the Milky Way's central black hole — for the galaxy scene of /workspace/solar-system
// (1 unit = 100 ly, galactic plane = XZ, galactic center at the origin of galaxy.group).
// Standalone: needs only `three` and the CSS2DRenderer addon (both already in the repo's import map). No build step.
//
//   import { addSgrA, SGRA_INFO } from './sgra.js';
//   const sgra = addSgrA(galaxy, { isTouch, labels: true });     // galaxy = createGalaxy(...)
//   ...each frame (galaxy scene active): sgra.update(camera, renderer);
//
// SCALE (nested zoom): at true scale Sgr A* is ~1/10,000,000 of a unit, i.e. invisible. So the black hole is drawn
// hugely ENLARGED: its Schwarzschild radius Rs is RS_WORLD units (default 1 unit = 100 ly, ~75 million× too big).
// From the galaxy-wide view you only see a tiny warm glow + label; as the camera approaches the center the
// exaggerated black hole fades in. A scale note says so.
//
// HOW IT IS DRAWN (one camera-facing quad, one fragment shader — no extra scene render, no build step):
//  * Every pixel of a billboard covering a bounding sphere (radius RB·Rs) traces a light ray from the camera through
//    the Schwarzschild metric (photon geodesic in Cartesian form: x'' = −1.5·h²·x/r⁵, units Rs = 1), with an adaptive
//    step. Rays that fall below r = 1 are captured → the black SHADOW (its edge lands at b ≈ 2.6 Rs automatically).
//  * Each time a ray crosses the disk plane between r_in (ISCO, 3 Rs) and r_out it picks up ACCRETION-DISK light:
//    procedural, differentially rotating fbm streaks; relativistic Doppler factor g = √(1−1/r) / (γ(1−β·k)) from the
//    Keplerian orbital speed gives BEAMING (∝ g⁴: approaching side brighter + bluer, receding side dimmer + redder).
//    Because rays bend, the far side of the disk shows up arched OVER (and under) the shadow, Interstellar-style, and
//    secondary images form the PHOTON RING; a thin analytic ring at the critical impact parameter b = 3√3/2 Rs adds the
//    sharp EHT-like ring.
//  * GRAVITATIONAL LENSING of the real galaxy behind it: the quad is drawn last; just before it draws, the already
//    rendered frame is copied into a FramebufferTexture (renderer.copyFramebufferToTexture — one GPU blit, no second
//    scene render). Escaping rays leave with a bent direction; that direction is projected back to screen space and the
//    frame copy is sampled there. So bulge stars are smeared into arcs and an Einstein ring around the shadow.
//    Near the edge of the quad the bend is tapered to zero, so it blends seamlessly with the un-lensed frame.
//  * LOD: far away → only a cheap glow sprite. The quad (and the frame copy) are switched on only when the camera is
//    within ~700 units and the effect is faded in by distance; only pixels inside the bounding sphere run the ray tracer.
//    Touch devices use ~half the ray steps (72 vs 150, larger adaptive step) and 3 instead of 4 noise octaves. Instead of
//    a second (even half-res) render of the whole galaxy into a render target, the lens reuses the frame already drawn
//    (one blit), which is the cheapest option on iPad. Without WebGL2 (or with opts.lite) a sprite-only fallback
//    (black disk + Doppler-lopsided glowing ring, no lensing) is used.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const D2R = Math.PI / 180;
const LY_KM = 9.4607e12, UNIT_KM = 100 * LY_KM;               // 1 scene unit = 100 ly
export const SGRA_MASS_SUN = 4.3e6;
export const SGRA_RS_KM = 2.953 * SGRA_MASS_SUN;              // Schwarzschild radius ≈ 12.7 million km

export const SGRA_INFO = {
  name: 'Sagittarius A*', type: 'Supermassive black hole · the heart of the Milky Way', color: '#ffb46a',
  rows: [
    ['Mass', '~4 million times the Sun (4.3 million M☉)'],
    ['Distance from Earth', '~26,000 light-years (toward the constellation Sagittarius)'],
    ['Size', 'Event horizon ~25 million km across (~18× the Sun); its shadow would fit inside Mercury’s orbit'],
    ['First image', 'Event Horizon Telescope, released May 12, 2022'],
  ],
  fact: 'Sagittarius A* is a black hole: so much mass squeezed so tightly that not even light can escape. ' +
        'We can’t see the hole itself, only its dark “shadow” against glowing gas swirling around it at near light-speed. ' +
        'In 2022 the Event Horizon Telescope, a network of radio dishes as big as the Earth, captured its first picture: a glowing ring around a dark center. ' +
        'Stars nearby whip around it in just 16 years, which is how we know how heavy it is.',
};

// ------------------------------------------------------------------------------------------------------------
const VERT = /* glsl */`
  uniform vec3 uCenter; uniform float uHalf; uniform float uFull;
  uniform mat4 uInvViewProj;
  varying vec3 vWorld;
  void main() {
    if (uFull > 0.5) {                               // camera inside the bounding sphere: full-screen quad
      vec4 w = uInvViewProj * vec4(position.xy, 1.0, 1.0);
      vWorld = w.xyz / w.w;
      gl_Position = vec4(position.xy, 0.0, 1.0);
      return;
    }
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = uCenter + (right * position.x + up * position.y) * uHalf;
    vWorld = wp;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const FRAG = (steps, stepK, octaves) => /* glsl */`
  precision highp float;
  #define STEPS ${steps}
  #define STEP_K ${stepK.toFixed(3)}
  #define OCT ${octaves}
  #define MAXB 0.2
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform mat4 uViewProj;
  uniform mat3 uToLocal, uToWorld;
  uniform vec3 uCenter;
  uniform float uRs, uRb, uRin, uRout, uTime, uFade, uTemp, uExposure, uLens;
  varying vec3 vWorld;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * noise(p); p = p * 2.07 + 7.3; a *= 0.5; } return s; }

  // blackbody colour (T in units of 100 K), Tanner Helland's fit, normalised to 0..1
  vec3 blackbody(float t) {
    t = clamp(t, 10.0, 400.0);
    float r = t <= 66.0 ? 1.0 : clamp(1.2929 * pow(t - 60.0, -0.1332), 0.0, 1.0);
    float g = t <= 66.0 ? clamp(0.3901 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(t - 60.0, -0.0755), 0.0, 1.0);
    float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(t - 10.0) - 1.1963, 0.0, 1.0));
    return vec3(r, g, b);
  }

  // accretion disk sample where the ray crosses the plane y = 0 at q, travelling along vdir
  vec4 disk(vec3 q, vec3 vdir) {
    float r = length(q.xz);
    float x = r / uRin;
    // thin-disk temperature profile (peaks just outside the inner edge), softened at the ISCO
    float prof = pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0) + 0.04, 0.25) / 0.52;   // ≈1 at the peak
    // Keplerian speed (Schwarzschild, local frame): beta = sqrt(M / (r - 2M)), M = 0.5 Rs
    float beta = min(sqrt(0.5 / max(r - 1.0, 0.5)), 0.7);
    vec3 vel = beta * normalize(vec3(-q.z, 0.0, q.x));           // counter-clockwise about +y
    vec3 k = -vdir;                                              // direction the photon actually travels (to the camera)
    float gam = inversesqrt(1.0 - beta * beta);
    float g = sqrt(max(1.0 - 1.0 / r, 0.02)) / (gam * (1.0 - dot(vel, k)));
    // procedural gas: differentially rotating streaks; two time-phases cross-faded so the shear never runs away
    float phi = atan(q.z, q.x);
    float om = 0.9 * beta / r;
    float T = uTime;
    float p1 = fract(T / 9.0), p2 = fract(T / 9.0 + 0.5);
    float w = abs(2.0 * p1 - 1.0);
    float a1 = phi + om * p1 * 9.0 * 6.0, a2 = phi + om * p2 * 9.0 * 6.0 + 1.7;
    float lr = log(r) * 7.0;
    float n1 = fbm(vec3(cos(a1) * 2.2, sin(a1) * 2.2, lr));
    float n2 = fbm(vec3(cos(a2) * 2.2, sin(a2) * 2.2, lr + 3.1));
    float tex = mix(n1, n2, w);
    float rings = 0.75 + 0.25 * sin(lr * 3.3 + 2.0 * tex * 6.2831);
    float dens = smoothstep(0.18, 0.85, tex) * rings;
    float I = prof * prof * (0.3 + 1.3 * dens);
    vec3 col = blackbody(uTemp * pow(prof, 0.6) * g) * I * pow(g, 4.0) * 2.0;
    float edge = smoothstep(uRin * 0.92, uRin * 1.08, r) * (1.0 - smoothstep(uRout * 0.55, uRout, r));
    float a = edge * clamp(0.25 + 0.6 * dens + 0.7 * prof, 0.0, 1.0);
    a *= 0.4 + 0.6 * smoothstep(0.0, 0.6, dot(col, vec3(0.3, 0.55, 0.15)) * uExposure);   // faint gas absorbs less
    return vec4(col * edge, a);
  }

  void main() {
    vec3 dirW = normalize(vWorld - cameraPosition);
    vec3 ro = uToLocal * (cameraPosition - uCenter) / uRs;
    vec3 rd = normalize(uToLocal * dirW);
    float b = dot(ro, rd), c = dot(ro, ro) - uRb * uRb, disc = b * b - c;
    if (disc <= 0.0) discard;                                    // ray misses the bounding sphere: un-lensed frame shows
    float t0 = max(-b - sqrt(disc), 0.0);
    vec3 p = ro + rd * t0, v = rd;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv), imp = sqrt(h2);                       // impact parameter (conserved), units of Rs

    vec3 emis = vec3(0.0); float alpha = 0.0;
    bool captured = false;
    for (int i = 0; i < STEPS; i++) {
      float r2 = dot(p, p), r = sqrt(r2);
      if (r < 1.0) { captured = true; break; }
      if (r > uRb + 0.01 && dot(p, v) > 0.0) break;
      if (alpha > 0.985) break;
      float dt = clamp(STEP_K * (r - 0.85), 0.012, 2.0);
      vec3 pPrev = p;
      v += (-1.5 * h2 / (r2 * r2 * r)) * p * dt;                  // semi-implicit Euler (good enough for a stable look)
      p += v * dt;
      if (pPrev.y * p.y < 0.0) {                                  // crossed the disk plane
        vec3 q = mix(pPrev, p, pPrev.y / (pPrev.y - p.y));
        float rq = length(q.xz);
        if (rq > uRin * 0.9 && rq < uRout) {
          vec4 d = disk(q, normalize(v));
          emis += (1.0 - alpha) * d.rgb;
          alpha += (1.0 - alpha) * d.a;
        }
      }
    }
    if (!captured && dot(p, p) < 2.25) captured = true;            // out of steps deep inside the photon sphere

    vec3 bg = vec3(0.0);
    if (!captured) {
      vec3 dOut = normalize(uToWorld * normalize(v));
      // taper the bend to zero at the quad edge → seamless with the un-lensed frame around it
      float taper = smoothstep(3.5, uRb * 0.85, imp);
      // big bends (rays passing near the shadow) would sample far off-screen; compress them smoothly to ≤ ~MAXB rad
      // (tanh), which keeps a clean Einstein ring + arcs instead of a smeared whirl
      float ang = acos(clamp(dot(dirW, dOut), -1.0, 1.0));
      float angC = MAXB * tanh(ang * 0.5 / MAXB) * (1.0 - taper) * uLens;
      vec3 ax = cross(dirW, dOut); float la = length(ax);
      if (la > 1e-5 && ang > 1e-5) { ax /= la; dOut = dirW * cos(angC) + cross(ax, dirW) * sin(angC); }
      else dOut = dirW;
      vec4 clip = uViewProj * vec4(cameraPosition + dOut * 1000.0, 1.0);
      if (clip.w > 0.0) {
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        uv = 1.0 - abs(1.0 - mod(uv, 2.0));                       // mirror at the screen edges (rays bent off-screen)
        bg = texture2D(tScene, uv).rgb;
        // lensed light piles up near the critical curve (magnification) → a faint Einstein glow
        bg *= 1.0 + 0.3 * exp(-pow((imp - 2.75) / 0.7, 2.0));
      } else {
        bg = texture2D(tScene, gl_FragCoord.xy / uRes).rgb * 0.5; // bent behind the camera: dim fallback
      }
    }
    // thin photon ring at the critical impact parameter b = 3√3/2 (plus a soft halo)
    float ring = exp(-pow((imp - 2.598) / 0.035, 2.0)) * 1.6 + exp(-pow((imp - 2.65) / 0.22, 2.0)) * 0.22;
    vec3 ringCol = blackbody(uTemp * 1.05) * ring * (1.0 - alpha);

    vec3 hdr = (emis + ringCol) * uExposure;
    vec3 ldr = 1.0 - exp(-hdr);                                   // soft tone map
    ldr = clamp(mix(vec3(dot(ldr, vec3(0.3, 0.55, 0.15))), ldr, 1.6), 0.0, 1.0);   // keep the colour after tone mapping
    vec3 col = bg * (1.0 - alpha) + ldr;
    if (captured) col = ldr;                                      // shadow: pure black + whatever disk light lies in front
    gl_FragColor = vec4(col, uFade);
  }`;

// ------------------------------------------------------------------------------------------------------------
export function addSgrA(galaxy, opts = {}) {
  const isTouch = !!opts.isTouch;
  const RS = opts.rsWorld ?? 1.0;            // Schwarzschild radius in scene units (exaggerated; true ≈ 1.3e-8)
  const RB = 16, RIN = 3.0, ROUT = 12.0;     // bounding sphere, ISCO, disk outer edge (units of Rs)
  const NEAR_ON = 700, NEAR_FULL = 330;
  const CLOSE_EXPOSURE = opts.closeExposure ?? 0.04;      // camera distance (units) where the close-up effect starts / is fully on
  const exaggeration = RS * UNIT_KM / SGRA_RS_KM;

  const parent = galaxy.group;
  const group = new THREE.Group();
  group.name = 'SgrA';
  parent.add(group);
  // disk orientation (Sgr A*'s real spin axis is uncertain, so this is a presentation choice): the disk is tilted so the
  // direction toward the Sun lies VIEW_EL° above its plane — the default close-up therefore looks at Sgr A* from Earth's
  // side, almost edge-on, which gives the classic Interstellar silhouette (and keeps the Sun marker behind the camera)
  const VIEW_EL = 5 * D2R;
  const sunDir = (galaxy.SUN_POS ? galaxy.SUN_POS.clone() : new THREE.Vector3(1, 0, 0)).normalize();
  const nrm = new THREE.Vector3(0, 1, 0).addScaledVector(sunDir, -sunDir.y).normalize()
    .multiplyScalar(Math.cos(VIEW_EL)).addScaledVector(sunDir, Math.sin(VIEW_EL)).normalize();
  const diskQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
  const sunLocal = sunDir.clone().applyQuaternion(diskQuat.clone().invert());          // in the disk frame
  const AZ0 = Math.atan2(sunLocal.x, sunLocal.z);

  // ---- close-up: ray-traced lens quad ------------------------------------------------------------------
  const fbTex = new THREE.FramebufferTexture(4, 4);
  fbTex.minFilter = fbTex.magFilter = THREE.LinearFilter;
  const uniforms = {
    tScene: { value: fbTex }, uRes: { value: new THREE.Vector2(1, 1) },
    uViewProj: { value: new THREE.Matrix4() }, uInvViewProj: { value: new THREE.Matrix4() },
    uToLocal: { value: new THREE.Matrix3() }, uToWorld: { value: new THREE.Matrix3() },
    uCenter: { value: new THREE.Vector3() }, uHalf: { value: 1 }, uFull: { value: 0 },
    uRs: { value: RS }, uRb: { value: RB }, uRin: { value: RIN }, uRout: { value: ROUT },
    uTime: { value: 0 }, uFade: { value: 0 }, uTemp: { value: 55 }, uExposure: { value: 0.75 }, uLens: { value: 1 },
  };
  const lensMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT,
    fragmentShader: FRAG(isTouch ? 72 : 150, isTouch ? 0.13 : 0.075, isTouch ? 3 : 4),
    transparent: true, depthTest: false, depthWrite: false,
  });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat);
  lens.frustumCulled = false;
  lens.renderOrder = 1000;                   // after everything else in the galaxy scene
  lens.visible = false;
  group.add(lens);

  const _size = new THREE.Vector2(), _origin = new THREE.Vector2(0, 0);
  let lite = !!opts.lite, checked = false, copies = 0;
  lens.onBeforeRender = (renderer, scene, camera) => {
    if (!checked) { checked = true; if (!renderer.capabilities.isWebGL2) { lite = true; } }
    renderer.getDrawingBufferSize(_size);
    if (fbTex.image.width !== _size.x || fbTex.image.height !== _size.y) {
      fbTex.image.width = _size.x; fbTex.image.height = _size.y; fbTex.dispose(); fbTex.needsUpdate = true; // re-allocated at the new size
    }
    uniforms.uRes.value.copy(_size);
    renderer.copyFramebufferToTexture(_origin, fbTex);          // the frame so far = what lies behind the black hole
    copies++;
    uniforms.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.uInvViewProj.value.copy(uniforms.uViewProj.value).invert();
  };

  function glowTexEarly(stops, size = 128) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, st] of stops) gr.addColorStop(o, st);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // warm aura around the disk; drawn just before the lens quad, so it is part of the copied frame and gets lensed too
  const auraTex = (() => {
    const sz = 128, cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    gr.addColorStop(0, 'rgba(255,190,120,0.55)'); gr.addColorStop(0.35, 'rgba(255,140,60,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  aura.scale.setScalar(RS * ROUT * 3.2); aura.renderOrder = 999; aura.visible = false;
  group.add(aura);

  // nuclear star cluster: a few crisp stars around Sgr A* (the real one has ~10 million stars within ~25 ly). They are
  // not dimmed by the close-up exposure, so the lens visibly bends them into arcs / double images near the shadow.
  const NSC = isTouch ? 2200 : 4500;
  const nscGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(NSC * 3), col = new Float32Array(NSC * 3), c = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < NSC; i++) {
      v.randomDirection().multiplyScalar(RS * (30 + 150 * Math.pow(Math.random(), 1.6)));
      pos.set([v.x, v.y, v.z], i * 3);
      const r = Math.random();
      c.setHSL(r < 0.25 ? 0.6 : 0.09 + 0.05 * Math.random(), r < 0.25 ? 0.5 : 0.6, 0.55 + 0.4 * Math.random()).multiplyScalar(0.5 + 1.6 * Math.random() ** 3);
      col.set([c.r, c.g, c.b], i * 3);
    }
    nscGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    nscGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const dotTex = glowTexEarly([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 32);
  const nsc = new THREE.Points(nscGeo, new THREE.PointsMaterial({ size: isTouch ? 4.5 : 3.5, sizeAttenuation: false, map: dotTex, vertexColors: true,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  nsc.renderOrder = 998; nsc.frustumCulled = false; nsc.visible = false;
  group.add(nsc);

  // ---- far: cheap glow --------------------------------------------------------------------------------
  const glowTex = (stops, size = 128) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, s] of stops) gr.addColorStop(o, s);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const farTex = glowTex([[0, 'rgba(255,240,215,1)'], [0.15, 'rgba(255,190,120,0.55)'], [0.45, 'rgba(255,140,60,0.12)'], [1, 'rgba(0,0,0,0)']]);
  const farGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: farTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  farGlow.renderOrder = 6;
  group.add(farGlow);

  // ---- lite fallback (no WebGL2): black disk + glowing ring sprites --------------------------------------
  const liteGroup = new THREE.Group(); liteGroup.visible = false; group.add(liteGroup);
  const shadowTex = glowTex([[0, 'rgba(0,0,0,1)'], [0.84, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  const ringTex = (() => {
    const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,230,190,0)'); gr.addColorStop(0.05, 'rgba(255,235,200,1)'); gr.addColorStop(0.25, 'rgba(255,160,70,0.55)');
    gr.addColorStop(0.7, 'rgba(200,80,30,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    const lg = g.createLinearGradient(0, 0, s, 0);                // Doppler: one side brighter
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = lg; g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const liteRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const liteShadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false, depthTest: false }));
  liteRing.scale.setScalar(RS * 2 * 7.5); liteShadow.scale.setScalar(RS * 2 * 2.6 / 0.84);
  liteRing.renderOrder = 1000; liteShadow.renderOrder = 1001;
  liteGroup.add(liteRing, liteShadow);

  // ---- labels ----------------------------------------------------------------------------------------
  const labelEls = [];
  let label = null, note = null, hiddenCenter = null;
  if (opts.labels !== false) {
    const make = (html, cls) => {
      const wrap = document.createElement('div'); wrap.className = 'galaxy-label-wrap';
      const el = document.createElement('div'); el.className = 'label galaxy-label ' + cls; el.innerHTML = html;
      wrap.appendChild(el); labelEls.push(el);
      return { obj: new CSS2DObject(wrap), el };
    };
    label = make('Sagittarius A* · <b>black hole</b>', 'sgra-label');
    group.add(label.obj);
    note = make(`Black hole enlarged ~${fmtBig(exaggeration)}× · real shadow ≈ 0.4 AU across`, 'small sgra-note off');
    group.add(note.obj);
    // galaxy.js already has a small "Galactic center · Sgr A*" label at the same spot → hide it (restored on dispose)
    hiddenCenter = (galaxy.labelEls || []).find((el) => /Sgr A\*/.test(el.textContent));
    if (hiddenCenter && opts.replaceCenterLabel !== false) hiddenCenter.style.display = 'none'; else hiddenCenter = null;
  }

  // ---- close-up exposure ---------------------------------------------------------------------------------
  // Deep in the bulge thousands of big additive star sprites saturate to white, which would hide the black hole and
  // the lensing. Like a camera stopping down, the galaxy's emissive materials are dimmed as we close in (restored when
  // leaving). Works on the galaxy's own uniforms (uBright / uIntensity) or, for plain additive materials, opacity —
  // re-reading the base value whenever someone else (galaxy.update) has changed it, so nothing compounds.
  // targets are de-duplicated by the object actually written (a uniform object may be shared by several materials)
  let expoTargets = null, curExposure = 1;
  const isMine = (o) => { for (let p = o; p; p = p.parent) if (p === group) return true; return false; };
  function collectExposureTargets() {
    const seen = new Set(); expoTargets = [];
    parent.traverse((o) => {
      if (!o.material || isMine(o)) return;
      for (const m of [].concat(o.material)) {
        if (m.blending !== THREE.AdditiveBlending) continue;
        const u = m.uniforms?.uBright ?? m.uniforms?.uIntensity;
        const t = u ? { obj: u, key: 'value' } : (!m.isShaderMaterial ? { obj: m, key: 'opacity' } : null);
        if (!t || seen.has(t.obj)) continue;
        seen.add(t.obj); t.base = null; t.written = null; expoTargets.push(t);
      }
    });
  }
  function setSceneExposure(k) {
    if (!expoTargets) collectExposureTargets();
    curExposure = k;
    for (const t of expoTargets) {
      const cur = t.obj[t.key];
      if (t.base === null || cur !== t.written) t.base = cur;   // first time, or changed by its owner since our last write
      t.written = t.base * k; t.obj[t.key] = t.written;
    }
  }

  // ---- per-frame -------------------------------------------------------------------------------------
  const _c = new THREE.Vector3(), _cam = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const _up = new THREE.Vector3(), _fwd = new THREE.Vector3();
  let bodyClassOn = false;
  let visible = true, t = 0, last = performance.now(), state = 'far', dist = Infinity;

  function update(camera, renderer) {
    const now = performance.now(); t += Math.min((now - last) / 1000, 0.1); last = now;
    if (renderer && !checked) { checked = true; if (!renderer.capabilities.isWebGL2) lite = true; }
    if (!visible) return;
    group.getWorldPosition(_c);
    camera.getWorldPosition(_cam);
    dist = _cam.distanceTo(_c);
    const near = 1 - THREE.MathUtils.smoothstep(dist, NEAR_FULL, NEAR_ON);   // 0 far … 1 close
    const inFront = camera.getWorldDirection(_fwd).dot(_up.subVectors(_c, _cam)) > -RB * RS;

    // far glow: ~constant small screen size, fades out as the close-up takes over
    farGlow.scale.setScalar(dist * (isTouch ? 0.022 : 0.016));
    farGlow.material.opacity = 0.9 * (1 - near);
    farGlow.visible = farGlow.material.opacity > 0.01;

    // stop the galaxy down as we approach (1 at ~420 units → CLOSE_EXPOSURE at ~35 units)
    const k = CLOSE_EXPOSURE + (1 - CLOSE_EXPOSURE) * THREE.MathUtils.smoothstep(dist, RS * 35, 420);
    if (k < 0.999 || curExposure < 0.999) setSceneExposure(k);

    const closeOn = near > 0.001 && inFront;
    state = !closeOn ? 'far' : (lite ? 'lite' : (near < 1 ? 'approach' : 'close'));
    lens.visible = closeOn && !lite;
    liteGroup.visible = closeOn && lite;
    aura.visible = lens.visible; aura.material.opacity = 0.6 * near;
    nsc.visible = closeOn; nsc.material.opacity = 1 - THREE.MathUtils.smoothstep(dist, RS * 60, RS * 170);
    nsc.visible = closeOn && nsc.material.opacity > 0.01;
    if (lite) { liteRing.material.opacity = near; liteShadow.material.opacity = near; }

    if (lens.visible) {
      // disk frame in world space. Deliberately NOT spun with the galaxy's cosmetic rotation: the black hole sits on the
      // rotation axis anyway, and a fixed disk keeps the close-up composition stable while the galaxy turns.
      _m.makeRotationFromQuaternion(diskQuat);
      uniforms.uToWorld.value.setFromMatrix4(_m);
      uniforms.uToLocal.value.copy(uniforms.uToWorld.value).transpose();
      uniforms.uCenter.value.copy(_c);
      const R = RB * RS;
      uniforms.uFull.value = dist < R * 1.02 ? 1 : 0;
      uniforms.uHalf.value = dist > R * 1.02 ? R * dist / Math.sqrt(dist * dist - R * R) * 1.01 : R;
      uniforms.uTime.value = t;
      uniforms.uFade.value = near;
      // lensing strength fades in a little later than the disk so the approach is gentle
      uniforms.uLens.value = THREE.MathUtils.smoothstep(near, 0.2, 0.9);
    }

    if (label) {
      const lgView = _cam.length() > 4500;                      // Local Group view: keep it uncluttered (like galaxy.js)
      label.el.classList.toggle('off', lgView);
      // up close, park the label above the disk so it does not cover the shadow
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const lift = THREE.MathUtils.smoothstep(near, 0.3, 1) * Math.min(RS * ROUT * 0.8, dist * Math.tan(camera.fov * D2R / 2) * 0.62);
      label.obj.position.copy(_up).multiplyScalar(lift);
      note.obj.position.copy(_up).multiplyScalar(-lift * 1.0);
      if (lift > 0) { const iq = group.getWorldQuaternion(_q).invert(); label.obj.position.applyQuaternion(iq); note.obj.position.applyQuaternion(iq); }
      note.el.classList.toggle('off', near < 0.6 || lgView);
    }
    // close-up: let the page hide unrelated galaxy labels (CSS: body.sgra-close .galaxy-label:not(.sgra-label) …)
    if (opts.bodyClass !== false) {
      const c = visible && near > 0.6 && dist < RS * 120;
      if (c !== bodyClassOn) { bodyClassOn = c; document.body.classList.toggle('sgra-close', c); }
    }
  }

  function setVisible(v) {
    visible = !!v; group.visible = visible;
    if (!visible && curExposure < 1) setSceneExposure(1);
    for (const el of labelEls) el.classList.toggle('off', !visible || el === note?.el);
  }

  // screen-space pick: is (clientX, clientY) on the black hole (or its glow when far)? slop in CSS px
  const _p = new THREE.Vector3();
  function pick(clientX, clientY, camera, domElement, slop = 12) {
    if (!visible) return false;
    const r = domElement.getBoundingClientRect();
    group.getWorldPosition(_p).project(camera);
    if (_p.z > 1) return false;
    const sx = r.left + (_p.x * 0.5 + 0.5) * r.width, sy = r.top + (-_p.y * 0.5 + 0.5) * r.height;
    const d = camera.position.distanceTo(group.getWorldPosition(_c));
    const pxPerUnit = r.height / (2 * Math.tan(camera.fov * D2R / 2)) / d;
    const rad = Math.max(slop, RS * ROUT * 0.9 * pxPerUnit);
    return Math.hypot(clientX - sx, clientY - sy) <= rad;
  }

  // close-up camera pose: by default from the Sun's direction (5° above the disk plane). azimuthDeg rotates around the
  // disk axis, elevationDeg sets the height above the disk plane.
  function focusView(camera, { distance, elevationDeg = 5, azimuthDeg = 0 } = {}) {
    const target = group.getWorldPosition(new THREE.Vector3());
    const tanH = Math.tan(camera.fov * D2R / 2);
    const halfW = RS * ROUT * 1.25;                                 // keep the whole disk in frame
    const d = distance ?? Math.max(RS * 27, halfW / tanH / Math.min(camera.aspect, 1.6));
    const el = elevationDeg * D2R, az = AZ0 + azimuthDeg * D2R;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    dir.applyQuaternion(diskQuat);
    return { position: target.clone().addScaledVector(dir, d), target, minDistance: RS * (RB + 4) };
  }

  // fill the repo's existing info panel (#info-name, #info-type, 4 table rows, #info-fact) and open it
  function showInfo() {
    const $ = (id) => document.getElementById(id);
    if (!$('info-panel')) return false;
    const g = SGRA_INFO;
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
    group.removeFromParent();
    lens.geometry.dispose(); lensMat.dispose(); fbTex.dispose(); nscGeo.dispose(); nsc.material.dispose(); dotTex.dispose();
    for (const s of [farGlow, liteRing, liteShadow, aura]) s.material.dispose();
    for (const tx of [farTex, shadowTex, ringTex, auraTex]) tx.dispose();
    for (const el of labelEls) el.parentElement?.remove();
    if (hiddenCenter) hiddenCenter.style.display = '';
    document.body.classList.remove('sgra-close');
    setSceneExposure(1);
  }

  const position = new THREE.Vector3();   // group-local origin = galactic center
  return {
    group, update, setVisible, dispose, pick, focusView, showInfo,
    info: { ...SGRA_INFO, exaggeration, rsWorld: RS, radius: RS * ROUT, bounds: RS * RB },
    labelEl: label?.el ?? null, labelEls,
    get focusTarget() { return group.getWorldPosition(new THREE.Vector3()); },
    position,
    stats: () => ({ state, dist, lite, copies }),
    uniforms,
  };
}

function fmtBig(x) {
  const e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  if (e >= 6 && e < 9) return `${Math.round(x / 1e6)} million`;
  if (e >= 9 && e < 12) return `${Math.round(x / 1e9)} billion`;
  return `${m.toFixed(1)}e${e}`;
}
