// ephemeris/planets.js: heliocentric positions of the eight planets from JPL's "Keplerian Elements for Approximate
// Positions of the Major Planets" (E. M. Standish, JPL/Caltech). Table 1 (fit to 1800–2050, errors ~ arcminutes) is
// used inside that span, Table 2a + 2b (3000 BC – 3000 AD, with the extra Jupiter–Neptune terms) outside it.
// Elements: a [AU], e, I [deg], L = mean longitude [deg], ϖ = longitude of perihelion [deg], Ω = longitude of the
// ascending node [deg], each with a rate per Julian century; J2000 ecliptic and equinox.
// Checked against real events: the 2020 Mars, 2023 Jupiter and 2024 Saturn/Uranus/Neptune oppositions and the 2025
// Venus and 2024 Mercury inferior conjunctions all come out within 0.2° of Earth's longitude, and Earth's 2026
// perihelion lands on 3 Jan at 0.98330 AU.
import * as THREE from 'three';

const D2R = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);

const T1 = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  Mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  Uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};
const T2 = {
  Mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819], [0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
  Venus: [[0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496], [-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174]],
  Earth: [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389], [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856]],
  Mars: [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984], [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
  Jupiter: [[5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654], [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619]],
  Saturn: [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702], [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002]],
  Uranus: [[19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215], [-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699]],
  Neptune: [[30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853], [0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302]],
};
// Table 2b: extra terms in the mean anomaly for the outer planets, b·T² + c·cos(f·T) + s·sin(f·T)
const T2B = { Jupiter: [-0.00012452, 0.06064060, -0.35635438, 38.35125000], Saturn: [0.00025899, -0.13434469, 0.87320147, 38.35125000],
  Uranus: [0.00058331, -0.97731848, 0.17689245, 7.67025000], Neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025000] };

export const PLANET_NAMES = Object.keys(T1);
export const VALID_YEARS = [-3000, 3000];

/** Osculating elements at `days` since J2000: { a, e, i, node, peri (argument of perihelion), M } with angles in radians. */
export function planetElements(name, days, out = {}) {
  const T = days / 36525;                       // Julian centuries since J2000
  const useT1 = T >= -2 && T <= 0.5;            // 1800–2050
  const [el, rate] = (useT1 ? T1 : T2)[name];
  const a = el[0] + rate[0] * T, e = el[1] + rate[1] * T, I = el[2] + rate[2] * T;
  const L = el[3] + rate[3] * T, w = el[4] + rate[4] * T, O = el[5] + rate[5] * T;
  let M = L - w;
  if (!useT1 && T2B[name]) { const [b, c, s, f] = T2B[name]; M += b * T * T + c * Math.cos(f * T * D2R) + s * Math.sin(f * T * D2R); }
  out.a = a; out.e = e; out.i = I * D2R; out.node = O * D2R; out.peri = (w - O) * D2R;
  out.M = ((M % 360) + 540) % 360 * D2R - Math.PI;   // wrapped to −π…π
  return out;
}

function solveKepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 15; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
  return E;
}
// orbital plane → J2000 ecliptic → scene axes (x = ecliptic X, y = ecliptic north, z = −ecliptic Y), as in smallbodies.js
function toScene(el, xo, yo, out) {
  const cw = Math.cos(el.peri), sw = Math.sin(el.peri), cO = Math.cos(el.node), sO = Math.sin(el.node), ci = Math.cos(el.i), si = Math.sin(el.i);
  const X = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const Y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const Z = (sw * si) * xo + (cw * si) * yo;
  return out.set(X, Z, -Y);
}

const _el = {};
/** Heliocentric position in AU (scene axes) at `days` since J2000 (main.js's clock). */
export function planetAU(name, days, out = new THREE.Vector3()) {
  const el = planetElements(name, days, _el);
  const E = solveKepler(el.M, el.e);
  return toScene(el, el.a * (Math.cos(E) - el.e), el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E), out);
}
/** The whole orbit (n points, AU, scene axes) with the elements of `days`. */
export function planetOrbitAU(name, days, n = 256) {
  const el = planetElements(name, days, {});
  const pts = [];
  for (let k = 0; k < n; k++) {
    const E = (k / n) * Math.PI * 2;
    pts.push(toScene(el, el.a * (Math.cos(E) - el.e), el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E), new THREE.Vector3()));
  }
  return pts;
}
export const daysFromDate = (ms) => (ms - J2000) / 86400000;
