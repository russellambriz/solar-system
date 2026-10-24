// skytonight/events.js: upcoming planetary events, worked out from the same positions as the panel (astro.js).
//   • oppositions of Mars, Jupiter, Saturn, Uranus and Neptune (geocentric ecliptic longitude 180° from the Sun's)
//   • greatest elongations of Mercury and Venus (east = evening sky, west = morning sky)
//   • close conjunctions: two naked-eye planets, or the Moon and a naked-eye planet, closest approach < 3°
//     (geocentric; seen from Boise the Moon can sit up to ~1° off that). Pairs within 12° of the Sun are skipped: lost in
//     the glare.
// Times are found by sampling (planets daily, the Moon every 3 h) and refining to ~1 minute.
// SKY_EVENTS: the next twelve months from page load, in ui/index.js's Events format [date, title, target, kind].
import { place, wrap180, BOISE } from './astro.js';

const DAY = 86400000;
const OUTER = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const BRIGHT = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const R2D = 180 / Math.PI;
const SUN_GLARE = 12;

const sepOf = (p, q) => Math.acos(Math.max(-1, Math.min(1, p.vec[0] * q.vec[0] + p.vec[1] * q.vec[1] + p.vec[2] * q.vec[2]))) * R2D;
function zero(f, a, b) { let fa = f(a); for (let k = 0; k < 24; k++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; }
function minimize(f, a, b) {   // golden section on [a, b]
  const g = 0.381966; let c = a + g * (b - a), d = b - g * (b - a), fc = f(c), fd = f(d);
  for (let k = 0; k < 30; k++) { if (fc < fd) { b = d; d = c; fd = fc; c = a + g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = b - g * (b - a); fd = f(d); } }
  return (a + b) / 2;
}
const fmtDate = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
const sepTxt = (s) => (s < 1 ? `${(s * 60).toFixed(0)}′` : `${s.toFixed(1)}°`);

/** Events between `from` and `from + days` (ms UTC), sorted: { ms, date (local YYYY-MM-DD), title, short, target, type }. */
export function findSkyEvents(from, days = 365, tz = BOISE.tz) {
  const to = from + days * DAY, out = [];
  const push = (ms, type, target, title, short, sep = null) => out.push({ ms, date: fmtDate(ms, tz), type, target, title, short, sep });
  // daily samples of every planet (and the Sun's longitude)
  const N = Math.ceil(days) + 2, t = (k) => from + (k - 1) * DAY;
  const S = {};
  for (const n of BRIGHT.concat(['Uranus', 'Neptune'])) S[n] = Array.from({ length: N + 1 }, (_, k) => place(n, t(k)));
  // oppositions
  for (const n of OUTER) {
    const f = (ms) => { const p = place(n, ms); return wrap180((p.lon - p.sunLon) * R2D - 180); };
    for (let k = 1; k <= N; k++) {
      const a = wrap180((S[n][k - 1].lon - S[n][k - 1].sunLon) * R2D - 180), b = wrap180((S[n][k].lon - S[n][k].sunLon) * R2D - 180);
      if ((a < 0) !== (b < 0) && Math.abs(b - a) < 20) {
        const ms = zero(f, t(k - 1), t(k)); if (ms < from || ms > to) continue;
        const p = place(n, ms);
        push(ms, 'opposition', n, `${n} at opposition: opposite the Sun, up all night${n === 'Uranus' || n === 'Neptune' ? ' (binoculars/telescope)' : ' and at its brightest'} (mag ${p.mag.toFixed(1)})`,
          `${n} at opposition`);
      }
    }
  }
  // greatest elongations
  for (const n of ['Mercury', 'Venus']) {
    const e = S[n].map((p) => p.elong);
    for (let k = 1; k < N; k++) {
      if (!(e[k] > e[k - 1] && e[k] >= e[k + 1])) continue;
      const ms = minimize((x) => -place(n, x).elong, t(k - 1), t(k + 1)); if (ms < from || ms > to) continue;
      const p = place(n, ms), east = wrap180((p.lon - p.sunLon) * R2D) > 0;
      push(ms, 'elongation', n, `${n} at greatest ${east ? 'eastern' : 'western'} elongation, ${p.elong.toFixed(0)}° from the Sun: best ${east ? 'evening' : 'morning'} view`,
        `${n} ${p.elong.toFixed(0)}° ${east ? 'E (evening)' : 'W (morning)'}`);
    }
  }
  // planet–planet conjunctions
  for (let i = 0; i < BRIGHT.length; i++) for (let j = i + 1; j < BRIGHT.length; j++) {
    const A = BRIGHT[i], B = BRIGHT[j], s = S[A].map((p, k) => sepOf(p, S[B][k]));
    for (let k = 1; k < N; k++) {
      if (!(s[k] < 4 && s[k] <= s[k - 1] && s[k] < s[k + 1])) continue;
      const ms = minimize((x) => sepOf(place(A, x), place(B, x)), t(k - 1), t(k + 1)); if (ms < from || ms > to) continue;
      const pa = place(A, ms), pb = place(B, ms), sep = sepOf(pa, pb);
      if (sep >= 3 || pa.elong < SUN_GLARE || pb.elong < SUN_GLARE) continue;
      const side = wrap180((pa.lon - pa.sunLon) * R2D) > 0 ? 'evening' : 'morning';
      push(ms, 'conjunction', pa.mag < pb.mag ? A : B, `${A} and ${B} ${sepTxt(sep)} apart (${side} sky)`, `${A}–${B} ${sepTxt(sep)}`, sep);
    }
  }
  // Moon–planet conjunctions (3-hourly samples)
  const H3 = DAY / 8, M = Math.ceil(days * 8) + 2, tm = (k) => from + (k - 1) * H3;
  const moon = Array.from({ length: M + 1 }, (_, k) => place('Moon', tm(k)));
  for (const n of BRIGHT) {
    const pl = (k) => { const f = ((k - 1) * H3) / DAY + 1, k0 = Math.floor(f); return S[n][Math.min(N, Math.max(0, k0))]; };   // planets barely move in 3 h
    const s = moon.map((m, k) => sepOf(m, pl(k)));
    for (let k = 1; k < M; k++) {
      if (!(s[k] < 5 && s[k] <= s[k - 1] && s[k] < s[k + 1])) continue;
      const ms = minimize((x) => sepOf(place('Moon', x), place(n, x)), tm(k - 1), tm(k + 1)); if (ms < from || ms > to) continue;
      const pm = place('Moon', ms), pp = place(n, ms), sep = sepOf(pm, pp);
      if (sep >= 3 || pp.elong < SUN_GLARE) continue;
      push(ms, 'moon', n, `The Moon passes ${sepTxt(sep)} from ${n}`, `Moon ${sepTxt(sep)} from ${n}`, sep);
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// ui/index.js Events: the next twelve months from page load. The timeline gets the oppositions, elongations and
// planet pairs, but only the Moon's closest passes (≤ 1°) so it isn't flooded; the panel lists them all.
export const SKY_EVENTS = (() => {
  try {
    return findSkyEvents(Date.now(), 365).filter((e) => e.type !== 'moon' || e.sep <= 1).map((e) => [e.date, `Sky from Boise: ${e.title}`, e.target, 'sky']);
  } catch (err) { console.warn('skytonight: events', err); return []; }
})();
