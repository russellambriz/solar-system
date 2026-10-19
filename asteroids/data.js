// asteroids/data.js: famous asteroids and near-Earth objects, drawn by asteroids/index.js on their real orbits.
//
// Elements: heliocentric, J2000 ecliptic and equinox (the frame of comets/data.js and smallbodies.js). a [AU], e,
// i / node (Ω) / peri (ω) / M (mean anomaly at the epoch) in degrees, n = mean motion [deg/day], epoch = JD (TDB, the
// ~1 min to UTC is ignored). Pure two-body motion from these osculating elements (planetary pulls are not modelled, so
// positions drift slowly for dates far from the epoch).
// Source: JPL Small-Body Database API (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=<number>&full-prec=1), fetched 2026-10-16:
//   99942 Apophis   JPL solution 220 (2024-06-25), epoch JD 2461200.5 (2026-06-09), 7,370 obs 2004-03-15 → 2022-04-09
//   162173 Ryugu    JPL solution 270 (2026-08-11), epoch JD 2461200.5, 5,124 obs 1986 → 2025
//   65803 Didymos   JPL solution 240 (2026-03-01), epoch JD 2461200.5, 1,869 obs 2022-09-27 → 2025-03-11
//   16 Psyche       JPL solution 92  (2025-02-06), epoch JD 2461200.5, 7,401 obs 1984 → 2024
//   433 Eros        JPL solution 659 (2021-05-24), epoch JD 2461200.5, 9,130 obs 1893 → 2021
//   2024 YR4        JPL solution 80  (2026-07-28), epoch JD 2461200.5, 485 obs 2024-12-25 → 2026-02-26 (incl. JWST)
// JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api, EPHEM_TYPE=ELEMENTS, CENTER=500@10, ecliptic J2000), 2026-10-16:
//   101955 Bennu    JPL solution 118 (2021-01-07) osculating at JD 2461200.5 (SBDB lists it at a 2011 epoch, 15 years back)
//   Apophis after its 2029 flyby: solution 220 osculating at JD 2462290.5 (2029-06-03). Earth's pull on 13 Apr 2029
//   stretches its orbit from a = 0.922 AU (324-day year) to 1.103 AU (423 days); index.js switches sets at the flyby.
// The 2029 flyby time and distance are from JPL's close-approach API (cad.api?des=99942): 2029-Apr-13 21:46 TDB,
// 0.000254091 AU = 38,012 km from Earth's centre.
// Vesta and Ceres are already in the scene as selectable bodies (smallbodies.js), so they are not repeated here.
const JD2000 = 2451545.0;
export const APOPHIS_TCA = 2462240.407091969 - JD2000;       // days since J2000 of the 2029 closest approach
export const APOPHIS_TCA_KM = 0.000254090910419299 * 149597870.7;

export const ASTEROIDS = [
  {
    name: '99942 Apophis', short: 'Apophis', kind: 'neo', color: '#ffb48a', sub: 'Near-Earth asteroid · 2029 flyby',
    type: 'Near-Earth asteroid 99942 Apophis (2004 MN4) · potentially hazardous · Aten class until 2029, Apollo after',
    aliases: ['apophis', '99942', '2004 mn4', 'near earth asteroid', 'asteroid', 'neo', '2029 flyby'],
    el: { a: 0.9223592206975018, e: 0.1911492279663492, i: 3.340996879880978, node: 203.8936514240762, peri: 126.6795706895841,
      M: 175.3304026592739, n: 1.112638115271892, epoch: 2461200.5 },
    post: { from: APOPHIS_TCA, el: { a: 1.103101666298891, e: 0.1890594750966858, i: 2.221082103353221, node: 203.5624105930783,
      peri: 71.43324190972841, M: 350.9411252185237, n: 0.8507084820138767, epoch: 2462290.5 } },
    // radar: elongated (~2:1), possibly two-lobed; it tumbles (non-principal-axis spin, ~30.6 h)
    shape: { kind: 'peanut', axes: [1, 0.55, 0.5], waist: 0.22, lump: 0.1, craters: 14, boulders: 50, base: [0.56, 0.5, 0.44], seed: 11 },
    size: 0.07, spinH: 30.56, tumble: true,
    rows: [
      ['Size', '~340 m across (3½ football fields), elongated and maybe two-lobed, from radar'],
      ['Discovered', '19 Jun 2004 by Roy Tucker, David Tholen and Fabrizio Bernardi at Kitt Peak, Arizona'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'Named after Apep, the Egyptian serpent god of chaos. For a few days in December 2004 it looked like it had a ' +
          '2.7% chance of hitting Earth in 2029; that has been ruled out, and radar in 2021 cleared it for at least 100 ' +
          'years. On 13 Apr 2029 it will pass just 31,600 km above Earth\'s surface, closer than geostationary satellites, ' +
          'and be visible to the naked eye from Europe and Africa. Earth\'s gravity will stretch its orbit (its year grows ' +
          'from 324 to 423 days), and NASA\'s OSIRIS-APEX, the spacecraft that brought Bennu\'s sample home, will meet it ' +
          'right after the flyby.',
  },
  {
    name: '101955 Bennu', short: 'Bennu', kind: 'neo', color: '#c7b8a6', sub: 'Near-Earth asteroid · OSIRIS-REx',
    type: 'Near-Earth asteroid 101955 Bennu (1999 RQ36) · potentially hazardous · Apollo class · rubble pile',
    aliases: ['bennu', '101955', '1999 rq36', 'osiris rex', 'osiris-rex', 'near earth asteroid', 'asteroid', 'neo'],
    el: { a: 1.125950726463012, e: 0.2036821438660532, i: 6.032966274857705, node: 1.96657403725591, peri: 66.41055452273676,
      M: 72.45176654686115, n: 0.8249450020676293, epoch: 2461200.5 },
    shape: { kind: 'top', axes: [1, 0.905, 0.975], ridge: 0.55, lump: 0.05, craters: 10, boulders: 140, base: [0.36, 0.34, 0.32], seed: 21 },
    size: 0.075, spinH: 4.296, pole: { ra: 85.4522, dec: -60.3678 },    // retrograde spinner (pole points south of the ecliptic)
    rows: [
      ['Size', '~490 m across (505 × 492 × 457 m), a "spinning top" with a ridge around its equator'],
      ['Discovered', '11 Sep 1999 by the LINEAR survey (Socorro, New Mexico)'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'NASA\'s OSIRIS-REx orbited Bennu and on 20 Oct 2020 touched its surface for 6 seconds; the surface was so loose ' +
          'that the sampler sank in like a ball pit. The capsule landed in Utah on 24 Sep 2023 with 121.6 g of rock and ' +
          'dust containing amino acids and all five bases used in DNA and RNA. Bennu is the best-tracked asteroid: ' +
          'its biggest risk is a 1-in-2,700 (0.037%) chance of hitting Earth on 24 Sep 2182.',
  },
  {
    name: '162173 Ryugu', short: 'Ryugu', kind: 'neo', color: '#b8aa9a', sub: 'Near-Earth asteroid · Hayabusa2',
    type: 'Near-Earth asteroid 162173 Ryugu (1999 JU3) · potentially hazardous · Apollo class · rubble pile',
    aliases: ['ryugu', '162173', '1999 ju3', 'hayabusa2', 'hayabusa 2', 'jaxa', 'near earth asteroid', 'asteroid', 'neo'],
    el: { a: 1.190918932702464, e: 0.1910730046480051, i: 5.866442486408568, node: 251.2897123995624, peri: 211.608993811871,
      M: 62.34067409463987, n: 0.7583693538530714, epoch: 2461200.5 },
    shape: { kind: 'top', axes: [1, 0.87, 0.99], ridge: 0.8, lump: 0.06, craters: 12, boulders: 120, base: [0.33, 0.31, 0.3], seed: 31 },
    size: 0.085, spinH: 7.6326, pole: { ra: 96.3956, dec: -66.3937 },
    rows: [
      ['Size', '~900 m across (1,004 × 876 m), a "spinning top" with a sharp equatorial ridge'],
      ['Discovered', '10 May 1999 by the LINEAR survey (Socorro, New Mexico)'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'Ryugu means "Dragon Palace", the undersea castle in the Japanese folk tale of Urashima Tarō. JAXA\'s Hayabusa2 ' +
          'arrived on 27 Jun 2018, dropped little hopping rovers, fired a copper bullet to blast an artificial crater, and ' +
          'touched down twice. On 6 Dec 2020 its capsule landed in Australia with 5.4 g of Ryugu: some of the most ' +
          'pristine material from the birth of the Solar System, rich in water-bearing clay and organic molecules.',
  },
  {
    name: '65803 Didymos', short: 'Didymos', kind: 'neo', color: '#d6c9b0', sub: 'Near-Earth asteroid · DART & Dimorphos',
    type: 'Near-Earth binary asteroid 65803 Didymos (1996 GT) with its moonlet Dimorphos · potentially hazardous · Apollo class',
    aliases: ['didymos', '65803', '1996 gt', 'dimorphos', 'dart', 'hera', 'binary asteroid', 'near earth asteroid', 'asteroid', 'neo'],
    el: { a: 1.642709608529702, e: 0.3831233242624545, i: 3.413876519313629, node: 72.9858236207145, peri: 319.5807001349104,
      M: 260.8612886320632, n: 0.4681261239466357, epoch: 2461200.5 },
    shape: { kind: 'top', axes: [1, 0.955, 0.98], ridge: 0.45, lump: 0.05, craters: 10, boulders: 70, base: [0.5, 0.47, 0.42], seed: 41 },
    size: 0.075, spinH: 2.2593, pole: { lon: 320, lat: -78 },           // ecliptic pole of Dimorphos's orbit (retrograde)
    // the moonlet: 151 m (177 × 174 × 116 m before DART), 1.19 km from Didymos's centre, tidally locked
    moonlet: { name: 'Dimorphos', size: 0.022, dist: 3.05, shape: { kind: 'potato', axes: [1, 0.98, 0.66], lump: 0.08, craters: 6,
      boulders: 40, base: [0.5, 0.47, 0.42], seed: 43 } },
    rows: [
      ['Size', 'Didymos ~780 m across; its moonlet Dimorphos ~150 m, orbiting 1.2 km away every 11 h 23 min'],
      ['Discovered', '11 Apr 1996 by Joe Montani of the Spacewatch survey, Kitt Peak, Arizona (Dimorphos found in 2003)'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'On 26 Sep 2022 NASA\'s DART spacecraft, about the size of a vending machine, crashed into Dimorphos at 22,500 km/h: the ' +
          'first time humans moved a world on purpose. Its 11 h 55 min orbit around Didymos got about 33 minutes shorter, ' +
          'and the blast threw out a tail of debris thousands of km long. Didymos is Greek for "twin". ESA\'s Hera ' +
          'spacecraft (launched Oct 2024) is due to arrive in November 2026 to study DART\'s crater and the ' +
          'reshaped moonlet up close.',
  },
  {
    name: '16 Psyche', short: 'Psyche', kind: 'asteroid', color: '#c9c3b8', sub: 'Metal-rich asteroid · NASA Psyche',
    type: 'Main-belt asteroid 16 Psyche · M-type (metal-rich) · outer main belt',
    aliases: ['psyche', '16', 'metal asteroid', 'asteroid', 'main belt'],
    el: { a: 2.925720466462538, e: 0.1349324738201893, i: 3.098749116151128, node: 149.9753859305033, peri: 230.0326782748359,
      M: 79.76939505329617, n: 0.1969494758105845, epoch: 2461200.5 },
    shape: { kind: 'potato', axes: [1, 0.86, 0.62], lump: 0.1, craters: 26, boulders: 0, base: [0.6, 0.58, 0.55], metal: 0.45, seed: 16 },
    size: 0.13, spinH: 4.196,
    rows: [
      ['Size', '~222 km across (278 × 238 × 171 km), the biggest metal-rich asteroid'],
      ['Discovered', '17 Mar 1852 by Annibale de Gasparis in Naples (the 16th asteroid ever found)'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'Psyche is so dense (about 4 g/cm³) and radar-bright that it must be full of iron and nickel, perhaps part of ' +
          'the metal core of a baby planet whose rocky outside was smashed away billions of years ago. NASA\'s Psyche ' +
          'spacecraft launched in Oct 2023, swung past Mars on 15 May 2026, and arrives in August 2029 to orbit it for ' +
          'about two years, pushed by glowing blue xenon ion thrusters.',
  },
  {
    name: '433 Eros', short: 'Eros', kind: 'neo', color: '#e0b98f', sub: 'Near-Earth asteroid · NEAR Shoemaker',
    type: 'Near-Earth asteroid 433 Eros · Amor class (crosses Mars\'s orbit, never Earth\'s) · S-type (stony)',
    aliases: ['eros', '433', 'near shoemaker', 'near', 'near earth asteroid', 'asteroid', 'neo'],
    el: { a: 1.458243716760167, e: 0.2228779627700761, i: 10.82854410314273, node: 304.2679713350896, peri: 178.9181319135911,
      M: 62.51145501986792, n: 0.5597046347038453, epoch: 2461200.5 },
    // a long, bent "peanut" with a saddle-shaped hollow (Himeros) on its inner side
    shape: { kind: 'peanut', axes: [1, 0.36, 0.34], waist: 0.16, bend: 0.22, lump: 0.08, craters: 30, boulders: 20, base: [0.62, 0.52, 0.4], seed: 433 },
    size: 0.12, spinH: 5.27, pole: { ra: 11.37, dec: 17.22 },
    rows: [
      ['Size', '34 × 11 × 11 km, a long, bent peanut'],
      ['Discovered', '13 Aug 1898 by Gustav Witt in Berlin: the first near-Earth asteroid ever found'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'NASA\'s NEAR Shoemaker went into orbit around Eros on Valentine\'s Day 2000 (Eros is the Greek god of love). ' +
          'A year later, on 12 Feb 2001, it gently landed, although it had never been built to land: the first spacecraft ' +
          'to touch down on an asteroid, and it kept sending data from the surface for two more weeks. Eros\'s close pass ' +
          'in 1931 was used to measure the size of the Solar System (the astronomical unit).',
  },
  {
    name: '2024 YR4', short: '2024 YR4', kind: 'neo', color: '#ffd27a', sub: 'Near-Earth asteroid · 2032 Moon pass',
    type: 'Near-Earth asteroid 2024 YR4 · Apollo class · not yet numbered',
    aliases: ['yr4', '2024 yr4', 'near earth asteroid', 'asteroid', 'neo'],
    el: { a: 2.515989042462611, e: 0.6613330031901985, i: 3.408056116054586, node: 271.3669515560151, peri: 134.3664504369954,
      M: 139.2118467324958, n: 0.2469681541772326, epoch: 2461200.5 },
    shape: { kind: 'potato', axes: [1, 0.8, 0.55], lump: 0.12, craters: 6, boulders: 30, base: [0.55, 0.5, 0.45], seed: 2024 },
    size: 0.05, spinH: 0.325,
    rows: [
      ['Size', '~60 m across (measured by JWST), about as big as a 15-storey building'],
      ['Discovered', '27 Dec 2024 by the ATLAS survey telescope at Río Hurtado, Chile'],
      ['Distance from Sun', 'live'],
      ['Distance from Earth', 'live'],
    ],
    fact: 'In February 2025 it briefly had a 3.1% chance of hitting Earth on 22 Dec 2032, the highest ever for an asteroid ' +
          'this big, which made it famous. More tracking ruled that out within days, but left a 4% chance of hitting the ' +
          'Moon. Then JWST spotted the faint speck again in February 2026, and on 5 Mar 2026 NASA and ESA ruled out the Moon ' +
          'too: on 22 Dec 2032 it will pass about 21,000 km above the lunar surface. It spins once every ~20 minutes.',
  },
];
