// skytonight/astro.js: what the sky looks like from one place on Earth (Boise by default): no DOM, no THREE objects kept.
//
// Positions:
//   • Planets and the Sun: the project's own ephemeris (ephemeris/planets.js, JPL/Standish Keplerian elements; the Sun is
//     the reverse of Earth's heliocentric vector), corrected for light time, rotated from the J2000 ecliptic to the J2000
//     equator and precessed to the equinox of date (IAU 1976, Lieske ζ z θ). Aberration and nutation (< 25″) are left out.
//   • The Moon: Meeus, Astronomical Algorithms (2nd ed.) ch. 47, the larger terms of tables 47.A/47.B (≈ 1′), mean equinox
//     of date, with its horizontal parallax for the rise/set altitude and the topocentric altitude.
//   • Sidereal time: IAU 1982 GMST (Meeus 12.4). Time scales: TT = UT + ΔT (≈ 69 s in the 2020s).
// Rise / set: the moment the centre reaches h0 = −0.833° (Sun: refraction 34′ + semi-diameter 16′), −0.567° (planets:
//   refraction only, the Astronomical Almanac / USNO convention for point-like discs) and 0.7275·π − 0.567° (Moon,
//   π = horizontal parallax, ≈ +0.125°). Found by sampling every 10 min and bisecting to ~1 s.
// Magnitudes: Mallama & Hilton (2018, Astronomy and Computing 25, 10) for Mercury, Venus, Mars, Jupiter, Uranus,
//   Neptune, and Saturn with its rings (ring tilt from Meeus ch. 45); the Moon from Allen's phase law.
// Constellations: Roman (1987) boundary table (bounds.js), position precessed to B1875.0.
import { planetAU } from '../ephemeris/planets.js';
import { ROMAN_1987 } from './bounds.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = Math.PI * 2;
const J2000_MS = Date.UTC(2000, 0, 1, 12), DAY_MS = 86400000;
const C_AU_PER_DAY = 173.1446327;
const EPS0 = 23.4392911 * D2R;                         // J2000 mean obliquity
export const BOISE = { name: 'Boise, Idaho', lat: 43.615, lon: -116.20, tz: 'America/Boise' };
export const SKY_PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

const wrap360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => { x = wrap360(x); return x >= 180 ? x - 360 : x; };
export { wrap180, wrap360 };

/** ΔT = TT − UT in seconds (Espenak & Meeus polynomials, simplified outside 1950–2150). */
export function deltaT(ms) {
  const y = 1970 + ms / (365.2425 * DAY_MS);
  if (y >= 2005 && y < 2050) { const t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y >= 1986 && y < 2005) { const t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y >= 1961 && y < 1986) { const t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (y >= 2050 && y < 2150) { const u = (y - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - y); }
  const u = (y - 1820) / 100; return -20 + 32 * u * u;
}
const ttDays = (ms) => (ms - J2000_MS) / DAY_MS + deltaT(ms) / 86400;

// ---- precession (IAU 1976): equatorial J2000 → mean equator/equinox of the epoch T (Julian centuries from J2000) ----
function precessionMatrix(T) {
  const as = D2R / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as;
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
  return [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ,
    cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ,
    cz * st, -sz * st, ct];
}
const mul = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mulT = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
let _pT = NaN, _pM = null;
const precAt = (T) => { if (!(Math.abs(T - _pT) <= 1e-6)) { _pT = T; _pM = precessionMatrix(T); } return _pM; };
const P1875 = precessionMatrix((2405889.258550475 - 2451545.0) / 36525);   // B1875.0

const eclToEq = (v, eps) => { const c = Math.cos(eps), s = Math.sin(eps); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const toRaDec = (v) => { const r = Math.hypot(v[0], v[1], v[2]); return { ra: Math.atan2(v[1], v[0]), dec: Math.asin(v[2] / r), r }; };

// ---- Sun & planets (project ephemeris) -------------------------------------------------------------------------------
const _a = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
// scene axes (x, north, −y) → J2000 ecliptic [x, y, z] in AU
const helioEcl = (name, d) => { planetAU(name, d, _a); return [_a.x, -_a.z, _a.y]; };

/** Geocentric J2000-ecliptic vector (AU) of a planet at TT day d, light-time corrected, plus its heliocentric distance. */
function planetGeoEcl(name, d) {
  const E = helioEcl('Earth', d);
  let lt = 0, P, g;
  for (let k = 0; k < 3; k++) {
    P = helioEcl(name, d - lt);
    g = [P[0] - E[0], P[1] - E[1], P[2] - E[2]];
    lt = Math.hypot(g[0], g[1], g[2]) / C_AU_PER_DAY;
  }
  return { g, r: Math.hypot(P[0], P[1], P[2]), R: Math.hypot(E[0], E[1], E[2]), helio: P };
}

// ---- Moon (Meeus ch. 47, main terms) ---------------------------------------------------------------------------------
// [D, M, M', F, Σl (1e-6°), Σr (1e-3 km)]
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149], [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210], [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056], [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897], [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
];
// [D, M, M', F, Σb (1e-6°)]
const MOON_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324], [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
];
/** Moon: geocentric ecliptic longitude/latitude (rad, mean equinox of date) and distance (km) at TT day d. */
export function moonEcliptic(d) {
  const T = d / 36525;
  const Lp = wrap360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T ** 3 / 538841 - T ** 4 / 65194000);
  const D = wrap360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868 - T ** 4 / 113065000) * D2R;
  const M = wrap360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T ** 3 / 24490000) * D2R;
  const Mp = wrap360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699 - T ** 4 / 14712000) * D2R;
  const F = wrap360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T ** 3 / 3526000 + T ** 4 / 863310000) * D2R;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = (119.75 + 131.849 * T) * D2R, A2 = (53.09 + 479264.290 * T) * D2R, A3 = (313.45 + 481266.484 * T) * D2R;
  let sl = 0, sr = 0, sb = 0;
  for (const [a, b, c, f, l, r] of MOON_LR) {
    const arg = a * D + b * M + c * Mp + f * F, e = b === 0 ? 1 : Math.abs(b) === 1 ? E : E * E;
    sl += l * e * Math.sin(arg); sr += r * e * Math.cos(arg);
  }
  for (const [a, b, c, f, l] of MOON_B) {
    const e = b === 0 ? 1 : Math.abs(b) === 1 ? E : E * E;
    sb += l * e * Math.sin(a * D + b * M + c * Mp + f * F);
  }
  const LpR = Lp * D2R;
  sl += 3958 * Math.sin(A1) + 1962 * Math.sin(LpR - F) + 318 * Math.sin(A2);
  sb += -2235 * Math.sin(LpR) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F) + 175 * Math.sin(A1 + F) + 127 * Math.sin(LpR - Mp) - 115 * Math.sin(LpR + Mp);
  return { lon: (Lp + sl / 1e6) * D2R, lat: (sb / 1e6) * D2R, distKm: 385000.56 + sr / 1000 };
}

// ---- one body's apparent place ---------------------------------------------------------------------------------------
/**
 * Geocentric place at time `ms` (UTC): { ra, dec (rad, equinox of date), dist (AU), lon (ecliptic longitude of date, rad),
 * elong (° from the Sun), phaseAngle (°), illum (0–1), mag, parallax (rad, Moon only), vec (unit, equator of date) }.
 */
export function place(name, ms) {
  const d = ttDays(ms), T = d / 36525, P = precAt(T);
  const E = helioEcl('Earth', d);                                         // the Sun is at −E
  const sunEq = mul(P, eclToEq([-E[0], -E[1], -E[2]], EPS0));
  const sunRD = toRaDec(sunEq), R = Math.hypot(E[0], E[1], E[2]);
  let eq, dist, r = null, out = { name };
  if (name === 'Sun') { eq = sunEq; dist = R; }
  else if (name === 'Moon') {
    const m = moonEcliptic(d), eps = EPS0 - 0.0130042 * T * D2R;
    dist = m.distKm / 149597870.7;
    eq = eclToEq([Math.cos(m.lat) * Math.cos(m.lon) * dist, Math.cos(m.lat) * Math.sin(m.lon) * dist, Math.sin(m.lat) * dist], eps);
    out.parallax = Math.asin(6378.14 / m.distKm);
  } else {
    const p = planetGeoEcl(name, d);
    eq = mul(P, eclToEq(p.g, EPS0)); dist = Math.hypot(...p.g); r = p.r;
    out.helio = p.helio;
  }
  const rd = toRaDec(eq);
  const u = [eq[0] / rd.r, eq[1] / rd.r, eq[2] / rd.r], s = [sunEq[0] / sunRD.r, sunEq[1] / sunRD.r, sunEq[2] / sunRD.r];
  const elong = name === 'Sun' ? 0 : Math.acos(Math.max(-1, Math.min(1, u[0] * s[0] + u[1] * s[1] + u[2] * s[2]))) * R2D;
  // ecliptic longitude of date (for oppositions / phases): equator of date → ecliptic of date
  const epsD = EPS0 - 0.0130042 * T * D2R, ce = Math.cos(epsD), se = Math.sin(epsD);
  const lon = Math.atan2(u[1] * ce + u[2] * se, u[0]), lat = Math.asin(-u[1] * se + u[2] * ce), sunLon = Math.atan2(s[1] * ce + s[2] * se, s[0]);
  let i = 0;
  if (name === 'Moon') { const psi = elong * D2R; i = Math.atan2(R * Math.sin(psi), dist - R * Math.cos(psi)) * R2D; }
  else if (r !== null) i = Math.acos(Math.max(-1, Math.min(1, (r * r + dist * dist - R * R) / (2 * r * dist)))) * R2D;
  Object.assign(out, { ra: rd.ra, dec: rd.dec, dist, r, R, lon, lat, sunLon, elong, phaseAngle: i, illum: (1 + Math.cos(i * D2R)) / 2, vec: u, T });
  out.mag = magnitude(name, out);
  return out;
}

function magnitude(name, p) {
  const i = p.phaseAngle, k = 5 * Math.log10((p.r || 1) * p.dist);
  switch (name) {
    case 'Mercury': return -0.613 + 6.3280e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6 + k;
    case 'Venus': return (i < 163.7 ? -4.384 - 1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4 : 236.05828 - 2.81914 * i + 8.39034e-3 * i ** 2) + k;
    case 'Mars': return (i <= 50 ? -1.601 + 2.267e-2 * i - 1.302e-4 * i ** 2 : -0.367 - 0.02573 * i + 3.445e-4 * i ** 2) + k;
    case 'Jupiter': return (i <= 12 ? -9.395 - 3.7e-4 * i + 6.16e-4 * i ** 2 : -9.428 - 2.5 * Math.log10(1 - 1.507 * (i / 180) - 0.363 * (i / 180) ** 2 - 0.062 * (i / 180) ** 3 + 2.809 * (i / 180) ** 4 - 1.876 * (i / 180) ** 5)) + k;
    case 'Saturn': {
      // Mallama & Hilton 2018 (globe + rings, i < 6.5°, B < 27°); B = ring tilt seen from Earth, ring plane from Meeus ch. 45
      const T = p.T, inc = (28.075216 - 0.012998 * T + 0.000004 * T * T) * D2R, node = (169.508470 + 1.394681 * T + 0.000412 * T * T) * D2R;
      const sB = Math.abs(Math.sin(inc) * Math.cos(p.lat) * Math.sin(p.lon - node) - Math.cos(inc) * Math.sin(p.lat));
      return -8.914 - 1.825 * sB + 0.026 * i - 0.378 * sB * Math.exp(-2.25 * i) + k;
    }
    case 'Uranus': return -7.110 + 6.587e-3 * i + 1.045e-4 * i * i + k;
    case 'Neptune': return -7.00 + k;
    case 'Moon': return -12.73 + 0.026 * Math.abs(i) + 4e-9 * i ** 4;
    case 'Sun': return -26.74;
    default: return NaN;
  }
}

/** Constellation abbreviation (IAU, e.g. 'Sgr') for an RA/Dec of the equinox of date T. */
export function constellationOf(ra, dec, T) {
  const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const j2000 = mulT(precAt(T), v), b = mul(P1875, j2000);
  const rd = toRaDec(b), raH = wrap360(rd.ra * R2D) / 15, decD = rd.dec * R2D;
  const B = ROMAN_1987;
  for (let k = 0; k < B.length; k += 4) if (decD >= B[k + 2] && raH >= B[k] && raH < B[k + 1]) return B[k + 3];
  return null;
}

// ---- horizon coordinates -----------------------------------------------------------------------------------------------
/** Greenwich mean sidereal time (rad) at `ms` UTC (Meeus 12.4). */
export function gmst(ms) {
  const d = (ms - J2000_MS) / DAY_MS, T = d / 36525;
  return wrap360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T ** 3 / 38710000) * D2R;
}
/** Altitude/azimuth (° ; azimuth from north through east) of place `p` at `ms` for site {lat, lon}; topocentric for the Moon. */
export function altAz(p, ms, site = BOISE) {
  const phi = site.lat * D2R;
  let H = gmst(ms) + site.lon * D2R - p.ra;
  H = Math.atan2(Math.sin(H), Math.cos(H));
  const sh = Math.sin(phi) * Math.sin(p.dec) + Math.cos(phi) * Math.cos(p.dec) * Math.cos(H);
  let alt = Math.asin(sh) * R2D;
  if (p.parallax) alt -= p.parallax * R2D * Math.cos(alt * D2R);
  const az = wrap360(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(p.dec) * Math.cos(phi)) * R2D + 180);
  return { alt, az, H };
}
const h0Of = (name, p) => (name === 'Sun' ? -0.833 : name === 'Moon' ? 0.7275 * p.parallax * R2D - 0.5667 : -0.5667);
/** Geocentric altitude minus the rise/set altitude: > 0 means "up". */
function upness(name, ms, site, extra = null) {
  const p = place(name, ms), phi = site.lat * D2R;
  const H = gmst(ms) + site.lon * D2R - p.ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(p.dec) + Math.cos(phi) * Math.cos(p.dec) * Math.cos(H)) * R2D;
  return alt - (extra ?? h0Of(name, p));
}
function hourAngle(name, ms, site) {
  const p = place(name, ms), H = gmst(ms) + site.lon * D2R - p.ra;
  return Math.atan2(Math.sin(H), Math.cos(H));
}
function bisect(f, a, b, fa) {
  for (let k = 0; k < 16; k++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}

/**
 * Rise, transit and set of `name` between t0 and t1 (ms UTC). altitude = 'rs' (rise/set) or a number in degrees for the
 * Sun's twilight crossings (e.g. −18). Returns { rise, set, transit, transitAlt } with times in ms or null.
 */
export function riseTransitSet(name, t0, t1, site = BOISE, altitude = null) {
  const STEP = 10 * 60000, f = (t) => upness(name, t, site, altitude), g = (t) => hourAngle(name, t, site);
  let rise = null, set = null, transit = null, tf = t0, ff = f(t0), gf = g(t0);
  for (let t = t0 + STEP; t <= t1 + 1; t += STEP) {
    const ft = f(t), gt = g(t);
    if (ff <= 0 && ft > 0 && rise === null) rise = bisect(f, tf, t, ff);
    if (ff > 0 && ft <= 0 && set === null) set = bisect(f, tf, t, ff);
    if (gf < 0 && gt >= 0 && gt - gf < Math.PI && transit === null) transit = bisect(g, tf, t, gf);
    tf = t; ff = ft; gf = gt;
  }
  let transitAlt = null;
  if (transit !== null) transitAlt = altAz(place(name, transit), transit, site).alt;
  return { rise, set, transit, transitAlt };
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (az) => COMPASS[Math.round(wrap360(az) / 45) % 8];

/** Moon phase: { name, emoji, illum (0–1), age (° of elongation in longitude, 0 = new, 180 = full), waxing }. */
export function moonPhase(ms) {
  const m = place('Moon', ms), age = wrap360((m.lon - m.sunLon) * R2D);
  const names = [[10, 'New Moon', '🌑'], [80, 'Waxing crescent', '🌒'], [100, 'First quarter', '🌓'], [170, 'Waxing gibbous', '🌔'],
    [190, 'Full Moon', '🌕'], [260, 'Waning gibbous', '🌖'], [280, 'Last quarter', '🌗'], [350, 'Waning crescent', '🌘'], [361, 'New Moon', '🌑']];
  const [, name, emoji] = names.find(([lim]) => age < lim);
  return { name, emoji, illum: m.illum, age, waxing: age < 180 };
}
/** Next time after `ms` that the Moon's longitude is `target`° ahead of the Sun's (0 new, 90 first quarter, 180 full, 270 last). */
export function nextMoonPhase(ms, target) {
  const f = (t) => { const m = place('Moon', t); return wrap180((m.lon - m.sunLon) * R2D - target); };
  const STEP = DAY_MS / 4;
  let a = ms, fa = f(a);
  for (let t = ms + STEP; t < ms + 32 * DAY_MS; t += STEP) {
    const ft = f(t);
    if (fa < 0 && ft >= 0 && ft - fa < 90) return bisect(f, a, t, fa);
    a = t; fa = ft;
  }
  return null;
}
/** Angular separation (°) between two places. */
export const separation = (p, q) => Math.acos(Math.max(-1, Math.min(1, p.vec[0] * q.vec[0] + p.vec[1] * q.vec[1] + p.vec[2] * q.vec[2]))) * R2D;
