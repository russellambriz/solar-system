// lagrange/data.js: Lagrange points and the Jupiter Trojans, drawn by lagrange/index.js.
//
// Named objects: heliocentric osculating elements, J2000 ecliptic and equinox (the frame of asteroids/data.js and
// smallbodies.js). a [AU], e, i / node (Ω) / peri (ω) / M (mean anomaly at the epoch) in degrees, n [deg/day], epoch = JD (TDB).
// Pure two-body motion (no planetary pulls), so positions drift slowly for dates far from the epoch.
// Source: JPL Small-Body Database API (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=<number>&full-prec=1&phys-par=1&discovery=1),
// fetched 2026-10-28. Sizes, rotation periods and discovery circumstances are SBDB's unless the text says otherwise.
// Check against JPL Horizons (VECTORS, Sun centre, ecliptic J2000) for 2026-10-28 00:00 TDB: see the 2026-10-28 CHANGELOG entry.
export const EL = {
  '624': { a: 5.276986092673823, e: 0.02434489234275647, i: 18.14715224028094, node: 342.8018513679027, peri: 181.288859678094, M: 24.91385327109803, n: 0.08130647811170628, epoch: 2461200.5 },   // sol 139 (2026-06-05), 8427 obs 1907-02-11 → 2026-04-13
  '588': { a: 5.215906988352895, e: 0.148117524873686, i: 10.31507282705955, node: 316.5298906019931, peri: 134.3146427558605, M: 93.31385566999712, n: 0.08273881878234011, epoch: 2461200.5 },   // sol 117 (2026-06-05), 5742 obs 1906-02-22 → 2026-04-14
  '617': { a: 5.205975173988769, e: 0.1391467916238868, i: 22.06359071054631, node: 44.34968792774898, peri: 308.8377281363527, M: 58.67543160284279, n: 0.08297570189160172, epoch: 2461200.5 },   // sol 87 (2026-09-09), 7108 obs 1906-10-29 → 2026-03-19
  '3548': { a: 5.217371617810976, e: 0.09059867172297777, i: 8.05147293527498, node: 43.5587275998936, peri: 28.69968222483612, M: 125.7480299363769, n: 0.08270398135406888, epoch: 2461200.5 },   // sol 61 (2024-09-11), 4457 obs 1973-09-19 → 2024-06-15
  '15094': { a: 5.191514133435046, e: 0.09592245810512318, i: 12.97735158439746, node: 50.33105662992578, peri: 5.86529887136951, M: 143.4220008064438, n: 0.08332263830560761, epoch: 2461200.5 },   // sol 21 (2024-09-12), 2532 obs 1991-05-04 → 2024-04-27
  '11351': { a: 5.312382832170665, e: 0.06495789797701287, i: 11.54341670108032, node: 251.0799335752079, peri: 162.4048390063255, M: 139.1721755085774, n: 0.08049520802874313, epoch: 2461200.5 },   // sol 28 (2025-04-11), 3972 obs 1996-11-09 → 2025-03-02
  '21900': { a: 5.123374239403683, e: 0.03672540559818106, i: 8.468580378470353, node: 258.5504431073313, peri: 182.7884930129634, M: 96.92267457127365, n: 0.08499041570407942, epoch: 2461200.5 },   // sol 40 (2025-04-11), 5622 obs 1998-11-10 → 2025-03-05
  '52246': { a: 2.383835831129859, e: 0.1868593763038477, i: 4.425205239728406, node: 262.7765342454273, peri: 212.8821499078564, M: 147.8525890028124, n: 0.267787042557632, epoch: 2461200.5 },   // sol 22 (2024-09-11), 1589 obs 2001-08-11 → 2024-09-01
  '153': { a: 3.968376768101129, e: 0.1384847714022829, i: 7.831389294038131, node: 228.0800257005049, peri: 39.0661557941409, M: 138.7461320041192, n: 0.1246765356472539, epoch: 2461200.5 },   // sol 87 (2026-06-05), 12422 obs 1880-05-15 → 2026-02-28
};

// camp: 'L4' (leading swarm, the "Greek camp"), 'L5' (trailing, the "Trojan camp"), 'belt' (main belt), 'hilda'
// lucy: Lucy's flyby (spacecraft/missions.js has the exact dates)
export const NAMED = [
  { key: 'hektor', num: '624', name: '624 Hektor', short: 'Hektor', camp: 'L4', color: '#ffc98a',
    aliases: ['hektor', 'hector', '624', 'largest trojan', 'biggest trojan'],
    rows: [['Size', '~225 km across (effective); stretched and probably two-lobed, about twice as long as it is wide'],
      ['Discovered', '10 Feb 1907 by August Kopff at Heidelberg'], ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    fact: 'The biggest Jupiter Trojan. It spins every 6.9 hours and has a small moon about 12 km across, found with the Keck telescope in 2006. ' +
      'It is named after the Trojan prince, yet it lives in the leading "Greek" swarm at L4: the naming rule (Greeks at L4, Trojans at L5) ' +
      'was settled only after Hektor and Patroclus had been named, so each camp has one "spy".' },
  { key: 'achilles', num: '588', name: '588 Achilles', short: 'Achilles', camp: 'L4', color: '#ffd9a0',
    aliases: ['achilles', '588', 'first trojan'],
    rows: [['Size', '~130 km across'], ['Discovered', '22 Feb 1906 by Max Wolf at Heidelberg: the first Trojan ever found'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    fact: 'Max Wolf spotted it in 1906, and it proved the 1772 prediction by Joseph-Louis Lagrange that a small body could share a planet\'s ' +
      'orbit 60° ahead or behind it. Its name started the tradition of naming Jupiter\'s Trojans after heroes of the Trojan War.' },
  { key: 'patroclus', num: '617', name: '617 Patroclus–Menoetius', short: 'Patroclus–Menoetius', camp: 'L5', color: '#b9d4ff', lucyKey: 'patroclus',
    aliases: ['patroclus', 'menoetius', '617', 'patroclus menoetius', 'binary trojan', 'lucy target'],
    rows: [['Size', 'Two bodies of ~113 and ~104 km orbiting each other ~680 km apart, every 4.3 days'],
      ['Discovered', '17 Oct 1906 by August Kopff at Heidelberg (found to be double in 2001)'], ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    lucy: 'Mar 2033 (the last flyby of the mission)',
    fact: 'A near-equal double asteroid in the trailing swarm, and Lucy\'s final target. Like Hektor it is a "spy": Patroclus was a Greek ' +
      'hero, but this pair lives in the Trojan camp at L5. Pairs like this are fragile, so it has probably never been hit hard since it formed, ' +
      'which makes it a good fossil of the early solar system.' },
  { key: 'eurybates', num: '3548', name: '3548 Eurybates', short: 'Eurybates', camp: 'L4', color: '#ffe0b0', lucyKey: 'eurybates',
    aliases: ['eurybates', '3548', 'queta', 'lucy target'],
    rows: [['Size', '~64 km across, with a tiny moon, Queta (~1 km)'], ['Discovered', '19 Sep 1973 by Cornelis van Houten at Palomar'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    lucy: 'Aug 2027 (Lucy\'s first Trojan)',
    fact: 'The largest piece of a collisional family: a cloud of fragments from an ancient smash-up among the Trojans. ' +
      'The Hubble Space Telescope found its little moon Queta in 2018 while preparing for Lucy. It spins every 8.7 hours.' },
  { key: 'polymele', num: '15094', name: '15094 Polymele', short: 'Polymele', camp: 'L4', color: '#ffe8c4', lucyKey: 'polymele',
    aliases: ['polymele', '15094', 'shaun', 'lucy target'],
    rows: [['Size', '~21 km across, the smallest of Lucy\'s Trojans'], ['Discovered', '17 Nov 1999 by the Catalina Sky Survey (Arizona)'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    lucy: 'Sep 2027',
    fact: 'In March 2022, astronomers watching it pass in front of a star found a small moon (nicknamed "Shaun", ~5 km) about 200 km away. ' +
      'In the myths, Polymele was the mother of Patroclus. It spins every 5.9 hours.' },
  { key: 'leucus', num: '11351', name: '11351 Leucus', short: 'Leucus', camp: 'L4', color: '#e8d2b0', lucyKey: 'leucus',
    aliases: ['leucus', '11351', 'lucy target'],
    rows: [['Size', '~34 km across'], ['Discovered', '12 Oct 1997 by the Beijing Schmidt CCD Asteroid Program at Xinglong'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    lucy: 'Apr 2028',
    fact: 'One of the slowest spinners known: one turn takes about 446 hours (18.6 days). It is named after a companion of Odysseus in Homer\'s Iliad.' },
  { key: 'orus', num: '21900', name: '21900 Orus', short: 'Orus', camp: 'L4', color: '#ffd4b0', lucyKey: 'orus',
    aliases: ['orus', '21900', 'lucy target'],
    rows: [['Size', '~51 km across'], ['Discovered', '9 Nov 1999 by Takao Kobayashi at Oizumi, Japan'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    lucy: 'Nov 2028 (the last of the leading swarm)',
    fact: 'A dark, reddish Trojan that spins every 13.5 hours. In the Iliad, Orus was a Greek warrior killed by Hektor.' },
  { key: 'donaldjohanson', num: '52246', name: '52246 Donaldjohanson', short: 'Donaldjohanson', camp: 'belt', color: '#d8d8e8', lucyKey: 'donaldjohanson',
    aliases: ['donaldjohanson', 'donald johanson', '52246', 'lucy target'],
    rows: [['Size', '~8 km long: two lobes joined by a narrow neck (seen by Lucy)'], ['Discovered', '2 Mar 1981 by Schelte Bus at Siding Spring, Australia'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    lucy: '20 Apr 2025 (flown past, a practice run)',
    fact: 'Not a Trojan: a main-belt asteroid that Lucy flew past on the way out, as a rehearsal. It is named after Donald Johanson, ' +
      'who in 1974 found the 3.2-million-year-old "Lucy" fossil that the spacecraft is named after.' },
  { key: 'hilda', num: '153', name: '153 Hilda', short: 'Hilda', camp: 'hilda', color: '#c8d8a8',
    aliases: ['hilda', '153', 'hildas', 'hilda group', '3:2 resonance'],
    rows: [['Size', '~171 km across'], ['Discovered', '2 Nov 1875 by Johann Palisa at Pola (now Pula, Croatia)'],
      ['Distance from Sun', 'live:sun'], ['Where', 'live:camp']],
    fact: 'The namesake of the Hilda group: asteroids that go around the Sun exactly 3 times for every 2 Jupiter orbits. They always meet ' +
      'Jupiter near their closest point to the Sun, so it can never pull them off course.' },
];

// Lagrange-point cards. `sys`: 'E' (Sun–Earth) or 'J' (Sun–Jupiter); value 'live:where' = filled with the point's position on the shown date.
const L_FACT = 'The five Lagrange points are where the pulls of the Sun and a planet, plus the push you feel going round with them, cancel out, ' +
  'so a small object can keep pace with the planet.';
export const CARDS = {
  lagrange: { name: 'Lagrange points', color: '#9fe0ff', type: 'Balance points of the Sun and a planet', view: 'J',
    rows: () => [['What', 'Five spots, L1–L5, that go round the Sun with a planet'], ['L1, L2, L3', 'On the Sun–planet line. Unstable: things drift away without small engine burns'],
      ['L4, L5', '60° ahead of and behind the planet. Stable: things can stay for billions of years'], ['Found by', 'Leonhard Euler (L1–L3, 1767) and Joseph-Louis Lagrange (L4, L5, 1772)']],
    fact: L_FACT + ' L4 and L5 are stable because the Sun is far heavier than any planet (it only needs to be ~25× heavier; it is 1,047× Jupiter): ' +
      'an object nudged away doesn\'t fall out, it just loops slowly around the point. That is why Jupiter has two huge swarms of "Trojan" ' +
      'asteroids there. Shown here for Sun–Earth (blue) and Sun–Jupiter (gold).' },
  'E-L1': { name: 'Sun–Earth L1', sys: 'E', k: 1, color: '#8fd3ff', type: 'Lagrange point · 1.5 million km sunward of Earth',
    rows: () => [['Distance', '~1.5 million km from Earth toward the Sun (4× the Moon\'s distance; drawn much closer)'], ['Stable?', 'No: spacecraft make small burns every few weeks'],
      ['Who\'s there', 'SOHO (since 1996), ACE, Wind, DSCOVR, Aditya-L1, IMAP and SWFO-L1'], ['Where now', 'live:where']],
    fact: 'An unblocked view of the Sun, all the time, and up to an hour\'s warning of solar storms heading for Earth. SOHO has watched the Sun ' +
      'from here since 1996 and has found more than 5,000 comets along the way. DSCOVR\'s camera here takes pictures of the whole sunlit Earth.' },
  'E-L2': { name: 'Sun–Earth L2', sys: 'E', k: 2, color: '#8fd3ff', type: 'Lagrange point · 1.5 million km beyond Earth', craft: 'JWST',
    rows: () => [['Distance', '~1.5 million km from Earth, directly away from the Sun (drawn much closer)'], ['Stable?', 'No: JWST makes a small burn about every 3 weeks'],
      ['Who\'s there', 'JWST (since 2022), Euclid; before: Gaia, Planck, Herschel, WMAP'], ['Where now', 'live:where']],
    fact: 'Sun, Earth and Moon all sit on the same side, so one sunshield can block all three: perfect for cold infrared telescopes like JWST. ' +
      'Spacecraft don\'t sit at L2 itself; they loop around it on big "halo" orbits, so they never pass into Earth\'s shadow.' },
  'E-L3': { name: 'Sun–Earth L3', sys: 'E', k: 3, color: '#8fd3ff', type: 'Lagrange point · on the far side of the Sun',
    rows: () => [['Distance', 'About 1 AU from the Sun, opposite Earth (~300 million km from us)'], ['Stable?', 'No'],
      ['Who\'s there', 'Nobody: it is always hidden behind the Sun'], ['Where now', 'live:where']],
    fact: 'The home of science fiction\'s "Counter-Earth". There is nothing there: other planets\' pulls would spoil the balance, and spacecraft ' +
      'have peeked at that region since the 1990s. A probe there could not talk to Earth directly, because the Sun is in the way.' },
  'E-L4': { name: 'Sun–Earth L4', sys: 'E', k: 4, color: '#8fd3ff', type: 'Lagrange point · 60° ahead of Earth',
    rows: () => [['Distance', '1 AU from the Sun and 1 AU from Earth (an equilateral triangle)'], ['Stable?', 'Yes'],
      ['Who\'s there', 'Two small Earth Trojans: 2010 TK7 and 2020 XL5 (both loop around L4)'], ['Where now', 'live:where']],
    fact: 'Earth has its own Trojans, though tiny ones: 2010 TK7 (~300 m, found by NASA\'s WISE telescope) and 2020 XL5 (~1 km). One idea for the ' +
      'origin of the Moon has a Mars-sized planet, "Theia", growing at L4 or L5 before it drifted off and hit the young Earth.' },
  'E-L5': { name: 'Sun–Earth L5', sys: 'E', k: 5, color: '#8fd3ff', type: 'Lagrange point · 60° behind Earth',
    rows: () => [['Distance', '1 AU from the Sun and 1 AU from Earth'], ['Stable?', 'Yes'],
      ['Who\'s there', 'No known asteroids yet; ESA\'s Vigil space-weather mission is planned to go there'], ['Where now', 'live:where']],
    fact: 'From L5 you can see the side of the Sun that is about to turn toward Earth, days before its sunspots and storms face us. That is why ' +
      'ESA plans to park its Vigil space-weather probe here in the 2030s.' },
  'J-L1': { name: 'Sun–Jupiter L1', sys: 'J', k: 1, color: '#ffcf8a', type: 'Lagrange point · ~53 million km sunward of Jupiter',
    rows: () => [['Distance', '~0.35 AU (53 million km) from Jupiter toward the Sun (drawn closer)'], ['Stable?', 'No'],
      ['Who\'s there', 'Nobody'], ['Where now', 'live:where']],
    fact: L_FACT + ' Jupiter\'s L1 and L2 are about 35 times farther from it than Earth\'s are from Earth, because Jupiter is 318 times ' +
      'heavier and 5 times farther from the Sun. They mark the edge of Jupiter\'s "Hill sphere": inside it, Jupiter\'s gravity wins over the Sun\'s.' },
  'J-L2': { name: 'Sun–Jupiter L2', sys: 'J', k: 2, color: '#ffcf8a', type: 'Lagrange point · ~53 million km beyond Jupiter',
    rows: () => [['Distance', '~0.35 AU (53 million km) from Jupiter, away from the Sun (drawn closer)'], ['Stable?', 'No'],
      ['Who\'s there', 'Nobody'], ['Where now', 'live:where']],
    fact: 'Comets can slip into a temporary orbit around Jupiter through the "gates" near L1 and L2. Comet Shoemaker–Levy 9 was probably ' +
      'caught this way decades before Jupiter tore it apart; its pieces crashed into Jupiter in July 1994.' },
  'J-L3': { name: 'Sun–Jupiter L3', sys: 'J', k: 3, color: '#ffcf8a', type: 'Lagrange point · opposite Jupiter',
    rows: () => [['Distance', '~5.2 AU from the Sun, on the far side from Jupiter'], ['Stable?', 'No'],
      ['Who\'s there', 'Nobody, but the Hilda asteroids\' triangle has a corner here'], ['Where now', 'live:where']],
    fact: 'The Hilda asteroids (3 orbits for every 2 of Jupiter\'s) trace a slowly turning triangle whose corners point at L3, L4 and L5. ' +
      'Turn on Layers → Lagrange & Trojans and look for the faint triangle inside Jupiter\'s orbit.' },
  'J-L4': { name: 'Sun–Jupiter L4 · the Greeks', sys: 'J', k: 4, color: '#ffcf8a', type: 'Lagrange point · 60° ahead of Jupiter',
    rows: () => [['Distance', '5.2 AU from the Sun and 5.2 AU from Jupiter'], ['Stable?', 'Yes, for billions of years'],
      ['Who\'s there', 'The leading Trojan swarm (the "Greek camp"): roughly two-thirds of the known Jupiter Trojans'], ['Where now', 'live:where']],
    fact: 'The leading swarm is named after Greek heroes (Achilles, Odysseus, Ajax…), with one "spy", Hektor. It has noticeably more members ' +
      'than L5 (nobody is sure why). Lucy visits Eurybates, Polymele, Leucus and Orus here in 2027–28.' },
  'J-L5': { name: 'Sun–Jupiter L5 · the Trojans', sys: 'J', k: 5, color: '#ffcf8a', type: 'Lagrange point · 60° behind Jupiter',
    rows: () => [['Distance', '5.2 AU from the Sun and 5.2 AU from Jupiter'], ['Stable?', 'Yes, for billions of years'],
      ['Who\'s there', 'The trailing Trojan swarm (the "Trojan camp")'], ['Where now', 'live:where']],
    fact: 'The trailing swarm is named after the defenders of Troy (Aeneas, Priam, Paris…), with one Greek "spy", Patroclus, whose double ' +
      'asteroid Patroclus–Menoetius will be Lucy\'s last stop in 2033.' },
  trojans: { name: 'Jupiter\'s Trojan asteroids', color: '#ffb98a', type: 'Two swarms sharing Jupiter\'s orbit', view: 'J',
    rows: () => [['How many', 'More than 15,000 known; maybe a million bigger than 1 km (about as many as the main belt)'], ['Where', 'Around L4 (leading, "Greeks") and L5 (trailing, "Trojans")'],
      ['Orbits', 'Same 11.9-year period as Jupiter; tilted up to ~35°, so the swarms are thick'], ['Visited by', 'NASA\'s Lucy (2027–2033), the first mission to the Trojans']],
    fact: 'They are dark and reddish, more like comets and Kuiper belt objects than main-belt asteroids, and may have formed far out beyond ' +
      'Neptune before being captured when the giant planets shifted around 4 billion years ago. Each Trojan slowly loops around its point on a ' +
      '"tadpole" path every ~150 years, so the swarms stretch along the orbit. Drawn here as a few thousand dots on a simple libration model; the ' +
      'named ones are on their real JPL orbits.' },
  hildas: { name: 'Hilda asteroids', color: '#c8d8a8', type: '3:2 resonance with Jupiter · ~4 AU', view: 'J',
    rows: () => [['How many', 'Several thousand known'], ['Orbit', '~4 AU from the Sun: 3 trips around the Sun for every 2 of Jupiter\'s'],
      ['Shape', 'Together they form a triangle with corners at Jupiter\'s L3, L4 and L5'], ['Named after', '153 Hilda, found in 1875']],
    fact: 'Each Hilda is on an ordinary ellipse, but seen from Jupiter (which turns with them) their paths make a three-cornered loop. They are always ' +
      'at their closest to the Sun when they pass Jupiter, so they stay well clear of it.' },
};
