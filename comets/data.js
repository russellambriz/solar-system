// comets/data.js: orbital elements and facts for the comets drawn by comets/index.js.
// Elements are heliocentric J2000 ecliptic: q = perihelion distance (AU), e, i / node / peri (argument of perihelion) in
// degrees, T = perihelion time (days since J2000, main.js's clock). Halley's period is set from its 1986 and 2061
// perihelia, so both dates come out right; planetary tugs make its real period wander between ~74 and 79 years.
const J2000 = Date.UTC(2000, 0, 1, 12);
export const day = (y, m, d, h = 0, min = 0) => (Date.UTC(y, m - 1, d, h, min) - J2000) / 86400000;

const HALLEY_T = day(1986, 2, 9, 11), HALLEY_NEXT = day(2061, 7, 28);

export const COMETS = [
  {
    name: "Halley's Comet", short: 'Halley', designation: '1P/Halley', color: '#9fd8ff',
    type: 'Periodic comet (1P/Halley) · comes back every ~76 years',
    q: 0.586, e: 0.96714, i: 162.26, node: 58.42, peri: 111.33, T: HALLEY_T, period: HALLEY_NEXT - HALLEY_T,
    nucleusKm: 11,
    // activity: tails start growing inside rOn (AU); lengths at perihelion (AU) for the ion and dust tails
    rOn: 5, ionAU: 0.25, dustAU: 0.15,
    rows: [
      ['Orbit', 'Every ~76 years, backwards compared with the planets (retrograde), tilted 162°'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.59 AU (inside Venus\'s orbit): last on 9 Feb 1986, next on 28 Jul 2061'],
      ['Tails now', 'live'],
    ],
    fact: 'The first comet known to come back: Edmond Halley worked out that the comets of 1531, 1607 and 1682 were one ' +
          'object and predicted its return in 1758, which happened after his death. People have recorded it since at ' +
          'least 240 BC, and it appears on the Bayeux Tapestry (1066). Its nucleus is a 15 × 8 km peanut darker than coal, ' +
          'photographed by the Giotto probe from 596 km in March 1986. Dust it sheds causes the Eta Aquariid (May) and ' +
          'Orionid (October) meteor showers.',
  },
  {
    name: 'Comet Hale-Bopp', short: 'Hale-Bopp', designation: 'C/1995 O1', color: '#b6f2de',
    type: 'Long-period comet (C/1995 O1) · the Great Comet of 1997',
    q: 0.9141, e: 0.99509, i: 89.43, node: 282.47, peri: 130.59, T: day(1997, 4, 1, 3),
    nucleusKm: 60,
    rOn: 8, ionAU: 0.6, dustAU: 0.4,
    rows: [
      ['Orbit', 'About 2,400 years, almost at right angles to the planets (89°); farthest ~370 AU'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.91 AU on 1 Apr 1997; next time around the year 4400'],
      ['Tails now', 'live'],
    ],
    fact: 'Found on 23 July 1995 by Alan Hale and Thomas Bopp, who were both watching the same patch of sky that night. ' +
          'It was 7.2 AU away, farther than any comet amateurs had ever discovered, because its nucleus is huge (about 60 km). ' +
          'It stayed visible to the naked eye for a record 18 months, with a blue ion tail, a white dust tail and a faint ' +
          'third tail of sodium. A close pass by Jupiter in 1996 shortened its orbit from about 4,200 to about 2,400 years.',
  },
];
for (const c of COMETS) {
  c.a = c.q / (1 - c.e);
  if (!c.period) c.period = 365.25 * Math.pow(c.a, 1.5);
}
