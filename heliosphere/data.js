// heliosphere/data.js: the numbers behind heliosphere/ (sources in CHANGELOG.md, 2026-10-26 entry).
// Days are days since J2000 (2000-01-01 12:00 UTC), the clock main.js uses.
const J2000 = Date.UTC(2000, 0, 1, 12);
const day = (y, m, d) => (Date.UTC(y, m - 1, d, 12) - J2000) / 86400000;

// Direction the interstellar wind comes FROM (the heliosphere's nose), J2000 ecliptic. IBEX + Ulysses "working values",
// McComas et al. 2015 (ApJS 220, 22): λ = 255.7°, β = 5.1°, 25.4 km/s, ~7,500 K at ~1000 AU upstream.
export const INFLOW = { lon: 255.7, lat: 5.1, speedKms: 25.4, tempK: 7500 };

// Voyager boundary crossings (NASA Voyager Interstellar Mission page; Stone et al. 2005 Science 309, 2017; Richardson et al. 2008
// Nature 454, 63; Burlaga et al. 2019 / Richardson et al. 2019 Nature Astronomy 3)
export const CROSSINGS = [
  { probe: 'Voyager 1', boundary: 'ts', au: 94.0, t: day(2004, 12, 16), date: '16 Dec 2004' },
  { probe: 'Voyager 2', boundary: 'ts', au: 84.0, t: day(2007, 8, 30), date: '30 Aug 2007' },
  { probe: 'Voyager 1', boundary: 'hp', au: 121.6, t: day(2012, 8, 25), date: '25 Aug 2012' },
  { probe: 'Voyager 2', boundary: 'hp', au: 119.0, t: day(2018, 11, 5), date: '5 Nov 2018' },
];

// Where to look if spacecraft/ is missing: the probes' outbound direction (RA h, Dec °), as in spacecraft/data.js
export const FALLBACK_DIR = { 'Voyager 1': [17 + 16 / 60, 12 + 26 / 60], 'Voyager 2': [20 + 10 / 60, -(59 + 52 / 60)] };

export const CARDS = {
  heliosphere: {
    name: 'Heliosphere', color: '#9fd8ff', type: 'The Sun\'s bubble in interstellar space · solar wind meets the interstellar wind',
    rows: () => [
      ['Size', 'Heliopause ~120 AU out toward the nose (Voyager 1 crossed it at 121.6 AU, Voyager 2 at 119.0 AU). Downwind it stretches into a long heliotail, hundreds of AU; how long and how round is still debated'],
      ['Interstellar wind', `Comes from ecliptic longitude ${INFLOW.lon}°, latitude ${INFLOW.lat}° (toward Ophiuchus) at ~${INFLOW.speedKms} km/s, ~${INFLOW.tempK.toLocaleString('en-US')} K (IBEX + Ulysses). The Sun plows through the Local Interstellar Cloud at about 91,000 km/h`],
      ['Layers', 'Sun → supersonic solar wind (~400 km/s) → termination shock (84–94 AU) → heliosheath (slow, hot, ~100–150 km/s) → heliopause (~120 AU) → interstellar space'],
      ['Voyagers now', 'live'],
    ],
    fact: 'There is probably no bow shock: IBEX showed the interstellar wind is too slow (below the fast magnetosonic speed) to make one, so the gas just piles up in a gentle "bow wave" ahead of the nose (McComas et al. 2012). IBEX also found the "ribbon", a bright, nearly circular band of energetic neutral atoms across the sky that traces the interstellar magnetic field draped over the heliosphere (2009). The bubble shields the planets from most galactic cosmic rays.',
  },
  ts: {
    name: 'Termination shock', color: '#ffc07a', type: 'Where the solar wind suddenly drops below the speed of sound',
    rows: () => [
      ['Voyager 1', 'Crossed 16 Dec 2004 at 94.0 AU, at 34° N'],
      ['Voyager 2', 'Crossed 30 Aug 2007 at ~84 AU, at 26° S (several crossings in two days as the shock moved back and forth). 10 AU closer: the bubble is squashed in the south, likely by the interstellar magnetic field'],
      ['Solar wind', '~400 km/s, slowed to ~300 km/s just before the shock by interstellar ions it has picked up, then dropping to ~130–150 km/s at the shock (Voyager 2 plasma data)'],
      ['It moves', 'In and out with the solar cycle: Voyager 2\'s data suggest it pulled in to ~73 AU around 2010, when the solar wind was weak'],
    ],
    fact: 'Like water from a tap hitting a sink and spreading in a ring, the supersonic solar wind piles up where it meets the interstellar pressure. Voyager 1\'s plasma instrument had failed in 1980, so its crossing was seen in energetic particles and the magnetic field; Voyager 2 measured the slowdown directly. The shock turned out weak and cool: most of the energy went into "pickup ions", not into heating the plasma.',
  },
  hs: {
    name: 'Heliosheath', color: '#e7a6ff', type: 'Slow, hot, compressed solar wind between the termination shock and the heliopause',
    rows: () => [
      ['Thickness', '~28 AU along Voyager 1\'s path (94 → 121.6 AU), ~35 AU along Voyager 2\'s (84 → 119 AU)'],
      ['Flow', '~100–170 km/s (Voyager 2), slowing and bending around toward the heliotail'],
      ['Time inside', 'Voyager 1: 7.7 years (Dec 2004 – Aug 2012). Voyager 2: 11.2 years (Aug 2007 – Nov 2018)'],
      ['Surprises', 'Voyager 1 found a "stagnation region" near the edge where the outward flow almost stopped; Voyager 2 found a "magnetic barrier" of piled-up field just inside the heliopause'],
    ],
    fact: 'The heliosheath is where most of the energetic neutral atoms IBEX maps come from: fast ions here swap an electron with interstellar hydrogen and fly off in a straight line, some all the way back to Earth orbit.',
  },
  hp: {
    name: 'Heliopause', color: '#7fd0ff', type: 'The edge of the heliosphere: interstellar space begins',
    rows: () => [
      ['Voyager 1', 'Crossed 25 Aug 2012 at 121.6 AU: the first human-made object in interstellar space'],
      ['Voyager 2', 'Crossed 5 Nov 2018 at 119.0 AU, in under a day, with a working plasma instrument this time'],
      ['What changed', 'Plasma ~20× denser outside (~0.002 → ~0.04 electrons per cm³), heliospheric particles dropped, galactic cosmic rays jumped. The interstellar plasma there is 30,000–50,000 K (Voyager 2)'],
      ['Voyagers now', 'live'],
    ],
    fact: 'The heliopause is where the pressure of the solar wind balances the interstellar medium\'s. The magnetic field direction hardly changed across it, which surprised scientists. Both Voyagers are still in a disturbed region just outside, not yet "pristine" interstellar space, and the Oort cloud lies far beyond: the Sun\'s gravity still rules out to ~100,000 AU.',
  },
};
