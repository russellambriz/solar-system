// meteors/data.js: the major annual meteor showers and their parent bodies.
//
// Shower values are from the IMO Meteor Shower Calendar 2026 (Jürgen Rendtel, International Meteor Organization, IMO INFO(3-25)),
// Table 5 "Working List of Visual Meteor Showers": activity dates, peak solar longitude λ☉ (J2000), radiant α/δ at the peak,
// entry speed V∞ and peak ZHR. The IAU Meteor Data Center codes (e.g. 007 PER) are the ones that table uses.
// Parent bodies are the IAU MDC / IMO associations. Parent orbits: JPL Small-Body Database API (ssd-api.jpl.nasa.gov/sbdb.api),
// fetched 2026-10-23, osculating elements at JPL's epoch for each object (q AU, e, i / node / peri in degrees, J2000 ecliptic).
// They are only used to draw where each debris stream runs; the showers' dates come from λ☉, not from these orbits.
//
// `hw` (days) is the rough half-width of the peak used to scale the drawn meteor rate between the activity dates. The IMO gives the
// peak ZHR, not a profile, so this is an illustrative shape: sharp for the Quadrantids and Draconids, broad for the Taurids.
const D2R = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12), DAY_MS = 86400000;
export const daysOf = (y, m, d, h = 0) => (Date.UTC(y, m - 1, d, h) - J2000) / DAY_MS;

// solar longitude in the J2000 frame the IMO uses (degrees, good to ~0.01°): Astronomical Almanac low-precision formula
// (equinox of date) minus general precession since 2000 (1.397° per century)
export function sunLongitude(days) {
  const L = 280.460 + 0.9856474 * days, g = (357.528 + 0.9856003 * days) * D2R;
  return (((L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g) - 1.397 * days / 36525) % 360) + 360) % 360;
}
// the moment (days since J2000) the Sun reaches longitude `lon`, nearest to `near`
export function daysAtLongitude(lon, near) {
  let d = near;
  for (let k = 0; k < 6; k++) { const diff = ((lon - sunLongitude(d) + 540) % 360) - 180; d += diff / 0.9856; }
  return d;
}

// [name, code, short label, IMO activity start (m, d), end (m, d), peak λ☉, radiant RA°, Dec°, V∞ km/s, ZHR, hw days,
//  radiant constellation (IAU abbr), parent key, colour]
const RAW = [
  ['Quadrantids', '010 QUA', [12, 28], [1, 12], 283.15, 230, 49, 41, 80, 0.4, 'Boo', 'eh1', '#a8c8ff'],
  ['Lyrids', '006 LYR', [4, 14], [4, 30], 32.32, 271, 34, 49, 18, 0.8, 'Lyr', 'thatcher', '#c8f0ff'],
  ['Eta Aquariids', '031 ETA', [4, 19], [5, 28], 45.5, 338, -1, 66, 50, 4, 'Aqr', 'halley', '#9fd8ff'],
  ['Perseids', '007 PER', [7, 17], [8, 24], 140.0, 48, 58, 59, 100, 2, 'Per', 'swift', '#ffe9a0'],
  ['Draconids', '009 DRA', [10, 6], [10, 10], 195.4, 262, 54, 20, 5, 0.4, 'Dra', 'gz', '#c8ffb0'],
  ['Orionids', '008 ORI', [10, 2], [11, 7], 208, 95, 16, 66, 20, 4, 'Ori', 'halley', '#8fc8ff'],
  ['Southern Taurids', '002 STA', [9, 20], [11, 20], 223, 52, 15, 27, 7, 12, 'Tau', 'encke', '#ffcf9a'],
  ['Northern Taurids', '017 NTA', [10, 20], [12, 10], 230, 58, 22, 29, 5, 12, 'Tau', 'encke', '#ffb98a'],
  ['Leonids', '013 LEO', [11, 6], [11, 30], 235.27, 152, 22, 71, 15, 1.2, 'Leo', 'tempel', '#d8c8ff'],
  ['Geminids', '004 GEM', [12, 4], [12, 20], 262.2, 112, 33, 35, 150, 1.2, 'Gem', 'phaethon', '#ffd0e0'],
  ['Ursids', '015 URS', [12, 17], [12, 26], 270.7, 217, 76, 33, 10, 0.8, 'UMi', 'tuttle', '#e0ffd8'],
];

// parent orbits (JPL SBDB, see above). `cometName`: the matching comet drawn by comets/ (its card links to the shower)
export const PARENTS = {
  eh1: { name: '(196256) 2003 EH1', kind: 'asteroid (likely a dead comet nucleus)', q: 1.19, e: 0.619, i: 70.9, node: 283, peri: 171 },
  thatcher: { name: 'Comet C/1861 G1 (Thatcher)', kind: 'long-period comet (~415-year orbit)', q: 0.921, e: 0.983, i: 79.8, node: 31.9, peri: 213 },
  halley: { name: "1P/Halley (Halley's Comet)", kind: 'periodic comet (~76 years)', q: 0.575, e: 0.968, i: 162, node: 59.1, peri: 112, cometName: "Halley's Comet" },
  swift: { name: '109P/Swift-Tuttle', kind: 'periodic comet (~133 years)', q: 0.96, e: 0.963, i: 113, node: 139, peri: 153, cometName: '109P/Swift-Tuttle' },
  gz: { name: '21P/Giacobini-Zinner', kind: 'periodic comet (~6.5 years)', q: 1.01, e: 0.71, i: 32, node: 195, peri: 173 },
  encke: { name: '2P/Encke', kind: 'periodic comet (3.3 years)', q: 0.34, e: 0.847, i: 11.3, node: 334, peri: 187, cometName: '2P/Encke' },
  tempel: { name: '55P/Tempel-Tuttle', kind: 'periodic comet (~33 years)', q: 0.976, e: 0.906, i: 162, node: 235, peri: 173, cometName: '55P/Tempel-Tuttle' },
  phaethon: { name: '3200 Phaethon', kind: 'asteroid ("rock comet", 1.4-year orbit)', q: 0.14, e: 0.89, i: 22.3, node: 265, peri: 322 },
  tuttle: { name: '8P/Tuttle', kind: 'periodic comet (~13.6 years)', q: 1.03, e: 0.82, i: 55, node: 270, peri: 208 },
};
for (const p of Object.values(PARENTS)) p.a = p.q / (1 - p.e);

const CONST_NAME = { Boo: 'Boötes', Lyr: 'Lyra', Aqr: 'Aquarius', Per: 'Perseus', Dra: 'Draco', Ori: 'Orion', Tau: 'Taurus', Leo: 'Leo', Gem: 'Gemini', UMi: 'Ursa Minor' };

const FACTS = {
  Quadrantids: 'Named after Quadrans Muralis, a constellation that no longer exists (its stars are now in Boötes). The peak is the sharpest of the big showers, only a few hours long, so many years it is missed. Its parent, 2003 EH1, looks like an asteroid but is probably the dead core of a comet that broke up about 500 years ago.',
  Lyrids: 'The oldest recorded meteor shower: Chinese astronomers noted stars "falling like rain" in 687 BC. Its comet, Thatcher, last passed the Sun in 1861 and is not due back until about 2276. Now and then it gives a short burst of 90+ meteors an hour (1803, 1922, 1982).',
  'Eta Aquariids': 'Earth meets the dust of Halley\'s Comet twice a year: on the way in (May, the Eta Aquariids) and on the way out (October, the Orionids). The radiant rises only shortly before dawn at Boise\'s latitude, so the rates are far better from the Southern Hemisphere. They hit at 66 km/s and often leave glowing trails.',
  Perseids: 'The most watched shower: warm August nights, a high radiant from northern latitudes and up to ~100 meteors an hour, many bright with long-lasting trains. The grains left Swift-Tuttle centuries ago; the comet (26 km across, one of the largest that crosses Earth\'s orbit) last came by in 1992 and returns in 2126.',
  Draconids: 'Slow meteors (20 km/s) from comet Giacobini-Zinner. Most years only a few an hour, but when Earth runs into a fresh trail they storm: thousands an hour in 1933 and 1946, and a radar outburst in 2011. Unusually, they are best in the evening, as the radiant in Draco is highest after dusk.',
  Orionids: 'The second shower from Halley\'s Comet, seen as Earth crosses the outbound side of its dust stream. Grains strike at 66 km/s, among the fastest, and often leave persistent trains. The peak is broad, so a few days either side of 21 October are almost as good. Between 2006 and 2009 rates rose to 50–70 an hour.',
  'Southern Taurids': 'Slow (27 km/s) and few, but famous for bright fireballs, especially in "swarm" years (2005, 2015, 2022, next expected 2032) when Earth passes a dense clump of larger grains. With the Northern Taurids they come from comet Encke\'s very old, spread-out debris complex.',
  'Northern Taurids': 'The northern branch of the Taurid stream, active through most of November alongside the Southern Taurids. Their slow meteors and occasional fireballs come from 2P/Encke\'s debris complex; the near-Earth asteroid 2004 TG10 may also be a fragment of it.',
  Leonids: 'The fastest meteors (71 km/s): Earth meets Tempel-Tuttle\'s orbit almost head on. Usually 10–15 an hour, but in the years around the comet\'s 33-year returns fresh trails can give storms: about 100,000 an hour over North America on 13 November 1833, and dozens per second over the western US on 17 November 1966.',
  Geminids: 'Now the richest shower of the year (ZHR ~150) and one of the few that are good before midnight, since the radiant in Gemini is up by mid-evening. Its parent, 3200 Phaethon, is a 5 km asteroid that swings closer to the Sun (0.14 AU) than Mercury; heating there cracks it and sheds the dust. The slow, bright meteors are dense, rocky grains.',
  Ursids: 'A modest pre-Christmas shower from comet 8P/Tuttle, with its radiant near the Little Dipper\'s bowl, so it never sets from Boise. Usually about 10 an hour, with occasional outbursts (1945, 1986, 2000) near the comet\'s returns.',
};

export const SHOWERS = RAW.map(([name, code, from, to, lon, ra, dec, v, zhr, hw, con, parent, color]) => ({
  name, code, from, to, lon, ra, dec, v, zhr, hw, con, conName: CONST_NAME[con], parentKey: parent, parent: PARENTS[parent], color,
  key: name.toLowerCase().replace(/[^a-z]+/g, '-'),
  fromLon: sunLongitude(daysOf(from[0] === 12 && to[0] === 1 ? 2025 : 2026, from[0], from[1])),   // IMO 2026 activity dates → λ☉
  toLon: sunLongitude(daysOf(2026, to[0], to[1], 24)),
  fact: FACTS[name],
  aliases: [name.toLowerCase(), name.toLowerCase().replace(/s$/, ''), code.slice(4).toLowerCase(), 'meteor', 'meteors', 'meteor shower', 'shooting stars',
    ...(name.includes('Taurid') ? ['taurids', 'taurid'] : []), ...(name === 'Eta Aquariids' ? ['eta aquarids', 'aquariids', 'η aquariids'] : [])],
}));

// peaks for the Events timeline: the next twelve months of peaks from 23 Oct 2026 (dates from λ☉, UTC)
const fmtDate = (d) => new Date(J2000 + d * DAY_MS).toISOString().slice(0, 10);
export const METEOR_EVENTS = SHOWERS.map((s) => {
  let d = daysAtLongitude(s.lon, daysOf(2026, 10, 23));
  if (d < daysOf(2026, 10, 23)) d += 365.2422;
  d = daysAtLongitude(s.lon, d);
  return [fmtDate(d), `${s.name} peak (ZHR ~${s.zhr}, from ${s.parent.name.replace(/ \(.*\)$/, '')})`, s.name, 'meteor'];
});
