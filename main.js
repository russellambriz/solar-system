// Interactive 3D Solar System — Three.js (ES modules from CDN, no build step)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Data (real values) — sizes/distances are scaled below for visibility
// ---------------------------------------------------------------------------
// Touch device detection (iPadOS Safari reports a "Macintosh" UA, so also check maxTouchPoints)
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
document.body.classList.toggle('touch', IS_TOUCH);

const EARTH_DIAMETER = 12742; // km
const SPIN_SLOWDOWN = 50;     // self-rotation is shown 50x slower than real
const J2000 = Date.UTC(2000, 0, 1, 12); // epoch for mean longitudes

const PLANETS = [
  { name: 'Mercury', type: 'Terrestrial planet', diameter: 4879, au: 0.387, period: 87.97, rotation: 58.65, tilt: 0.03, L0: 252.25, color: '#9e9a95',
    fact: 'A solar day on Mercury (sunrise to sunrise) lasts about 176 Earth days — that is two full Mercury years!' },
  { name: 'Venus', type: 'Terrestrial planet', diameter: 12104, au: 0.723, period: 224.70, rotation: -243.02, tilt: 177.4, L0: 181.98, color: '#e3c58c',
    fact: 'Venus is the hottest planet (~465 °C) even though Mercury is closer to the Sun, thanks to its runaway greenhouse effect. It also spins backwards.' },
  { name: 'Earth', type: 'Terrestrial planet', diameter: 12742, au: 1.0, period: 365.256, rotation: 0.997, tilt: 23.44, L0: 100.46, color: '#3d7bd9',
    fact: 'The only place known to host life. Light from the Sun takes about 8 minutes 20 seconds to reach us.' },
  { name: 'Mars', type: 'Terrestrial planet', diameter: 6779, au: 1.524, period: 686.98, rotation: 1.026, tilt: 25.19, L0: 355.45, color: '#c1440e',
    fact: 'Home of Olympus Mons, the tallest volcano in the solar system — about 22 km high, roughly 2.5× the height of Mount Everest.' },
  { name: 'Jupiter', type: 'Gas giant', diameter: 139820, au: 5.203, period: 4332.59, rotation: 0.414, tilt: 3.13, L0: 34.40, color: '#d8b48a',
    fact: 'Jupiter is so big that all the other planets could fit inside it. Its Great Red Spot is a storm wider than Earth that has raged for centuries.' },
  { name: 'Saturn', type: 'Gas giant', diameter: 116460, au: 9.537, period: 10759.22, rotation: 0.444, tilt: 26.73, L0: 49.94, color: '#e6d39c',
    fact: 'Saturn’s average density is lower than water — it would float in a (very, very large) bathtub. Its rings are mostly ice, yet only ~10 m thick in places.' },
  { name: 'Uranus', type: 'Ice giant', diameter: 50724, au: 19.19, period: 30688.5, rotation: -0.718, tilt: 97.77, L0: 313.23, color: '#9fdfe6',
    fact: 'Uranus is tipped on its side (98° tilt), so each pole gets about 42 years of continuous sunlight followed by 42 years of darkness.' },
  { name: 'Neptune', type: 'Ice giant', diameter: 49244, au: 30.07, period: 60182, rotation: 0.671, tilt: 28.32, L0: 304.88, color: '#3f5fd6',
    fact: 'Neptune was found by math before it was seen: astronomers predicted it from wobbles in Uranus’s orbit (1846). Its winds reach ~2,100 km/h.' },
];

const SUN_INFO = {
  name: 'Sun', type: 'G-type main-sequence star', diameter: 1392700, color: '#ffcc55',
  distanceText: '— (center)', periodText: '~230 million years around the galaxy', dayText: '~25 days (equator)',
  fact: 'The Sun holds 99.86% of all the mass in the solar system. About 1.3 million Earths could fit inside it.',
};
const MOON_INFO = {
  name: 'Moon', type: 'Natural satellite of Earth', diameter: 3474, period: 27.32, color: '#bbbbbb',
  fact: 'The Moon is tidally locked, so we always see the same side. It drifts about 3.8 cm farther from Earth every year.',
};

// Scaling for visibility
const SUN_RADIUS = 5;
const scaleDistance = (au) => 6 + 14 * Math.pow(au, 0.55);
const scaleRadius = (km) => 0.95 * Math.sqrt(km / EARTH_DIAMETER);

// ---------------------------------------------------------------------------
// Renderer, scene, camera, controls
// ---------------------------------------------------------------------------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 6000);
const OVERVIEW_POS = new THREE.Vector3(0, 80, 140);
camera.position.copy(OVERVIEW_POS);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 1200;

scene.add(new THREE.AmbientLight(0xffffff, 0.12));
const sunLight = new THREE.PointLight(0xfff2dd, 3.2, 0, 0); // decay 0: no falloff, so outer planets stay visible
scene.add(sunLight);

// ---------------------------------------------------------------------------
// Procedural texture helpers (seamless 3D value noise sampled on the sphere)
// ---------------------------------------------------------------------------
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256).map(() => rand());
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf);
  };
  return (x, y, z, octaves = 5) => {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * noise(x * freq, y * freq, z * freq); norm += amp; amp *= 0.5; freq *= 2; }
    return sum / norm; // 0..1
  };
}

const hex = (c) => { const v = new THREE.Color(c); return [v.r * 255, v.g * 255, v.b * 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Generate an equirectangular texture. shade(x,y,z,lat,lon) -> [r,g,b] or [r,g,b,a]
const TEX_W = IS_TOUCH ? 384 : 512; // smaller procedural textures on tablets = faster startup
function sphereTexture(shade, w = TEX_W, h = TEX_W / 2) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const lat = Math.PI / 2 - (j + 0.5) / h * Math.PI;
    const cl = Math.cos(lat), y = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = (i + 0.5) / w * Math.PI * 2;
      const c = shade(cl * Math.cos(lon), y, cl * Math.sin(lon), lat, lon);
      const k = (j * w + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Banded gas giant: palette sampled by latitude, warped by noise
function bandedTexture(seed, palette, { warp = 0.08, freq = 3, turbulence = 0.6, spot = null } = {}) {
  const n = makeNoise(seed);
  const cols = palette.map(hex);
  return sphereTexture((x, y, z, lat, lon) => {
    const t0 = n(x * freq, y * freq * 6, z * freq, 4);
    let v = (y + 1) / 2 + (t0 - 0.5) * warp;
    let f = clamp01(v) * (cols.length - 1) * 2.0; // repeat palette twice across latitudes
    f = f % (cols.length - 1);
    const idx = Math.floor(f);
    let c = mix(cols[idx], cols[Math.min(idx + 1, cols.length - 1)], f - idx);
    const d = n(x * 12, y * 30, z * 12, 3);
    c = mix(c, [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], d * turbulence);
    if (spot) {
      const dl = (lat - spot.lat) / spot.h;
      const dn = Math.atan2(Math.sin(lon - spot.lon), Math.cos(lon - spot.lon)) / spot.w;
      const r = dl * dl + dn * dn;
      if (r < 1) c = mix(c, hex(spot.color), (1 - r) * 0.85);
    }
    return c;
  });
}

function rockyTexture(seed, dark, light, { freq = 3, craters = 0, caps = null } = {}) {
  const n = makeNoise(seed);
  const a = hex(dark), b = hex(light);
  return sphereTexture((x, y, z, lat) => {
    let v = n(x * freq, y * freq, z * freq, 6);
    if (craters) {
      const c = n(x * 18, y * 18, z * 18, 2);
      v -= Math.max(0, c - 0.62) * craters;
    }
    let col = mix(a, b, clamp01((v - 0.25) * 1.8));
    if (caps && Math.abs(lat) > caps - (n(x * 8, y * 8, z * 8, 3) - 0.5) * 0.15) col = [240, 240, 245];
    return col;
  });
}

function earthTexture() {
  const n = makeNoise(7);
  const deep = hex('#0b2a6b'), shallow = hex('#1f5fbf'), green = hex('#2f6b2a'), dry = hex('#9c8452'), ice = [240, 244, 250];
  return sphereTexture((x, y, z, lat) => {
    const v = n(x * 2.2, y * 2.2, z * 2.2, 6);
    const absLat = Math.abs(lat);
    if (absLat > 1.25 + (n(x * 6, y * 6, z * 6, 3) - 0.5) * 0.3) return ice;
    if (v < 0.52) return mix(deep, shallow, clamp01((v - 0.3) / 0.22));
    const desert = clamp01(1 - Math.abs(absLat - 0.4) * 4) * n(x * 5 + 9, y * 5, z * 5, 3);
    return mix(green, dry, clamp01(desert * 1.6 + (v - 0.52) * 2));
  });
}

function cloudTexture() {
  const n = makeNoise(21);
  return sphereTexture((x, y, z) => {
    const v = n(x * 3, y * 5, z * 3, 6);
    const a = clamp01((v - 0.5) * 3.2) * 255;
    return [255, 255, 255, a];
  });
}

function sunTexture() {
  const n = makeNoise(3);
  const a = hex('#ff8a1e'), b = hex('#ffe680');
  return sphereTexture((x, y, z) => mix(a, b, clamp01((n(x * 6, y * 6, z * 6, 5) - 0.3) * 2)));
}

function glowTexture(inner = 'rgba(255,230,150,1)', mid = 'rgba(255,170,60,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner); grad.addColorStop(0.2, mid); grad.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 4;
  const g = c.getContext('2d');
  const n = makeNoise(11);
  for (let i = 0; i < 512; i++) {
    const t = i / 512;
    let a = 0.35 + 0.55 * n(t * 40, 0.5, 0.5, 4);
    if (t > 0.56 && t < 0.62) a *= 0.08;        // Cassini division
    if (t < 0.12) a *= t / 0.12 * 0.5;          // faint inner C ring
    if (t > 0.9) a *= (1 - t) / 0.1;            // fade out edge
    const shade = 180 + 60 * n(t * 25, 3.3, 1.1, 3);
    g.fillStyle = `rgba(${shade + 20 | 0},${shade | 0},${shade - 40 | 0},${a.toFixed(3)})`;
    g.fillRect(i, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function uranusRingTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 4;
  const g = c.getContext('2d');
  for (const [pos, w, a] of [[0.15, 3, 0.5], [0.45, 2, 0.4], [0.85, 5, 0.8]]) {
    g.fillStyle = `rgba(200,230,240,${a})`; g.fillRect(pos * 128, 0, w, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeRing(inner, outer, texture, opacity = 1) {
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {        // map u radially so the strip texture becomes bands
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

const TEXTURES = {
  Mercury: () => rockyTexture(1, '#4f4b47', '#b5b0aa', { freq: 4, craters: 2.5 }),
  Venus: () => bandedTexture(2, ['#c9a76a', '#e8d3a2', '#d9b97e', '#f0e0b8'], { warp: 0.5, freq: 2, turbulence: 0.4 }),
  Earth: earthTexture,
  Mars: () => rockyTexture(4, '#7a2c10', '#d9733a', { freq: 3, craters: 0.8, caps: 1.3 }),
  Jupiter: () => bandedTexture(5, ['#c9a27a', '#f2e3c8', '#a8754d', '#e9d2ad', '#8f6340', '#f5ead6'],
    { warp: 0.06, spot: { lat: -0.38, lon: 2.0, w: 0.32, h: 0.12, color: '#b4482a' } }),
  Saturn: () => bandedTexture(6, ['#d9c08a', '#efe0b5', '#c7a96e', '#e8d7a6', '#bfa46c'], { warp: 0.04, turbulence: 0.35 }),
  Uranus: () => bandedTexture(8, ['#9fdfe6', '#b5ecf0', '#8fd2dc', '#a8e5ea'], { warp: 0.03, turbulence: 0.15 }),
  Neptune: () => bandedTexture(9, ['#2f4fc4', '#4a6fe0', '#2a44a8', '#5b80ea'],
    { warp: 0.07, turbulence: 0.35, spot: { lat: -0.35, lon: 4.0, w: 0.25, h: 0.1, color: '#1a2a70' } }),
  Moon: () => rockyTexture(12, '#5c5c5c', '#c8c8c8', { freq: 4, craters: 2.0 }),
};

// ---------------------------------------------------------------------------
// Build scene objects
// ---------------------------------------------------------------------------
const bodies = [];         // selectable things: { name, info, group, mesh, radius, labelEl }
const pickTargets = [];    // meshes used for raycasting (invisible enlarged spheres)
const orbitLines = [];

function addLabel(parent, text, yOffset, small = false) {
  const el = document.createElement('div');
  el.className = 'label' + (small ? ' small' : '');
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(0, yOffset, 0);
  parent.add(obj);
  el._obj = obj;
  return el;
}

function addPickSphere(parent, radius, body) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 1.4, 0.9), 16, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.userData.body = body;
  parent.add(m);
  pickTargets.push(m);
}

function orbitLine(radius, color = 0x6f86c9, opacity = 0.28) {
  const pts = [];
  for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  orbitLines.push(line);
  return line;
}

// Sun
const sunGroup = new THREE.Group();
scene.add(sunGroup);
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 48), new THREE.MeshBasicMaterial({ map: sunTexture() }));
sunGroup.add(sunMesh);
const glow1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glow1.scale.set(SUN_RADIUS * 5, SUN_RADIUS * 5, 1);
const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,120,0.5)', 'rgba(255,140,40,0.12)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glow2.scale.set(SUN_RADIUS * 11, SUN_RADIUS * 11, 1);
sunGroup.add(glow1, glow2);
const sunBody = { name: 'Sun', info: SUN_INFO, group: sunGroup, mesh: sunMesh, radius: SUN_RADIUS };
sunBody.labelEl = addLabel(sunGroup, 'Sun', SUN_RADIUS + 1.5);
addPickSphere(sunGroup, SUN_RADIUS / 1.4, sunBody);
bodies.push(sunBody);

// Planets
for (const p of PLANETS) {
  const radius = scaleRadius(p.diameter);
  const dist = scaleDistance(p.au);
  const group = new THREE.Group();          // moves along the orbit (no rotation)
  const tiltGroup = new THREE.Group();      // axial tilt
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.tilt);
  group.add(tiltGroup);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48),
    new THREE.MeshStandardMaterial({ map: TEXTURES[p.name](), roughness: 0.95, metalness: 0 }));
  tiltGroup.add(mesh);
  scene.add(group);
  scene.add(orbitLine(dist));

  const body = { name: p.name, info: p, group, mesh, radius, dist, tiltGroup };
  body.labelEl = addLabel(group, p.name, radius + 0.9);
  addPickSphere(group, radius, body);
  bodies.push(body);

  if (p.name === 'Earth') {
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.02, 64, 48),
      new THREE.MeshStandardMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, roughness: 1 }));
    tiltGroup.add(clouds);
    body.clouds = clouds;

    // Moon
    const moonDist = radius * 2.6;
    const moonPivot = new THREE.Group();
    moonPivot.rotation.z = THREE.MathUtils.degToRad(5.1); // orbit inclination
    group.add(moonPivot);
    const moonR = scaleRadius(MOON_INFO.diameter) * 0.8;
    const moonGroup = new THREE.Group();
    moonPivot.add(moonGroup);
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(moonR, 32, 24),
      new THREE.MeshStandardMaterial({ map: TEXTURES.Moon(), roughness: 1 }));
    moonGroup.add(moonMesh);
    moonPivot.add(orbitLine(moonDist, 0x9aa6c8, 0.22));
    const moonBody = { name: 'Moon', info: MOON_INFO, group: moonGroup, mesh: moonMesh, radius: moonR, moonDist, isMoon: true };
    moonBody.labelEl = addLabel(moonGroup, 'Moon', moonR + 0.5, true);
    addPickSphere(moonGroup, moonR * 0.8, moonBody);
    bodies.push(moonBody);
  }
  if (p.name === 'Saturn') tiltGroup.add(makeRing(radius * 1.25, radius * 2.35, ringTexture(), 0.95));
  if (p.name === 'Uranus') tiltGroup.add(makeRing(radius * 1.6, radius * 2.0, uranusRingTexture(), 0.5));
}

// Starfield
{
  const N = IS_TOUCH ? 5000 : 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const r = 1500 + Math.random() * 1500;
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    const t = Math.random();
    c.setHSL(t < 0.15 ? 0.6 : t < 0.25 ? 0.08 : 0.15, t < 0.25 ? 0.6 : 0.05, 0.6 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const g = dot.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 7, vertexColors: true, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, sizeAttenuation: true })));
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const speedSlider = $('speed'), speedValue = $('speed-value'), pauseBtn = $('pause-btn');
let paused = false;
let daysPerSecond = 10;
let simTime = Date.now();                    // simulated date in ms; starts "now"

function sliderToSpeed(v) { return v <= 0 ? 0 : 0.1 * Math.pow(10, v / 25); } // 0 → paused, 50 → 10 d/s, 100 → 1000 d/s
function fmtSpeed(d) {
  if (d === 0) return 'Paused';
  if (d < 1) return `${(d * 24).toFixed(1)} hours/s`;
  if (d < 365) return `${d < 10 ? d.toFixed(1) : Math.round(d)} days/s`;
  return `${(d / 365.25).toFixed(1)} years/s`;
}
function updateSpeed() {
  daysPerSecond = sliderToSpeed(+speedSlider.value);
  speedValue.textContent = paused ? 'Paused' : fmtSpeed(daysPerSecond);
  pauseBtn.textContent = paused || daysPerSecond === 0 ? '▶ Play' : '⏸ Pause';
}
function togglePause() {
  if (daysPerSecond === 0) { speedSlider.value = 50; paused = false; } else paused = !paused;
  updateSpeed();
}
speedSlider.addEventListener('input', () => { paused = false; updateSpeed(); });
pauseBtn.addEventListener('click', togglePause);
$('toggle-orbits').addEventListener('change', (e) => orbitLines.forEach((l) => (l.visible = e.target.checked)));
$('toggle-labels').addEventListener('change', (e) => (labelRenderer.domElement.style.display = e.target.checked ? '' : 'none'));
$('overview-btn').addEventListener('click', () => goOverview());
$('close-info').addEventListener('click', () => goOverview());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') goOverview();
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') { e.preventDefault(); togglePause(); }
});
updateSpeed();

// Body list buttons
const list = $('body-list');
for (const b of bodies) {
  const btn = document.createElement('button');
  btn.innerHTML = `<span class="dot" style="background:${b.info.color}"></span>${b.name}`;
  if (b.isMoon) btn.style.paddingLeft = '22px';
  btn.addEventListener('click', () => focusOn(b));
  b.button = btn;
  list.appendChild(btn);
  b.labelEl.addEventListener('click', (e) => {
    e.stopPropagation();
    // A label can sit on top of another planet's disc (e.g. the Sun's label over Mars).
    // If the tap is on a planet's visible disc (±4px), prefer that planet; otherwise focus the label's body.
    const under = pick(e.clientX, e.clientY, IS_TOUCH ? 4 : 2);
    focusOn(under && under !== b && under.name !== 'Sun' ? under : b);
  });
  b.labelEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovered = b; });
  b.labelEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hovered === b) hovered = null; });
}

function fmtNum(n) { return n.toLocaleString('en-US'); }
function fmtPeriod(days) {
  return days < 1000 ? `${fmtNum(+days.toFixed(2))} days` : `${(days / 365.25).toFixed(2)} years (${fmtNum(Math.round(days))} days)`;
}
function fmtDay(rotDays) {
  const d = Math.abs(rotDays), retro = rotDays < 0 ? ' (retrograde)' : '';
  return (d < 2 ? `${(d * 24).toFixed(1)} hours` : `${d.toFixed(1)} Earth days`) + retro;
}
function showInfo(b) {
  const i = b.info;
  $('info-name').textContent = i.name;
  $('info-name').style.color = i.color;
  $('info-type').textContent = i.type;
  $('info-diameter').textContent = `${fmtNum(i.diameter)} km` + (b.name !== 'Earth' ? ` (${(i.diameter / EARTH_DIAMETER).toFixed(2)}× Earth)` : '');
  if (b.isMoon) {
    $('info-distance-label').textContent = 'Distance from Earth';
    $('info-distance').textContent = '384,400 km (0.00257 AU)';
    $('info-period').textContent = '27.32 days (around Earth)';
    $('info-day').textContent = '27.3 days (tidally locked)';
  } else if (b.name === 'Sun') {
    $('info-distance-label').textContent = 'Distance from Sun';
    $('info-distance').textContent = i.distanceText;
    $('info-period').textContent = i.periodText;
    $('info-day').textContent = i.dayText;
  } else {
    $('info-distance-label').textContent = 'Distance from Sun';
    $('info-distance').textContent = `${i.au} AU (${fmtNum(Math.round(i.au * 149.6))} million km)`;
    $('info-period').textContent = fmtPeriod(i.period);
    $('info-day').textContent = fmtDay(i.rotation);
  }
  $('info-fact').textContent = '💡 ' + i.fact;
  $('info-panel').classList.remove('hidden');
  $('info-panel').scrollTop = 0;
  document.body.classList.add('info-open');
}

// ---------------------------------------------------------------------------
// Picking (click vs. drag detection)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const _proj = new THREE.Vector3();
let hovered = null;

// Picking: every body gets a score = (screen distance from tap to its center) / (its on-screen radius + finger slop).
// Lowest score wins, so tiny planets near a big one (e.g. Mars in front of the Sun) are still easy to tap.
// The invisible enlarged hit spheres are raycast too; the body they hit gets a small bonus (helps with occlusion).
function pick(clientX, clientY, slopPx) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets, false);
  const rayBody = hits.length ? hits[0].object.userData.body : null;
  let best = null, bestScore = Infinity;
  const fovScale = r.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  for (const b of bodies) {
    b.group.getWorldPosition(_proj);
    const dist = _proj.distanceTo(camera.position);
    _proj.project(camera);
    if (_proj.z > 1) continue; // behind camera
    const sx = (_proj.x + 1) / 2 * r.width + r.left, sy = (1 - _proj.y) / 2 * r.height + r.top;
    const screenR = (b.radius / dist) * fovScale;
    const centerDist = Math.hypot(sx - clientX, sy - clientY);
    if (centerDist > screenR + slopPx && b !== rayBody) continue;
    const score = centerDist / (screenR + slopPx) * (b === rayBody ? 0.8 : 1);
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return best;
}

// Tap-vs-drag detection with pointer events (works for mouse, touch and pen).
const activePointers = new Set();
let tap = null; // { id, x, y, t }
const TAP_SLOP = () => (IS_TOUCH ? 12 : 5);
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId);
  tap = activePointers.size === 1 && (e.pointerType !== 'mouse' || e.button === 0)
    ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null; // 2nd finger cancels the tap
});
el.addEventListener('pointermove', (e) => {
  if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP()) tap = null;
  if (e.pointerType === 'mouse' && !e.buttons) {
    hovered = pick(e.clientX, e.clientY, 8);
    el.style.cursor = hovered ? 'pointer' : 'grab';
  }
});
const endPointer = (e) => {
  activePointers.delete(e.pointerId);
  if (e.type !== 'pointerup' || !tap || e.pointerId !== tap.id) { if (e.type !== 'pointerup') tap = null; return; }
  const ok = performance.now() - tap.t < 600 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP();
  tap = null;
  if (!ok) return;
  const b = pick(e.clientX, e.clientY, e.pointerType === 'mouse' ? 10 : 28);
  if (b) focusOn(b);
};
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', endPointer);
el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !e.buttons) hovered = null; });
el.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press / right-click menu

// iOS Safari ignores user-scalable=no, so block page pinch-zoom & scroll bounce explicitly.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scrollable, input')) e.preventDefault();
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// Collapsible panels (start collapsed on small screens so the view isn't covered)
for (const btn of document.querySelectorAll('.collapse-btn')) {
  const panel = document.getElementById(btn.dataset.target);
  const set = (collapsed) => { panel.classList.toggle('collapsed', collapsed); btn.setAttribute('aria-expanded', String(!collapsed)); };
  btn.addEventListener('click', () => set(!panel.classList.contains('collapsed')));
  if (Math.min(window.innerWidth, window.innerHeight) < 600) set(true);
}

// ---------------------------------------------------------------------------
// Label de-cluttering: hide labels whose screen rectangles overlap a higher-priority label
// (priority: selected > hovered > Sun > bigger planets). Uses projected positions, no DOM layout reads.
// ---------------------------------------------------------------------------
const labelOrder = [...bodies].sort((a, b) => b.radius - a.radius);
function declutterLabels() {
  if (labelRenderer.domElement.style.display === 'none') return;
  const w = window.innerWidth, h = window.innerHeight;
  const ordered = labelOrder.slice().sort((a, b) => prio(b) - prio(a));
  const placed = [];
  for (const b of ordered) {
    const lab = b.labelEl;
    lab._obj.getWorldPosition(_proj).project(camera);
    if (_proj.z > 1) continue;
    const cx = (_proj.x + 1) / 2 * w, cy = (1 - _proj.y) / 2 * h;
    const lw = (lab._w ||= lab.offsetWidth || lab.textContent.length * 7 + 18), lh = (lab._h ||= lab.offsetHeight || 20);
    const rect = [cx - lw / 2 - 2, cy - lh / 2 - 2, cx + lw / 2 + 2, cy + lh / 2 + 2];
    const hit = placed.some((p) => rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1]);
    const forced = b === focused || b === hovered;
    lab.classList.toggle('overlap', hit && !forced);
    if (!hit || forced) placed.push(rect);
  }
}
function prio(b) { return b === focused ? 1e6 : b === hovered ? 1e5 : b.name === 'Sun' ? 1e4 : b.radius; }

// ---------------------------------------------------------------------------
// Camera focus / follow with smooth transitions
// ---------------------------------------------------------------------------
let focused = null;          // body being followed (null = overview)
let transition = null;       // { fromCam, fromTarget, t, offset | overview }
const lastFocusPos = new THREE.Vector3();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function bodyWorldPos(b, out) { return b.group.getWorldPosition(out); }
function focusOffset(b, out) {
  const p = bodyWorldPos(b, tmp2);
  const dist = b.name === 'Sun' ? 32 : b.radius * 6 + 2.5;
  if (p.lengthSq() < 1e-6) out.set(0, 0.45, 1);
  else {
    // start from the outward direction, swing ~110° around toward the Sun so we see the lit (day) side
    out.copy(p).setY(0).normalize().applyAxisAngle(UP, 1.9).add(new THREE.Vector3(0, 0.4, 0)).normalize();
  }
  return out.multiplyScalar(dist);
}

function focusOn(b) {
  focused = b;
  transition = { fromCam: camera.position.clone(), fromTarget: controls.target.clone(), t: 0, offset: focusOffset(b, new THREE.Vector3()) };
  controls.minDistance = Math.max(b.radius * 1.5, 0.3);
  bodies.forEach((o) => { o.labelEl.classList.toggle('active', o === b); o.button.classList.toggle('active', o === b); });
  showInfo(b);
}
function goOverview() {
  focused = null;
  transition = { fromCam: camera.position.clone(), fromTarget: controls.target.clone(), t: 0, overview: true };
  controls.minDistance = 2;
  bodies.forEach((o) => { o.labelEl.classList.remove('active'); o.button.classList.remove('active'); });
  $('info-panel').classList.add('hidden');
  document.body.classList.remove('info-open');
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function updateCamera(dt) {
  if (transition) {
    transition.t = Math.min(1, transition.t + dt / 1.6);
    const e = ease(transition.t);
    let goalTarget, goalCam;
    if (transition.overview) { goalTarget = new THREE.Vector3(); goalCam = OVERVIEW_POS; }
    else { goalTarget = bodyWorldPos(focused, new THREE.Vector3()); goalCam = goalTarget.clone().add(transition.offset); }
    controls.target.lerpVectors(transition.fromTarget, goalTarget, e);
    camera.position.lerpVectors(transition.fromCam, goalCam, e);
    if (transition.t >= 1) { transition = null; if (focused) bodyWorldPos(focused, lastFocusPos); }
  } else if (focused) {
    // follow: shift camera and target by the body's motion; user can still orbit/zoom around it
    const p = bodyWorldPos(focused, tmp);
    const delta = tmp2.subVectors(p, lastFocusPos);
    camera.position.add(delta);
    controls.target.add(delta);
    lastFocusPos.copy(p);
  }
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const dateEl = $('date');
const DAY_MS = 86400000;

function updateBodies() {
  const days = (simTime - J2000) / DAY_MS;
  for (const b of bodies) {
    if (b.name === 'Sun') { b.mesh.rotation.y = (days / 25.4 / SPIN_SLOWDOWN) * Math.PI * 2; continue; }
    if (b.isMoon) {
      const a = (days / MOON_INFO.period) * Math.PI * 2;
      b.group.position.set(Math.cos(a) * b.moonDist, 0, -Math.sin(a) * b.moonDist);
      b.mesh.rotation.y = a + Math.PI; // tidally locked: same face toward Earth
      continue;
    }
    const p = b.info;
    const L = THREE.MathUtils.degToRad(p.L0) + (days / p.period) * Math.PI * 2; // mean longitude
    b.group.position.set(Math.cos(L) * b.dist, 0, -Math.sin(L) * b.dist);
    b.mesh.rotation.y = (days / p.rotation / SPIN_SLOWDOWN) * Math.PI * 2;
    if (b.clouds) b.clouds.rotation.y = b.mesh.rotation.y * 1.15;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused) simTime += daysPerSecond * dt * DAY_MS;
  updateBodies();
  scene.updateMatrixWorld();
  updateCamera(dt);
  controls.update();
  dateEl.textContent = 'Date: ' + new Date(simTime).toISOString().slice(0, 10) + (paused || daysPerSecond === 0 ? '  ⏸' : '');
  renderer.render(scene, camera);
  declutterLabels();
  labelRenderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250)); // iOS reports new size a bit late

updateBodies();
animate();
const loading = $('loading');
loading.style.opacity = '0';
setTimeout(() => loading.remove(), 700);

// Exposed for experimenting in the browser console (e.g. solar.focusOn(solar.bodies[3]))
window.solar = { THREE, scene, camera, controls, bodies, focusOn, goOverview };
