// Deep-space layer for the Milky Way galaxy view (galaxy.js → createGalaxy()).
// Adds: emission nebulae (H II regions) + dark dust clouds along the spiral arms, real named objects
// (nebulae, an open cluster, halo globular clusters) at roughly correct galactic positions relative to the Sun,
// a population of ~150 halo globular clusters, and an optional layer of bright blue young-star knots (OB associations).
// Everything is procedural (canvas textures, no image files). Units match galaxy.js: 1 unit = 100 light-years,
// galactic plane = the group's local XZ plane, galactic center at the origin, north galactic pole = +Y.
//
// Usage:  const deep = addDeepSpace(galaxy, { isTouch });   // galaxy = object returned by createGalaxy()
//         deep.update(camera)   // only needed when opts.labels is true (shows/hides labels by distance)
// Point/billboard sizes self-calibrate every frame from the renderer + camera (no setScale call needed).
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const D2R = Math.PI / 180;

// Spiral-arm model — mirrors the constants in galaxy.js createGalaxy() (not exported there) so our clouds sit on its arms.
const BAR = 55, K = 1 / Math.tan(13 * D2R);
const ARMS = [[0, BAR, 1.0], [Math.PI, BAR, 1.0], [Math.PI / 2, BAR * 1.6, 0.65], [Math.PI * 1.5, BAR * 1.6, 0.65]];
const armTheta = (arm, r) => arm[0] + K * Math.log(r / BAR);

// ---------------------------------------------------------------------------
// Real objects. l, b = galactic longitude/latitude (deg), distLy = distance from the Sun (light-years).
// kind: 'nebula' | 'snr' | 'open' | 'globular'. Sizes are exaggerated so they are visible at galaxy scale.
// ---------------------------------------------------------------------------
export const DEEP_SPACE_OBJECTS = [
  { id: 'm42', name: 'Orion Nebula (M42)', kind: 'nebula', l: 209.01, b: -19.38, distLy: 1344,
    desc: 'The nearest big star-forming region, ~1,340 ly away in the Orion Arm. Visible to the naked eye as the middle "star" of Orion’s sword.' },
  { id: 'm45', name: 'Pleiades (M45)', kind: 'open', l: 166.57, b: -23.52, distLy: 444,
    desc: 'The Seven Sisters: a young open cluster of hot blue stars (~100 million years old), ~444 ly away, wrapped in faint blue reflection nebulosity.' },
  { id: 'm16', name: 'Eagle Nebula (M16)', kind: 'nebula', l: 16.95, b: 0.79, distLy: 5700,
    desc: 'Home of the "Pillars of Creation" — columns of gas and dust where new stars are forming, ~5,700 ly away in the Sagittarius Arm.' },
  { id: 'm8', name: 'Lagoon Nebula (M8)', kind: 'nebula', l: 6.04, b: -1.20, distLy: 4100,
    desc: 'A giant glowing cloud in Sagittarius, ~4,100 ly away, bright enough to see with the naked eye from a dark site.' },
  { id: 'ngc3372', name: 'Carina Nebula', kind: 'nebula', l: 287.60, b: -0.63, distLy: 8500,
    desc: 'One of the largest, brightest nebulae in the sky (~8,500 ly away), four times bigger than Orion. Home of the unstable giant star Eta Carinae.' },
  { id: 'm1', name: 'Crab Nebula (M1)', kind: 'snr', l: 184.56, b: -5.78, distLy: 6500,
    desc: 'The wreck of a star that exploded as a supernova seen on Earth in 1054 AD. A spinning neutron star (pulsar) at its heart flashes 30 times a second.' },
  { id: 'omegacen', name: 'Omega Centauri', kind: 'globular', l: 309.10, b: 14.97, distLy: 17100,
    desc: 'The biggest globular cluster of the Milky Way: ~10 million stars in a ball ~150 ly wide. Possibly the core of a swallowed dwarf galaxy.' },
  { id: '47tuc', name: '47 Tucanae', kind: 'globular', l: 305.89, b: -44.89, distLy: 14700,
    desc: 'The second-brightest globular cluster, ~14,700 ly away, with a very dense core packed with millions of old stars.' },
  { id: 'm13', name: 'Great Hercules Cluster (M13)', kind: 'globular', l: 59.01, b: 40.91, distLy: 22200,
    desc: 'About 300,000 stars ~22,000 ly away. In 1974 the Arecibo radio message was beamed toward it.' },
  { id: 'm4', name: 'M4', kind: 'globular', l: 350.97, b: 15.97, distLy: 7200,
    desc: 'One of the closest globular clusters (~7,200 ly). Its stars are ~12 billion years old, nearly as old as the Universe.' },
  { id: 'm22', name: 'M22', kind: 'globular', l: 9.89, b: -7.55, distLy: 10600,
    desc: 'A bright globular cluster near the galactic bulge in Sagittarius, ~10,600 ly away.' },
  { id: 'm15', name: 'M15', kind: 'globular', l: 65.01, b: -27.31, distLy: 33600,
    desc: 'One of the densest globular clusters known (~33,600 ly away); its core may hide a black hole.' },
  { id: 'm3', name: 'M3', kind: 'globular', l: 42.22, b: 78.71, distLy: 33900,
    desc: 'About half a million stars, far above the galactic disk (~34,000 ly away) toward the north galactic pole.' },
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function mulberry32(seed) { // small seeded RNG so the layout is the same on every load
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// galactic (l, b, distance) → position in the galaxy group's local frame (same convention galaxy.js uses for M31)
export function galacticToLocal(lDeg, bDeg, distLy, sunPos, out = new THREE.Vector3()) {
  const gc = sunPos.clone().negate().normalize();                         // Sun → galactic center (l = 0)
  const l90 = new THREE.Vector3(0, 1, 0).cross(gc).normalize();           // l = 90°
  const l = lDeg * D2R, b = bDeg * D2R, d = distLy / 100;
  return out.copy(sunPos).addScaledVector(gc, d * Math.cos(b) * Math.cos(l)).addScaledVector(l90, d * Math.cos(b) * Math.sin(l)).addScaledVector(new THREE.Vector3(0, 1, 0), d * Math.sin(b));
}

// 2×2 atlas of cloudy nebula puffs (tiles 0–2) + a smooth round glow (tile 3); density lives in the alpha channel
function nebulaAtlas(T, rnd) {
  const cv = document.createElement('canvas'); cv.width = cv.height = T * 2;
  const g = cv.getContext('2d');
  const tile = document.createElement('canvas'); tile.width = tile.height = T;
  const tg = tile.getContext('2d');
  for (let k = 0; k < 4; k++) {
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, T, T);
    const h = T / 2;
    if (k === 3) {
      const gr = tg.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      tg.fillStyle = gr; tg.fillRect(0, 0, T, T);
    } else {
      tg.globalCompositeOperation = 'lighter';
      const n = 70;
      for (let i = 0; i < n; i++) {                                         // overlapping soft blobs → billowy cloud
        const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.8) * T * 0.3;
        const x = h + Math.cos(a) * rr, y = h + Math.sin(a) * rr * (0.6 + 0.4 * k / 2);
        const rad = T * (0.04 + rnd() * 0.16);
        const gr = tg.createRadialGradient(x, y, 0, x, y, rad);
        const al = 0.05 + rnd() * 0.12;
        gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        tg.fillStyle = gr; tg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      tg.globalCompositeOperation = 'destination-out';                      // carve darker holes / filaments
      for (let i = 0; i < 18; i++) {
        const x = h + (rnd() - 0.5) * T * 0.6, y = h + (rnd() - 0.5) * T * 0.6, rad = T * (0.03 + rnd() * 0.08);
        const gr = tg.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(0,0,0,${0.25 + rnd() * 0.35})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        tg.fillStyle = gr; tg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      tg.globalCompositeOperation = 'destination-in';                       // soft round edge so quads never show
      const m = tg.createRadialGradient(h, h, 0, h, h, h);
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.55, 'rgba(0,0,0,0.75)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      tg.fillStyle = m; tg.fillRect(0, 0, T, T);
    }
    g.drawImage(tile, (k % 2) * T, Math.floor(k / 2) * T);
  }
  return finishTex(cv);
}

// 2×2 atlas of dark dust filaments (wavy streaks of blobs)
function dustAtlas(T, rnd) {
  const cv = document.createElement('canvas'); cv.width = cv.height = T * 2;
  const g = cv.getContext('2d');
  const tile = document.createElement('canvas'); tile.width = tile.height = T;
  const tg = tile.getContext('2d');
  for (let k = 0; k < 4; k++) {
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, T, T);
    const h = T / 2, strands = 1 + (k % 2);
    for (let s = 0; s < strands; s++) {
      const ph = rnd() * 6.28, amp = T * (0.05 + rnd() * 0.08), off = (rnd() - 0.5) * T * 0.2, fr = 1.5 + rnd() * 2;
      for (let i = 0; i < 60; i++) {
        const u = i / 59, x = T * (0.1 + 0.8 * u), y = h + off + Math.sin(u * fr * 3.14 + ph) * amp + (rnd() - 0.5) * T * 0.06;
        const rad = T * (0.03 + rnd() * 0.07) * Math.sin(u * Math.PI);
        if (rad <= 0.5) continue;
        const gr = tg.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(255,255,255,${0.12 + rnd() * 0.15})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        tg.fillStyle = gr; tg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    tg.globalCompositeOperation = 'destination-in';
    const m = tg.createRadialGradient(h, h, 0, h, h, h);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.7, 'rgba(0,0,0,0.7)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    tg.fillStyle = m; tg.fillRect(0, 0, T, T);
    g.drawImage(tile, (k % 2) * T, Math.floor(k / 2) * T);
  }
  return finishTex(cv);
}

function finishTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  return t;
}

// Shared "pixels per world unit at distance 1" uniform, refreshed from the live renderer/camera before each draw.
function makeScaleHook(uScale) {
  const v = new THREE.Vector2();
  return (renderer, scene, camera) => {
    if (!camera.isPerspectiveCamera) return;
    renderer.getDrawingBufferSize(v);
    uScale.value = v.y * camera.projectionMatrix.elements[5] * 0.5;
  };
}

// Camera-facing textured quads (instanced). No gl_PointSize limits, so big clouds stay correct up close on iPad too.
const BB_VERT = /* glsl */`
  attribute vec3 iPos; attribute vec4 iColor; attribute vec3 iMisc; // iMisc = (size, rotation, atlas tile)
  uniform float uScale;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    float size = iMisc.x, c = cos(iMisc.y), s = sin(iMisc.y);
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float dz = max(-mv.z, 1e-3);
    mv.xy += mat2(c, s, -s, c) * position.xy * size;
    float px = size * uScale / dz;                                // on-screen size in px
    float fade = smoothstep(1.5, 8.0, px)                         // sub-pixel when far → fade out instead of sparkling
               * smoothstep(size * 0.5, size * 2.0, dz)           // camera inside the cloud → fade out (no blow-out)
               * (1.0 - 0.6 * smoothstep(0.15, 0.6, size / dz));  // dim clouds that fill a big part of the screen
    vCol = vec4(iColor.rgb, iColor.a * fade);
    vUv = (position.xy + 0.5 + vec2(mod(iMisc.z, 2.0), floor(iMisc.z / 2.0))) * 0.5;
    gl_Position = projectionMatrix * mv;
  }`;
const BB_FRAG_ADD = /* glsl */`
  uniform sampler2D map; uniform float uIntensity; varying vec2 vUv; varying vec4 vCol;
  void main() { float a = texture2D(map, vUv).a * vCol.a * uIntensity; if (a < 0.002) discard; gl_FragColor = vec4(vCol.rgb * a, 1.0); }`;
const BB_FRAG_DARK = /* glsl */`
  uniform sampler2D map; uniform float uIntensity; varying vec2 vUv; varying vec4 vCol;
  void main() { float a = texture2D(map, vUv).a * vCol.a * uIntensity; if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, a); }`;

function billboards(list, map, { dark = false, intensity = 1, uScale, renderOrder = 2 }) {
  const n = list.length;
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.getAttribute('position'));
  const p = new Float32Array(n * 3), c = new Float32Array(n * 4), m = new Float32Array(n * 3);
  list.forEach((b, i) => { p.set([b.x, b.y, b.z], i * 3); c.set([b.r, b.g, b.b, b.a], i * 4); m.set([b.size, b.rot, b.tile], i * 3); });
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(p, 3));
  geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(c, 4));
  geo.setAttribute('iMisc', new THREE.InstancedBufferAttribute(m, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uScale, uIntensity: { value: intensity } },
    vertexShader: BB_VERT, fragmentShader: dark ? BB_FRAG_DARK : BB_FRAG_ADD,
    transparent: true, depthWrite: false, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = renderOrder;
  mesh.onBeforeRender = makeScaleHook(uScale);
  return mesh;
}

// Star points: same look/size convention as galaxy.js particles (size × uScale / depth)
const PT_VERT = /* glsl */`
  attribute float size; attribute vec3 aColor; uniform float uScale, uBright; varying vec3 vColor; varying float vFade;
  void main() {
    vColor = aColor * uBright; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ps = size * uScale / -mv.z; vFade = clamp(ps * ps, 0.0, 1.0);
    gl_PointSize = clamp(ps, 1.0, 64.0); gl_Position = projectionMatrix * mv;
  }`;
const PT_FRAG = /* glsl */`
  varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8); gl_FragColor = vec4(vColor * a * vFade, 1.0); }`;

function starPoints(pts, { bright = 0.5, uScale, renderOrder = 1 }) {
  const n = pts.length, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
  pts.forEach((q, i) => { p.set([q.x, q.y, q.z], i * 3); c.set([q.r, q.g, q.b], i * 3); s[i] = q.size; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale, uBright: { value: bright } }, vertexShader: PT_VERT, fragmentShader: PT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false; obj.renderOrder = renderOrder;
  obj.onBeforeRender = makeScaleHook(uScale);
  return obj;
}

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------
/**
 * @param galaxy  object returned by createGalaxy() (uses .group, .SUN_POS, .R) — or a THREE.Group, then pass opts.sunPos.
 * @param opts    { isTouch=false, nebulae=true, dust=true, objects=true, halo=true, armKnots=true, labels=false,
 *                  intensity=1, seed=7 }
 * @returns {{ group, objects, update(camera), setVisible(v), dispose() }}
 */
export function addDeepSpace(galaxy, opts = {}) {
  const parent = galaxy.isObject3D ? galaxy : galaxy.group;
  const sunPos = (opts.sunPos || galaxy.SUN_POS || new THREE.Vector3(260, 0, 0)).clone();
  const R = opts.R || galaxy.R || 500;
  const { isTouch = false, nebulae = true, dust = true, objects = true, halo = true, armKnots = true, labels = false,
    intensity = 1, seed = 7 } = opts;
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pickArm = (() => { const w = ARMS.map((a) => a[2]), sum = w.reduce((a, b) => a + b, 0);
    return () => { let x = rnd() * sum, k = 0; while (x > w[k]) { x -= w[k]; k++; } return ARMS[k]; }; })();
  const sunR = Math.hypot(sunPos.x, sunPos.z), sunTheta = Math.atan2(sunPos.z, sunPos.x);

  const group = new THREE.Group();
  group.name = 'DeepSpace';
  parent.add(group);
  const uScale = { value: 800 };
  const nebTex = nebulaAtlas(isTouch ? 128 : 256, rnd);
  const dustTex = dustAtlas(isTouch ? 128 : 256, rnd);
  const glows = [], darks = [], stars = [];
  const HA = [1.0, 0.33, 0.52], HA2 = [1.0, 0.5, 0.62], OIII = [0.45, 0.85, 1.0], BLUE = [0.62, 0.78, 1.0];
  const cloud = (x, y, z, size, col, a, tile = Math.floor(rnd() * 3)) => glows.push({ x, y, z, size, r: col[0], g: col[1], b: col[2], a, rot: rnd() * 6.283, tile });

  // positions on an arm (theta offset > 0 = just downstream/outside the dust lane, where H II regions light up)
  const onArm = (arm, r, dTheta, spreadK = 1) => {
    const th = armTheta(arm, r) + dTheta, sp = (3 + 0.03 * r) * spreadK;
    return [Math.cos(th) * r + gauss() * sp, Math.sin(th) * r + gauss() * sp];
  };
  const onSpur = (r) => { const th = sunTheta + K * Math.log(r / sunR) * 0.8, sp = 4 + 0.03 * r; return [Math.cos(th) * r + gauss() * sp, Math.sin(th) * r + gauss() * sp]; };

  // 1) emission nebulae: H II complexes along the arms
  if (nebulae) {
    const NC = isTouch ? 40 : 95;
    for (let i = 0; i < NC; i++) {
      const spur = rnd() < 0.08, arm = pickArm();
      const r = spur ? sunR + gauss() * 50 : arm[1] * 1.3 + (R * 0.92 - arm[1] * 1.3) * Math.pow(rnd(), 1.1);
      const [x, z] = spur ? onSpur(r) : onArm(arm, r, 0.03 + gauss() * 0.025);
      const y = gauss() * 1.5;
      const big = 9 + rnd() * 14 * (1 - 0.4 * r / R);
      const puffs = isTouch ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < puffs; k++) {
        const s = big * (0.55 + rnd() * 0.6);
        cloud(x + gauss() * big * 0.35, y + gauss() * 0.8, z + gauss() * big * 0.35, s, rnd() < 0.5 ? HA : HA2, 0.22 + rnd() * 0.14);
      }
      cloud(x, y, z, big * 0.4, rnd() < 0.25 ? OIII : [1.0, 0.72, 0.82], 0.32, 3);                 // hot ionized core
      if (dust && rnd() < 0.5) darks.push({ x: x + gauss() * big * 0.3, y: y + 0.5, z: z + gauss() * big * 0.3, size: big * (0.6 + rnd() * 0.5),
        r: 0.03, g: 0.02, b: 0.015, a: 0.45, rot: rnd() * 6.283, tile: Math.floor(rnd() * 4) });       // dark globule cutting into it
    }
  }

  // 2) dark dust clouds along the inner edges of the arms (same lane offset galaxy.js uses: −0.16 rad)
  if (dust) {
    const ND = isTouch ? 70 : 180;
    for (let i = 0; i < ND; i++) {
      const arm = ARMS[i % 4], r = arm[1] * 1.15 + (R * 0.85 - arm[1] * 1.15) * Math.pow(rnd(), 1.05);
      const [x, z] = onArm(arm, r, -0.16 + gauss() * 0.02, 0.8);
      darks.push({ x, y: gauss() * 1.2, z, size: 14 + rnd() * 22 * (1 - 0.35 * r / R), r: 0.035, g: 0.024, b: 0.018, a: 0.32 + rnd() * 0.18,
        rot: rnd() * 6.283, tile: Math.floor(rnd() * 4) });
    }
  }

  // 3) optional: young blue star knots (OB associations) along the arms, each with a faint blue glow
  if (armKnots) {
    const NK = isTouch ? 70 : 200, per = isTouch ? 7 : 14;
    for (let i = 0; i < NK; i++) {
      const arm = pickArm(), r = arm[1] * 1.2 + (R * 0.95 - arm[1] * 1.2) * Math.pow(rnd(), 1.0);
      const [x, z] = onArm(arm, r, 0.05 + gauss() * 0.03, 0.9), y = gauss() * 1.5, sp = 1.5 + rnd() * 2.5;
      for (let k = 0; k < per; k++) {
        const v = 0.7 + rnd() * 0.6;
        stars.push({ x: x + gauss() * sp, y: y + gauss() * sp * 0.4, z: z + gauss() * sp, r: BLUE[0] * v, g: BLUE[1] * v, b: BLUE[2] * v, size: 2.5 + rnd() * 3 });
      }
      cloud(x, y, z, sp * 6, [0.45, 0.6, 1.0], 0.1, 3);
    }
  }

  // 4) halo: ~150 globular clusters, concentrated toward the center, spherical distribution
  const haloPts = [];
  if (halo) {
    const NG = isTouch ? 70 : 150;
    for (let i = 0; i < NG; i++) {
      const rr = Math.min(R * 1.4, 25 + 90 * -Math.log(1 - rnd() * 0.97));
      const ct = rnd() * 2 - 1, ph = rnd() * 6.283, st = Math.sqrt(1 - ct * ct);
      const v = 0.75 + rnd() * 0.35;
      haloPts.push({ x: rr * st * Math.cos(ph), y: rr * ct, z: rr * st * Math.sin(ph), r: 1.0 * v, g: 0.86 * v, b: 0.66 * v, size: 6 + rnd() * 4 });
    }
  }

  // 5) named objects at their real galactic positions relative to the Sun marker
  const named = [];
  if (objects) {
    for (const o of DEEP_SPACE_OBJECTS) {
      const p = galacticToLocal(o.l, o.b, o.distLy, sunPos);
      const entry = { ...o, position: p.clone() };
      named.push(entry);
      if (o.kind === 'nebula') {
        const S = o.id === 'ngc3372' ? 13 : o.id === 'm42' ? 6 : 8;            // exaggerated sizes
        for (let k = 0; k < (isTouch ? 3 : 5); k++) cloud(p.x + gauss() * S * 0.3, p.y + gauss() * S * 0.3, p.z + gauss() * S * 0.3, S * (0.6 + rnd() * 0.5), rnd() < 0.6 ? HA : HA2, 0.26);
        cloud(p.x, p.y, p.z, S * 0.45, [1.0, 0.78, 0.86], 0.4, 3);
        if (dust) darks.push({ x: p.x + S * 0.2, y: p.y, z: p.z - S * 0.15, size: S * 0.7, r: 0.03, g: 0.02, b: 0.015, a: 0.5, rot: rnd() * 6.283, tile: 1 });
        entry.size = S;
      } else if (o.kind === 'snr') {                                           // Crab: compact orange filaments around a blue-white core
        cloud(p.x, p.y, p.z, 3.5, [1.0, 0.55, 0.3], 0.35, 0);
        cloud(p.x, p.y, p.z, 2.4, [0.55, 0.75, 1.0], 0.35, 3);
        entry.size = 3.5;
      } else if (o.kind === 'open') {                                          // Pleiades: a few hot blue stars + reflection haze
        for (let k = 0; k < (isTouch ? 9 : 14); k++) {
          const v = 0.9 + rnd() * 0.5;
          stars.push({ x: p.x + gauss() * 0.7, y: p.y + gauss() * 0.7, z: p.z + gauss() * 0.7, r: 0.7 * v, g: 0.84 * v, b: 1.0 * v, size: 1.6 + rnd() * 1.6 });
        }
        cloud(p.x, p.y, p.z, 4, [0.4, 0.6, 1.0], 0.3, 0);
        entry.size = 3;
      } else {                                                                 // globular: dense ball of old yellowish stars + glow
        const big = o.id === 'omegacen' || o.id === '47tuc', rc = big ? 1.8 : 1.3, n = isTouch ? (big ? 110 : 70) : (big ? 300 : 180);
        for (let k = 0; k < n; k++) {
          const rr = rc * Math.pow(-Math.log(1 - rnd() * 0.985), 1.4), ct = rnd() * 2 - 1, ph = rnd() * 6.283, st = Math.sqrt(1 - ct * ct), v = 0.4 + rnd() * 0.4;
          stars.push({ x: p.x + rr * st * Math.cos(ph), y: p.y + rr * ct, z: p.z + rr * st * Math.sin(ph), r: v, g: 0.88 * v, b: 0.68 * v, size: 1.3 + rnd() * 1.4 });
        }
        cloud(p.x, p.y, p.z, rc * 9, [1.0, 0.85, 0.6], 0.26, 3);
        entry.size = rc * 4;
      }
    }
  }

  const parts = [];
  if (darks.length) { const m = billboards(darks, dustTex, { dark: true, intensity: 1, uScale, renderOrder: 2.5 }); m.name = 'DeepSpaceDust'; parts.push(m); }
  if (glows.length) { const m = billboards(glows, nebTex, { intensity: (isTouch ? 1.1 : 1) * intensity, uScale, renderOrder: 2.7 }); m.name = 'DeepSpaceNebulae'; parts.push(m); }
  if (stars.length) { const m = starPoints(stars, { bright: isTouch ? 0.75 : 0.6, uScale, renderOrder: 1.5 }); m.name = 'DeepSpaceStars'; parts.push(m); }
  if (haloPts.length) { const m = starPoints(haloPts, { bright: isTouch ? 0.65 : 0.55, uScale, renderOrder: 1.5 }); m.name = 'DeepSpaceHalo'; parts.push(m); }
  group.add(...parts);

  // optional labels (CSS2D, same classes as galaxy.js labels so the live style.css applies). Hidden unless the camera is near.
  const labelObjs = [];
  if (labels && named.length) {
    for (const e of named) {
      const wrap = document.createElement('div'); wrap.className = 'galaxy-label-wrap';
      const el = document.createElement('div'); el.className = 'label galaxy-label small deep-label off';
      el.textContent = e.name; el.dataset.deepId = e.id; wrap.appendChild(el);
      const obj = new CSS2DObject(wrap); obj.position.copy(e.position); group.add(obj);
      // nearby objects (within ~2,000 ly of the Sun) only make sense when zoomed in close to the marker
      const range = e.distLy < 2000 ? 160 : e.kind === 'globular' ? 1400 : 700;
      labelObjs.push({ e, el, obj, range });
      e.labelEl = el;
    }
  }

  const tmp = new THREE.Vector3();
  return {
    group,
    objects: named,           // [{ id, name, kind, desc, l, b, distLy, position (group-local), size, labelEl? }]
    counts: { nebulaSprites: glows.length, dustSprites: darks.length, stars: stars.length, halo: haloPts.length },
    update(camera) {
      for (const L of labelObjs) L.el.classList.toggle('off', camera.position.distanceTo(L.obj.getWorldPosition(tmp)) > L.range);
    },
    setVisible(v) { group.visible = v; for (const L of labelObjs) L.obj.visible = v; },
    dispose() {
      for (const L of labelObjs) { L.obj.removeFromParent(); L.obj.element.remove(); }
      for (const m of parts) { m.geometry.dispose(); m.material.dispose(); }
      nebTex.dispose(); dustTex.dispose(); group.removeFromParent();
    },
  };
}
