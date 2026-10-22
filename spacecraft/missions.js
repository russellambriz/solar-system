// spacecraft/missions.js: today's interplanetary missions on their real JPL trajectories (spacecraft/index.js draws them).
//
//   Juno · Europa Clipper · JUICE · Psyche · Lucy · BepiColombo · Hera · OSIRIS-APEX
//
// Where the numbers come from: JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), fetched 2026-10-22: geometric
// state vectors in the J2000 ecliptic frame, TDB, for each craft from launch to the end of its published trajectory
// (Juno -61, Europa Clipper -159, JUICE -28, Psyche -255, Lucy -49, BepiColombo -121 (MPO), Hera -91, OSIRIS-APEX -64).
//   • Cruise: daily heliocentric vectors. Within 0.004–0.01 AU of Mercury, Venus, Earth or Mars (0.3 AU of Jupiter) the
//     vectors are taken relative to that planet every 10 min (Jupiter: hourly), so a flyby is drawn around the planet the
//     sim actually shows, whatever the small error of its approximate planet orbits.
//   • Knots are kept only where needed: cubic Hermite interpolation (positions + velocities) between them reproduces every
//     Horizons sample within 500 km (heliocentric) or 0.3% of the distance (near a planet). See spacecraft/trajectories.js.
//   • In orbit (Juno and Europa Clipper at Jupiter, BepiColombo at Mercury): two-body ellipses fitted to the planet-centred
//     vectors (Juno every 6 h, Clipper 3 h, BepiColombo 30 min); a new ellipse starts when the old one drifts 2–3% away.
//     Drawn around the planet with the distance from its centre compressed as (r / R)^0.33 × the drawn radius, which puts
//     Clipper's Europa passes near the drawn Europa orbit.
//   • Psyche: Horizons ends 11 Feb 2029, 465,000 km short of the asteroid; from there it is eased onto asteroid 16 Psyche
//     (Horizons "16;", JPL's latest orbit) by the planned arrival (31 Jul 2029) and rides with it to the end of its prime
//     mission. Its two JPL trajectory files meet with a 1.6 million km step on 1 Feb 2027; that step is spread smoothly
//     over the 60 days before. Hera: Horizons ends 4 Nov 2026 30 km from Didymos; it then rides with Didymos (Horizons
//     20065803) for its ~6-month survey. BepiColombo: after Horizons ends (10 Apr 2027) it stays on its last (science) orbit.
import { TRAJ } from './trajectories.js';
import { day } from './data.js';

const AU_KM = 149597870.7, TDB_UTC = 69.184 / 86400, TAU = Math.PI * 2;
const sec2day = (s) => s / 86400 - TDB_UTC;      // Horizons TDB seconds → main.js days (UTC)

// ---- mission facts (verified against NASA / ESA / JAXA pages and the Horizons headers, 2026-10-22) ---------------------
// phases: [until, status]; milestones: [date, what]; flyby heights are from the Horizons trajectories (closest approach).
export const MISSIONS = [
  {
    key: 'juno', name: 'Juno', model: 'juno', color: '#ffd36b', type: 'Jupiter orbiter (NASA/JPL, SwRI)',
    launched: '5 Aug 2011 (Atlas V, Cape Canaveral)',
    phases: [[day(2013, 10, 9, 19, 21), 'Cruise: looping back for an Earth flyby'], [day(2016, 7, 5, 2, 30), 'Cruise to Jupiter'],
      [day(2025, 9, 30), 'Orbiting Jupiter over its poles (prime + first extended mission)'],
      [day(2028, 9, 2), 'Orbiting Jupiter: second extended mission (to Sep 2028)']],
    milestones: [[day(2013, 10, 9, 19, 21), 'Earth flyby, 571 km up'], [day(2016, 7, 5, 2, 30), 'Arrives: Jupiter orbit insertion'],
      [day(2021, 6, 7, 17, 35), 'Ganymede flyby, 1,038 km up'], [day(2022, 9, 29, 9, 36), 'Europa flyby, 352 km up'],
      [day(2023, 12, 30, 8, 36), 'Io flyby, 1,500 km up'], [day(2024, 2, 3, 17, 48), 'Io flyby, 1,500 km up'],
      [day(2028, 9, 1), 'End of the second extended mission (planned)']],
    perijove: true,
    fact: 'The first solar-powered spacecraft at Jupiter: three 9 m wings of solar cells catch sunlight 25 times fainter than at ' +
          'Earth. Every orbit it dives over Jupiter\'s poles to about 4,000 km above the clouds, then swings out past the ' +
          'Galilean moons; its electronics ride in a titanium vault against the radiation. It found clusters of cyclones at both ' +
          'poles and a "fuzzy", partly dissolved core, and it carries three LEGO figures: Galileo, Jupiter and Juno.',
    orbitNote: 'In orbit it is drawn on its real orbit (JPL), with the distance from Jupiter compressed like the moons\'.',
  },
  {
    key: 'clipper', name: 'Europa Clipper', model: 'clipper', color: '#7fe0c8', type: 'Europa explorer, cruising to Jupiter (NASA/JPL, APL)',
    launched: '14 Oct 2024 (Falcon Heavy, Kennedy)',
    phases: [[day(2025, 3, 1, 17, 56), 'Cruise: heading for a Mars flyby'], [day(2026, 12, 3, 20, 13), 'Cruise: looping back for an Earth flyby'],
      [day(2030, 4, 11, 8), 'Cruise to Jupiter'], [day(2031, 6, 1), 'Orbiting Jupiter: shaping the orbit for the Europa tour'],
      [day(2034, 9, 2), 'Orbiting Jupiter: 49 close Europa flybys']],
    milestones: [[day(2025, 3, 1, 17, 56), 'Mars flyby, 885 km up'], [day(2026, 12, 3, 20, 13), 'Earth flyby, 3,238 km up'],
      [day(2030, 4, 11, 8), 'Arrives: Jupiter orbit insertion'], [day(2034, 9, 3), 'Planned end: crash onto Ganymede']],
    perijove: true,
    fact: 'NASA\'s biggest planetary spacecraft: its solar arrays span 30.5 m, wider than a basketball court. It will swoop ' +
          'past Europa 49 times, as low as 25 km, to find out whether the ocean under the ice could support life, ducking ' +
          'back out of Jupiter\'s radiation between passes. It carries a poem, "In Praise of Mystery" by US Poet Laureate ' +
          'Ada Limón, engraved in her handwriting, and 2.6 million names on a microchip.',
    orbitNote: 'At Jupiter it is drawn on its planned orbit (JPL), with the distance from Jupiter compressed like the moons\'.',
  },
  {
    key: 'juice', name: 'JUICE', model: 'juice', color: '#b9a4ff', type: 'Jupiter Icy Moons Explorer, cruising (ESA)',
    launched: '14 Apr 2023 (Ariane 5, Kourou)',
    phases: [[day(2024, 8, 20, 21, 55), 'Cruise: heading for the Moon–Earth double flyby'], [day(2025, 8, 31, 5, 28), 'Cruise: heading for Venus'],
      [day(2026, 9, 28, 11, 44), 'Cruise: looping back for an Earth flyby'], [day(2029, 1, 17, 18, 33), 'Cruise: one last loop back to Earth'],
      [day(2031, 7, 20), 'Cruise to Jupiter']],
    milestones: [[day(2024, 8, 20, 21, 55), 'Moon (19 Aug) and Earth flybys, 6,840 km up'], [day(2025, 8, 31, 5, 28), 'Venus flyby, 5,088 km up'],
      [day(2026, 9, 28, 11, 44), 'Earth flyby, 8,648 km up'], [day(2029, 1, 17, 18, 33), 'Last Earth flyby, 4,641 km up'],
      [day(2031, 7, 21), 'Arrives at Jupiter (July 2031)'], [day(2034, 12, 15), 'Orbits Ganymede (Dec 2034)']],
    fact: 'Its 85 m² of solar panels are the largest ever put on an interplanetary spacecraft. In Aug 2024 it made the first-ever double ' +
          'gravity assist, Moon then Earth a day later, and on 28 Sep 2026 Earth bent its path 20° and sped it up 3.5 km/s. ' +
          'In Dec 2034 it will become the first spacecraft to orbit a moon of another planet: Ganymede, the largest moon in ' +
          'the Solar System, which hides a salty ocean.',
  },
  {
    key: 'psyche', name: 'Psyche spacecraft', short: 'Psyche', model: 'psyche', color: '#f0a8ff', type: 'Asteroid orbiter, cruising (NASA/JPL, ASU)',
    launched: '13 Oct 2023 (Falcon Heavy, Kennedy)',
    phases: [[day(2026, 5, 15, 19, 27), 'Cruise on ion power: heading for a Mars flyby'], [day(2029, 7, 31), 'Cruise on ion power to asteroid 16 Psyche'],
      [day(2031, 10, 31), 'Orbiting asteroid 16 Psyche (planned)']],
    milestones: [[day(2026, 5, 15, 19, 27), 'Mars flyby, 4,611 km up'], [day(2029, 8, 1), 'Arrives at asteroid 16 Psyche (summer 2029)'],
      [day(2031, 10, 31), 'End of the 26-month prime mission (planned)']],
    fact: 'Four Hall thrusters push it with a glow of xenon ions, gentle as the weight of three coins but nonstop for years: the ' +
          'first electric propulsion of this kind beyond the Moon. Its target, 16 Psyche, is a 280 km asteroid that may be the ' +
          'exposed metal core of a shattered baby planet. On the way it tested laser communication (DSOC) from beyond Mars.',
    tailNote: 'Horizons\' trajectory ends on 11 Feb 2029; after that it is drawn closing in on the asteroid by the planned arrival.',
  },
  {
    key: 'lucy', name: 'Lucy', model: 'lucy', color: '#9fd8ff', type: 'Trojan asteroid explorer (NASA/SwRI, Goddard)',
    launched: '16 Oct 2021 (Atlas V, Cape Canaveral)',
    phases: [[day(2022, 10, 16, 11, 4), 'Cruise: looping back for an Earth flyby'], [day(2024, 12, 13, 4, 15), 'Cruise: second loop to Earth'],
      [day(2027, 8, 11), 'Cruise to Jupiter\'s leading Trojans (L4)'], [day(2028, 11, 11), 'Touring the L4 Trojans'],
      [day(2030, 12, 27, 0, 35), 'Cruise: falling back to Earth'], [day(2033, 3, 3), 'Cruise to the trailing Trojans (L5)'],
      [day(2033, 4, 2), 'Patroclus–Menoetius, then the end of the mission']],
    milestones: [[day(2022, 10, 16, 11, 4), 'Earth flyby, 369 km up'], [day(2023, 11, 1, 16, 54), 'Dinkinesh flyby: finds moon Selam'],
      [day(2024, 12, 13, 4, 15), 'Earth flyby, 364 km up'], [day(2025, 4, 20, 17, 51), 'Asteroid Donaldjohanson flyby'],
      [day(2027, 8, 11), 'Trojan Eurybates and its moon Queta'], [day(2027, 9, 15), 'Trojan Polymele'], [day(2028, 4, 18), 'Trojan Leucus'],
      [day(2028, 11, 11), 'Trojan Orus'], [day(2030, 12, 27, 0, 35), 'Earth flyby, 628 km up'], [day(2033, 3, 3), 'Trojans Patroclus and Menoetius']],
    fact: 'The first visit to the Trojans, two swarms of asteroids that share Jupiter\'s orbit 60° ahead of and behind it: ' +
          'leftovers from the planets\' birth. It is named after the 3.2-million-year-old human ancestor fossil, itself ' +
          'named after the Beatles\' "Lucy in the Sky with Diamonds", and carries a plaque of messages for the far future. ' +
          'Its first flyby target, tiny Dinkinesh, turned out to have a moon that is itself two rocks stuck together.',
  },
  {
    key: 'bepi', name: 'BepiColombo', model: 'bepi', color: '#ffb0a0', type: 'Mercury orbiters MPO + Mio (ESA / JAXA)',
    launched: '20 Oct 2018 (Ariane 5, Kourou)',
    phases: [[day(2025, 1, 8, 5, 58), 'Cruise on ion power: nine flybys of Earth, Venus and Mercury'],
      [day(2026, 9, 3), 'Cruise on ion power to Mercury'], [day(2026, 11, 21), 'Final approach (transfer module dropped 3 Sep)'],
      [day(2026, 12, 10), 'Orbiting Mercury: MPO and Mio still stacked'], [day(2027, 3, 10), 'Orbiting Mercury: MPO lowering to its science orbit'],
      [day(2028, 5, 1), 'Orbiting Mercury: science mission']],
    milestones: [[day(2020, 4, 10, 4, 24), 'Earth flyby, 12,693 km up'], [day(2020, 10, 15, 3, 58), 'Venus flyby, 10,723 km up'],
      [day(2021, 8, 10, 13, 51), 'Venus flyby, 553 km up'], [day(2021, 10, 1, 23, 34), '1st Mercury flyby, 200 km up'],
      [day(2022, 6, 23, 9, 44), '2nd Mercury flyby, 207 km up'], [day(2023, 6, 19, 19, 34), '3rd Mercury flyby, 238 km up'],
      [day(2024, 9, 4, 21, 48), '4th Mercury flyby, 164 km up'], [day(2024, 12, 1, 14, 23), '5th Mercury flyby, 37,626 km up'],
      [day(2025, 1, 8, 5, 58), '6th Mercury flyby, 296 km up'], [day(2026, 11, 21), 'Arrives: Mercury orbit insertion'],
      [day(2026, 12, 9), 'Mio separates from MPO'], [day(2027, 3, 10), 'MPO reaches its 480 × 1,500 km science orbit'],
      [day(2027, 4, 6), 'Science operations begin'], [day(2028, 5, 1), 'End of the nominal mission']],
    fact: 'Two orbiters in one stack: Europe\'s MPO maps the surface and Japan\'s Mio studies the magnetic field. Reaching ' +
          'Mercury takes more braking than getting to Pluto, so it used ion engines and nine flybys over eight years. A power ' +
          'fault in its thrusters in 2024 delayed arrival by a year, to 21 Nov 2026. It is named after Giuseppe "Bepi" ' +
          'Colombo, who worked out the trick that let Mariner 10 fly past Mercury three times.',
    orbitNote: 'In orbit it is drawn on its real orbit (JPL/ESA) around a compressed Mercury, with the 2.3-hour laps slowed so they don\'t blur.',
  },
  {
    key: 'hera', name: 'Hera', model: 'hera', color: '#ffd9a0', type: 'Planetary-defence mission to Didymos (ESA)',
    launched: '7 Oct 2024 (Falcon 9, Cape Canaveral)',
    phases: [[day(2025, 3, 12, 12, 50), 'Cruise: heading for a Mars flyby'], [day(2026, 10, 15), 'Cruise to the Didymos asteroids'],
      [day(2026, 11, 4), 'Braking: closing in on Didymos'], [day(2027, 5, 31), 'Surveying Didymos and Dimorphos']],
    milestones: [[day(2025, 3, 12, 12, 50), 'Mars flyby, 5,670 km up (and Deimos)'], [day(2026, 10, 15), 'Braking burn 1'],
      [day(2026, 10, 22), 'Braking burn 2'], [day(2026, 11, 4), 'Arrives at Didymos (Nov 2026)'],
      [day(2027, 5, 31), 'End of close operations (about 6 months, planned)']],
    fact: 'A crash-scene investigator: in 2022 NASA\'s DART slammed into Dimorphos, the 151 m moonlet of asteroid Didymos, ' +
          'and shortened its 11 h 55 min orbit by about 33 minutes: the first time people moved a celestial body. Hera ' +
          'measures the crater and the moonlet\'s mass, so the trick can be used to push away an asteroid on course for ' +
          'Earth. It brought two CubeSats, Milani and Juventas, which will try to land on Dimorphos.',
    tailNote: 'After Horizons\' trajectory ends (4 Nov 2026, 30 km out) it is drawn riding with Didymos.',
  },
  {
    key: 'orex', name: 'OSIRIS-APEX', model: 'osiris', color: '#ffc47a', type: 'Asteroid explorer, ex OSIRIS-REx (NASA, U. Arizona)',
    launched: '8 Sep 2016 (Atlas V, Cape Canaveral) as OSIRIS-REx',
    phases: [[day(2018, 12, 3), 'OSIRIS-REx: cruise to asteroid Bennu'], [day(2021, 5, 10), 'OSIRIS-REx: mapping and sampling Bennu'],
      [day(2023, 9, 24, 14, 42), 'OSIRIS-REx: bringing the sample home'], [day(2029, 4, 13, 23, 5), 'OSIRIS-APEX: looping to meet Apophis'],
      [day(2029, 6, 1), 'Closing in on Apophis'], [day(2030, 3, 21), 'Studying Apophis after its brush with Earth']],
    milestones: [[day(2017, 9, 22, 16, 51), 'Earth flyby, 17,221 km up'], [day(2018, 12, 3), 'Arrives at Bennu'],
      [day(2020, 10, 20, 22, 8), 'Grabs a sample of Bennu'], [day(2023, 9, 24, 14, 52), 'Sample capsule lands in Utah'],
      [day(2025, 9, 23, 16, 59), 'Earth flyby, 3,444 km up'], [day(2027, 3, 16, 3, 29), 'Earth flyby, 4,188 km up'],
      [day(2029, 4, 13, 23, 5), 'Earth flyby, ~1,150 km up, an hour after Apophis'], [day(2029, 6, 1), 'Arrives at Apophis (late spring 2029)']],
    fact: 'As OSIRIS-REx it brought 121.6 g of asteroid Bennu to Earth in 2023: the biggest asteroid sample ever, rich in ' +
          'carbon and water-bearing clay. Renamed OSIRIS-APEX, it now chases Apophis, a 340 m asteroid that on 13 Apr 2029 ' +
          'passes Earth closer than TV satellites, visible to the naked eye. The spacecraft swings past Earth about an hour ' +
          'behind it, then catches up to watch how Earth\'s tides shook it.',
  },
];

// ---- trajectories --------------------------------------------------------------------------------------------------------
function decode(b64) {
  const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
  const I = new Int32Array(u8.buffer), m = I.length / 7;
  const t = new Float64Array(m), p = new Float64Array(m * 3), v = new Float64Array(m * 3);
  const kv = 86400 / AU_KM / 1e6;                     // mm/s → AU/day
  for (let k = 0; k < m; k++) {
    t[k] = sec2day(I[7 * k]);
    // J2000 ecliptic (X, Y, Z) → scene axes (x = X, y = Z, z = −Y), as smallbodies.js
    p[3 * k] = I[7 * k + 1] / AU_KM; p[3 * k + 1] = I[7 * k + 3] / AU_KM; p[3 * k + 2] = -I[7 * k + 2] / AU_KM;
    v[3 * k] = I[7 * k + 4] * kv; v[3 * k + 1] = I[7 * k + 6] * kv; v[3 * k + 2] = -I[7 * k + 5] * kv;
  }
  return { t, p, v, n: m };
}

export function solveE(M, e) {
  M = ((M % TAU) + TAU) % TAU;
  let E = e > 0.8 ? Math.PI : M;
  for (let k = 0; k < 40; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}
// position on a two-body ellipse (AU, scene axes) at eccentric anomaly E
export function ellipseAt(s, E, out) {
  const x = s.a * (Math.cos(E) - s.e), y = s.a * Math.sqrt(1 - s.e * s.e) * Math.sin(E);
  const X = s.P[0] * x + s.Q[0] * y, Y = s.P[1] * x + s.Q[1] * y, Z = s.P[2] * x + s.Q[2] * y;
  return out.set(X, Z, -Y);
}

export function createTrack(key) {
  const T = TRAJ[key];
  const segs = T.segs.map(([c, b64]) => ({ c, ...decode(b64) }));
  for (const s of segs) { s.t0 = s.t[0]; s.t1 = s.t[s.n - 1]; }
  let orbit = null;
  if (T.orbit) {
    const o = T.orbit;
    orbit = { c: o.c, R: o.R / AU_KM, t0: sec2day(o.t0), sets: o.sets.map(([t, a, e, i, node, w, M0]) => {
      const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(i), si = Math.sin(i);
      return { t: sec2day(t), a: a / AU_KM, e, M0, n: Math.sqrt(o.gm / (a * a * a)) * 86400,     // rad/day
        period: TAU / (Math.sqrt(o.gm / (a * a * a)) * 86400),
        P: [cw * cn - sw * sn * ci, cw * sn + sw * cn * ci, sw * si], Q: [-sw * cn - cw * sn * ci, -sw * sn + cw * cn * ci, cw * si] };
    }) };
  }
  const start = sec2day(T.start);
  const dataEnd = T.dataEnd !== undefined ? sec2day(T.dataEnd) : sec2day(T.end);
  const res = { mode: 0, c: 'Sun', set: null, setIndex: -1, M: 0 };   // mode 0 hidden, 1 heliocentric, 2 planet-relative, 3 in orbit
  let si = 0, ki = 0, oi = 0;
  const findK = (s, t) => {                           // knot index k with s.t[k] ≤ t < s.t[k+1] (cached walk, else bisection)
    let k = Math.min(ki, s.n - 2);
    if (t >= s.t[k] && t <= s.t[k + 1]) return k;
    if (t > s.t[k + 1] && k + 2 < s.n && t <= s.t[k + 2]) return k + 1;
    let lo = 0, hi = s.n - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s.t[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const track = {
    key, segs, orbit, start, dataEnd, end: sec2day(T.end), res,
    parkUntil: null,                                   // BepiColombo: stay on the last orbit until this date
    // state at main.js day t: res.mode / res.c and `out` = heliocentric AU (mode 1) or offset from planet res.c (modes 2, 3)
    eval(t, out) {
      res.mode = 0;
      if (t < start) return res;
      if (orbit && t >= orbit.t0) {
        if (t > track.end && !(track.parkUntil && t <= track.parkUntil)) return res;
        const S = orbit.sets;
        if (!(oi < S.length && S[oi].t <= t && (oi + 1 >= S.length || t < S[oi + 1].t))) {
          let lo = 0, hi = S.length - 1;
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].t <= t) lo = mid; else hi = mid - 1; }
          oi = lo;
        }
        const s = S[oi];
        res.M = s.M0 + s.n * (t - s.t);
        ellipseAt(s, solveE(res.M, s.e), out);
        res.mode = 3; res.c = orbit.c; res.set = s; res.setIndex = oi;
        return res;
      }
      if (t > track.end) return res;
      if (!(segs[si].t0 <= t && t <= segs[si].t1)) {
        si = 0;
        while (si < segs.length - 1 && t > segs[si].t1) si++;
        if (t > segs[si].t1) return res;
        ki = 0;
      }
      const s = segs[si];
      const k = ki = findK(s, t);
      const t0 = s.t[k], t1 = s.t[k + 1], h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
      const a = 2 * u3 - 3 * u2 + 1, b = (u3 - 2 * u2 + u) * h, c = -2 * u3 + 3 * u2, d = (u3 - u2) * h;
      const p = s.p, v = s.v, i0 = 3 * k, i1 = i0 + 3;
      out.set(a * p[i0] + b * v[i0] + c * p[i1] + d * v[i1], a * p[i0 + 1] + b * v[i0 + 1] + c * p[i1 + 1] + d * v[i1 + 1],
        a * p[i0 + 2] + b * v[i0 + 2] + c * p[i1 + 2] + d * v[i1 + 2]);
      res.mode = s.c === 'Sun' ? 1 : 2; res.c = s.c; res.set = null; res.setIndex = -1;
      return res;
    },
    // times to sample for the drawn path: every knot, plus a 2-day grid in cruise and a 2-hour grid near planets
    pathTimes() {
      const ts = [];
      for (const s of segs) {
        const step = s.c === 'Sun' ? 2 : 1 / 12;
        let k = 0;
        for (let t = s.t0; t < s.t1; t += step) {
          while (k < s.n && s.t[k] <= t) { if (!ts.length || s.t[k] > ts[ts.length - 1] + 1e-6) ts.push(s.t[k]); k++; }
          if (!ts.length || t > ts[ts.length - 1] + 1e-6) ts.push(t);
        }
        while (k < s.n) { if (!ts.length || s.t[k] > ts[ts.length - 1] + 1e-6) ts.push(s.t[k]); k++; }
      }
      return ts;
    },
  };
  return track;
}
