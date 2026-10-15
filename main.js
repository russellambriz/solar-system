// Interactive 3D Solar System — Three.js (ES modules from CDN, no build step)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createSkyBand, createGalaxy, GALAXY_INFO, ANDROMEDA_INFO } from './galaxy.js';
import { addSombrero, SOMBRERO_INFO } from './sombrero.js';
import { addSgrA } from './sgra.js';
import { addTon618 } from './ton618.js';
import { addLocalGroup } from './localgroup/index.js';
import { createGalileanMesh, createPotatoMesh } from './moons.js';
import { OUTER_MOON_SYSTEMS, createOuterMoons } from './outermoons.js';
import { createSunFX } from './sun.js';
import { createEarth } from './earth/index.js';
import { createMoonMesh, updateMoon } from './moon/index.js';
import { createMars } from './mars/index.js';
import { addPlanetFX, createPlanetRing, addNightFill } from './planets/index.js';
import { SMALL_BODIES, CHARON_INFO, CHARON_MASS_RATIO, keplerAU, scaleAU, orbitPoints, createAsteroidBelt, createKuiperBelt,
  surfaceTexture } from './smallbodies.js';
import { createSpacecraft } from './spacecraft/index.js';
import { createComets } from './comets/index.js';
import { createRealPositions } from './ephemeris/index.js';
import { moonEclipticLongitude, MOON_SIDEREAL_DAYS, galileanLongitude, galileanElements, anchorMoonPhase, moonPhaseFromPositions } from './ephemeris/moons.js';
import { createSearch } from './search/index.js';
import { createPerfGuard } from './perf/index.js';
import { createScaleTools } from './scale/index.js';
import { createUI } from './ui/index.js';
import { createConstellations } from './constellations/index.js';
import { orientTilt } from './axes/index.js';

// ---------------------------------------------------------------------------
// Data (real values) — sizes/distances are scaled below for visibility
// ---------------------------------------------------------------------------
// Touch device detection (iPadOS Safari reports a "Macintosh" UA, so also check maxTouchPoints)
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
document.body.classList.toggle('touch', IS_TOUCH);

const EARTH_DIAMETER = 12742; // km
const SPIN_SLOWDOWN = 50;     // self-rotation is shown 50x slower than real
const J2000 = Date.UTC(2000, 0, 1, 12); // epoch for mean longitudes
const DAY_MS = 86400000;

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
  fact: 'The Sun holds 99.86% of all the mass in the solar system. About 1.3 million Earths could fit inside it. ' +
        'Zoom in close to watch its boiling surface: glowing loops of plasma (prominences) arch along magnetic field lines, and solar flares ' +
        'release more energy in minutes than humanity uses in a million years. Sometimes they hurl billions of tons of plasma into space (a CME), ' +
        'which can spark auroras on Earth days later.',
};
const MOON_INFO = {
  name: 'Moon', type: 'Natural satellite of Earth', diameter: 3474, period: MOON_SIDEREAL_DAYS, color: '#bbbbbb',
  distLabel: 'Distance from Earth', distanceText: '384,400 km (0.00257 AU)', periodText: '27.32 days (sidereal; around Earth)',
  dayText: '27.3 days (tidally locked)',
  fact: 'The Moon is tidally locked, so we always see the same side. It drifts about 3.8 cm farther from Earth every year.',
};

// Moons of Mars and Jupiter. Orbits/sizes are scaled for visibility (order and relative periods are real).
// Their motion is slowed (Jupiter's 20×, Mars' 60×) — otherwise Io would lap Jupiter 5× per second at the default speed.
// orbit = scaled distance from planet center (scene units); size = scaled radius; phase = starting angle.
const MOON_SYSTEMS = {
  Mars: { slow: 60, moons: [
    { name: 'Phobos', kind: 'potato', size: 0.21, orbit: 1.6, period: 0.31891, phase: 0.4, color: '#a08f80',
      type: 'Moon of Mars (captured asteroid?)', diameter: 22.2, diameterText: '22.2 km avg (27 × 22 × 18 km, potato-shaped)',
      distLabel: 'Distance from Mars', distanceText: '9,376 km (only ~6,000 km above the surface)',
      periodText: '7 h 39 min (0.319 days)', dayText: 'Tidally locked (= orbital period)',
      fact: 'Phobos orbits faster than Mars spins, so from Mars it rises in the west and sets in the east — twice a day. ' +
            'It is spiralling inward ~1.8 m per century and in ~30–50 million years will crash into Mars or break up into a ring. ' +
            'Its giant crater Stickney (9 km) nearly shattered it.' },
    { name: 'Deimos', kind: 'potato', size: 0.14, orbit: 2.6, period: 1.263, phase: 2.6, color: '#b5a593',
      type: 'Moon of Mars', diameter: 12.4, diameterText: '12.4 km avg (15 × 12 × 11 km)',
      distLabel: 'Distance from Mars', distanceText: '23,463 km', periodText: '30 h 18 min (1.263 days)',
      dayText: 'Tidally locked (= orbital period)',
      fact: 'Deimos is so small that its escape velocity is only ~5.6 m/s — a strong throw could send a ball into space. ' +
            'A thick blanket of dust smooths its surface, and from Mars it looks like a bright star.' },
  ] },
  // Galilean periods/L0 from Meeus (ephemeris/moons.js). Motion still slowed 20× so they don't blur at 10 days/s;
  // phase is re-anchored to the real mean longitude whenever the date is set (see anchorGalileanMoons).
  Jupiter: { slow: 20, moons: [
    { name: 'Io', kind: 'galilean', size: 0.46, orbit: 5.2, period: galileanElements('Io').period, phase: 0, color: '#e8c44a',
      type: 'Galilean moon of Jupiter', diameter: 3643,
      distLabel: 'Distance from Jupiter', distanceText: '421,700 km', periodText: '1.77 days', dayText: 'Tidally locked (= orbital period)',
      fact: 'The most volcanic place in the solar system: ~400 active volcanoes, some shooting sulfur plumes 400 km high. ' +
            'Tidal squeezing by Jupiter heats its interior. Io, Europa and Ganymede are locked in a 1:2:4 orbital resonance.' },
    { name: 'Europa', kind: 'galilean', size: 0.42, orbit: 6.4, period: galileanElements('Europa').period, phase: 0, color: '#d9cbb3',
      type: 'Galilean moon of Jupiter', diameter: 3122,
      distLabel: 'Distance from Jupiter', distanceText: '671,034 km', periodText: '3.55 days', dayText: 'Tidally locked (= orbital period)',
      fact: 'Under its cracked ice shell (~15–25 km thick) lies a global salty ocean holding about twice as much water as all of ' +
            'Earth\'s oceans — one of the best places to look for life. NASA\'s Europa Clipper arrives in 2030.' },
    { name: 'Ganymede', kind: 'galilean', size: 0.55, orbit: 7.8, period: galileanElements('Ganymede').period, phase: 0, color: '#9c948a',
      type: 'Galilean moon of Jupiter', diameter: 5268,
      distLabel: 'Distance from Jupiter', distanceText: '1,070,412 km', periodText: '7.15 days', dayText: 'Tidally locked (= orbital period)',
      fact: 'The largest moon in the solar system — bigger than the planet Mercury — and the only moon with its own magnetic field, ' +
            'which even makes auroras. Its bright terrain is scored with long parallel grooves.' },
    { name: 'Callisto', kind: 'galilean', size: 0.53, orbit: 9.6, period: galileanElements('Callisto').period, phase: 0, color: '#6f665c',
      type: 'Galilean moon of Jupiter', diameter: 4821,
      distLabel: 'Distance from Jupiter', distanceText: '1,882,709 km', periodText: '16.69 days', dayText: 'Tidally locked (= orbital period)',
      fact: 'One of the most heavily cratered surfaces known, about 4 billion years old. Its Valhalla impact basin is ringed by ' +
            'concentric ridges spreading ~3,800 km across — like ripples frozen in ice.' },
  ] },
};

// Scaling for visibility
const SUN_RADIUS = 5;
// drawn distance = a + b·AU^p; scale/ morphs these toward true ratios and everything reads them live
const DIST_SCALE = { a: 6, b: 14, p: 0.55 };
const scaleDistance = (au) => DIST_SCALE.a + DIST_SCALE.b * Math.pow(au, DIST_SCALE.p);
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
let SOLAR_MAX_DIST = 900;            // zooming out to this distance switches to the galaxy view (scale/ raises it at true distances)
controls.maxDistance = SOLAR_MAX_DIST;

scene.add(new THREE.AmbientLight(0xffffff, 0.04));   // low so night sides read as night (was 0.12); planets/ adds a faint night fill so silhouettes stay readable
const sunLight = new THREE.PointLight(0xfff2dd, 3.2, 0, 0); // decay 0: no falloff, so outer planets stay visible
scene.add(sunLight);
addNightFill(scene);   // planets/: very dim camera fill so unlit moons/dwarf planets stay readable with the low ambient

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
  el.className = 'label solar-label' + (small ? ' small' : '');
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
const glow1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true }));
glow1.scale.set(SUN_RADIUS * 5, SUN_RADIUS * 5, 1);
const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,120,0.5)', 'rgba(255,140,40,0.12)'), blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true }));
glow2.scale.set(SUN_RADIUS * 11, SUN_RADIUS * 11, 1);
sunGroup.add(glow1, glow2);
const GLOW_COS_FAR = Math.cos(THREE.MathUtils.degToRad(75)), GLOW_COS_NEAR = Math.cos(THREE.MathUtils.degToRad(55));
const _camFwd = new THREE.Vector3(), _toSun = new THREE.Vector3();
// close-up effects: animated granulation, sunspots, limb darkening, prominences, flares/CMEs (LOD: only when near)
const sunFX = createSunFX({ radius: SUN_RADIUS, isTouch: IS_TOUCH, mesh: sunMesh });
sunGroup.add(sunFX.group);
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
  orientTilt(tiltGroup, p.name, p.tilt);    // axes/: +Y at the IAU north pole (Earth → Polaris)
  group.add(tiltGroup);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48),
    new THREE.MeshStandardMaterial({ map: TEXTURES[p.name](), roughness: 0.95, metalness: 0 }));
  tiltGroup.add(mesh);
  addPlanetFX({ name: p.name, mesh, tiltGroup, radius, sunLight, isTouch: IS_TOUCH }); // planets/: real maps + atmosphere rim (no-op for Earth/Mars)
  scene.add(group);
  const orbit = orbitLine(dist);         // ephemeris/ reshapes it into the real tilted ellipse
  scene.add(orbit);

  const body = { name: p.name, info: p, group, mesh, radius, dist, tiltGroup, orbit };
  body.labelEl = addLabel(group, p.name, radius + 0.9);
  addPickSphere(group, radius, body);
  bodies.push(body);

  // real-texture Mars (USGS Viking colour + MOLA relief, seasonal polar caps, dusty rim): see mars/index.js
  if (p.name === 'Mars') tiltGroup.add((body.mars = createMars({ radius, sunLight, isMobile: IS_TOUCH, renderer, mesh })).group);
  if (p.name === 'Earth') {
    // real-texture Earth (day/night, ocean glint, clouds + shadows, atmosphere): see earth/index.js
    const earth = createEarth({ radius, sunLight, isMobile: IS_TOUCH, renderer, mesh });
    tiltGroup.add(earth.group);
    body.clouds = earth.clouds; body.earth = earth;   // clouds still spun in updateBodies(); earth.uEarthTint for the Moon

    // Moon — size and distance exaggerated so it's clearly visible: real Moon is 0.27× Earth's diameter and
    // ~30 Earth diameters away (which at our compressed scale would sit inside Earth's sphere).
    const moonDist = radius * 3.4;   // ≈ 3.2 units: clearly separated from Earth, still inside the Venus–Mars gap
    const moonPivot = new THREE.Group();
    moonPivot.rotation.z = THREE.MathUtils.degToRad(5.1); // orbit inclination
    group.add(moonPivot);
    const moonR = radius * 0.5;      // shown at ~half Earth's size (real: 0.27×) so it reads at overview zoom
    const moonGroup = new THREE.Group();
    moonPivot.add(moonGroup);
    const moonMesh = createMoonMesh({ radius: moonR, isTouch: IS_TOUCH }); // moon/: NASA LRO maps, lunar shading, earthshine, LOD
    moonGroup.add(moonMesh);
    moonPivot.add(orbitLine(moonDist, 0xb8c4e6, 0.4));  // faint ring around Earth; follows Earth; toggled with "Orbit lines"
    const moonBody = { name: 'Moon', info: MOON_INFO, group: moonGroup, mesh: moonMesh, radius: moonR, isMoon: true,
      parent: body, orbitDist: moonDist, period: MOON_INFO.period, slow: 1, phase: 0, baseRadius: moonR, realLon: true };
    body.moons = [moonBody]; body.systemRadius = moonDist;
    moonBody.labelEl = addLabel(moonGroup, 'Moon', moonR + 0.5, true);
    addPickSphere(moonGroup, moonR * 0.8, moonBody);
    bodies.push(moonBody);
  }
  if (MOON_SYSTEMS[p.name]) {
    // moons orbit in the planet's equatorial plane, so their pivot lives inside the tilt group
    const sys = MOON_SYSTEMS[p.name];
    body.moons = [];
    for (const m of sys.moons) {
      const pivot = new THREE.Group();
      tiltGroup.add(pivot);
      const mg = new THREE.Group();
      pivot.add(mg);
      const mesh = m.kind === 'galilean' ? createGalileanMesh(renderer, m.name, m.size, IS_TOUCH) : createPotatoMesh(m.name, m.size, IS_TOUCH);
      mg.add(mesh);
      pivot.add(orbitLine(m.orbit, 0xb8c4e6, 0.3));   // faint ring; follows the planet; toggled with "Orbit lines"
      const mb = { name: m.name, info: m, group: mg, mesh, radius: m.size, isMoon: true,
        parent: body, orbitDist: m.orbit, period: m.period, slow: sys.slow, phase: m.phase,
        realLon: m.kind === 'galilean' };
      mb.labelEl = addLabel(mg, m.name, m.size + 0.4, true);
      addPickSphere(mg, m.size, mb);
      bodies.push(mb);
      body.moons.push(mb);
    }
    body.systemRadius = sys.moons[sys.moons.length - 1].orbit;
  }
  if (OUTER_MOON_SYSTEMS[p.name]) {
    // Saturn, Uranus, Neptune: major moons in the planet's equatorial plane (see outermoons.js)
    body.moons = createOuterMoons(p.name, { renderer, isTouch: IS_TOUCH, tiltGroup, parent: body, orbitLine, addLabel, addPickSphere });
    bodies.push(...body.moons);
  }
  // planets/: sun-lit rings with planet shadow + ring shadow on the planet; radii are real multiples of the drawn radius
  if (p.name === 'Saturn') tiltGroup.add(createPlanetRing({ name: p.name, mesh, radius, sunLight, isTouch: IS_TOUCH, fallback: ringTexture }));
  if (p.name === 'Uranus') tiltGroup.add(createPlanetRing({ name: p.name, mesh, radius, sunLight, isTouch: IS_TOUCH, fallback: uranusRingTexture }));
}

// ---------------------------------------------------------------------------
// Small bodies: asteroid belt (+ Trojans, Hildas), Kuiper belt, dwarf planets & Vesta
// ---------------------------------------------------------------------------
const beltScale = IS_TOUCH ? 1.15 : 1;          // fewer but slightly bigger particles on touch devices
const asteroidBelt = createAsteroidBelt({ isTouch: IS_TOUCH, jupiterL0Deg: PLANETS[4].L0, scale: beltScale });
const kuiperBelt = createKuiperBelt({ isTouch: IS_TOUCH, scale: beltScale });
scene.add(asteroidBelt, kuiperBelt);
const belts = [asteroidBelt, kuiperBelt];

function ellipseLine(el, color, opacity) {
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPoints(el, scaleDistance, 512)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  orbitLines.push(line);
  return line;
}
const smallBodies = [];
const _au = new THREE.Vector3();
for (const sb of SMALL_BODIES) {
  const radius = sb.name === 'Vesta' ? 0.22 : scaleRadius(sb.diameter);
  const group = new THREE.Group();          // heliocentric position (for Pluto: the Pluto–Charon barycenter)
  const tiltGroup = new THREE.Group();
  orientTilt(tiltGroup, sb.name, sb.tilt);
  group.add(tiltGroup);
  scene.add(group);
  const sbOrbit = ellipseLine(sb, sb.group === 'belt' ? 0xa89a86 : 0x9d8cd9, sb.group === 'belt' ? 0.3 : 0.32);   // scale/ redraws it
  scene.add(sbOrbit);
  let mesh;
  if (sb.name === 'Vesta') mesh = createPotatoMesh('Vesta', radius, IS_TOUCH);
  else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32),
      new THREE.MeshStandardMaterial({ map: surfaceTexture(sb.name, IS_TOUCH), roughness: 0.95, metalness: 0, emissive: 0x111114 }));
    if (sb.name === 'Haumea') mesh.scale.set(1, 0.51, 0.8);   // egg/ellipsoid stretched by its 3.9 h spin (shortest axis = spin axis)
  }
  const body = { name: sb.name, info: sb, group, mesh, radius, tiltGroup, isSmall: true, orbit: sbOrbit };
  let spinner = mesh;                        // what rotates with the body's day
  if (sb.name === 'Pluto') {
    // Pluto–Charon binary: both circle their shared barycenter (outside Pluto in reality) once per 6.39 days, and both are
    // tidally locked, so a single pivot carries Pluto's offset and Charon's orbit — they always face each other.
    const pivot = new THREE.Group();
    tiltGroup.add(pivot);                    // Charon orbits in Pluto's equatorial plane (Pluto's axis is tipped 122°)
    const charonR = scaleRadius(CHARON_INFO.diameter), sep = 1.9;
    const off = sep * CHARON_MASS_RATIO / (1 + CHARON_MASS_RATIO);
    mesh.position.set(-off, 0, 0); mesh.rotation.y = Math.PI;   // the heart-hemisphere faces away from Charon (as in reality)
    pivot.add(mesh);
    const cGroup = new THREE.Group(); cGroup.position.set(sep - off, 0, 0); pivot.add(cGroup);
    const cMesh = new THREE.Mesh(new THREE.SphereGeometry(charonR, 40, 28),
      new THREE.MeshStandardMaterial({ map: surfaceTexture('Charon', IS_TOUCH), roughness: 1, metalness: 0, emissive: 0x111114 }));
    cGroup.add(cMesh);
    const ring = orbitLine(sep - off, 0xb8c4e6, 0.35); tiltGroup.add(ring);
    const slow = 20;                         // shown 20× slower (like Jupiter's moons) so the pair doesn't blur
    const charon = { name: 'Charon', info: CHARON_INFO, group: cGroup, mesh: cMesh, radius: charonR, isMoon: true, isSmall: true,
      parent: body, orbitDist: sep - off, period: CHARON_INFO.period, slow, phase: 0, update() {} };
    charon.labelEl = addLabel(cGroup, 'Charon', charonR + 0.4, true);
    addPickSphere(cGroup, charonR, charon);
    body.moons = [charon]; body.systemRadius = sep; body.focusElev = 0.7;
    body.pivot = pivot; body.slow = slow;
    spinner = null;
    smallBodies.push(body, charon);
  } else {
    tiltGroup.add(mesh);
    smallBodies.push(body);
  }
  if (sb.name === 'Haumea') {                // its ring (found 2017), ~2,290 km radius, in the equatorial plane
    tiltGroup.add(makeRing(radius * 1.85, radius * 2.05, uranusRingTexture(), 0.55));
  }
  body.update = (days) => {
    group.position.copy(scaleAU(keplerAU(sb, days, _au), scaleDistance));
    if (body.pivot) body.pivot.rotation.y = (days / (CHARON_INFO.period * body.slow)) * Math.PI * 2;
    else if (spinner) spinner.rotation.y = (days / sb.rotation / SPIN_SLOWDOWN) * Math.PI * 2;
  };
  body.labelEl = addLabel(group, sb.name, radius + 0.5, true);
  addPickSphere(group, radius, body);
}
// list order: Ceres & Vesta (asteroid belt) right after Mars' moons, the Kuiper-belt dwarf planets after Neptune
{
  const belt = smallBodies.filter((b) => b.info.group === 'belt'), outer = smallBodies.filter((b) => b.info.group !== 'belt');
  belt[0].listHeader = 'Asteroid belt'; outer[0].listHeader = 'Dwarf planets · Kuiper belt';
  bodies.splice(bodies.findIndex((b) => b.name === 'Jupiter'), 0, ...belt);
  bodies.push(...outer);
}

// Starfield (scale/ keeps it centred on the camera so it stays "at infinity" when distances are stretched)
let starfield;
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
  starfield = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 7, vertexColors: true, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, sizeAttenuation: true }));
  scene.add(starfield);
}

// Milky Way sky band (galactic plane tilted ~60° to the ecliptic, center toward Sagittarius)
const skyBand = createSkyBand({ isTouch: IS_TOUCH, renderer });
scene.add(skyBand.group);
const constellations = createConstellations({ scene, renderer, isTouch: IS_TOUCH }); // constellations/: bright stars + IAU stick figures at infinity

// spacecraft/: Voyager 1 & 2, New Horizons, Parker Solar Probe, JWST, ISS, and the Apollo/Artemis sites on the Moon
const spacecraft = createSpacecraft({ scene, bodies, renderer, isTouch: IS_TOUCH, scaleDistance, orbitLines });
// comets/: Halley's Comet and Hale-Bopp on their real orbits, with ion + dust tails that grow near the Sun
const comets = createComets({ scene, bodies, renderer, isTouch: IS_TOUCH, scaleDistance, orbitLines });

// Galaxy view lives in its own scene with its own units (1 unit = 100 ly) → no float/depth precision issues
const galaxy = createGalaxy({ isTouch: IS_TOUCH });
// Deep-space objects (all live in galaxy.scene, same units: 1 unit = 100 ly)
const sombrero = addSombrero(galaxy, { isTouch: IS_TOUCH, labels: true });   // M104 at its true distance (31 Mly = 310,000 units)
const M104_MIN_DIST = 120;
const UNIVERSE_MID = galaxy.SUN_POS.clone().lerp(sombrero.POS, 0.46);         // framing point for the MW + M31 + M104 view
const sgra = addSgrA(galaxy, { isTouch: IS_TOUCH, labels: true });           // Sgr A* at the galactic center (enlarged; LOD close-up); replaces the old center label
const ton618 = addTon618(galaxy, { isTouch: IS_TOUCH, labels: true });       // TON 618 at its true light-travel distance (1.08e8 units)
const localGroup = addLocalGroup(galaxy, { isTouch: IS_TOUCH, labels: true }); // LMC + SMC (ride with the disk) and M33 (beside M31), true distances
const TON618_MAX_DIST = 3e8;                                                 // zoom-out limit while focused on TON 618 (the far view sits at ~1.6e8)
const GALAXY_POS = new THREE.Vector3(0, 620, 720);
const GALAXY_MIN_DIST = 90, GALAXY_MAX_DIST = 700000;  // zooming far out reveals the Local Group, then the Sombrero (31 Mly)
const GALAXY_FAR = 2000000;                             // galaxy-scene camera far plane (units of 100 ly); must exceed ~1.1 M to see M104 from the far view
const M31_MIN_DIST = 160;
let galaxyFocus = 'mw';              // what the galaxy-view camera orbits: 'mw' (Milky Way) | 'm31' (Andromeda) | 'm104' (Sombrero) | 'sgra' (Sgr A*) | 'ton618'
const LG_MID = galaxy.SUN_POS.clone().lerp(galaxy.M31_POS, 0.5);
let activeScene = scene;
let mode = 'solar';                  // 'solar' | 'galaxy' | 'transit'

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
$('toggle-asteroids').addEventListener('change', (e) => (asteroidBelt.visible = e.target.checked));
$('toggle-kuiper').addEventListener('change', (e) => (kuiperBelt.visible = e.target.checked));
$('toggle-milkyway').addEventListener('change', (e) => (skyBand.group.visible = e.target.checked));
$('toggle-constellations')?.addEventListener('change', (e) => constellations.setEnabled(e.target.checked));
$('overview-btn').addEventListener('click', () => (mode === 'galaxy' ? exitGalaxy() : goOverview()));
$('galaxy-btn').addEventListener('click', () => (mode === 'galaxy' ? exitGalaxy() : enterGalaxy()));
$('andromeda-btn').addEventListener('click', () => {
  if (mode === 'solar') enterGalaxy(() => flyToAndromeda());
  else if (mode === 'galaxy') (galaxyFocus === 'm31' ? flyToMilkyWay() : flyToAndromeda());
});
$('sombrero-btn').addEventListener('click', () => {
  if (mode === 'solar') enterGalaxy(() => flyToSombrero());
  else if (mode === 'galaxy') (galaxyFocus === 'm104' ? flyToMilkyWay() : flyToSombrero());
});
$('sgra-btn').addEventListener('click', () => {
  if (mode === 'solar') enterGalaxy(() => flyToSgrA());
  else if (mode === 'galaxy') (galaxyFocus === 'sgra' ? leaveSgrA() : flyToSgrA());
});
$('ton618-btn').addEventListener('click', () => {
  if (mode === 'solar') enterGalaxy(() => flyToTon618());
  else if (mode === 'galaxy') (galaxyFocus === 'ton618' ? leaveTon618() : flyToTon618());
});
$('close-info').addEventListener('click', () => (mode === 'galaxy' ? hideInfo() : goOverview()));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (mode === 'galaxy') (galaxyFocus !== 'mw' ? flyToMilkyWay() : exitGalaxy()); else if (mode === 'solar') goOverview(); }
  if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey) $('andromeda-btn').click();
  if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) $('sombrero-btn').click();
  if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) $('sgra-btn').click();     // C = galactic Center
  if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey) $('ton618-btn').click();
  if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey) { if (mode === 'galaxy') exitGalaxy(); else enterGalaxy(); }
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') { e.preventDefault(); togglePause(); }
});
updateSpeed();
// ephemeris/: planets on their real Keplerian orbits (eccentricity, inclination) for the sim date + the Controls date picker
function setSimTime(ms) {
  simTime = ms;
  anchorGalileanMoons((simTime - J2000) / DAY_MS);
}
const realPositions = createRealPositions({ bodies, scaleDistance, getTime: () => simTime, setTime: setSimTime });
anchorGalileanMoons((simTime - J2000) / DAY_MS);   // correct Galilean longitudes for "today" on load

// Body list buttons
const list = $('body-list');
for (const b of bodies) {
  if (b.listHeader) {
    const h = document.createElement('div');
    h.className = 'list-header'; h.textContent = b.listHeader;
    list.appendChild(h);
  }
  const btn = document.createElement('button');
  btn.innerHTML = `<span class="dot" style="background:${b.info.color}"></span>${b.name}`;
  if (b.isSmall) btn.classList.add('small-body');
  if (b.isMoon) { btn.style.paddingLeft = b.isSmall ? '30px' : '22px'; btn.classList.add('moon-item', 'folded'); }
  btn.addEventListener('click', () => {
    if (mode === 'galaxy') exitGalaxy(() => focusOn(b)); else if (mode === 'solar') focusOn(b);
    if (isCompact()) setPanelCollapsed('nav-panel', true);       // small screens: get the list out of the way
  });
  b.button = btn;
  if (b.moons && b.moons.length) {
    // planet row with an expand arrow that shows/hides its moons
    const row = document.createElement('div'); row.className = 'list-row';
    const ex = document.createElement('button');
    ex.className = 'expand-btn'; ex.setAttribute('aria-label', `Show ${b.name}'s moons`); ex.setAttribute('aria-expanded', 'false');
    ex.innerHTML = `▸<span class="n">${b.moons.length}</span>`;
    ex.addEventListener('click', () => setMoonsExpanded(b, ex.getAttribute('aria-expanded') !== 'true'));
    b.expandBtn = ex;
    row.append(btn, ex);
    list.appendChild(row);
  } else list.appendChild(btn);
  b.labelEl.addEventListener('click', (e) => {
    e.stopPropagation();
    // A label can sit on top of another planet's disc (e.g. the Sun's label over Mars).
    // If the tap is on a planet's visible disc (±4px), prefer that planet; otherwise focus the label's body.
    const under = pick(e.clientX, e.clientY, IS_TOUCH ? 4 : 2, true);
    // (only planets override a label: a tiny moon or asteroid that happens to sit under it never steals the tap)
    focusOn(under && under !== b && under.name !== 'Sun' && !under.isMoon && !under.isSmall ? under : b);
  });
  b.labelEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovered = b; });
  b.labelEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hovered === b) hovered = null; });
}

function setMoonsExpanded(b, open) {
  if (!b.expandBtn) return;
  b.expandBtn.setAttribute('aria-expanded', String(open));
  b.expandBtn.firstChild.textContent = open ? '▾' : '▸';
  for (const m of b.moons) m.button.classList.toggle('folded', !open);
}
function fmtNum(n) { return n.toLocaleString('en-US'); }
function fmtPeriod(days) {
  return days < 1000 ? `${fmtNum(+days.toFixed(2))} days` : `${(days / 365.25).toFixed(2)} years (${fmtNum(Math.round(days))} days)`;
}
function fmtDay(rotDays) {
  const d = Math.abs(rotDays), retro = rotDays < 0 ? ' (retrograde)' : '';
  return (d < 2 ? `${(d * 24).toFixed(1)} hours` : `${d.toFixed(1)} Earth days`) + retro;
}
function setRowLabels(a, b, c, d) {
  $('info-diameter-label').textContent = a; $('info-distance-label').textContent = b;
  $('info-period-label').textContent = c; $('info-day-label').textContent = d;
}
function openInfoPanel() {
  $('info-panel').classList.remove('hidden');
  $('info-panel').scrollTop = 0;
  document.body.classList.add('info-open');
}
function hideInfo() {
  $('info-panel').classList.add('hidden');
  document.body.classList.remove('info-open');
}
function showGalaxyInfo() {
  const g = GALAXY_INFO;
  $('info-name').textContent = g.name; $('info-name').style.color = g.color; $('info-type').textContent = g.type;
  setRowLabels(...g.rows.map((r) => r[0]));
  ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => ($(id).textContent = g.rows[k][1]));
  $('info-fact').textContent = '💡 ' + g.fact;
  openInfoPanel();
}
function showAndromedaInfo() {
  const g = ANDROMEDA_INFO;
  $('info-name').textContent = g.name; $('info-name').style.color = g.color; $('info-type').textContent = g.type;
  setRowLabels(...g.rows.map((r) => r[0]));
  ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => ($(id).textContent = g.rows[k][1]));
  $('info-fact').textContent = '💡 ' + g.fact;
  openInfoPanel();
}
function showSombreroInfo() {
  const g = SOMBRERO_INFO;
  $('info-name').textContent = g.name; $('info-name').style.color = g.color; $('info-type').textContent = g.type;
  setRowLabels(...g.rows.map((r) => r[0]));
  ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => ($(id).textContent = g.rows[k][1]));
  $('info-fact').textContent = '💡 ' + g.fact;
  openInfoPanel();
}
function showInfo(b) {
  const i = b.info;
  setRowLabels('Diameter', 'Distance from Sun', 'Orbital period', 'Day length');
  $('info-name').textContent = i.name;
  $('info-name').style.color = i.color;
  $('info-type').textContent = i.type;
  $('info-diameter').textContent = i.diameterText ||
    `${fmtNum(i.diameter)} km` + (b.name !== 'Earth' ? ` (${(i.diameter / EARTH_DIAMETER).toFixed(2)}× Earth)` : '');
  const phaseRow = $('info-phase-row');
  if (phaseRow) phaseRow.classList.toggle('hidden', b.name !== 'Moon');
  if (b.isMoon) {
    $('info-distance-label').textContent = i.distLabel;
    $('info-distance').textContent = i.distanceText;
    $('info-period').textContent = i.periodText;
    $('info-day').textContent = i.dayText;
    if (b.name === 'Moon') {
      const ph = currentMoonPhase();
      if (ph && $('info-phase')) setPhaseText($('info-phase'), moonPhaseText(ph));
    }
  } else if (b.name === 'Sun') {
    $('info-distance-label').textContent = 'Distance from Sun';
    $('info-distance').textContent = i.distanceText;
    $('info-period').textContent = i.periodText;
    $('info-day').textContent = i.dayText;
  } else {
    $('info-distance-label').textContent = 'Distance from Sun';
    $('info-distance').textContent = i.distanceText || `${i.au} AU (${fmtNum(Math.round(i.au * 149.6))} million km)`;
    $('info-period').textContent = i.periodText || fmtPeriod(i.period);
    $('info-day').textContent = i.dayText || fmtDay(i.rotation);
  }
  $('info-fact').textContent = '💡 ' + i.fact;
  openInfoPanel();
}

// ---------------------------------------------------------------------------
// Picking (click vs. drag detection)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const _proj = new THREE.Vector3(), _hist = new THREE.Vector3();
let hovered = null;

// Picking: every body gets a score = (screen distance from tap to its center) / (its on-screen radius + finger slop).
// Lowest score wins, so tiny planets near a big one (e.g. Mars in front of the Sun) are still easy to tap.
// The invisible enlarged hit spheres are raycast too; the body they hit gets a small bonus (helps with occlusion).
function pick(clientX, clientY, slopPx, discOnly = false) {   // discOnly: only bodies whose visible disc (± slop) is under the finger
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets, false);
  const rayBody = hits.length ? hits[0].object.userData.body : null;
  let best = null, bestScore = Infinity;
  const reach = new Map();   // body → { centerDist, screenR } for every body within reach of the finger
  const fovScale = r.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  for (const b of bodies) {
    // Test the body's current position AND where it was over the last ~400 ms: fast movers (the Moon laps Earth
    // every ~2.7 s at default speed) have moved on by the time a finger lands, so tapping where you saw it still works.
    let centerDist = Infinity, screenR = 0;
    for (const wp of [b.group.getWorldPosition(_hist), ...(b.hist || []).map((h) => h.p)]) {
      const dist = wp.distanceTo(camera.position);
      _proj.copy(wp).project(camera);
      if (_proj.z > 1) continue; // behind camera
      const sx = (_proj.x + 1) / 2 * r.width + r.left, sy = (1 - _proj.y) / 2 * r.height + r.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < centerDist) { centerDist = d; screenR = (b.radius / dist) * fovScale; }
    }
    if (centerDist === Infinity) continue;
    if (centerDist > screenR + slopPx && (discOnly || b !== rayBody)) continue;
    reach.set(b, { centerDist, screenR });
    // 1) the tap is well inside a body's visible disc → that body (front-most wins if discs overlap)
    // 2) otherwise → the body whose center is nearest the finger (so a tiny moon right next to a bigger
    //    planet's edge is still easy to hit); moons of the focused planet get a small head start
    const inside = centerDist <= screenR * 0.8;
    const camDist = b.group.getWorldPosition(_hist).distanceTo(camera.position);
    const boost = focused && (b.parent === focused || b.parent === focused.parent) ? 0.75 : 1;
    const score = inside ? -1e6 + camDist : centerDist * boost;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  // 3) moons of a planet that isn't focused (e.g. Saturn's in the overview) don't steal a tap aimed at their own planet:
  //    the planet wins if the finger is at its disc's edge, or if it is within reach and the finger isn't right on the moon
  if (best && best.isMoon && best.parent && focused !== best.parent && (!focused || focused.parent !== best.parent)) {
    const pc = reach.get(best.parent), mc = reach.get(best), near = slopPx * 0.35;
    // outer systems (Saturn/Uranus/Neptune) pack many moons just outside the planet: there the planet wins unless the finger is right on the moon's disc
    const outer = !!OUTER_MOON_SYSTEMS[best.parent.name];
    if (pc && (pc.centerDist <= pc.screenR + near || (pc.centerDist <= pc.screenR + slopPx && mc.centerDist > (outer ? mc.screenR + 2 : Math.max(mc.screenR, near))))) best = best.parent;
  }
  return best;
}

// Galaxy view picking: did the tap land on the galactic disk (ray ∩ galactic plane within the radius)?
const galaxyPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pickGalaxy(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.ray.intersectPlane(galaxyPlane, _proj);
  return !!hit && hit.length() < galaxy.R * 1.1;
}
for (const lab of galaxy.labelEls) {
  lab.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'galaxy') showGalaxyInfo(); });
}
// Andromeda picking: within its projected disk (or a finger-sized zone when it's just a far-away smudge)
function pickAndromeda(clientX, clientY, slopPx) {
  const r = renderer.domElement.getBoundingClientRect();
  _proj.copy(galaxy.M31_POS).project(camera);
  if (_proj.z > 1) return false;
  const sx = (_proj.x + 1) / 2 * r.width + r.left, sy = (1 - _proj.y) / 2 * r.height + r.top;
  const fovScale = r.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const rpx = galaxy.M31_R * 0.6 / camera.position.distanceTo(galaxy.M31_POS) * fovScale;
  return Math.hypot(sx - clientX, sy - clientY) < rpx + slopPx;
}
function onAndromedaTap() { if (galaxyFocus === 'm31') showAndromedaInfo(); else flyToAndromeda(); }
sombrero.labelEls[0]?.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'galaxy') (galaxyFocus === 'm104' ? showSombreroInfo() : flyToSombrero()); });
sgra.labelEl?.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'galaxy') (galaxyFocus === 'sgra' ? sgra.showInfo() : flyToSgrA()); });
ton618.labelEl?.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'galaxy') (galaxyFocus === 'ton618' ? ton618.showInfo() : flyToTon618()); });
for (const key of localGroup.keys) localGroup.objects[key].labelEl?.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'galaxy') onLocalGroupTap(key); });
for (const lab of galaxy.m31LabelEls) {
  lab.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'galaxy') onAndromedaTap(); });
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
    if (mode === 'galaxy') { hovered = null; el.style.cursor = ton618.pick(e.clientX, e.clientY, camera, el, 8) || sgra.pick(e.clientX, e.clientY, camera, el, 8) || pickAndromeda(e.clientX, e.clientY, 8) || localGroup.pick(e.clientX, e.clientY, camera, el, 8) || pickGalaxy(e.clientX, e.clientY) ? 'pointer' : 'grab'; return; }
    hovered = mode === 'solar' ? pick(e.clientX, e.clientY, 8) : null;
    el.style.cursor = hovered ? 'pointer' : 'grab';
  }
});
const endPointer = (e) => {
  activePointers.delete(e.pointerId);
  if (e.type !== 'pointerup' || !tap || e.pointerId !== tap.id) { if (e.type !== 'pointerup') tap = null; return; }
  const ok = performance.now() - tap.t < 600 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP();
  tap = null;
  if (!ok || mode === 'transit') return;
  if (mode === 'galaxy') {
    let lgKey;
    if (ton618.pick(e.clientX, e.clientY, camera, renderer.domElement, e.pointerType === 'mouse' ? 10 : 28)) (galaxyFocus === 'ton618' ? ton618.showInfo() : flyToTon618());
    else if (sgra.pick(e.clientX, e.clientY, camera, renderer.domElement, e.pointerType === 'mouse' ? 10 : 28)) (galaxyFocus === 'sgra' ? sgra.showInfo() : flyToSgrA());
    else if (pickAndromeda(e.clientX, e.clientY, e.pointerType === 'mouse' ? 10 : 28)) onAndromedaTap();
    else if ((lgKey = localGroup.pick(e.clientX, e.clientY, camera, renderer.domElement, e.pointerType === 'mouse' ? 10 : 28))) onLocalGroupTap(lgKey);
    else if (pickGalaxy(e.clientX, e.clientY)) showGalaxyInfo();
    return;
  }
  const b = pick(e.clientX, e.clientY, e.pointerType === 'mouse' ? 10 : 28);
  if (b) { constellations.clear(); focusOn(b); return; }
  // constellations/: tap a stick figure to select it (card + highlight); tapping empty sky closes the card
  const cAbbr = mode === 'solar' ? constellations.pickAt(e.clientX, e.clientY, camera, e.pointerType === 'mouse' ? 8 : 22) : null;
  if (cAbbr) constellations.select(cAbbr); else constellations.clear();
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

// The body list is tall now (dwarf planets): if it would cover the bottom-left scale notes, slide the notes to its right.
function placeNotes() {
  document.body.style.removeProperty('--note-left');
  const nav = $('nav-panel').getBoundingClientRect(), note = $('scale-note').getBoundingClientRect();
  const noteTop = note.height ? note.top : window.innerHeight - 140;
  if (nav.bottom > noteTop - 6 && nav.right + 12 + 300 < window.innerWidth) document.body.style.setProperty('--note-left', `${Math.round(nav.right + 12)}px`);
}
// Collapsible panels. Compact screens (portrait tablets, phones, short landscape) start with both panels collapsed
// and the Layers group closed, so planets and moons aren't hidden behind the UI.
function isCompact() { return window.innerHeight > window.innerWidth || Math.min(window.innerWidth, window.innerHeight) < 600; }
function setPanelCollapsed(id, collapsed) {
  const panel = $(id), btn = panel.querySelector('.collapse-btn');
  panel.classList.toggle('collapsed', collapsed); btn.setAttribute('aria-expanded', String(!collapsed)); placeNotes();
}
for (const btn of document.querySelectorAll('.collapse-btn')) {
  const id = btn.dataset.target;
  btn.addEventListener('click', () => setPanelCollapsed(id, !$(id).classList.contains('collapsed')));
}
let wasCompact = null;
function applyCompact() {
  const c = isCompact();
  if (c === wasCompact) return;
  wasCompact = c;
  document.body.classList.toggle('compact', c);
  if (c) { setPanelCollapsed('nav-panel', true); setPanelCollapsed('controls', true); $('layers').open = false; }
  else $('layers').open = true;
}
applyCompact();
window.addEventListener('resize', applyCompact);

// ---------------------------------------------------------------------------
// Label de-cluttering: hide labels whose screen rectangles overlap a higher-priority label
// (priority: selected > hovered > Sun > bigger planets). Uses projected positions, no DOM layout reads.
// ---------------------------------------------------------------------------
const labelOrder = [...bodies].sort((a, b) => b.radius - a.radius);
function declutterLabels() {
  if (labelRenderer.domElement.style.display === 'none' || activeScene !== scene) return;
  const w = window.innerWidth, h = window.innerHeight;
  const ordered = labelOrder.slice().sort((a, b) => prio(b) - prio(a));
  const placed = [];
  for (const b of ordered) {
    const lab = b.labelEl;
    // moons of Saturn/Uranus/Neptune: labels only while their system is focused (in the overview they crowd the planet and steal its taps)
    if (b.isMoon && OUTER_MOON_SYSTEMS[b.parent.name] && b !== hovered && focused !== b.parent && (!focused || focused.parent !== b.parent)) { lab.classList.add('overlap'); continue; }
    lab._obj.getWorldPosition(_proj).project(camera);
    if (_proj.z > 1) continue;
    const cx = (_proj.x + 1) / 2 * w, cy = (1 - _proj.y) / 2 * h;
    const lw = (lab._w ||= lab.offsetWidth || lab.textContent.length * 7 + 18), lh = (lab._h ||= lab.offsetHeight || 20);
    const rect = [cx - lw / 2 - 2, cy - lh / 2 - 2, cx + lw / 2 + 2, cy + lh / 2 + 2];
    const hit = placed.some((p) => rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1]);
    // keep Earth+Moon labels together when either is focused
    // single-moon systems (Earth): keep planet + Moon labels together when either is focused
    const forced = b === focused || b === hovered ||
      (focused && ((b.parent === focused && focused.moons.length === 1) || (focused.isMoon && b === focused.parent && b.moons.length === 1)));
    lab.classList.toggle('overlap', hit && !forced);
    if (!hit || forced) placed.push(rect);
  }
}
function prio(b) {
  if (b === focused) return 1e6;
  if (b === hovered) return 1e5;
  // moons of the focused planet (or siblings/parent of a focused moon) outrank everything else
  if (focused && (b.parent === focused || b === focused.parent || (focused.parent && b.parent === focused.parent))) return 5e4 + b.radius;
  return b.name === 'Sun' ? 1e4 : b.radius;
}

// ---------------------------------------------------------------------------
// Camera focus / follow with smooth transitions
// ---------------------------------------------------------------------------
let focused = null;          // body being followed (null = overview)
let transition = null;       // { fromCam, fromTarget, t, offset | overview }
const lastFocusPos = new THREE.Vector3();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function bodyWorldPos(b, out) { return b.group.getWorldPosition(out); }
// ScaleBot: Earth's cinematic arrival distance (Earth radii). ~4.5 R on desktop; on narrow screens (iPad portrait) backed
// off so the globe's diameter is at most ~45% of the smaller screen side (uses the narrower horizontal FOV).
const EARTH_ARRIVE_R = 4.5, EARTH_FRAME_FILL = 0.45;
function earthCinematicDistance() {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanMin = Math.min(tanV, tanV * camera.aspect);
  return Math.max(EARTH_ARRIVE_R, 1 / Math.sin(Math.atan(EARTH_FRAME_FILL * tanMin)));
}
function focusOffset(b, out) {
  const p = bodyWorldPos(b, tmp2);
  // Earth: back off far enough that the whole Moon orbit is in frame
  // planets with moons: back off far enough that the whole moon system is in frame
  const dist = b.name === 'Sun' ? 32 : b.systemRadius ? b.systemRadius * 3.4 : b.radius * 6 + 2.5;
  if (p.lengthSq() < 1e-6) out.set(0, 0.45, 1);
  else {
    // start from the outward direction, swing ~110° around toward the Sun so we see the lit (day) side
    // multi-moon systems (Mars, Jupiter) get a higher viewpoint (~40°) so moons don't hide behind the planet
    const elev = b.focusElev ?? (b.moons && b.moons.length > 1 ? 0.85 : 0.4);
    out.copy(p).setY(0).normalize().applyAxisAngle(UP, 1.9).add(new THREE.Vector3(0, elev, 0)).normalize();
  }
  return out.multiplyScalar(dist);
}

function focusOn(b) {
  focused = b;
  drift = null;
  setMoonsExpanded(b.moons && b.moons.length ? b : b.parent || b, true);
  if (!cinematicArrival(b)) {
    transition = { fromCam: camera.position.clone(), fromTarget: controls.target.clone(), t: 0, offset: focusOffset(b, new THREE.Vector3()) };
    controls.minDistance = Math.max(b.radius * 1.5, 0.3);
  }
  bodies.forEach((o) => { o.labelEl.classList.toggle('active', o === b); o.button.classList.toggle('active', o === b); });
  showInfo(b);
}
// ScaleBot: cinematic arrival for Earth and the Moon. Same log-space fly as flyTo (distance-scaled duration), but the goal
// is re-evaluated every frame so the camera tracks the orbiting body, and ends on the module's suggested framing
// (earth/ & moon/ getCinematicStart(): offset in body radii, world frame). The live rendered radius is used, so the Moon's
// 0.5x -> 0.273x size easing is followed as the camera closes in. On arrival a slow drift carries the view across the
// terminator until the user touches, drags or zooms (then it stays off for this focus).
let drift = null;            // { body, helper, useOut, angle } while the post-arrival drift is running
let userTouched = false;     // set by any controls start / wheel / pointerdown; cancels a pending or running drift
const CINEMATIC_MIN_SEC = 1.6;
function cinematicHelper(b) {
  const h = b.earth || b.moon;
  return h && typeof h.getCinematicStart === 'function' ? h : null;
}
function cinematicMinDist(b) { return Math.max(b.radius * 1.5, 0.3); }
function cinematicArrival(b) {
  const helper = cinematicHelper(b);
  if (!helper) return false;
  const opts = b.earth ? { distance: earthCinematicDistance() } : undefined;   // Earth only (Moon keeps its default); reused by the drift
  let c;
  try { c = helper.getCinematicStart(undefined, opts); } catch (e) { return false; }
  if (!c || !c.offset || !(c.offset.lengthSq() > 0)) return false;
  let last = c;
  const goalTarget = () => {
    const p = bodyWorldPos(b, new THREE.Vector3());
    return last.target ? p.addScaledVector(last.target, b.radius) : p;
  };
  const goalCam = () => {
    last = helper.getCinematicStart(undefined, opts) || last;           // depends on the Sun direction: keep it current as the body moves
    const t = goalTarget(), r = b.radius;
    const d = Math.max(last.offset.length() * r, cinematicMinDist(b) * 1.05);
    return t.add(_cineDir.copy(last.offset).normalize().multiplyScalar(d));
  };
  userTouched = false;
  flyTo(goalCam, goalTarget, CINEMATIC_MIN_SEC, () => {
    controls.minDistance = cinematicMinDist(b);           // radius is final now (Moon size easing has settled)
    if (focused === b && !userTouched && last.driftAxis && last.driftSpeed) drift = { body: b, helper, opts, useOut: helperTakesOut(helper), angle: 0 };
  });
  transition.cinematic = b;
  // fly in around the body itself (not the moving orbit target), so the distance to the body shrinks steadily in log space
  // even when the start is beside another body (e.g. Earth -> Moon, where a target-relative arc swings out first)
  transition.fromOffset = camera.position.clone().sub(transition.goalTarget);
  controls.minDistance = 0;                               // the live Moon radius shrinks mid-flight; clamp again on arrival
  return true;
}
// The drift re-reads the helper every frame, so the framing stays on the day/night line however fast the sim runs
// (at 10 days/s Earth swings ~10° around the Sun per second; a fixed offset would slide to full phase in seconds).
// If a helper fills an `out` object (getCinematicStart(out, opts)), we hand it a reused one to avoid per-frame garbage.
// Support is probed once per helper: today's helpers take (opts) and simply see an object without opts keys (defaults).
const _cineOut = { offset: new THREE.Vector3(), target: new THREE.Vector3(), driftSpeed: 0, driftAxis: new THREE.Vector3() };
const _outSupport = new WeakMap();
function helperTakesOut(helper) {
  if (_outSupport.has(helper)) return _outSupport.get(helper);
  let ok = false;
  try {
    const probe = { offset: new THREE.Vector3(), target: new THREE.Vector3(), driftAxis: new THREE.Vector3() };  // no opts keys
    const r = helper.getCinematicStart(probe);
    ok = r === probe && probe.offset.lengthSq() > 0;
  } catch (e) { ok = false; }
  _outSupport.set(helper, ok);
  return ok;
}
const _driftAxis = new THREE.Vector3(), _driftOff = new THREE.Vector3(), _driftP = new THREE.Vector3();
function applyDrift(dt) {
  const b = drift.body;
  let c;
  try { c = drift.useOut ? drift.helper.getCinematicStart(_cineOut, drift.opts) : drift.helper.getCinematicStart(undefined, drift.opts); } catch (e) { c = null; }
  if (!c || !c.offset || !c.driftAxis || !(c.offset.lengthSq() > 0)) { drift = null; return; }   // fall back to plain follow
  drift.angle += (c.driftSpeed || 0) * dt;
  const r = b.radius;
  bodyWorldPos(b, _driftP);
  if (c.target) _driftP.addScaledVector(c.target, r);
  const d = Math.max(c.offset.length() * r, cinematicMinDist(b) * 1.05);
  _driftOff.copy(c.offset).normalize().multiplyScalar(d);
  if (c.driftAxis.lengthSq() > 1e-12) _driftOff.applyAxisAngle(_driftAxis.copy(c.driftAxis).normalize(), drift.angle);
  controls.target.copy(_driftP);
  camera.position.copy(_driftP).add(_driftOff);
}
function stopDrift() { userTouched = true; drift = null; }
controls.addEventListener('start', stopDrift);
renderer.domElement.addEventListener('wheel', stopDrift, { passive: true });
renderer.domElement.addEventListener('pointerdown', stopDrift);

function goOverview() {
  focused = null;
  drift = null;
  transition = { fromCam: camera.position.clone(), fromTarget: controls.target.clone(), t: 0, overview: true };
  controls.minDistance = 2;
  bodies.forEach((o) => { o.labelEl.classList.remove('active'); o.button.classList.remove('active'); });
  hideInfo();
}

// ---------------------------------------------------------------------------
// Solar System ⇄ Galaxy transitions
// Fly out → fade to black → swap scene + camera range → fade in → fly to the destination.
// ---------------------------------------------------------------------------
const fadeEl = $('fade');
const _cineDir = new THREE.Vector3();
// ScaleBot: longer fly-tos scale with how far they really travel. `duration` is now a minimum: each factor of ten in
// camera distance adds FLY_SEC_PER_DECADE seconds, and moving the target far relative to the view adds a little more,
// capped per stage. Pass fixed = true for a stage that is timed against something else (e.g. the fade-to-black).
const FLY_SEC_PER_DECADE = 1.5, FLY_SEC_TRAVEL = 1.2, FLY_STAGE_MAX = 9;
function flyDuration(goalCam, goalTarget, duration) {
  const d0 = Math.max(camera.position.distanceTo(controls.target), 1e-6), d1 = Math.max(goalCam.distanceTo(goalTarget), 1e-6);
  const decades = Math.abs(Math.log10(d1 / d0));
  const travel = Math.log10(1 + controls.target.distanceTo(goalTarget) / Math.max(d0, d1));
  return Math.min(FLY_STAGE_MAX, Math.max(duration * 1.3, 1.2 + decades * FLY_SEC_PER_DECADE + travel * FLY_SEC_TRAVEL));
}
function flyToFixed(goalCam, goalTarget, duration, onDone) { flyTo(goalCam, goalTarget, duration, onDone, true); }
// goalCam / goalTarget may be Vector3s (fixed goal) or functions returning a fresh Vector3, re-evaluated every frame so the
// fly can track a moving goal (an orbiting planet, the Sun marker in the turning Milky Way). Duration uses their start values.
function flyTo(goalCam, goalTarget, duration, onDone, fixed = false) {
  const camFn = typeof goalCam === 'function' ? goalCam : null, targetFn = typeof goalTarget === 'function' ? goalTarget : null;
  const gc = camFn ? camFn() : goalCam.clone(), gt = targetFn ? targetFn() : goalTarget.clone();
  if (!fixed) duration = flyDuration(gc, gt, duration);
  transition = { fly: true, fromCam: camera.position.clone(), fromTarget: controls.target.clone(), t: 0,
    goalCam: gc, goalTarget: gt, camFn, targetFn, duration, onDone };
}
function setCameraRange(near, far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
function beginTransit() {
  mode = 'transit';
  controls.enabled = false;
  controls.minDistance = 0; controls.maxDistance = Infinity;
  hovered = null;
  hideInfo();
}
function updateGalaxyButton() {
  const g = activeScene === galaxy.scene;
  $('galaxy-btn').innerHTML = g ? '<span class="ico">☀</span><span class="lbl">Solar System</span>' : '<span class="ico">🌌</span><span class="lbl">Galaxy</span>';
  // view row: compact icon + short label; the focused object's button turns into "back to the Milky Way"
  setDeepBtn('andromeda-btn', g && galaxyFocus === 'm31', '🔭', 'Andromeda');
  setDeepBtn('sombrero-btn', g && galaxyFocus === 'm104', '🎩', 'Sombrero');
  setDeepBtn('sgra-btn', g && galaxyFocus === 'sgra', '⚫', 'Sgr A*');
  setDeepBtn('ton618-btn', g && galaxyFocus === 'ton618', '✴', 'TON 618');
  document.body.classList.toggle('galaxy-mode', g);
}

function setDeepBtn(id, focusedHere, icon, label) {
  const b = $(id);
  b.innerHTML = focusedHere ? '<span class="ico">🌌</span><span class="lbl">Milky Way</span>' : `<span class="ico">${icon}</span><span class="lbl">${label}</span>`;
  b.classList.toggle('active', focusedHere);
  b.setAttribute('aria-label', focusedHere ? 'Back to the Milky Way' : label);
}

function enterGalaxy(after) {
  if (mode !== 'solar') return;
  galaxyFocus = 'mw';
  focused = null;
  drift = null;
  bodies.forEach((o) => { o.labelEl.classList.remove('active'); o.button.classList.remove('active'); });
  beginTransit();
  const dir = tmp.subVectors(camera.position, controls.target).normalize();
  if (dir.lengthSq() < 0.5) dir.set(0, 0.5, 0.86);
  setTimeout(() => fadeEl.classList.add('on'), 550);
  flyToFixed(controls.target.clone().addScaledVector(dir, 2200), new THREE.Vector3(), 1.0, () => {
    // swap to the galaxy scene: start close to the Sun marker, then pull back to the full galaxy
    activeScene = galaxy.scene;
    setCameraRange(1, GALAXY_FAR);
    updateGalaxyButton();
    const sun = galaxy.sunWorldPos();
    controls.target.copy(sun);
    camera.position.copy(sun).add(new THREE.Vector3(0, 18, 30));
    fadeEl.classList.remove('on');
    flyTo(GALAXY_POS, new THREE.Vector3(), 2.4, () => {
      mode = 'galaxy';
      controls.minDistance = GALAXY_MIN_DIST; controls.maxDistance = GALAXY_MAX_DIST;
      controls.enabled = true;
      if (after) after();
    });
  });
}

// Milky Way ⇄ Andromeda: pull back to a Local Group view that shows both galaxies (so you feel the 2.5-million-ly gap),
// then glide in to the destination.
function lgView() {
  const axis = tmp2.subVectors(galaxy.M31_POS, galaxy.SUN_POS).normalize().clone();
  if (camera.aspect < 1) {
    // narrow/portrait screens: stand behind the Milky Way and look toward Andromeda —
    // our galaxy fills the foreground, Andromeda is a small oval far away in the middle of the screen
    const back = axis.clone().negate();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
    back.applyAxisAngle(new THREE.Vector3().crossVectors(up, back).normalize(), -14 * Math.PI / 180);
    return { cam: back.multiplyScalar(2600), target: galaxy.M31_POS.clone() };
  }
  // wide screens: look roughly along Andromeda's disk axis (so it shows as a recognizable spiral, not a sliver),
  // kept perpendicular-ish to the MW–M31 line and framed to fit both galaxies
  const side = galaxy.m31Normal.clone().addScaledVector(axis, -galaxy.m31Normal.dot(axis));
  if (side.y < 0) side.negate();
  side.normalize().addScaledVector(axis, -0.2).normalize();
  // keep both galaxies in the middle ~40% of the screen width (clear of the side panels)
  const fit = 12500 / 0.42 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.aspect;
  return { cam: LG_MID.clone().addScaledVector(side, fit), target: LG_MID.clone() };
}
const lgPair = () => { const v = lgView(); return [v.cam, v.target]; };
function galaxyFly(midCam, midTarget, endCam, endTarget, onDone) {
  beginTransit();
  glideBase = null;
  flyTo(midCam, midTarget, 2.6, () => flyTo(endCam, endTarget, 2.6, () => {
    mode = 'galaxy';
    controls.enabled = true;
    if (onDone) onDone();
  }));
}
function flyToAndromeda() {
  if (galaxyFocus === 'sgra') { leaveSgrA(() => flyToAndromeda()); return; }
  if (galaxyFocus === 'ton618') { leaveTon618(() => flyToAndromeda()); return; }
  if (mode !== 'galaxy' || galaxyFocus === 'm31') return;
  // final view: from our side of Andromeda (as we see it from the Milky Way: tilted 77°), slightly above and to one side
  const toUs = galaxy.m31Dir.clone().negate();
  const sideways = new THREE.Vector3(0, 1, 0).cross(toUs).normalize();
  // view close to our own line of sight, so it looks like the famous photos (a long tilted oval), nudged a little for depth
  const endDir = toUs.clone().addScaledVector(sideways, 0.18).addScaledVector(galaxy.m31Minor, 0.12).normalize();
  const endDist = galaxy.M31_R * 1.12 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.min(1, camera.aspect);
  galaxyFly(...lgPair(), galaxy.M31_POS.clone().addScaledVector(endDir, endDist), galaxy.M31_POS, () => {
    galaxyFocus = 'm31';
    controls.minDistance = M31_MIN_DIST; controls.maxDistance = GALAXY_MAX_DIST;
    updateGalaxyButton();
    showAndromedaInfo();
  });
}
function flyToMilkyWay() {
  if (galaxyFocus === 'sgra') { leaveSgrA(); return; }
  if (galaxyFocus === 'ton618') { leaveTon618(); return; }
  if (mode !== 'galaxy' || galaxyFocus === 'mw') return;
  galaxyFly(...homePair(), GALAXY_POS, new THREE.Vector3(), () => {
    galaxyFocus = 'mw';
    controls.minDistance = GALAXY_MIN_DIST; controls.maxDistance = GALAXY_MAX_DIST;
    updateGalaxyButton();
  });
}

// ---- Deep space: Sombrero (M104), Sagittarius A*, TON 618 ----
// Far view: Milky Way + Andromeda + Sombrero for scale (look perpendicular to the plane through all three)
function universeView() {
  const a = galaxy.M31_POS.clone().sub(galaxy.SUN_POS), b = sombrero.POS.clone().sub(galaxy.SUN_POS);
  const n = new THREE.Vector3().crossVectors(a, b).normalize(); if (n.y < 0) n.negate();
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), half = b.length() * 0.5 / 0.72;
  const dist = camera.aspect >= 1 ? half / tanH / camera.aspect : half / tanH;
  return { cam: UNIVERSE_MID.clone().addScaledVector(n, dist), target: UNIVERSE_MID.clone() };
}
function flyToSombrero() {
  if (galaxyFocus === 'sgra') { leaveSgrA(() => flyToSombrero()); return; }
  if (galaxyFocus === 'ton618') { leaveTon618(() => flyToSombrero()); return; }
  if (mode !== 'galaxy' || galaxyFocus === 'm104') return;
  const I = sombrero.info, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // end on our own line of sight → the famous near-edge-on view (6° from edge-on), framed to fit the screen
  const endDist = sombrero.R * (camera.aspect > 1 ? 1.2 : 0.95) / tanH / camera.aspect;
  const u = universeView();
  galaxyFly(u.cam, u.target, sombrero.POS.clone().addScaledVector(I.los, endDist), sombrero.POS.clone(), () => {
    galaxyFocus = 'm104';
    controls.minDistance = M104_MIN_DIST; controls.maxDistance = GALAXY_MAX_DIST;
    updateGalaxyButton();
    showSombreroInfo();
  });
}
// Local Group dwarfs (localgroup/): the Magellanic Clouds through a view of the Milky Way beside the Cloud, M33 through the
// Local Group view (like Andromeda). Two flyTo() stages via galaxyFly, as for the Sombrero.
function flyToLocalGroup(key) {
  if (galaxyFocus === 'sgra') { leaveSgrA(() => flyToLocalGroup(key)); return; }
  if (galaxyFocus === 'ton618') { leaveTon618(() => flyToLocalGroup(key)); return; }
  if (mode !== 'galaxy' || galaxyFocus === key) return;
  const mid = localGroup.isNear(key) ? localGroup.farPair(key, camera) : lgPair(), end = localGroup.focusView(key, camera);
  galaxyFly(...mid, end.position, end.target, () => {
    galaxyFocus = key;
    controls.minDistance = end.minDistance; controls.maxDistance = GALAXY_MAX_DIST;
    updateGalaxyButton();
    localGroup.showInfo(key);
  });
}
function onLocalGroupTap(key) { if (galaxyFocus === key) localGroup.showInfo(key); else flyToLocalGroup(key); }
// way home from a focus: back past the Milky Way + Cloud view for the Clouds, through the Local Group view otherwise
const homePair = () => (localGroup.isNear(galaxyFocus) ? localGroup.farPair(galaxyFocus, camera) : lgPair());

// Sagittarius A*: fly to an (enlarged) close-up of the central black hole, as seen from the Sun's direction
function flyToSgrA() {
  if (galaxyFocus === 'ton618') { leaveTon618(() => flyToSgrA()); return; }
  if (mode !== 'galaxy' || galaxyFocus === 'sgra') return;
  const fromFar = galaxyFocus !== 'mw';   // Andromeda / Sombrero: come home through the Local Group view first
  beginTransit();
  glideBase = null;
  const goIn = () => {
    const f = sgra.focusView(camera);
    flyTo(GALAXY_POS.clone().lerp(f.position, 0.55), f.target, 1.6, () => flyTo(f.position, f.target, 2.2, () => {
      mode = 'galaxy'; galaxyFocus = 'sgra';
      controls.minDistance = f.minDistance; controls.maxDistance = GALAXY_MAX_DIST;
      controls.enabled = true;
      updateGalaxyButton();
      sgra.showInfo();
    }));
  };
  if (fromFar) flyTo(...homePair(), 2.6, () => flyTo(GALAXY_POS, new THREE.Vector3(), 2.4, goIn)); else goIn();
}
function leaveSgrA(after) {
  if (mode !== 'galaxy' || galaxyFocus !== 'sgra') return;
  beginTransit();
  flyTo(GALAXY_POS, new THREE.Vector3(), 2.4, () => {
    mode = 'galaxy'; galaxyFocus = 'mw';
    controls.minDistance = GALAXY_MIN_DIST; controls.maxDistance = GALAXY_MAX_DIST;
    controls.enabled = true;
    updateGalaxyButton();
    if (after) after();
  });
}
// TON 618: pull back until the Milky Way and TON 618 are both on screen (10.8 billion ly apart, "every dash = 1 billion ly"),
// glide out to the quasar (host galaxy + jets + glare), then drop into the enlarged black-hole close-up
function flyToTon618() {
  if (galaxyFocus === 'sgra') { leaveSgrA(() => flyToTon618()); return; }
  if (mode !== 'galaxy' || galaxyFocus === 'ton618') return;
  beginTransit();
  glideBase = null;
  const far = ton618.farView(camera), app = ton618.focusView(camera, { view: 'approach' }), close = ton618.focusView(camera);
  flyTo(far.position, far.target, 2.6, () => flyTo(app.position, app.target, 2.8, () => flyTo(close.position, close.target, 2.2, () => {
    mode = 'galaxy'; galaxyFocus = 'ton618';
    controls.minDistance = close.minDistance; controls.maxDistance = TON618_MAX_DIST;
    controls.enabled = true;
    updateGalaxyButton();
    ton618.showInfo();
  })));
}
function leaveTon618(after) {
  if (mode !== 'galaxy' || galaxyFocus !== 'ton618') return;
  beginTransit();
  const far = ton618.farView(camera);
  flyTo(far.position, far.target, 2.6, () => flyTo(GALAXY_POS, new THREE.Vector3(), 2.6, () => {
    mode = 'galaxy'; galaxyFocus = 'mw';
    controls.minDistance = GALAXY_MIN_DIST; controls.maxDistance = GALAXY_MAX_DIST;
    controls.enabled = true;
    updateGalaxyButton();
    if (after) after();
  }));
}

// While zoomed far out, slide the orbit target from the focused galaxy toward the Local Group midpoint,
// so zooming out reveals both galaxies (and zooming back in returns to the focused one).
const _glide = new THREE.Vector3();
let glideBase = null, glideEnabled = true;                 // orbit target when the glide started (keeps any panning the user did)
function glideGalaxyTarget() {
  const d = camera.position.distanceTo(controls.target);
  if (d < 2500) { glideBase = null; return; }
  if (!glideBase) glideBase = controls.target.clone();
  const t = THREE.MathUtils.smoothstep(d, 2500, 26000), t2 = THREE.MathUtils.smoothstep(d, 60000, 450000);
  _glide.copy(glideBase).lerp(LG_MID, t).lerp(UNIVERSE_MID, t2).sub(controls.target);   // ...and further out toward MW + M31 + M104
  if (_glide.lengthSq() > 1e-6) { camera.position.add(_glide); controls.target.add(_glide); }
}

function exitGalaxy(after) {
  if (mode !== 'galaxy') return;
  if (galaxyFocus === 'sgra') { leaveSgrA(() => exitGalaxy(after)); return; }
  if (galaxyFocus === 'ton618') { leaveTon618(() => exitGalaxy(after)); return; }
  if (galaxyFocus !== 'mw') { // come home first, then drop into the Solar System
    galaxyFly(...homePair(), GALAXY_POS, new THREE.Vector3(), () => {
      galaxyFocus = 'mw'; updateGalaxyButton(); exitGalaxy(after);
    });
    return;
  }
  beginTransit();
  const sun = galaxy.sunWorldPos();
  const dir = new THREE.Vector3().subVectors(camera.position, sun).normalize();
  setTimeout(() => fadeEl.classList.add('on'), 1100);
  // track the Sun marker live (the disk turns), so the dive ends on the Sun rather than where it was when we set off
  flyToFixed(() => galaxy.sunWorldPos().addScaledVector(dir, 25), () => galaxy.sunWorldPos(), 1.6, () => {
    activeScene = scene;
    setCameraRange(0.05, 6000);
    updateGalaxyButton();
    controls.target.set(0, 0, 0);
    camera.position.copy(OVERVIEW_POS).normalize().multiplyScalar(2200);
    fadeEl.classList.remove('on');
    flyTo(OVERVIEW_POS, new THREE.Vector3(), 1.9, () => {
      mode = 'solar';
      controls.minDistance = 2; controls.maxDistance = SOLAR_MAX_DIST;
      controls.enabled = true;
      if (after) after();
    });
  });
}
const _flyA = new THREE.Vector3(), _flyB = new THREE.Vector3();
const _flyQ = new THREE.Quaternion(), _flyQI = new THREE.Quaternion();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function updateCamera(dt) {
  if (transition) {
    transition.t = Math.min(1, transition.t + dt / (transition.duration || 1.6));
    const e = ease(transition.t);
    let goalTarget, goalCam;
    if (transition.fly) {
      if (transition.targetFn) transition.goalTarget = transition.targetFn();
      if (transition.camFn) transition.goalCam = transition.camFn();
      goalTarget = transition.goalTarget; goalCam = transition.goalCam;
    }
    else if (transition.overview) { goalTarget = new THREE.Vector3(); goalCam = OVERVIEW_POS; }
    else { goalTarget = bodyWorldPos(focused, new THREE.Vector3()); goalCam = goalTarget.clone().add(transition.offset); }
    controls.target.lerpVectors(transition.fromTarget, goalTarget, e);
    if (transition.fly) {
      // ScaleBot: log-space fly. The camera's distance to its target changes by the same factor per unit of eased time,
      // so every power of ten gets equal screen time (instead of racing through the near part of a huge jump).
      // (cinematic arrivals pass fromOffset: interpolate about the live body instead of the lerped orbit target)
      const anchor = transition.fromOffset ? goalTarget : controls.target;
      const o0 = transition.fromOffset ? _flyA.copy(transition.fromOffset) : _flyA.subVectors(transition.fromCam, transition.fromTarget);
      const o1 = _flyB.subVectors(goalCam, goalTarget);
      const d0 = Math.max(o0.length(), 1e-6), d1 = Math.max(o1.length(), 1e-6);
      let dir;
      if (transition.fromOffset) {   // great-circle swing (also safe when start and end directions are opposite)
        o0.divideScalar(d0); _flyQ.setFromUnitVectors(o0, o1.divideScalar(d1));
        dir = o0.applyQuaternion(_flyQI.identity().slerp(_flyQ, e));
      } else {
        dir = o0.divideScalar(d0).lerp(o1.divideScalar(d1), e);
        if (dir.lengthSq() < 1e-8) dir.set(0, 0.5, 0.86);
      }
      dir.normalize();
      camera.position.copy(anchor).addScaledVector(dir, Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * e));
    } else {
      camera.position.lerpVectors(transition.fromCam, goalCam, e);
    }
    if (transition.t >= 1) {
      const done = transition.onDone;
      transition = null;
      if (focused) bodyWorldPos(focused, lastFocusPos);
      if (done) done();
    }
  } else if (focused) {
    // follow: shift camera and target by the body's motion; user can still orbit/zoom around it
    const p = bodyWorldPos(focused, tmp);
    const delta = tmp2.subVectors(p, lastFocusPos);
    camera.position.add(delta);
    controls.target.add(delta);
    lastFocusPos.copy(p);
    // cinematic drift after an Earth/Moon arrival: helper framing re-read each frame, swung by the accumulated
    // real-time drift angle (stops for good on any user interaction; plain follow from then on)
    if (drift && drift.body === focused) applyDrift(dt);
  }
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const dateEl = $('date');


/** Snap Jupiter's Galilean moons to their real mean longitudes at `days` (kept slowed while time runs). */
function anchorGalileanMoons(days) {
  for (const b of bodies) {
    if (!b.realLon || b.name === 'Moon') continue;
    anchorMoonPhase(b, days, galileanLongitude(b.name, days));
  }
}

const _earthPos = new THREE.Vector3(), _moonPos = new THREE.Vector3();
function currentMoonPhase() {
  const earth = bodies.find((b) => b.name === 'Earth');
  if (!MOON || !earth) return null;
  earth.group.getWorldPosition(_earthPos);
  MOON.group.getWorldPosition(_moonPos);
  return moonPhaseFromPositions(_earthPos, _moonPos);
}

// Phase readout wording, e.g. "Full Moon · 99% lit, as seen from Earth"
function moonPhaseText(ph) { return ph.label + ', as seen from Earth'; }
// let the longer readout wrap on narrow screens instead of overflowing/clipping
function setPhaseText(el, text) {
  if (el.textContent !== text) el.textContent = text;
  el.style.whiteSpace = 'normal';
  el.style.overflowWrap = 'anywhere';
}

function updateMoonPhaseUI() {
  const ph = currentMoonPhase();
  if (!ph) return;
  const ctrl = $('moon-phase');
  if (ctrl) setPhaseText(ctrl, 'Moon: ' + moonPhaseText(ph));
  const infoPh = $('info-phase');
  if (infoPh && focused && focused.name === 'Moon') setPhaseText(infoPh, moonPhaseText(ph));
}

function updateBodies() {
  const days = (simTime - J2000) / DAY_MS;
  for (const b of bodies) {
    if (b.update) { b.update(days); continue; }
    if (b.name === 'Sun') { b.mesh.rotation.y = (days / 25.4 / SPIN_SLOWDOWN) * Math.PI * 2; continue; }
    if (b.isMoon) {
      // Earth's Moon: real ecliptic longitude every frame (slow = 1) so phases match the calendar.
      // Galilean moons: slowed motion from a phase anchored to the real longitude at the last date pick.
      const a = b.name === 'Moon' ? moonEclipticLongitude(days)
        : b.phase + (days / (b.period * b.slow)) * Math.PI * 2;
      b.group.position.set(Math.cos(a) * b.orbitDist, 0, -Math.sin(a) * b.orbitDist);
      b.mesh.rotation.y = a + Math.PI; // tidally locked: same face toward planet
      continue;
    }
    const p = b.info;
    if (!realPositions.place(b, days)) {      // ephemeris/: real orbit for the date; mean-longitude circle as a fallback
      const L = THREE.MathUtils.degToRad(p.L0) + (days / p.period) * Math.PI * 2; // mean longitude
      b.group.position.set(Math.cos(L) * b.dist, 0, -Math.sin(L) * b.dist);
    }
    b.mesh.rotation.y = (days / p.rotation / SPIN_SLOWDOWN) * Math.PI * 2;
    if (b.clouds) b.clouds.rotation.y = b.mesh.rotation.y * 1.15;
  }
}

// short position history per body (used by picking so fast-moving targets are easy to tap)
function recordHistory() {
  const now = performance.now();
  for (const b of bodies) {
    const h = (b.hist ||= []);
    const last = h[h.length - 1];
    if (last && now - last.t < 30) continue;          // sample ~every 30 ms
    h.push({ t: now, p: b.group.getWorldPosition(new THREE.Vector3()) });
    while (h.length && now - h[0].t > 400) h.shift();
  }
}

const MOON = bodies.find((b) => b.name === 'Moon');

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused) simTime += daysPerSecond * dt * DAY_MS;
  updateBodies();
  scene.updateMatrixWorld();
  updateMoonPhaseUI();
  if (MOON) updateMoon(MOON, camera, sunLight, (simTime - J2000) / DAY_MS);   // moon/: lighting, earthshine, 0.5x -> 0.273x size easing
  recordHistory();
  updateCamera(dt);
  controls.update();
  // zoom-based switching between views
  if (!transition) {
    if (mode === 'solar' && controls.getDistance() >= SOLAR_MAX_DIST * 0.99) enterGalaxy();
    else if (mode === 'galaxy' && galaxyFocus === 'mw' && controls.getDistance() <= GALAXY_MIN_DIST * 1.02) exitGalaxy();
    else if (mode === 'galaxy' && galaxyFocus === 'sgra' && controls.getDistance() > 1200) { galaxyFocus = 'mw'; controls.minDistance = GALAXY_MIN_DIST; updateGalaxyButton(); }
    else if (mode === 'galaxy' && localGroup.isNear(galaxyFocus) && controls.getDistance() > 2500) { galaxyFocus = 'mw'; controls.minDistance = GALAXY_MIN_DIST; updateGalaxyButton(); }
  }
  if (mode === 'galaxy' && !transition && glideEnabled && galaxyFocus !== 'ton618') glideGalaxyTarget();
  if (activeScene === galaxy.scene) document.body.classList.toggle('lg-view', (galaxyFocus !== 'mw' && galaxyFocus !== 'sgra' && !localGroup.isNear(galaxyFocus)) || camera.position.length() > 4500);
  if (activeScene === scene) {
    const days = (simTime - J2000) / DAY_MS;
    for (const bt of belts) bt.material.uniforms.uDays.value = days;
    skyBand.update(camera);
    sunFX.update(dt, camera, sunGroup.position, true);
    spacecraft.update(days, camera, dt);
    comets.update(days, camera, dt);
    const nearSun = sunFX.stats().near;
    // fade the glow sprites out when the Sun is far off-axis or behind: a sprite near the screen edge projects to a huge straight-edged band
    camera.getWorldDirection(_camFwd);
    const sunDot = _camFwd.dot(sunGroup.getWorldPosition(_toSun).sub(camera.position).normalize());
    const sunAxisFade = THREE.MathUtils.smoothstep(sunDot, GLOW_COS_FAR, GLOW_COS_NEAR);
    glow1.material.opacity = (1 - 0.55 * nearSun) * sunAxisFade; glow2.material.opacity = (1 - 0.4 * nearSun) * sunAxisFade; // let surface detail show up close
    glow1.visible = glow2.visible = sunAxisFade > 0;
  }
  else { galaxy.update(dt, camera, mode === 'galaxy' && !paused && daysPerSecond > 0 && !localGroup.isNear(galaxyFocus) && !search.holdsSpin()); sombrero.update(camera); sgra.update(camera, renderer); ton618.update(camera, renderer); localGroup.update(camera); }
  scaleTools.update((simTime - J2000) / DAY_MS, camera, activeScene === galaxy.scene);
  ui.update((simTime - J2000) / DAY_MS, camera, activeScene === galaxy.scene);
  dateEl.textContent = 'Date: ' + new Date(simTime).toISOString().slice(0, 10) + (paused || daysPerSecond === 0 ? '  ⏸' : '');
  constellations.update(camera, { mode, transition, inSolarScene: activeScene === scene });
  renderer.render(activeScene, camera);
  declutterLabels();
  labelRenderer.render(activeScene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  // galaxy point sprites: pixels per world unit at distance 1
  for (const bt of belts) {
    bt.material.uniforms.uScale.value = window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    bt.material.uniforms.uMaxPx.value = (IS_TOUCH ? 3 : 4) * renderer.getPixelRatio();
  }
  sunFX.setScale(window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  placeNotes();
  galaxy.setScale(window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250)); // iOS reports new size a bit late

// search/: find any object by name and fly there (cinematic past the orbits/belts on long trips); grouped, filterable list
const search = createSearch({ constellations, bodies, spacecraft, comets, localGroup, galaxy, camera, controls, focusOn, flyTo, flyToFixed, galaxyFly,
  enterGalaxy, exitGalaxy, getMode: () => mode, getGalaxyFocus: () => galaxyFocus, isTransitioning: () => !!transition, flyToAndromeda,
  flyToMilkyWay, flyToSombrero, flyToSgrA, flyToTon618, flyToLocalGroup, showGalaxyInfo, scaleDistance, scene, isCompact, setPanelCollapsed,
  releaseFocus: () => { focused = null; drift = null; bodies.forEach((o) => { o.labelEl.classList.remove('active'); o.button.classList.remove('active'); }); } });
// perf/: if the frame rate stays low, thin out the big particle clouds (stars, belts, galaxies); "Restore" in Controls
// scale/: distance-scale slider (compressed ↔ true distances), distance/light-time HUD, size comparisons and true-scale ghosts
const scaleTools = createScaleTools({ DIST_SCALE, scaleDistance, bodies, smallBodies, belts, starfield, realPositions, spacecraft, comets, camera,
  controls, OVERVIEW_POS, setSolarMaxDist: (d) => { SOLAR_MAX_DIST = d; if (mode === 'solar') controls.maxDistance = d; }, getMode: () => mode,
  getFocused: () => focused, galaxy, scene });
const ui = createUI({ bodies, smallBodies, scene, camera, scaleDistance, realPositions, search, spacecraft, comets, getMode: () => mode,
  getFocused: () => focused, isPaused: () => paused || daysPerSecond === 0, togglePause, isTransitioning: () => !!transition, isTouch: IS_TOUCH, isCompact });
const perfGuard = createPerfGuard({ scenes: [scene, galaxy.scene], exclude: [sunFX.group, sgra.group, ton618.group], isTouch: IS_TOUCH });

updateBodies();
onResize();
animate();
const loading = $('loading');
loading.style.opacity = '0';
setTimeout(() => loading.remove(), 700);

// Exposed for experimenting in the browser console (e.g. solar.focusOn(solar.bodies[3]))
window.solar = { moonPhase: currentMoonPhase, moonLongitude: (d) => moonEclipticLongitude(d), anchorGalileanMoons, isTransitioning: () => !!transition, getTransitionInfo: () => transition && { t: transition.t, duration: transition.duration, cinematic: !!transition.cinematic }, asteroidBelt, kuiperBelt, smallBodies, sunFX, setGlide: (v) => (glideEnabled = v), lgView, LG_MID, flyToAndromeda, flyToMilkyWay, sombrero, flyToSombrero, sgra, flyToSgrA, leaveSgrA, ton618, flyToTon618, leaveTon618, getGalaxyFocus: () => galaxyFocus, THREE, pick, scene, camera, controls, bodies, focusOn, goOverview, isDrifting: () => !!drift, getDrift: () => drift && { angle: drift.angle, useOut: drift.useOut }, enterGalaxy, exitGalaxy, galaxy, skyBand, getMode: () => mode, spacecraft, comets, localGroup, flyToLocalGroup, realPositions, search, perfGuard, scaleTools, ui, constellations };
