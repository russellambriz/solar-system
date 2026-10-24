// Milky Way: (1) procedural sky band for the solar-system view, (2) a separate galaxy scene for the zoomed-out view.
// Everything is generated in code — no image files.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { addDeepSpace } from './deepspace.js';
import { addAntennae } from './antennae.js';

// ---------------------------------------------------------------------------
// Galactic coordinate frame expressed in our scene's ecliptic frame.
// Scene convention: ecliptic plane = XZ, ecliptic north = +Y, longitude λ: x = cos λ, z = −sin λ.
// Galactic north pole: λ = 180.02°, β = +29.81°  → galactic plane is tilted ~60.2° to the ecliptic.
// Galactic center (Sgr A*): λ = 266.84°, β = −5.54° (toward Sagittarius).
// ---------------------------------------------------------------------------
const D2R = Math.PI / 180;
const ecl = (lamDeg, betDeg) => {
  const l = lamDeg * D2R, b = betDeg * D2R;
  return new THREE.Vector3(Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l));
};
export const NGP = ecl(180.02, 29.81).normalize();
export const GC = (() => { const g = ecl(266.84, -5.54); return g.sub(NGP.clone().multiplyScalar(g.dot(NGP))).normalize(); })();
export const L90 = new THREE.Vector3().crossVectors(NGP, GC).normalize(); // galactic longitude 90° (toward Cygnus)

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// GLSL value noise shared by shaders
const NOISE_GLSL = /* glsl */`
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------------------
// 1) Sky band (inside of a large sphere that follows the camera, so it sits "at infinity")
// ---------------------------------------------------------------------------
export function createSkyBand({ isTouch = false, renderer } = {}) {
  const group = new THREE.Group();
  group.name = 'MilkyWaySky';

  // The band is expensive to compute (several noise lookups per pixel), so it is rendered ONCE on the GPU into an
  // equirectangular texture at startup; each frame then just samples that texture (cheap on iPad).
  const W = isTouch ? 1536 : 2048;
  const rt = new THREE.WebGLRenderTarget(W, W / 2, { depthBuffer: false });
  {
    const bakeMat = new THREE.ShaderMaterial({
      uniforms: { uNGP: { value: NGP }, uGC: { value: GC }, uL90: { value: L90 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 uNGP, uGC, uL90;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          // same (u,v) → direction mapping as THREE.SphereGeometry
          float phi = vUv.x * 6.28318530718, theta = (1.0 - vUv.y) * 3.14159265359;
          vec3 d = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
          float b = asin(clamp(dot(d, uNGP), -1.0, 1.0));       // galactic latitude
          float l = atan(dot(d, uL90), dot(d, uGC));             // galactic longitude, 0 = galactic center
          float core = exp(-l * l / 0.55);                       // brighter toward Sagittarius
          float width = 0.08 + 0.06 * core;
          float n = fbm(d * 5.0), n2 = fbm(d * 13.0 + 3.0);
          float bw = b + (n - 0.5) * 0.07;
          float band = exp(-bw * bw / (width * width));
          float bulge = exp(-(l * l / 0.08 + b * b / 0.02));
          float bright = band * (0.35 + 0.45 * core) * (0.45 + 1.0 * n2) + bulge * 0.3;
          // the Great Rift: a dark dust lane running along the plane from Cygnus to Centaurus
          float riftC = 0.012 + 0.025 * sin(l * 2.3);
          float rw = 0.018 + 0.015 * core;
          float rift = exp(-pow((b - riftC) / rw, 2.0)) * smoothstep(1.7, 0.2, abs(l - 0.25)) * smoothstep(0.32, 0.6, fbm(d * 9.0 + 7.0));
          bright *= 1.0 - 0.8 * rift;
          bright *= 0.85 + 0.3 * fbm(d * 30.0);                  // fine mottling
          vec3 col = mix(vec3(0.60, 0.68, 1.0), vec3(1.0, 0.85, 0.64), core);
          gl_FragColor = vec4(col * bright, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
    const bakeScene = new THREE.Scene(); bakeScene.add(quad);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(bakeScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    renderer.setRenderTarget(prev);
    quad.geometry.dispose(); bakeMat.dispose();
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: { tBand: { value: rt.texture }, uOpacity: { value: 0.34 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tBand; uniform float uOpacity; varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(tBand, vUv).rgb * uOpacity, 1.0); }`,
    side: THREE.BackSide, transparent: false, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,   // opaque pass + renderOrder -10: drawn first, so planets (incl. night sides) cover it
  });
  const band = new THREE.Mesh(new THREE.SphereGeometry(3200, 96, 48), mat);
  band.renderOrder = -10;
  band.frustumCulled = false;
  group.add(band);

  // Extra faint stars concentrated along the galactic plane
  const N = isTouch ? 4000 : 9000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color(), d = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const l = Math.random() < 0.55 ? gauss() * 0.9 : (Math.random() * 2 - 1) * Math.PI;
    const core = Math.exp(-l * l / 0.55);
    const b = gauss() * (0.05 + 0.07 * core);
    d.copy(GC).multiplyScalar(Math.cos(b) * Math.cos(l)).addScaledVector(L90, Math.cos(b) * Math.sin(l)).addScaledVector(NGP, Math.sin(b));
    d.multiplyScalar(2100 + Math.random() * 700);
    pos.set([d.x, d.y, d.z], i * 3);
    c.setHSL(core > 0.5 ? 0.1 : 0.6, 0.35, 0.55 + Math.random() * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 4.5, vertexColors: true, map: dotTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(stars);

  return {
    group,
    update(camera) { band.position.copy(camera.position); },
  };
}

// ---------------------------------------------------------------------------
// 2) Galaxy scene — a barred spiral built from particles.
// Scale: 1 unit = 100 light-years (galaxy radius 500 units ≈ 50,000 ly).
// ---------------------------------------------------------------------------
export const GALAXY_INFO = {
  name: 'Milky Way', type: 'Barred spiral galaxy (type SBbc)', color: '#b9c6ff',
  rows: [
    ['Diameter', '~100,000 light-years'],
    ['Stars', '~100–400 billion'],
    ['Sun’s distance from center', '~26,000 light-years (Orion Arm)'],
    ['Sun’s galactic orbit', '~230 million years per lap (~230 km/s)'],
  ],
  fact: 'The last time the Sun was at this spot in its orbit around the galaxy, the first dinosaurs were just appearing on Earth. ' +
        'At the center sits Sagittarius A*, a black hole about 4 million times the mass of the Sun.',
};

export const ANDROMEDA_INFO = {
  name: 'Andromeda Galaxy (M31)', type: 'Spiral galaxy (type SA(s)b) · our nearest big neighbor', color: '#ffd9a0',
  rows: [
    ['Distance', '~2.5 million light-years (≈ 25 Milky Way diameters)'],
    ['Diameter', '~220,000 light-years (about twice the Milky Way)'],
    ['Stars', '~1 trillion'],
    ['Heading our way', 'Approaching at ~110 km/s; it will merge with the Milky Way in ~4–5 billion years'],
  ],
  fact: 'The light you see from Andromeda left it about 2.5 million years ago, when the first humans were appearing in Africa. ' +
        'It is the most distant thing you can see with your bare eyes. It looks like a faint smudge, but it spans about 6 full Moons across the sky. ' +
        'When it collides with the Milky Way, stars are so far apart that almost none will actually hit each other. The two will blend into one giant elliptical galaxy, nicknamed "Milkomeda".',
};

const particleVert = /* glsl */`
  attribute float size; attribute vec3 aColor;
  uniform float uScale, uBright;
  varying vec3 vColor; varying float vFade;
  void main() {
    vColor = aColor * uBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ps = size * uScale / -mv.z;
    // a particle smaller than a pixel is drawn as 1 px but dimmed by its true area, so far-away
    // galaxies fade into a smooth, correctly faint smudge instead of a noisy sparkle
    vFade = clamp(ps * ps, 0.0, 1.0);
    gl_PointSize = clamp(ps, 1.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }`;
const starFrag = /* glsl */`
  varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8); gl_FragColor = vec4(vColor * a * vFade, 1.0); }`;
const dustFrag = /* glsl */`
  uniform float uAlpha; varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = (1.0 - d * 2.0); gl_FragColor = vec4(vColor, a * a * uAlpha * vFade); }`;

function pointCloud(positions, colors, sizes, frag, opts) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 }, uBright: { value: opts.bright ?? 1 }, uAlpha: { value: opts.alpha ?? 1 } },
    vertexShader: particleVert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: opts.blending ?? THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function createGalaxy({ isTouch = false } = {}) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();     // rotates slowly
  scene.add(group);

  const R = 500, BAR = 55, K = 1 / Math.tan(13 * D2R);           // radius, bar half-length, log-spiral pitch 13°
  const ARMS = [                                                   // [angle offset, start radius, weight]
    [0, BAR, 1.0], [Math.PI, BAR, 1.0],                            // two major arms from the bar ends (Scutum–Centaurus, Perseus)
    [Math.PI / 2, BAR * 1.6, 0.65], [Math.PI * 1.5, BAR * 1.6, 0.65], // two minor arms (Norma, Sagittarius)
  ];
  const armTheta = (arm, r) => arm[0] + K * Math.log(r / BAR);
  // Sun: ~26,000 ly = 260 units, in the Orion Spur between two arms
  const SUN_R = 260;
  const sunTheta = armTheta(ARMS[1], SUN_R) + Math.PI / 4.2;
  const SUN_POS = new THREE.Vector3(Math.cos(sunTheta) * SUN_R, 0, Math.sin(sunTheta) * SUN_R);

  const N = isTouch ? 26000 : 65000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const c = new THREE.Color();
  const coreCol = new THREE.Color(1.0, 0.82, 0.55), armIn = new THREE.Color(1.0, 0.9, 0.75), armOut = new THREE.Color(0.55, 0.7, 1.0);
  const pink = new THREE.Color(1.0, 0.45, 0.65), blue = new THREE.Color(0.7, 0.82, 1.0);
  const weights = ARMS.map((a) => a[2]), wSum = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N; i++) {
    let x, y, z, s;
    const u = Math.random();
    if (u < 0.16) {                       // central bulge + bar (ellipsoid elongated along x)
      const r = Math.abs(gauss());
      x = gauss() * BAR * 0.55; z = gauss() * BAR * 0.2; y = gauss() * 9 * Math.exp(-r * 0.3);
      if (Math.random() < 0.45) { x *= 0.45; z = gauss() * 22; y = gauss() * 14; } // round bulge part
      c.copy(coreCol).multiplyScalar(0.45 + Math.random() * 0.25); s = 2 + Math.random() * 2.5;
    } else if (u < 0.80 || u >= 0.95) {   // spiral arms (+ Orion Spur below)
      let theta, r;
      if (u >= 0.95) {                    // Orion Spur: short partial arm through the Sun's position
        r = SUN_R + gauss() * 45;
        theta = sunTheta + K * Math.log(r / SUN_R) * 0.8;
      } else {
        let pickW = Math.random() * wSum, k = 0;
        while (pickW > weights[k]) { pickW -= weights[k]; k++; }
        const arm = ARMS[k];
        r = arm[1] + (R - arm[1]) * Math.pow(Math.random(), 1.25);
        theta = armTheta(arm, r);
      }
      const spread = 4 + 0.045 * r;
      const ox = gauss() * spread, oz = gauss() * spread;
      x = Math.cos(theta) * r + ox; z = Math.sin(theta) * r + oz; y = gauss() * (3 + 4 * (1 - r / R));
      const t = Math.min(1, r / R);
      c.copy(armIn).lerp(armOut, Math.pow(t, 0.7));
      s = 1.6 + Math.random() * 2.6;
      const roll = Math.random();
      if (roll < 0.025) { c.copy(pink); s = 4 + Math.random() * 4; }          // glowing star-forming (HII) regions
      else if (roll < 0.07) { c.copy(blue); s = 3.5 + Math.random() * 3; }    // young hot blue stars
    } else {                              // diffuse exponential disk between the arms
      const r = Math.min(R * 1.05, -Math.log(1 - Math.random() * 0.995) * 140);
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * 5;
      c.setRGB(0.75, 0.75, 0.85); s = 1.3 + Math.random() * 1.6;
    }
    pos.set([x, y, z], i * 3); col.set([c.r, c.g, c.b], i * 3); size[i] = s;
  }
  const stars = pointCloud(pos, col, size, starFrag, { bright: isTouch ? 0.6 : 0.45 });
  stars.renderOrder = 1;
  group.add(stars);

  // Dust lanes: dark, normally-blended particles along the inner edge of each arm
  const ND = isTouch ? 3500 : 9000;
  const dpos = new Float32Array(ND * 3), dcol = new Float32Array(ND * 3), dsize = new Float32Array(ND);
  for (let i = 0; i < ND; i++) {
    const arm = ARMS[i % 4];
    const r = arm[1] * 1.1 + (R * 0.9 - arm[1]) * Math.pow(Math.random(), 1.1);
    const theta = armTheta(arm, r) - 0.16;
    const spread = 3 + 0.03 * r;
    dpos.set([Math.cos(theta) * r + gauss() * spread, gauss() * 1.5, Math.sin(theta) * r + gauss() * spread], i * 3);
    dcol.set([0.04, 0.025, 0.02], i * 3);
    dsize[i] = 9 + Math.random() * 10;
  }
  const dust = pointCloud(dpos, dcol, dsize, dustFrag, { blending: THREE.NormalBlending, alpha: 0.35 });
  dust.renderOrder = 2;
  group.add(dust);

  // Soft glows: flat disk glow (lies in the plane) + spherical core glow
  const glowTex = (stops) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, s] of stops) gr.addColorStop(o, s);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const disk = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.3, R * 2.3), new THREE.MeshBasicMaterial({
    map: glowTex([[0, 'rgba(255,220,170,0.55)'], [0.25, 'rgba(200,190,220,0.18)'], [0.6, 'rgba(120,150,255,0.07)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  disk.rotation.x = -Math.PI / 2; disk.renderOrder = 0;
  group.add(disk);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex([[0, 'rgba(255,235,190,0.6)'], [0.3, 'rgba(255,200,120,0.18)'], [1, 'rgba(255,160,60,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  coreGlow.scale.set(220, 220, 1); coreGlow.renderOrder = 3;
  group.add(coreGlow);

  // Distant background stars / galaxies
  let bg;
  {
    const NB = isTouch ? 800 : 1800, bp = new Float32Array(NB * 3), bc = new Float32Array(NB * 3), bs = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      const r = 6000 + Math.random() * 3000, u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      bp.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      const v = 0.4 + Math.random() * 0.6; bc.set([v, v, v * 1.05], i * 3); bs[i] = 10 + Math.random() * 20;
    }
    bg = pointCloud(bp, bc, bs, starFrag, { bright: 0.7 });
    bg.renderOrder = -1;
    scene.add(bg);
  }


  // ---------------------------------------------------------------------------
  // Andromeda (M31) + companions M32 and M110 — placed at their TRUE distance.
  // 1 unit = 100 ly → 2.5 million ly = 25,000 units (≈ 25 Milky Way diameters); both galaxies' sizes are to scale.
  // Direction is realistic: galactic longitude 121.2°, latitude −21.6° as seen from the Sun.
  // ---------------------------------------------------------------------------
  const M31_DIST = 25000, M31_R = 1100;                         // ~220,000 ly across
  const gcDir = SUN_POS.clone().negate().normalize();           // Sun → galactic center (l = 0)
  const l90Dir = new THREE.Vector3(0, 1, 0).cross(gcDir).normalize(); // l = 90° (direction of rotation; +y = north galactic pole)
  const L = 121.17 * D2R, B = -21.57 * D2R;
  const m31Dir = gcDir.clone().multiplyScalar(Math.cos(B) * Math.cos(L)).addScaledVector(l90Dir, Math.cos(B) * Math.sin(L)).addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(B)).normalize();
  const M31_POS = SUN_POS.clone().addScaledVector(m31Dir, M31_DIST);
  const andromeda = new THREE.Group();                          // positioned in the (non-rotating) scene
  andromeda.position.copy(M31_POS);
  scene.add(andromeda);
  const m31Disk = new THREE.Group(), m31Normal = new THREE.Vector3();                            // disk lies in local xz; tilted 77° from face-on as seen from us
  {
    const los = m31Dir.clone().negate();                        // M31 → Sun
    let perp = new THREE.Vector3(0, 1, 0).addScaledVector(los, -los.y).normalize();
    perp.applyAxisAngle(los, 52 * D2R);                         // position angle of the tilt (cosmetic)
    m31Normal.copy(los).multiplyScalar(Math.cos(77 * D2R)).addScaledVector(perp, Math.sin(77 * D2R)).normalize();
    m31Disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m31Normal);
  }
  // on-sky axes of M31 as seen from us: major axis (line of nodes) and minor axis
  const m31Los = m31Dir.clone().negate();
  const m31Major = new THREE.Vector3().crossVectors(m31Normal, m31Los).normalize();
  const m31Minor = new THREE.Vector3().crossVectors(m31Los, m31Major).normalize();
  andromeda.add(m31Disk);
  const m31Spin = new THREE.Group();                            // slow cosmetic rotation about the disk axis
  m31Disk.add(m31Spin);

  const NA = isTouch ? 50000 : 140000;
  const apos = new Float32Array(NA * 3), acol = new Float32Array(NA * 3), asize = new Float32Array(NA);
  const A_BULGE = new THREE.Color(1.0, 0.8, 0.52), A_INNER = new THREE.Color(1.0, 0.88, 0.7), A_OUTER = new THREE.Color(0.55, 0.68, 1.0);
  const A_PINK = new THREE.Color(1.0, 0.42, 0.62), A_BLUE = new THREE.Color(0.62, 0.78, 1.0);
  const AK = 1 / Math.tan(9 * D2R);                             // M31's arms are tightly wound (pitch ~9°), almost ring-like
  const A_ARM0 = 130, RING_R = 330;                             // famous "10 kpc ring" of star formation at ~33,000 ly
  const aArm = (k, r) => k * Math.PI + AK * Math.log(r / A_ARM0);
  for (let i = 0; i < NA; i++) {
    let x, y, z, sz; const u = Math.random();
    if (u < 0.24) {                                             // big classical bulge, bright yellowish core
      const r = 50 * Math.pow(-Math.log(1 - Math.random() * 0.999), 1.45);
      const ct = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, st = Math.sqrt(1 - ct * ct);
      x = r * st * Math.cos(ph); y = r * ct * 0.7; z = r * st * Math.sin(ph);
      c.copy(A_BULGE).multiplyScalar(0.3 + 0.28 * Math.exp(-r / 70) + Math.random() * 0.15); sz = 2.4 + Math.random() * 2.8;
    } else if (u < 0.54) {                                      // two tightly wound spiral arms
      const k = Math.random() < 0.5 ? 0 : 1;
      const r = A_ARM0 + (M31_R * 0.85 - A_ARM0) * Math.pow(Math.random(), 1.35);
      const th = aArm(k, r), sp = 6 + 0.035 * r;
      x = Math.cos(th) * r + gauss() * sp; z = Math.sin(th) * r + gauss() * sp; y = gauss() * (7 + 6 * (1 - r / M31_R));
      c.copy(A_INNER).lerp(A_OUTER, Math.min(1, Math.pow(r / (M31_R * 0.8), 0.6))); sz = 1.8 + Math.random() * 2.6;
      const roll = Math.random();
      if (roll < 0.03) { c.copy(A_PINK); sz = 4 + Math.random() * 4; } else if (roll < 0.09) { c.copy(A_BLUE); sz = 3.5 + Math.random() * 3; }
    } else if (u < 0.66) {                                      // the 10-kpc star-forming ring (slightly off-center, as observed)
      const th = Math.random() * Math.PI * 2, r = RING_R + gauss() * 22 + 18 * Math.cos(th);
      x = Math.cos(th) * r + 25 + gauss() * 7; z = Math.sin(th) * r + gauss() * 7; y = gauss() * 7;
      c.copy(A_BLUE).lerp(A_INNER, Math.random() * 0.4); sz = 2 + Math.random() * 2.8;
      if (Math.random() < 0.06) { c.copy(A_PINK); sz = 4 + Math.random() * 4.5; }
    } else if (u < 0.95) {                                      // smooth exponential disk (scale length ~17,000 ly)
      const r = Math.min(M31_R, -Math.log(1 - Math.random() * 0.998) * 170), th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * (9 + 10 * Math.exp(-r / 200));
      c.copy(A_INNER).lerp(A_OUTER, Math.min(1, r / M31_R * 1.3)).multiplyScalar(0.75); sz = 1.4 + Math.random() * 1.8;
    } else {                                                    // faint extended outer disk / halo
      const r = 300 + Math.random() * (M31_R * 1.1 - 300), th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * 40;
      c.setRGB(0.55, 0.62, 0.85); sz = 1.2 + Math.random() * 1.5;
    }
    apos.set([x, y, z], i * 3); acol.set([c.r, c.g, c.b], i * 3); asize[i] = sz;
  }
  const m31Stars = pointCloud(apos, acol, asize, starFrag, { bright: isTouch ? 0.62 : 0.46 });
  m31Stars.renderOrder = 1;
  m31Spin.add(m31Stars);

  // dark dust lanes hugging the inner edges of the arms and the ring (they show up strongly in the inclined view)
  const NAD = isTouch ? 5000 : 14000;
  const adp = new Float32Array(NAD * 3), adc = new Float32Array(NAD * 3), ads = new Float32Array(NAD);
  for (let i = 0; i < NAD; i++) {
    let x, z;
    if (i % 3 === 0) { const th = Math.random() * Math.PI * 2, r = RING_R - 14 + gauss() * 10 + 18 * Math.cos(th); x = Math.cos(th) * r + 25; z = Math.sin(th) * r; }
    else { const k = i % 2, r = A_ARM0 * 1.1 + (M31_R * 0.75 - A_ARM0) * Math.pow(Math.random(), 1.2), th = aArm(k, r) - 0.12, sp = 4 + 0.02 * r; x = Math.cos(th) * r + gauss() * sp; z = Math.sin(th) * r + gauss() * sp; }
    adp.set([x, gauss() * 2.5, z], i * 3); adc.set([0.035, 0.022, 0.015], i * 3); ads[i] = 12 + Math.random() * 14;
  }
  const m31Dust = pointCloud(adp, adc, ads, dustFrag, { blending: THREE.NormalBlending, alpha: 0.42 });
  m31Dust.renderOrder = 2;
  m31Spin.add(m31Dust);

  // soft glows: disk glow in the M31 plane + bright core (these keep it visible as a smudge from very far away)
  const m31DiskGlow = new THREE.Mesh(new THREE.PlaneGeometry(M31_R * 2.1, M31_R * 2.1), new THREE.MeshBasicMaterial({
    map: glowTex([[0, 'rgba(255,215,160,0.6)'], [0.12, 'rgba(255,200,150,0.3)'], [0.35, 'rgba(170,175,230,0.1)'], [0.7, 'rgba(110,140,255,0.035)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m31DiskGlow.rotation.x = -Math.PI / 2;
  m31Disk.add(m31DiskGlow);
  const m31Core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex([[0, 'rgba(255,240,200,0.85)'], [0.18, 'rgba(255,205,130,0.3)'], [1, 'rgba(255,160,60,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m31Core.scale.set(420, 420, 1); m31Core.renderOrder = 3;
  andromeda.add(m31Core);

  // companions: small elliptical galaxies (smooth, yellowish, no arms)
  const elliptical = (n, re, flat, bright) => {
    const p = new Float32Array(n * 3), cc = new Float32Array(n * 3), ss = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = re * Math.pow(-Math.log(1 - Math.random() * 0.995), 1.25), ct = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, st = Math.sqrt(1 - ct * ct);
      p.set([r * st * Math.cos(ph), r * ct * flat, r * st * Math.sin(ph)], i * 3);
      c.setRGB(1.0, 0.86, 0.66).multiplyScalar(0.3 + 0.2 * Math.exp(-r / re) + Math.random() * 0.15); cc.set([c.r, c.g, c.b], i * 3); ss[i] = 1.6 + Math.random() * 2;
    }
    const pts = pointCloud(p, cc, ss, starFrag, { bright });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255,230,190,0.5)'], [0.3, 'rgba(255,210,150,0.15)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(re * 7); glow.material.opacity = 0.7;
    const g = new THREE.Group(); g.add(pts, glow); return { group: g, pts };
  };
  const m32 = elliptical(isTouch ? 2500 : 6000, 10, 0.8, isTouch ? 0.55 : 0.45);   // M32: compact, ~6,500 ly across
  const m110 = elliptical(isTouch ? 3500 : 9000, 34, 0.55, isTouch ? 0.34 : 0.27);  // M110: larger, more diffuse, ~17,000 ly
  // place them where they appear in photos: M32 just off the disk near the core, M110 farther out on the other side
  // (on-sky offsets as in photos: M32 just beside the nucleus at the disk's edge, M110 well off the disk on the other side)
  m32.group.position.copy(m31Minor).multiplyScalar(-260).addScaledVector(m31Major, 70).addScaledVector(m31Los, 60);
  m110.group.position.copy(m31Minor).multiplyScalar(520).addScaledVector(m31Major, -330).addScaledVector(m31Los, -120);
  m110.group.rotation.set(0.4, 0.8, 0.3);
  andromeda.add(m32.group, m110.group);

  // distance line Milky Way ↔ Andromeda, labeled (shown only when zoomed far out)
  const lineGeo = new THREE.BufferGeometry().setFromPoints([SUN_POS.clone().addScaledVector(m31Dir, 700), M31_POS.clone().addScaledVector(m31Dir, -M31_R * 0.75)]);
  const distLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.4, dashSize: 260, gapSize: 200, depthWrite: false }));
  distLine.computeLineDistances();
  scene.add(distLine);

  // "You are here" marker (pulsing ring + dot) and labels
  const marker = new THREE.Group();
  marker.position.copy(SUN_POS);
  group.add(marker);
  const ringTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'); g.strokeStyle = 'rgba(255,215,120,1)'; g.lineWidth = 8;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffe08a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false }));
  const ring2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 }));
  for (const s of [dot, ring, ring2]) { s.renderOrder = 5; marker.add(s); }

  const makeLabel = (html, cls) => {
    const wrap = document.createElement('div');
    wrap.className = 'galaxy-label-wrap';
    const lab = document.createElement('div');
    lab.className = 'label galaxy-label ' + cls;
    lab.innerHTML = html;
    wrap.appendChild(lab);
    return { obj: new CSS2DObject(wrap), el: lab };
  };
  const sunLabel = makeLabel('☀ You are here: <b>Sun</b>', 'sun-here');
  marker.add(sunLabel.obj);
  const centerLabel = makeLabel('Galactic center · Sgr A*', 'small');
  group.add(centerLabel.obj);
  const mwLabel = makeLabel('🌌 Milky Way · <b>you are here</b>', 'mw-far off');
  scene.add(mwLabel.obj);
  const m31Label = makeLabel('Andromeda Galaxy · <b>M31</b>', 'm31-label');
  m31Label.obj.position.copy(m31Minor).multiplyScalar(330);
  andromeda.add(m31Label.obj);
  const m32Label = makeLabel('M32', 'small off'); m32.group.add(m32Label.obj);
  const m110Label = makeLabel('M110', 'small off'); m110.group.add(m110Label.obj);
  const distLabel = makeLabel('≈ 2.5 million light-years', 'small dist-label off');
  distLabel.obj.position.copy(SUN_POS).lerp(M31_POS, 0.5);
  scene.add(distLabel.obj);

  // Nebulae, dust clouds, young-star knots, halo globulars and named objects (Orion, Eagle, Carina, Pleiades, ω Cen, M13…)
  const deep = addDeepSpace({ group, SUN_POS, R }, { isTouch, labels: true });

  // Screen-space label declutter for the galaxy scene. Runs from bg.onBeforeRender, i.e. inside renderer.render() after
  // every module's update() and the matrix update, right before main.js draws the CSS2D labels (no main.js hook needed).
  // Antennae Galaxies (NGC 4038/4039) at their true distance (~45 Mly); owns its label, beacon, info card and N fly-to key
  const antennae = addAntennae({ scene, SUN_POS, R, M31_POS, get spinning() { return spinning; } }, { isTouch, labels: true });

  const declutter = createLabelDeclutter(scene, marker, () => markerRingWorld);
  let markerRingWorld = 0;
  bg.onBeforeRender = (_r, _s, camera) => declutter(camera);

  const tmp = new THREE.Vector3();
  let t = 0, spinning = false;
  // cosmetic rotation rates (hugely sped up): Milky Way pattern one turn per ~10 min, Andromeda/Sombrero ~15 min
  const MW_OMEGA = (2 * Math.PI) / 600, M31_OMEGA = (2 * Math.PI) / 900;
  return {
    scene, group, R, SUN_POS, marker, M31_POS, M31_R, m31Dir, m31Minor, m31Normal, andromeda, deep, antennae,
    labelEls: [sunLabel.el, centerLabel.el, mwLabel.el],
    m31LabelEls: [m31Label.el, m32Label.el, m110Label.el],
    m31Counts: { stars: NA, dust: NAD },
    sunWorldPos(out = new THREE.Vector3()) { return marker.getWorldPosition(out); },
    get spinning() { return spinning; },                // read by sombrero.js so every galaxy pauses together
    get time() { return t; },
    setScale(pxPerUnitAtDist1) {
      for (const p of [stars, dust, bg, m31Stars, m31Dust, m32.pts, m110.pts]) p.material.uniforms.uScale.value = pxPerUnitAtDist1;
    },
    update(dt, camera, spin) {
      t += dt;
      spinning = !!spin;
      if (spin) {
        // rigid rotation of the whole disk group (stars, dust, Sun marker, nebulae/clusters, labels, Sgr A*) about the
        // galactic center: like the real spiral *pattern* (density wave), which turns rigidly — differential star
        // motion would wind the arms up within minutes at this speed-up. Clockwise seen from the north galactic pole,
        // so the arms trail. Eased to a stop near the center so the Sgr A* close-up stays perfectly steady.
        const steady = THREE.MathUtils.smoothstep(camera.position.length(), 120, 450);
        group.rotation.y -= dt * MW_OMEGA * steady;
        m31Spin.rotation.y -= dt * M31_OMEGA;              // Andromeda about its own disk axis (trailing arms)
      }
      bg.position.copy(camera.position);                  // distant background stars stay "at infinity"
      // what to label depends on how far out we are
      const dMW = camera.position.length(), dM31 = camera.position.distanceTo(M31_POS);
      const far = dMW > 4500;
      sunLabel.el.classList.toggle('off', far);
      antennae.update(camera, dt);
      deep.update(camera, dt);                            // deep-space labels appear only when the camera is near; nebula breathing
      if (far) for (const o of deep.objects) o.labelEl?.classList.add('off'); // keep the Local Group view uncluttered
      centerLabel.el.classList.toggle('off', far);
      mwLabel.el.classList.toggle('off', !far);
      m32Label.el.classList.toggle('off', dM31 > 6000);
      m110Label.el.classList.toggle('off', dM31 > 6000);
      // far away, individual particles fade below a pixel; strengthen the soft glows so each galaxy stays a visible smudge
      const farM31 = THREE.MathUtils.smoothstep(dM31, 3500, 22000), farMW = THREE.MathUtils.smoothstep(dMW, 2500, 22000);
      m31DiskGlow.material.opacity = 1 + 3.5 * farM31; m31Core.material.opacity = 1 + 0.6 * farM31;
      disk.material.opacity = 1 + 3.5 * farMW; coreGlow.material.opacity = 1 + 0.6 * farMW;
      const showLine = dMW > 9000 && dM31 > 9000 && dMW < 150000;   // hide in the far MW + M31 + M104 view (overlaps the M31 label)
      distLine.visible = showLine; distLabel.el.classList.toggle('off', !showLine);
      // marker keeps a constant on-screen size
      const dist = camera.position.distanceTo(marker.getWorldPosition(tmp));
      const s = dist * (dist > 4500 ? 0.018 : 0.04);   // smaller when far out, so it doesn't hide the tiny Milky Way
      markerRingWorld = s * 0.62;                         // ~visible ring radius (world units) → label keep-out zone
      dot.scale.setScalar(s * 0.45);
      const ph = (t * 0.6) % 1, ph2 = (t * 0.6 + 0.5) % 1;
      ring.scale.setScalar(s * (0.4 + 1.4 * ph)); ring.material.opacity = 1 - ph;
      ring2.scale.setScalar(s * (0.4 + 1.4 * ph2)); ring2.material.opacity = 1 - ph2;
    },
  };
}

// ---------------------------------------------------------------------------
// Label declutter (galaxy scene). Every visible CSS2D galaxy label is projected to the screen; labels are placed in
// priority order and a lower-priority label that overlaps an already placed one (or the pulsing 'You are here' ring)
// is nudged just above/below/beside it via the CSS `translate` property (composes with the labels' own CSS transform),
// or hidden with the shared `.overlap` class when no nearby free slot exists. Only labels of the user's galaxy modules
// are moved; any other visible label is treated as a fixed obstacle.
// ---------------------------------------------------------------------------
const LABEL_PRIO = [
  ['sun-here', 100, false], ['mw-far', 95, true], ['m31-label', 90, true], ['sombrero-label', 85, true], ['antennae-label', 84, true], ['sgra-label', 80, true],
  ['deep-label', 30, true], ['sgra-note', 60, false], ['sombrero-dist', 12, true], ['antennae-dist', 12, true], ['dist-label', 12, true], ['small', 40, true],
];
function labelPrio(el) {
  if (/\bton-/.test(el.className)) return { p: 60, movable: false, mayHide: false };   // TON 618 places its own labels
  for (const [cls, p, movable] of LABEL_PRIO) if (el.classList.contains(cls)) return { p, movable, mayHide: p < 50 };
  return { p: 60, movable: false, mayHide: false };   // other modules' labels (TON 618 …): fixed obstacles
}
function createLabelDeclutter(scene, marker, ringWorld) {
  let items = [], frame = 0;
  const v = new THREE.Vector3(), mv = new THREE.Vector3();
  const collect = () => {
    const prev = new Map(items.map((it) => [it.el, it]));
    items = [];
    scene.traverse((o) => {
      if (!o.isCSS2DObject) return;
      const el = o.element.firstElementChild;
      if (!el || !el.classList.contains('galaxy-label')) return;
      items.push(prev.get(el) || { obj: o, el, ...labelPrio(el), w: 0, h: 0, ox: 0, oy: 0, dx: 0, dy: 0, hidden: false });
    });
    items.sort((a, b) => b.p - a.p);
  };
  const shown = (it, body) => {
    const { el, obj } = it, wrap = obj.element;
    if (el.classList.contains('off') || el.style.display === 'none' || wrap.style.display === 'none') return false;
    if (body.contains('lg-view') && el.classList.contains('deep-label')) return false;
    if (body.contains('sgra-close') && !el.classList.contains('sgra-label') && !el.classList.contains('sgra-note')) return false;
    for (let p = obj; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const setOffset = (it, dx, dy, hide) => {
    dx = Math.round(dx); dy = Math.round(dy);
    if (dx !== it.dx || dy !== it.dy) { it.dx = dx; it.dy = dy; it.el.style.translate = dx || dy ? `${dx}px ${dy}px` : ''; }
    if (hide !== it.hidden) { it.hidden = hide; it.el.classList.toggle('overlap', hide); }
  };
  const hit = (r, placed, pad = 0) => placed.some((q) => r[0] < q[2] + pad && r[2] > q[0] - pad && r[1] < q[3] + pad && r[3] > q[1] - pad);
  return function declutter(camera) {
    const layer = items[0]?.obj.element.parentElement;
    if (frame++ % 30 === 0) collect();
    const body = document.body.classList;
    if (!body.contains('galaxy-mode') || (layer && layer.style.display === 'none')) return;
    const W = window.innerWidth, H = window.innerHeight, G = 3;
    const placed = [];
    // keep-out zone: the 'You are here' ring around the Sun marker
    marker.getWorldPosition(v);
    mv.copy(v).applyMatrix4(camera.matrixWorldInverse);
    if (mv.z < 0) {
      v.project(camera);
      const rpx = ringWorld() / -mv.z * H / 2 * camera.projectionMatrix.elements[5];
      const cx = (v.x + 1) / 2 * W, cy = (1 - v.y) / 2 * H;
      if (rpx > 2) placed.push([cx - rpx, cy - rpx, cx + rpx, cy + rpx]);
    }
    for (const it of items) {
      if (!shown(it, body)) { if (it.dx || it.dy || it.hidden) setOffset(it, 0, 0, false); continue; }
      it.obj.getWorldPosition(v);
      mv.copy(v).applyMatrix4(camera.matrixWorldInverse);
      if (mv.z >= 0) continue;
      v.project(camera);
      if (!it.w) {                                      // measure once: size + the label's own CSS offset (e.g. translateY(-30px))
        it.w = it.el.offsetWidth; it.h = it.el.offsetHeight;
        const m = getComputedStyle(it.el).transform.match(/matrix\(([^)]+)\)/);
        if (m) { const a = m[1].split(',').map(Number); it.ox = a[4] || 0; it.oy = a[5] || 0; }
        if (!it.w) continue;
      }
      const cx = (v.x + 1) / 2 * W + it.ox, cy = (1 - v.y) / 2 * H + it.oy, hw = it.w / 2, hh = it.h / 2;
      const rect = (dx, dy) => [cx + dx - hw, cy + dy - hh, cx + dx + hw, cy + dy + hh];
      if (!it.movable) { placed.push(rect(0, 0)); continue; }
      const natural = rect(0, 0);
      // stay put if free (with a small margin when returning from a nudge, so it doesn't flicker back and forth)
      if (!hit(natural, placed, it.dx || it.dy ? 4 : 0)) { setOffset(it, 0, 0, false); placed.push(natural); continue; }
      const cands = [];
      if (it.dx || it.dy) cands.push([it.dx, it.dy]);    // keep the previous slot while it stays free
      for (const q of placed) {
        if (!(natural[0] < q[2] && natural[2] > q[0] && natural[1] < q[3] && natural[3] > q[1])) continue;
        const up = q[1] - G - hh - cy, down = q[3] + G + hh - cy;
        const left = q[0] - G - hw - cx, right = q[2] + G + hw - cx;
        const above = cy < (q[1] + q[3]) / 2;           // move away from the obstacle first
        cands.push(...(above ? [[0, up], [0, down]] : [[0, down], [0, up]]), cx < (q[0] + q[2]) / 2 ? [left, 0] : [right, 0]);
      }
      const maxShift = Math.max(70, it.h * 3.5);
      let best = null;
      for (const [dx, dy] of cands) {
        if (Math.hypot(dx, dy) > maxShift) continue;
        if (!hit(rect(dx, dy), placed)) { best = [dx, dy]; break; }
      }
      if (best) { setOffset(it, best[0], best[1], false); placed.push(rect(best[0], best[1])); }
      else if (it.mayHide) setOffset(it, 0, 0, true);
      else { setOffset(it, 0, 0, false); placed.push(natural); }
    }
  };
}
