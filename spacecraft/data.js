// spacecraft/data.js: facts, dates and orbit data for the spacecraft and Moon landing sites (see spacecraft/index.js).
// Times are days since J2000 (2000-01-01 12:00 UTC), the same clock main.js uses.
const J2000 = Date.UTC(2000, 0, 1, 12);
export const day = (y, m, d, h = 0, min = 0) => (Date.UTC(y, m - 1, d, h, min) - J2000) / 86400000;

// km/s -> AU per year
export const KMS_TO_AU_YR = 31557600 / 149597870.7;

// ---------------------------------------------------------------------------------------------------------------------
// Escaping probes: launch, planetary flybys (the probe sits on that planet at that date, using main.js's own planet
// model, so the trail passes through each planet), then a straight coast to a measured position:
// distance from the Sun on EPOCH and the direction in the sky (RA/Dec, heavens-above.com "Spacecraft escaping the Solar
// System", mid-2026). After EPOCH they keep coasting along the same line at today's speed.
// ---------------------------------------------------------------------------------------------------------------------
export const EPOCH = day(2026, 6, 15);

export const PROBES = [
  {
    name: 'Voyager 1', color: '#8fd3ff', type: 'Space probe · interstellar space (NASA/JPL)',
    launch: day(1977, 9, 5, 12, 56),
    flybys: [['Jupiter', day(1979, 3, 5)], ['Saturn', day(1980, 11, 12)]],
    epochAU: 170.98, raH: 17 + 16 / 60, decDeg: 12 + 26 / 60, speedKms: 17.0,
    rows: [
      ['Launched', '5 Sep 1977 (16 days after Voyager 2)'],
      ['Distance from Sun', 'live'],
      ['Signal time from Earth', 'live'],
      ['Speed', '17.0 km/s (3.6 AU a year), outward toward Ophiuchus'],
    ],
    fact: 'The farthest human-made object. It flew past Jupiter (1979) and Saturn (1980), where a close pass of Titan flung it ' +
          'north out of the planets\' plane. On 14 Feb 1990, about 6 billion km out, it took the "Pale Blue Dot" photo of Earth. ' +
          'In Aug 2012, at 121.6 AU, it became the first spacecraft in interstellar space, and in Nov 2026 it reaches one ' +
          'light-day from Earth. It carries a Golden Record of sounds and pictures of Earth.',
  },
  {
    name: 'Voyager 2', color: '#c6b2ff', type: 'Space probe · interstellar space (NASA/JPL)',
    launch: day(1977, 8, 20, 14, 29),
    flybys: [['Jupiter', day(1979, 7, 9)], ['Saturn', day(1981, 8, 26)], ['Uranus', day(1986, 1, 24)], ['Neptune', day(1989, 8, 25)]],
    epochAU: 143.15, raH: 20 + 10 / 60, decDeg: -(59 + 52 / 60), speedKms: 15.37,
    rows: [
      ['Launched', '20 Aug 1977'],
      ['Distance from Sun', 'live'],
      ['Signal time from Earth', 'live'],
      ['Speed', '15.4 km/s (3.2 AU a year), outward toward Pavo'],
    ],
    fact: 'The only spacecraft to visit Uranus (Jan 1986) and Neptune (Aug 1989), after Jupiter (1979) and Saturn (1981). ' +
          'This "Grand Tour" used a line-up of the outer planets that happens about once every 175 years. The Neptune flyby bent ' +
          'its path south of the planets\' plane. It entered interstellar space on 5 Nov 2018 at 119 AU. Like Voyager 1 it ' +
          'carries a Golden Record.',
  },
  {
    name: 'New Horizons', color: '#ffb36b', type: 'Space probe · Kuiper belt (NASA/JHU APL)',
    launch: day(2006, 1, 19, 19, 0),
    flybys: [['Jupiter', day(2007, 2, 28)], ['Pluto', day(2015, 7, 14, 11, 50)]],
    epochAU: 64.90, raH: 19 + 20 / 60, decDeg: -(20 + 7 / 60), speedKms: 13.65,
    rows: [
      ['Launched', '19 Jan 2006 (fastest launch ever, 16.3 km/s)'],
      ['Distance from Sun', 'live'],
      ['Signal time from Earth', 'live'],
      ['Speed', 'about 13.7 km/s (2.9 AU a year), toward Sagittarius'],
    ],
    fact: 'It swung past Jupiter in Feb 2007 for a speed boost, then made the first visit to Pluto on 14 Jul 2015, passing ' +
          '12,500 km above the surface and finding the heart-shaped nitrogen-ice plain Sputnik Planitia. On 1 Jan 2019 it flew ' +
          'past Arrokoth, a 36 km "snowman" 6.6 billion km from the Sun: the most distant object ever explored up close. It ' +
          'carries some of the ashes of Clyde Tombaugh, who discovered Pluto in 1930.',
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Parker Solar Probe: final orbit since the last Venus flyby (6 Nov 2024). Perihelion 9.86 solar radii (0.0459 AU),
// aphelion ~0.73 AU, perihelia 88.4 days apart (P22 24 Dec 2024 ... P29 4 Sep 2026 14:53 UTC). The orbit lies close to
// Venus's plane (it is shaped by Venus flybys), and P29 was a "farside" perihelion on the far side of the Sun from
// Earth, which puts perihelion at ecliptic longitude ~160°. Elements in the format smallbodies.js keplerAU() takes.
// ---------------------------------------------------------------------------------------------------------------------
const PSP_PERIOD = 88.44, PSP_Q = 0.0459;
const PSP_A = Math.pow(PSP_PERIOD / 365.256, 2 / 3);
const PSP_PERI_T = day(2026, 9, 4, 14, 53);
export const PARKER = {
  name: 'Parker Solar Probe', color: '#ff9a6b', type: 'Solar probe · the fastest object ever built (NASA/JHU APL)',
  launch: day(2018, 8, 12, 7, 31),
  el: {
    a: PSP_A, e: 1 - PSP_Q / PSP_A, i: 3.4, node: 76.7, peri: 160 - 76.7, period: PSP_PERIOD,
    M0: ((-(PSP_PERI_T / PSP_PERIOD) * 360) % 360 + 360) % 360,
  },
  rows: [
    ['Launched', '12 Aug 2018 (Delta IV Heavy)'],
    ['Distance from Sun', 'live'],
    ['Speed now', 'live'],
    ['Orbit', 'Every 88 days, from 6.1 million km above the Sun\'s surface out to Venus\'s orbit'],
  ],
  fact: 'At its closest it swoops 6.1 million km above the Sun\'s surface at about 690,000 km/h (192 km/s), fast enough to ' +
        'cross from New York to Tokyo in about a minute. An 11.4 cm carbon-foam heat shield faces about 1,400 °C while the ' +
        'instruments behind it stay near room temperature. In April 2021 it became the first spacecraft to fly through the ' +
        'Sun\'s corona. It is named after Eugene Parker, who predicted the solar wind in 1958. The orbit drawn is its final ' +
        'one (since Dec 2024); earlier orbits were wider.',
};

// ---------------------------------------------------------------------------------------------------------------------
// James Webb Space Telescope at Sun–Earth L2 (on the Sun–Earth line, 1.5 million km beyond Earth), on a halo orbit
// around L2 that takes about 6 months per loop.
// ---------------------------------------------------------------------------------------------------------------------
export const JWST = {
  name: 'James Webb Space Telescope', short: 'JWST', color: '#ffd27a', type: 'Infrared space telescope (NASA/ESA/CSA)',
  launch: day(2021, 12, 25, 12, 20), arrive: day(2022, 1, 24, 19, 0), haloPeriod: 180,
  rows: [
    ['Launched', '25 Dec 2021 (Ariane 5, French Guiana)'],
    ['Where', 'Sun–Earth L2, 1.5 million km beyond Earth (4× the Moon\'s distance; drawn much closer)'],
    ['Orbit', 'Loops around L2 about every 6 months, while L2 circles the Sun with Earth'],
    ['Mirror', '6.5 m across: 18 gold-coated beryllium hexagons'],
  ],
  fact: 'The largest telescope ever sent into space. Its tennis-court-sized sunshield has five layers thinner than a human ' +
        'hair and keeps the mirror and instruments below −223 °C, so they can pick up the faint infrared glow of galaxies that ' +
        'formed more than 13 billion years ago. Its first full-colour images were released on 12 July 2022. The launch was so ' +
        'accurate that it saved enough fuel for more than 20 years of science.',
};

// ---------------------------------------------------------------------------------------------------------------------
// International Space Station. Real altitude ~420 km would sit on the drawn surface at this scale, so it flies at
// 1,500 km; its 92.9-minute orbit is slowed (see ISS_SLOW in index.js) so it doesn't blur.
// ---------------------------------------------------------------------------------------------------------------------
export const ISS = {
  name: 'International Space Station', short: 'ISS', color: '#bfe9ff', type: 'Crewed space station in low Earth orbit',
  launch: day(1998, 11, 20, 6, 40), periodMin: 92.9, inclination: 51.64, shownAltKm: 1500,
  rows: [
    ['In orbit since', '20 Nov 1998; crewed nonstop since 2 Nov 2000'],
    ['Altitude', '~420 km (drawn at ~1,500 km, 3.5× too high, so it clears the surface at this scale)'],
    ['Orbit', 'Every 93 min at 7.66 km/s, tilted 51.6° (slowed ~300× here)'],
    ['Size', '109 m across, ~420 tonnes: about a football field'],
  ],
  fact: 'The biggest structure humans have built in space. Its crew sees about 16 sunrises and 16 sunsets every day. From the ' +
        'ground it looks like a bright star gliding across the sky in a few minutes, no telescope needed. NASA plans to bring ' +
        'it down into a remote part of the Pacific around 2030 using a SpaceX deorbit vehicle.',
};

// ---------------------------------------------------------------------------------------------------------------------
// Crewed Moon landings (selenographic lat/lon: north and east positive) and the planned Artemis south-pole landing area.
// ---------------------------------------------------------------------------------------------------------------------
export const SITES = [
  { name: 'Apollo 11', lat: 0.674, lon: 23.473,
    rows: [
      ['Landed', '20 Jul 1969, 20:17 UTC'],
      ['Crew on the Moon', 'Neil Armstrong, Buzz Aldrin (Michael Collins orbited in Columbia)'],
      ['Site', 'Sea of Tranquility · 0.674° N, 23.473° E'],
      ['On the surface', '21.6 hours · 1 moonwalk (2.5 h) · 21.5 kg of rock'],
    ],
    fact: 'The first crewed landing: "That\'s one small step for man, one giant leap for mankind." Armstrong flew the Eagle ' +
          'lander by hand past a boulder field and touched down with less than a minute of landing fuel to spare. The laser ' +
          'reflector they left is still used to measure the Moon\'s distance to within a few millimetres.' },
  { name: 'Apollo 12', lat: -3.012, lon: -23.422,
    rows: [
      ['Landed', '19 Nov 1969, 06:54 UTC'],
      ['Crew on the Moon', 'Pete Conrad, Alan Bean (Richard Gordon orbited in Yankee Clipper)'],
      ['Site', 'Ocean of Storms · 3.012° S, 23.422° W'],
      ['On the surface', '31.5 hours · 2 moonwalks · 34.4 kg of rock'],
    ],
    fact: 'A pinpoint landing about 180 m from the robotic Surveyor 3, which had landed in 1967; the crew walked over and ' +
          'brought pieces of it home. Their Saturn V was struck by lightning twice just after liftoff, and the mission flew on.' },
  { name: 'Apollo 14', lat: -3.645, lon: -17.471,
    rows: [
      ['Landed', '5 Feb 1971, 09:18 UTC'],
      ['Crew on the Moon', 'Alan Shepard, Edgar Mitchell (Stuart Roosa orbited in Kitty Hawk)'],
      ['Site', 'Fra Mauro highlands · 3.645° S, 17.471° W'],
      ['On the surface', '33.5 hours · 2 moonwalks · 42.8 kg of rock'],
    ],
    fact: 'Shepard, the first American in space (1961), became the only Mercury astronaut to walk on the Moon, and hit two golf ' +
          'balls with a makeshift club. Roosa carried tree seeds around the Moon; the "Moon trees" grown from them were planted ' +
          'across the United States.' },
  { name: 'Apollo 15', lat: 26.132, lon: 3.634,
    rows: [
      ['Landed', '30 Jul 1971, 22:16 UTC'],
      ['Crew on the Moon', 'David Scott, James Irwin (Alfred Worden orbited in Endeavour)'],
      ['Site', 'Hadley–Apennine · 26.132° N, 3.634° E'],
      ['On the surface', '67 hours · 3 moonwalks · 77 kg of rock'],
    ],
    fact: 'The first mission with the Lunar Roving Vehicle, driven 28 km around Hadley Rille and the Apennine mountains. The crew found the ' +
          '"Genesis Rock", a piece of the Moon\'s ancient crust about 4 billion years old. On camera, Scott dropped a hammer and ' +
          'a falcon feather together: with no air, they hit the ground at the same moment, as Galileo predicted.' },
  { name: 'Apollo 16', lat: -8.973, lon: 15.500,
    rows: [
      ['Landed', '21 Apr 1972, 02:23 UTC'],
      ['Crew on the Moon', 'John Young, Charles Duke (Ken Mattingly orbited in Casper)'],
      ['Site', 'Descartes Highlands · 8.973° S, 15.500° E'],
      ['On the surface', '71 hours · 3 moonwalks · 95.8 kg of rock'],
    ],
    fact: 'The only landing in the rugged lunar highlands. The crew set up the first telescope on the Moon, an ultraviolet ' +
          'camera that photographed Earth\'s glowing upper atmosphere, and Duke left a photo of his family on the surface.' },
  { name: 'Apollo 17', lat: 20.191, lon: 30.772,
    rows: [
      ['Landed', '11 Dec 1972, 19:54 UTC'],
      ['Crew on the Moon', 'Gene Cernan, Harrison Schmitt (Ronald Evans orbited in America)'],
      ['Site', 'Taurus–Littrow valley · 20.191° N, 30.772° E'],
      ['On the surface', '75 hours · 3 moonwalks · 110.5 kg of rock (the record)'],
    ],
    fact: 'The last time people walked on the Moon. Schmitt was the only trained geologist to go, and he spotted orange ' +
          'volcanic glass beads at Shorty crater. On the way there the crew took the famous "Blue Marble" photo of the whole ' +
          'sunlit Earth.' },
  { name: 'Artemis landing area', label: 'Artemis (planned)', lat: -89.5, lon: 0, artemis: true,
    title: 'Lunar south pole · planned Artemis landing',
    rows: [
      ['Where', 'Around 89.5° S, near the south pole and craters such as Shackleton'],
      ['Planned landing', 'Artemis IV, 2028: the first crewed landing since 1972'],
      ['Why here', 'Water ice in craters that never see sunlight, next to ridges in almost constant sunlight for solar power'],
      ['Artemis so far', 'Artemis I (uncrewed, Nov 2022); Artemis II flew four astronauts around the Moon, 1–10 Apr 2026'],
    ],
    fact: 'NASA first planned this landing for Artemis III. In 2026 it turned Artemis III into a 2027 test flight in Earth ' +
          'orbit, where Orion practises docking with the commercial landers, and moved the first landing near the south pole ' +
          'to Artemis IV. Ice that has sat in permanent shadow for billions of years could give future crews drinking water, ' +
          'oxygen and rocket fuel.' },
];
