// Small bodies of the Solar System:
//  • Main asteroid belt (with Kirkwood gaps) and the Kuiper belt — GPU-animated particle clouds (Jupiter's Trojans and
//    Hildas: lagrange/).
//    Every particle has its own Kepler orbit (semi-major axis, eccentricity, inclination, node, perihelion, phase);
//    the vertex shader moves it, so thousands of asteroids cost one draw call and zero CPU per frame.
//  • Orbital elements, facts and procedural surface textures for the dwarf planets (Ceres, Pluto + Charon, Eris,
//    Haumea, Makemake) and the asteroid Vesta. main.js builds the selectable bodies from these.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const GAUSS_K = 0.01720209895;          // rad/day: mean motion of a 1 AU orbit (Kepler's 3rd law: n = k / a^1.5)

// ---------------------------------------------------------------------------
// Orbital elements (approximate, J2000 ecliptic). a [AU], e, i/node/peri [deg], M0 = mean anomaly at J2000 [deg],
// period [days]. Physical data from NASA/JPL fact sheets.
// ---------------------------------------------------------------------------
export const SMALL_BODIES = [
  { name: 'Ceres', group: 'belt', type: 'Dwarf planet · largest object in the asteroid belt', diameter: 939, color: '#a59d92',
    a: 2.7675, e: 0.0758, i: 10.59, node: 80.31, peri: 73.60, M0: 6, period: 1681.6, rotation: 0.3781, tilt: 4,
    distanceText: '2.77 AU avg (2.56–2.98 AU) · 414 million km', periodText: '4.60 years (1,682 days)',
    fact: 'Ceres holds about a quarter of the whole asteroid belt\'s mass and is the only dwarf planet in the inner Solar System. ' +
          'Discovered in 1801, it was called a planet for 50 years. The bright spots in Occator crater are salt (sodium carbonate) left ' +
          'behind by briny water seeping up from below. NASA\'s Dawn spacecraft orbited it from 2015 to 2018.' },
  { name: 'Vesta', group: 'belt', type: 'Asteroid (protoplanet) · 2nd-largest in the belt', diameter: 525,
    diameterText: '525 km avg (572 × 557 × 446 km, lumpy)', color: '#b9ad9c',
    a: 2.3615, e: 0.0887, i: 7.14, node: 103.85, peri: 151.20, M0: 340, period: 1325.9, rotation: 0.2226, tilt: 29,
    distanceText: '2.36 AU avg (2.15–2.57 AU) · 353 million km', periodText: '3.63 years (1,326 days)',
    fact: 'Vesta is the brightest asteroid — sometimes visible to the naked eye. A giant impact carved the 505 km-wide Rheasilvia basin ' +
          'at its south pole, with a central peak about 22 km high (2.5× Everest). Debris from that crash still falls to Earth: ' +
          'about 1 in 20 meteorites comes from Vesta.' },
  { name: 'Pluto', group: 'kuiper', type: 'Dwarf planet · Kuiper belt (binary with Charon)', diameter: 2377, color: '#d9b99a',
    a: 39.48, e: 0.2488, i: 17.14, node: 110.30, peri: 113.77, M0: 15, period: 90560, rotation: -6.387, tilt: 122.5,
    distanceText: '39.5 AU avg (29.7–49.3 AU) · 5.9 billion km', periodText: '248 years (90,560 days)',
    dayText: '6.39 Earth days (retrograde) — locked to Charon',
    fact: 'Pluto\'s orbit is so stretched (e = 0.25) and tilted (17°) that it comes closer to the Sun than Neptune for 20 of its ' +
          '248 years (last time 1979–1999). They can never collide: Pluto goes around exactly 2 times for every 3 Neptune orbits. ' +
          'New Horizons flew past in 2015 and found a giant heart-shaped glacier of nitrogen ice (Sputnik Planitia), ' +
          'mountains of water ice and a blue hazy sky. It was reclassified as a dwarf planet in 2006.' },
  { name: 'Eris', group: 'kuiper', type: 'Dwarf planet · scattered disk', diameter: 2326, color: '#e6e6ea',
    a: 67.86, e: 0.4361, i: 44.04, node: 35.95, peri: 151.64, M0: 195, period: 204199, rotation: 15.79, tilt: 0,
    distanceText: '67.9 AU avg (38–97.5 AU) · 10 billion km', periodText: '559 years (204,199 days)', dayText: '15.8 Earth days',
    fact: 'Eris is almost exactly Pluto\'s size but 27% more massive. Its discovery in 2005 forced astronomers to define "planet" — ' +
          'which is how Pluto got demoted. Eris is one of the most reflective objects known (frozen methane snow) and is now near ' +
          'its farthest point, ~96 AU away: sunlight takes 13 hours to reach it. Its moon is Dysnomia.' },
  { name: 'Haumea', group: 'kuiper', type: 'Dwarf planet · Kuiper belt (egg-shaped, ringed)', diameter: 1632,
    diameterText: '~2,100 × 1,680 × 1,070 km (squashed by its fast spin)', color: '#f1eee8',
    a: 43.13, e: 0.1912, i: 28.21, node: 122.17, peri: 239.04, M0: 191, period: 103468, rotation: 0.1631, tilt: 0,
    distanceText: '43.1 AU avg (34.9–51.5 AU)', periodText: '283 years (103,468 days)', dayText: '3.9 hours (fastest-spinning large body)',
    fact: 'Haumea spins once every 3.9 hours — so fast it has stretched into an egg shape twice as long as it is thick. ' +
          'In 2017 astronomers found it has a ring, the first seen around a Kuiper belt object. It has two moons, Hiʻiaka and Namaka, ' +
          'and a surface of nearly pure crystalline water ice with a dark red spot.' },
  { name: 'Makemake', group: 'kuiper', type: 'Dwarf planet · Kuiper belt', diameter: 1430, color: '#c98a64',
    a: 45.43, e: 0.161, i: 28.98, node: 79.62, peri: 294.8, M0: 141, period: 111845, rotation: 0.951, tilt: 0,
    distanceText: '45.4 AU avg (38.1–52.8 AU)', periodText: '306 years (111,845 days)', dayText: '22.8 hours',
    fact: 'Makemake was found just after Easter 2005 and is nicknamed "Easter Bunny"; its official name comes from the creator god of ' +
          'Rapa Nui (Easter Island). It is the second-brightest Kuiper belt object after Pluto, covered in reddish-brown frozen methane ' +
          'and ethane, and has a small dark moon nicknamed MK2.' },
];

export const CHARON_INFO = {
  name: 'Charon', type: 'Moon of Pluto (binary partner)', diameter: 1212, color: '#a8a39c', period: 6.387,
  distLabel: 'Distance from Pluto', distanceText: '19,591 km (center to center)',
  periodText: '6.39 days (around the shared center)', dayText: 'Tidally locked — and so is Pluto',
  fact: 'Charon is half Pluto\'s width — so big that the two orbit a point in empty space between them (the barycenter lies ' +
        'about 960 km above Pluto\'s surface), making them a true double world. Both are tidally locked: they always show each other ' +
        'the same face, so from one side of Pluto Charon hangs motionless in the sky forever. Its reddish north pole (Mordor Macula) ' +
        'is stained by gas escaping from Pluto.',
};
export const CHARON_MASS_RATIO = 0.1218;   // Charon / Pluto

// ---------------------------------------------------------------------------
// Kepler orbit → heliocentric ecliptic position (AU). Scene axes: x = ecliptic X, y = ecliptic Z (north), z = −ecliptic Y,
// which matches main.js's planets (x = cos L, z = −sin L).
// ---------------------------------------------------------------------------
export function keplerAU(el, days, out = new THREE.Vector3()) {
  const M = el.M0 * DEG + (days / el.period) * Math.PI * 2;
  let E = M;
  for (let k = 0; k < 6; k++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  return fromEccentric(el, E, out);
}
function fromEccentric(el, E, out) {
  const xo = el.a * (Math.cos(E) - el.e), yo = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const w = el.peri * DEG, O = el.node * DEG, inc = el.i * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const X = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const Y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const Z = (sw * si) * xo + (cw * si) * yo;
  return out.set(X, Z, -Y);
}
// Apply main.js's compressed distance scale radially (keeps the real direction → real inclination and orbit shape on the sky)
export function scaleAU(v, scaleDistance) { const r = v.length(); return r > 0 ? v.multiplyScalar(scaleDistance(r) / r) : v; }
export function orbitPoints(el, scaleDistance, n = 360) {
  const pts = [];
  for (let k = 0; k < n; k++) pts.push(scaleAU(fromEccentric(el, (k / n) * Math.PI * 2, new THREE.Vector3()), scaleDistance));
  return pts;
}

// ---------------------------------------------------------------------------
// Particle belts
// ---------------------------------------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

const BELT_VERT = /* glsl */`
  attribute vec4 aOrbit;   // a [AU], e, i [rad], node [rad]
  attribute vec3 aPhase;   // peri [rad], M0 [rad], size [world units]
  attribute vec3 color;
  uniform float uDays, uScale, uMaxPx, uDistA, uDistB, uDistP, uBright;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float a = aOrbit.x, e = aOrbit.y, inc = aOrbit.z, node = aOrbit.w, w = aPhase.x;
    float M = aPhase.y + 0.01720209895 / (a * sqrt(a)) * uDays;      // Kepler: inner asteroids lap the outer ones
    float E = M + e * sin(M); E = M + e * sin(E);                      // 2 fixed-point steps of Kepler's equation (e is small)
    float xo = a * (cos(E) - e), yo = a * sqrt(1.0 - e * e) * sin(E);
    float cw = cos(w), sw = sin(w), cO = cos(node), sO = sin(node), ci = cos(inc), si = sin(inc);
    vec3 p = vec3((cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo,
                  (sw * si) * xo + (cw * si) * yo,
                 -((sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo));
    float r = length(p);
    p *= (uDistA + uDistB * pow(r, uDistP)) / r;                       // same compressed distance scale as the planets
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float px = aPhase.z * uScale / -mv.z;
    vAlpha = clamp(px, 0.0, 1.0) * uBright;                            // sub-pixel particles fade by area instead of flickering
    gl_PointSize = clamp(px, 1.2, uMaxPx);
    vColor = color;
    gl_Position = projectionMatrix * mv;
  }`;
const BELT_FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.25, 0.05, d));
  }`;

function makeBeltPoints(count, gen, { maxPx, bright }) {
  const orbit = new Float32Array(count * 4), phase = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3); // unused by the shader (positions are computed on the GPU) but required by three
  const tmp = {};
  for (let k = 0; k < count; k++) {
    gen(tmp, k);
    orbit.set([tmp.a, tmp.e, tmp.i, tmp.node], k * 4);
    phase.set([tmp.peri, tmp.M0, tmp.size], k * 3);
    col.set(tmp.color, k * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);   // positions live on the GPU → never frustum-cull wrongly
  const mat = new THREE.ShaderMaterial({
    vertexShader: BELT_VERT, fragmentShader: BELT_FRAG, transparent: true, depthWrite: false,
    uniforms: { uDays: { value: 0 }, uScale: { value: 800 }, uMaxPx: { value: maxPx }, uDistA: { value: 6 }, uDistB: { value: 14 },
      uDistP: { value: 0.55 }, uBright: { value: bright } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// Main belt: semi-major axes 2.1–3.3 AU with the Kirkwood gaps (orbital resonances with Jupiter) carved out.
// The Jupiter Trojans and the Hilda group used to be appended here at fixed mean longitudes; since 2026-10-28 lagrange/
// draws them locked to Jupiter's real position (tadpole librations, the Hilda triangle), so they are no longer added here.
const KIRKWOOD = [[2.502, 0.035], [2.825, 0.028], [2.958, 0.018], [3.279, 0.03], [2.065, 0.02]]; // 3:1, 5:2, 7:3, 2:1, 4:1
export function createAsteroidBelt({ isTouch, scale }) {   // (main.js still passes jupiterL0Deg; no longer needed)
  const r = rng(1801);
  const nMain = isTouch ? 4500 : 13000;
  const grey = [0.62, 0.58, 0.53], brown = [0.66, 0.5, 0.36], blue = [0.55, 0.6, 0.68];
  const pts = makeBeltPoints(nMain, (o) => {
    let a;
    for (;;) {   // rejection sampling: denser in the middle belt, with resonance gaps
      a = 2.1 + 1.2 * Math.pow(r(), 1.15);
      if (KIRKWOOD.every(([g, w]) => Math.abs(a - g) > w * (0.6 + 0.6 * r()))) break;
    }
    o.e = Math.min(0.3, Math.abs(gauss(r)) * 0.09);
    o.i = Math.abs(gauss(r)) * 8 * DEG;            // most asteroids within ~10–15° of the ecliptic
    o.node = r() * 2 * Math.PI; o.peri = r() * 2 * Math.PI; o.M0 = r() * 2 * Math.PI;
    o.a = a;
    o.size = (0.09 + Math.pow(r(), 6) * 0.22) * scale;
    const t = r(), base = t < 0.45 ? grey : t < 0.85 ? brown : blue, s = 0.75 + r() * 0.5;
    o.color = base.map((c) => Math.min(1, c * s));
  }, { maxPx: isTouch ? 3 : 4, bright: 0.95 });
  return pts;
}

// Kuiper belt: classical belt 42–48 AU (the "kernel" near 44 AU is extra dense), plutinos at 39.4 AU (2:3 with Neptune
// like Pluto), and a sprinkling of scattered-disk objects on long eccentric orbits.
export function createKuiperBelt({ isTouch, scale }) {
  const r = rng(1992);
  const n = isTouch ? 2000 : 6000;
  const pts = makeBeltPoints(n, (o) => {
    const t = r();
    if (t < 0.62) {          // classical (cold + hot populations)
      o.a = r() < 0.3 ? 44 + gauss(r) * 0.3 : 42 + r() * 6;
      o.e = Math.abs(gauss(r)) * 0.05;
      o.i = (r() < 0.6 ? Math.abs(gauss(r)) * 2.5 : Math.abs(gauss(r)) * 14) * DEG;
    } else if (t < 0.85) {   // plutinos
      o.a = 39.4 + gauss(r) * 0.2; o.e = 0.1 + r() * 0.2; o.i = Math.abs(gauss(r)) * 12 * DEG;
    } else {                 // scattered disk
      o.a = 50 + r() * 40; o.e = 0.25 + r() * 0.35; o.i = Math.abs(gauss(r)) * 18 * DEG;
    }
    o.node = r() * 2 * Math.PI; o.peri = r() * 2 * Math.PI; o.M0 = r() * 2 * Math.PI;
    o.size = (0.28 + Math.pow(r(), 5) * 0.4) * scale;
    const s = 0.7 + r() * 0.5, red = r() < 0.4;    // icy: bluish-white, some reddish (tholins)
    o.color = (red ? [0.78, 0.62, 0.52] : [0.62, 0.74, 0.9]).map((c) => Math.min(1, c * s));
  }, { maxPx: isTouch ? 3.5 : 4.5, bright: 0.75 });
  return pts;
}

// ---------------------------------------------------------------------------
// Procedural surfaces (equirectangular canvas textures)
// ---------------------------------------------------------------------------
function noise3(seed) {
  const r = rng(seed), perm = new Uint8Array(512), vals = new Float32Array(256).map(() => r());
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const f = (t) => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const n = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), xf), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
             L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  };
  return (x, y, z, oct = 5) => { let s = 0, a = 0.5, fr = 1, nn = 0; for (let o = 0; o < oct; o++) { s += a * n(x * fr, y * fr, z * fr); nn += a; a *= 0.5; fr *= 2; } return s / nn; };
}
const C = (h) => { const v = new THREE.Color(h); return [v.r * 255, v.g * 255, v.b * 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (x) => Math.max(0, Math.min(1, x));
// angular distance (radians) from (lat, lon) to a spot
const angTo = (lat, lon, la, lo) => Math.acos(Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(la) + Math.cos(lat) * Math.cos(la) * Math.cos(lon - lo))));

function texture(w, shade) {
  const h = w / 2, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const lat = Math.PI / 2 - (j + 0.5) / h * Math.PI, cl = Math.cos(lat), y = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = (i + 0.5) / w * Math.PI * 2, c = shade(cl * Math.cos(lon), y, cl * Math.sin(lon), lat, lon), k = (j * w + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function craterField(n, x, y, z, freq, thr) { return Math.max(0, n(x * freq, y * freq, z * freq, 2) - thr); }

const SURFACES = {
  Ceres: (n) => (x, y, z, lat, lon) => {
    let v = n(x * 3, y * 3, z * 3, 6) - craterField(n, x + 5, y, z, 16, 0.6) * 2.2 - craterField(n, x, y + 9, z, 34, 0.66) * 1.5;
    let c = mixc(C('#3e3b38'), C('#8b857c'), sat((v - 0.2) * 1.7));
    const occ = angTo(lat, lon, 19.8 * DEG, 239 * DEG);          // Occator crater's bright salt spots (Cerealia + Vinalia Faculae)
    if (occ < 0.16) c = mixc(c, C('#4a4743'), 0.5 * (1 - occ / 0.16));
    const spots = Math.max(1 - occ / 0.035, 0.7 * (1 - angTo(lat, lon, 20.6 * DEG, 241.5 * DEG) / 0.03));
    if (spots > 0) c = mixc(c, [250, 250, 245], sat(spots * 1.4));
    return c;
  },
  Pluto: (n) => (x, y, z, lat, lon) => {
    const v = n(x * 3, y * 3, z * 3, 6);
    let c = mixc(C('#9a7558'), C('#e2cdb2'), sat((v - 0.25) * 1.8));
    // Cthulhu Macula: long dark red-brown band along the equator
    const band = sat(1 - Math.abs(lat + 8 * DEG + (n(x * 4, y * 4, z * 4, 3) - 0.5) * 0.35) / (16 * DEG)) *
                 sat(1 - Math.abs(Math.atan2(Math.sin(lon - 1.35), Math.cos(lon - 1.35))) / 1.1);
    c = mixc(c, C('#4a2416'), sat(band * 1.6) * 0.9);
    // Tombaugh Regio, the bright "heart": western lobe = Sputnik Planitia (smooth nitrogen ice), eastern lobe more mottled
    const w = (n(x * 6, y * 6, z * 6, 3) - 0.5) * 0.12;
    const heart = Math.max(1 - angTo(lat, lon, 25 * DEG, 175 * DEG) / (0.36 + w), 0.85 * (1 - angTo(lat, lon, 5 * DEG, 205 * DEG) / (0.36 + w)));
    if (heart > 0) c = mixc(c, n(x * 20, y * 20, z * 20, 2) > 0.55 ? [236, 230, 222] : [250, 246, 240], sat(heart * 3));
    if (lat > 1.1) c = mixc(c, C('#c7a78a'), 0.4);              // slightly yellowish north polar cap
    return c;
  },
  Charon: (n) => (x, y, z, lat) => {
    const v = n(x * 3.5, y * 3.5, z * 3.5, 6) - craterField(n, x, y, z + 3, 18, 0.64) * 1.4;
    let c = mixc(C('#6e6c69'), C('#bdb8b1'), sat((v - 0.2) * 1.6));
    const mordor = sat((lat - 1.0 + (n(x * 5, y * 5, z * 5, 3) - 0.5) * 0.3) / 0.25);   // reddish Mordor Macula (north pole)
    return mixc(c, C('#6b3a28'), mordor * 0.85);
  },
  Eris: (n) => (x, y, z) => mixc(C('#c9c9cf'), C('#f6f6f8'), sat((n(x * 2.5, y * 2.5, z * 2.5, 5) - 0.3) * 2)),
  Haumea: (n) => (x, y, z, lat, lon) => {
    let c = mixc(C('#cfd2d6'), C('#f7f7f5'), sat((n(x * 3, y * 3, z * 3, 5) - 0.3) * 2));
    const spot = angTo(lat, lon, 10 * DEG, 60 * DEG);             // the dark red spot
    if (spot < 0.45) c = mixc(c, C('#8a3b2a'), sat((1 - spot / 0.45) * 1.5) * 0.8);
    return c;
  },
  Makemake: (n) => (x, y, z) => {
    const v = n(x * 2.5, y * 2.5, z * 2.5, 6);
    return mixc(C('#8a4a2e'), C('#e4b597'), sat((v - 0.25) * 1.8));
  },
};
export function surfaceTexture(name, isTouch) { return texture(isTouch ? 256 : 512, SURFACES[name](noise3(name.length * 977 + name.charCodeAt(0)))); }
