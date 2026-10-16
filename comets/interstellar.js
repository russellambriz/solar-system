// comets/interstellar.js: the three known interstellar visitors, drawn by comets/index.js on open hyperbolic paths (e > 1).
//
// Elements: JPL Small-Body Database API (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=…&full-prec=1), fetched 2026-10-15.
// Heliocentric, J2000 ecliptic, the same convention as comets/data.js: q = perihelion distance (AU), e, i / node (Ω) /
// peri (ω) in degrees, T = perihelion time (days since J2000 = JD 2451545.0; SBDB's tp is TDB, ~1 min off UTC, ignored).
// a = q / (1 − e) comes out negative, as SBDB lists it. Pure two-body motion from these osculating elements; the small
// non-gravitational pushes in JPL's fits (A1/A2/A3) are not modelled, so far from perihelion positions drift slightly.
//   1I/'Oumuamua (A/2017 U1): JPL solution 16 (2018-06-26), epoch JD 2458080.5, 207 obs 2017-10-14 → 2018-01-02
//   2I/Borisov  (C/2019 Q4):  JPL solution 54 (2024-06-24), epoch JD 2458853.5, 964 obs 2019-02-24 → 2020-09-30
//   3I/ATLAS    (C/2025 N1):  JPL solution 54 (2026-02-19), epoch JD 2461090.5, 782 obs 2025-05-15 → 2026-02-19
const JD2000 = 2451545.0;

export const VISITORS = [
  {
    name: "1I/'Oumuamua", short: "'Oumuamua", designation: '1I/2017 U1', color: '#ff8fd0', hyperbolic: true,
    type: 'Interstellar object 1I/2017 U1 · the first known visitor from another star',
    q: 0.2559115812959116, e: 1.201133796102373, i: 122.7417062847286, node: 24.59690955523242, peri: 241.8105360304898,
    T: 2458006.007321375231 - JD2000,                       // 9 Sep 2017 12:10 UT
    // no coma or tail was ever seen: rOn = 0 keeps it a bare rock
    rOn: 0, ionAU: 0, dustAU: 0,
    rock: { color: 0xc07a58, stretch: [5, 1, 0.9], size: 0.09 },   // elongated, reddish; tumbling
    rows: [
      ['Discovered', '19 Oct 2017 by Robert Weryk with the Pan-STARRS1 telescope (Haleakalā, Hawaii), already on its way out'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.256 AU (inside Mercury\'s orbit) on 9 Sep 2017'],
      ['Speed', 'live'],
    ],
    fact: 'Its Hawaiian name means "a messenger from afar arriving first". It flickered about tenfold in brightness every ' +
          'few hours as it tumbled, so it must be very elongated (or flat): a reddish body a few hundred metres long. ' +
          'Telescopes saw no gas or dust at all, yet its tracking showed a tiny extra push away from the Sun on top of ' +
          'gravity (about 0.1% of the Sun\'s pull), the kind of push comets get from venting gas. What caused it is still ' +
          'debated. It arrived from the direction of the star Vega in Lyra and is now leaving towards Pegasus.',
  },
  {
    name: '2I/Borisov', short: 'Borisov', designation: 'C/2019 Q4', color: '#c39bff', hyperbolic: true,
    type: 'Interstellar comet 2I/Borisov (C/2019 Q4) · the first comet from another star',
    q: 2.006520878500843, e: 3.356475782676596, i: 44.05264247909138, node: 308.1477292269942, peri: 209.1236864378081,
    T: 2458826.052845906059 - JD2000,                       // 8 Dec 2019 13:16 UT
    nucleusKm: 1,
    // active well before discovery; tails drawn enlarged (like every coma here) so they read at this scale
    rOn: 6, ionAU: 0, dustAU: 0.12, tailText: 'a coma and a dusty tail',
    rows: [
      ['Discovered', '30 Aug 2019 by amateur astronomer Gennadiy Borisov (Crimea), with a 0.65 m telescope he built himself'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '2.01 AU (between Mars and the asteroid belt) on 8 Dec 2019'],
      ['Speed', 'live'],
    ],
    fact: 'Unlike \'Oumuamua, Borisov looked like an ordinary comet: a fuzzy coma and a dust tail, from a nucleus less than ' +
          'about 1 km across. Hubble and ALMA found its gas unusually rich in carbon monoxide, a hint that it formed in a ' +
          'very cold place around its home star. In March 2020, on its way out, it flared up and a piece broke off.',
  },
  {
    name: '3I/ATLAS', short: '3I/ATLAS', designation: 'C/2025 N1', color: '#ff6fe6', hyperbolic: true,
    type: 'Interstellar comet 3I/ATLAS (C/2025 N1) · the third known interstellar visitor',
    q: 1.356481057231181, e: 6.141351449317625, i: 175.1164570850441, node: 322.1696089290778, peri: 128.0228697185194,
    T: 2460977.995262847653 - JD2000,                       // 29 Oct 2025 11:53 UT
    nucleusKm: 2,
    rOn: 6, ionAU: 0.1, dustAU: 0.16, tailText: 'a coma and tail',
    rows: [
      ['Discovered', '1 Jul 2025 by the ATLAS survey telescope at Río Hurtado, Chile (older images later found it back to May 2025)'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '1.36 AU (just inside Mars\'s orbit) on 29 Oct 2025'],
      ['Speed', 'live'],
    ],
    fact: 'The fastest visitor so far, on the most open path (e ≈ 6.1): it barely bends around the Sun. Its orbit runs ' +
          'backwards, tilted 175°, close to the plane of the planets. It was already active when found 4.5 AU out, and ' +
          'JWST saw a coma dominated by carbon dioxide. Around perihelion it was behind the Sun as seen from Earth, but ' +
          'it passed about 0.2 AU from Mars on 3 Oct 2025, and spacecraft orbiting Mars photographed it.',
  },
];
for (const c of VISITORS) {
  c.a = c.q / (1 - c.e);                       // negative for a hyperbola (AU)
  c.n = 0.01720209895 / Math.pow(-c.a, 1.5);   // mean motion (rad/day), Gaussian constant k / |a|^1.5
}
