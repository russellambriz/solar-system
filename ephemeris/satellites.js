// ephemeris/satellites.js: real positions of the major moons of Saturn, Uranus and Neptune for any date.
//
// Each moon is a precessing Kepler ellipse ("mean elements") in its reference plane:
//   λ(t) = L0 + n·t  (+ a libration term for Mimas, Tethys and Hyperion),   ϖ(t) = peri + periRate·t,
//   Ω(t) = node + nodeRate·t,   M = λ − ϖ,   ω = ϖ − Ω,   t = days since J2000 (2000-01-01 12:00).
// The orbit plane is Rz(Ω)·Rx(i) inside the reference plane, and the reference plane → ICRF rotation is
// Rz(α_pole + 90°)·Rx(90° − δ_pole) (its x axis = the plane's ascending node on the ICRF equator), as in JPL's tables.
//
// Sources:
//  • JPL Solar System Dynamics, "Planetary Satellite Mean Elements", https://ssd.jpl.nasa.gov/sats/elem/ (fetched
//    2026-10-19): semi-major axes a, reference planes (local Laplace-plane poles for Saturn's and Neptune's moons, Uranus's
//    equator for Uranus's), and the starting values / directions of the apsidal and nodal precession. Underlying JPL
//    ephemerides: SAT441 (Jacobson 2022, AJ 164:199), URA182 (Jacobson & Park 2025, AJ 169:65), NEP097 (Jacobson 2009,
//    AJ 137:4322), NEP105 (Nereid, Jacobson 2024).
//  • JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api, fetched 2026-10-19): the angles and rates below (L0, n, e, peri,
//    periRate, i, node, nodeRate, lib) are a least-squares fit of the precessing ellipse to Horizons' planetocentric ICRF
//    position vectors of each moon (894 dates, every 1471 h from 1950 to 2100). The SSD table's own epoch angles (M, ω)
//    did not reproduce Horizons (Saturn's moons came out 6–160° off), so only its a, poles and precession rates are used;
//    the table itself warns that the mean elements "are not intended for ephemeris computation".
//  • Uranus: the moons go round prograde about RA 77.311°, Dec +15.175°, i.e. the opposite end of the IAU "north" pole
//    (257.311°, −15.175°, used by axes/). Uranus spins retrograde, so its moons orbit backwards w.r.t. IAU north.
//  • Mimas and Tethys share a 2:1 resonance libration (≈70.6 yr, amplitudes ≈43.4° and ≈2.1°); Hyperion librates in its
//    4:3 Titan resonance (≈640 d, ≈9.2°). Both show up in the fit (cf. Vienne & Duriez 1995, TASS 1.7).
// The comment after each moon is the fit's rms / max angular error (seen from the planet) against Horizons 1950–2100.
// Short-period perturbations are not modelled; outside 1950–2100 the mean motion is simply extrapolated.
//
// Pure math, no Three.js: positions are [x, y, z] in km, ICRF (equatorial J2000), planet at the origin.

const D2R = Math.PI / 180;
const UR_POLE = [77.311, 15.175];                   // pole of Uranus's equator on the moons' prograde side (see above)
const ECL_POLE = [270, 90 - 23.4392911];            // J2000 ecliptic (Nereid's elements, NEP105)

// angles in degrees, rates in degrees/day, a in km, lib = [amplitude °, period days, phase °] added to λ
export const SAT_ELEMENTS = {
  Mimas:     { planet: 'Saturn', pole: [40.6, 83.5], a: 186000, L0: 160.6667, n: 381.99449558, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 1.5732, node: 173.005, nodeRate: -0.9995004, lib: [43.388, 25792.93, 140.64] },   // fit rms 1.67°, max 3.29°
  Enceladus: { planet: 'Saturn', pole: [40.6, 83.5], a: 238400, L0: 182.4200, n: 262.73190002, e: 0.00474, peri: 171.607, periRate: 0.3379592, i: 0.0000, node: 0.000, nodeRate: 0.0000000 },   // fit rms 0.23°, max 0.47°
  Tethys:    { planet: 'Saturn', pole: [40.6, 83.5], a: 295000, L0: 188.5075, n: 190.69791211, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 1.0916, node: 259.850, nodeRate: -0.1978494, lib: [2.079, 25863.12, 321.11] },   // fit rms 0.04°, max 0.10°
  Dione:     { planet: 'Saturn', pole: [40.6, 83.5], a: 377700, L0: 176.9864, n: 131.53493143, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 0.0000, node: 0.000, nodeRate: 0.0000000 },   // fit rms 0.18°, max 0.31°
  Rhea:      { planet: 'Saturn', pole: [40.6, 83.5], a: 527200, L0: 52.2143, n: 79.69004629, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 0.0000, node: 0.000, nodeRate: 0.0000000 },   // fit rms 0.25°, max 0.42°
  Titan:     { planet: 'Saturn', pole: [36.4, 84.0], a: 1221900, L0: 11.7380, n: 22.57697637, e: 0.02874, peri: 208.219, periRate: 0.0014139, i: 0.3467, node: 23.527, nodeRate: -0.0012873 },   // fit rms 0.02°, max 0.04°
  Hyperion:  { planet: 'Saturn', pole: [40.2, 83.6], a: 1481500, L0: 289.5454, n: 16.91995103, e: 0.10257, peri: 234.295, periRate: -0.0511236, i: 0.5391, node: 259.903, nodeRate: -0.0047839, lib: [9.175, 640.51, 102.74] },   // fit rms 2.04°, max 4.22°
  Iapetus:   { planet: 'Saturn', pole: [288.7, 78.9], a: 3561700, L0: 200.2267, n: 4.53794639, e: 0.02846, peri: 351.369, periRate: 0.0002658, i: 7.5833, node: 74.790, nodeRate: -0.0003129 },   // fit rms 0.07°, max 0.20°
  Phoebe:    { planet: 'Saturn', pole: [276.0, 67.5], a: 12929400, L0: 276.9124, n: 0.65679432, e: 0.16399, peri: 223.575, periRate: 0.0033983, i: 175.2031, node: 241.219, nodeRate: 0.0013048 },   // fit rms 1.10°, max 2.54°
  Miranda:   { planet: 'Uranus', pole: UR_POLE, a: 129846, L0: 328.8481, n: 254.69065792, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 4.4271, node: 100.861, nodeRate: -0.0554133 },   // fit rms 1.03°, max 1.79°
  Ariel:     { planet: 'Uranus', pole: UR_POLE, a: 190929, L0: 203.1704, n: 142.83564949, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 0.0000, node: 0.000, nodeRate: 0.0000000 },   // fit rms 0.17°, max 0.43°
  Umbriel:   { planet: 'Uranus', pole: UR_POLE, a: 265986, L0: 251.3044, n: 86.86887423, e: 0.00037, peri: 19.594, periRate: -0.0150932, i: 0.0765, node: 196.349, nodeRate: -0.0075990 },   // fit rms 0.31°, max 0.57°
  Titania:   { planet: 'Uranus', pole: UR_POLE, a: 436298, L0: 281.5914, n: 41.35141528, e: 0.00116, peri: 228.770, periRate: 0.0036531, i: 0.1031, node: 12.733, nodeRate: 0.0009951 },   // fit rms 0.11°, max 0.30°
  Oberon:    { planet: 'Uranus', pole: UR_POLE, a: 583511, L0: 352.5802, n: 26.73948245, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 0.1717, node: 37.738, nodeRate: -0.0015894 },   // fit rms 0.15°, max 0.37°
  Proteus:   { planet: 'Neptune', pole: [299.8, 42.6], a: 117600, L0: 274.0190, n: 320.76563684, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 0.0000, node: 0.000, nodeRate: 0.0000000 },   // fit rms 0.28°, max 0.77°
  Triton:    { planet: 'Neptune', pole: [299.8, 43.1], a: 354800, L0: 234.6153, n: 61.26017788, e: 0.00000, peri: 0.000, periRate: 0.0000000, i: 157.2116, node: 176.806, nodeRate: 0.0014575 },   // fit rms 0.07°, max 0.19°
  Nereid:    { planet: 'Neptune', pole: ECL_POLE, a: 5513900, L0: 112.9370, n: 0.99961921, e: 0.75093, peri: 256.084, periRate: 0.0000244, i: 5.0701, node: 319.862, nodeRate: -0.0001258 },   // fit rms 1.40°, max 10.57°
};

function frameBasis(el) {
  if (el._f) return el._f;
  const a = el.pole[0] * D2R, d = el.pole[1] * D2R;
  const Z = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const X = [-Math.sin(a), Math.cos(a), 0];                     // ascending node of the plane on the ICRF equator (RA α + 90°)
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  return (el._f = { X, Y, Z });
}

function trueAnomaly(M, e) {
  if (!e) return M;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 30; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/**
 * Orbit state at `days` since J2000 (sim clock = UT; the ~1 min TT−UT difference is ignored).
 * Returns { r (km), u (argument of latitude ω + ν, rad), w (ω), nu, e, a,
 *           P, Q, W: ICRF unit vectors of the orbit frame (P → ascending node on the reference plane, Q 90° ahead along
 *           the direction of motion, W = orbit normal = P × Q, the moon's own "north" of its orbit) }.
 */
export function satelliteState(name, days, out = {}) {
  const el = SAT_ELEMENTS[name];
  if (!el || !Number.isFinite(days)) return null;
  const t = days;
  let lam = el.L0 + el.n * t;
  if (el.lib) lam += el.lib[0] * Math.sin((el.lib[2] + 360 * t / el.lib[1]) * D2R);
  const varpi = el.peri + el.periRate * t, node = el.node + el.nodeRate * t;
  const M = (((lam - varpi) % 360) + 360) % 360 * D2R;
  const nu = trueAnomaly(M, el.e);
  const { X, Y, Z } = frameBasis(el);
  const O = node * D2R, inc = el.i * D2R;
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const comb = (a, b, c) => [a * X[0] + b * Y[0] + c * Z[0], a * X[1] + b * Y[1] + c * Z[1], a * X[2] + b * Y[2] + c * Z[2]];
  out.P = comb(cO, sO, 0);
  out.Q = comb(-sO * ci, cO * ci, si);
  out.W = comb(sO * si, -cO * si, ci);
  out.w = (varpi - node) * D2R; out.nu = nu; out.u = out.w + nu; out.e = el.e; out.a = el.a;
  out.r = el.e ? el.a * (1 - el.e * el.e) / (1 + el.e * Math.cos(nu)) : el.a;
  return out;
}

const _s = {};
/** Planetocentric position [x, y, z] in km (ICRF) at `days` since J2000. */
export function satellitePosition(name, days, out = [0, 0, 0]) {
  const s = satelliteState(name, days, _s);
  if (!s) return null;
  const cu = Math.cos(s.u) * s.r, su = Math.sin(s.u) * s.r;
  for (let k = 0; k < 3; k++) out[k] = s.P[k] * cu + s.Q[k] * su;
  return out;
}

/**
 * Where a moon appears next to its planet as seen from Earth.
 * `los` = unit vector Earth → planet (ICRF), `distKm` = Earth–planet distance (km).
 * Returns { east, north (arcsec; + = east / north on the sky), sep (arcsec), pa (position angle °, N through E),
 *           behind (true if the moon is farther from Earth than the planet's centre) }.
 */
export function skyOffset(name, days, los, distKm) {
  const p = satellitePosition(name, days, [0, 0, 0]);
  if (!p) return null;
  const [sx, sy, sz] = los;
  let ex = -sy, ey = sx;                                         // east = ẑ × ŝ
  const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
  const nx = -sz * ey, ny = sz * ex, nz = sx * ey - sy * ex;     // north = ŝ × east
  const k = 206264.806 / distKm;
  const east = (p[0] * ex + p[1] * ey) * k, north = (p[0] * nx + p[1] * ny + p[2] * nz) * k;
  return { east, north, sep: Math.hypot(east, north), pa: (Math.atan2(east, north) / D2R + 360) % 360,
    behind: p[0] * sx + p[1] * sy + p[2] * sz > 0 };
}
