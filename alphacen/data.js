// alphacen/data.js — published numbers for the Alpha Centauri triple system.
// Sources (fetched 2026-10-30):
//   • A–B visual/spectroscopic orbit: Akeson et al. 2021, AJ 162, 14 (their Table 8 "Present work"),
//     which revises Pourbaix & Boffin 2016, A&A 586, A106 (HARPS + ESO). Physical a = a(")/ϖ(").
//   • Stellar radii / spectral types: Kervella et al. 2017 (A&A 598, L7) / Akeson 2021 radii.
//   • Proxima planets: Anglada-Escudé et al. 2016 Nature 536, 437 (b); Faria et al. 2022 A&A 658, A115 (d).
//   • Proxima orbit about AB: Kervella et al. 2017 A&A 598, L7 (~12,950 AU, P ~ 550 kyr).
//   • Coordinates: SIMBAD / Hipparcos–Gaia (J2000).

export const DIST_LY_AB = 4.37;            // AB barycentre ≈ 1.34 pc
export const DIST_LY_PROXIMA = 4.2465;     // Proxima ≈ 1.302 pc (closer than AB)

// J2000 RA/Dec of AB (Rigil Kentaurus / Toliman midpoint ≈ α Cen A) and Proxima
export const AB_RA_H = 14 + 39 / 60 + 36.5 / 3600;   // 14h39m36.5s
export const AB_DEC_DEG = -(60 + 50 / 60 + 2 / 3600); // −60°50′02″
export const PROX_RA_H = 14 + 29 / 60 + 42.95 / 3600;
export const PROX_DEC_DEG = -(62 + 40 / 60 + 46 / 3600);

// A–B relative orbit (B around A), Akeson et al. 2021 Table 8. a_AU = 17.4930 / 0.75081 ≈ 23.30 AU.
// Pourbaix & Boffin 2016 for comparison: P=79.91 yr, a"=17.66, ϖ=743 mas → a≈23.77 AU, e=0.524,
// i=79.32°, ω=232.3°, Ω=204.75°, T0=1955.66.
export const AB_ORBIT = {
  source: 'Akeson et al. 2021, AJ 162, 14 (Table 8); cf. Pourbaix & Boffin 2016, A&A 586, A106',
  P_yr: 79.762,
  a_AU: 23.30,             // 17.4930″ / 0.75081″
  e: 0.51947,
  i_deg: 79.243,
  w_deg: 231.519,          // ω of B
  Om_deg: 205.073,         // Ω
  T0_yr: 1955.564,         // epoch of periastron (Julian year)
  mA: 1.0788,              // M☉
  mB: 0.9092,              // M☉
};

// Mass fraction of B: distance of A from barycentre = κ · r_rel, of B = (1−κ) · r_rel opposite.
export const KAPPA_B = AB_ORBIT.mB / (AB_ORBIT.mA + AB_ORBIT.mB); // ≈ 0.4573

export const STARS = {
  A: {
    id: 'A', name: 'Alpha Centauri A', aliases: ['Rigil Kentaurus', 'Rigil Kent', 'α Cen A', 'Alpha Cen A', 'Hip 71683'],
    type: 'G2V star · primary of the nearest Sun-like binary', color: '#ffe9a8',
    spectral: 'G2V', radiusSolar: 1.2175, massSolar: AB_ORBIT.mA,
    teff: 5795, luminositySolar: 1.506,
  },
  B: {
    id: 'B', name: 'Alpha Centauri B', aliases: ['Toliman', 'α Cen B', 'Alpha Cen B', 'Hip 71681'],
    type: 'K1V star · orange companion of Alpha Centauri A', color: '#ffb070',
    spectral: 'K1V', radiusSolar: 0.8591, massSolar: AB_ORBIT.mB,
    teff: 5260, luminositySolar: 0.498,
  },
  proxima: {
    id: 'proxima', name: 'Proxima Centauri', aliases: ['Proxima', 'α Cen C', 'V645 Centauri', 'Hip 70890'],
    type: 'M5.5V red dwarf · nearest star to the Sun', color: '#ff6a4a',
    spectral: 'M5.5V', radiusSolar: 0.1542, massSolar: 0.1221,
    teff: 2992, luminositySolar: 0.00151,
  },
};

// Proxima planets (confirmed). Proxima c is disputed / unconfirmed — omitted.
export const PLANETS = {
  proximaB: {
    id: 'proximaB', name: 'Proxima Centauri b', aliases: ['Proxima b', 'α Cen Cb'],
    type: 'Terrestrial exoplanet · in the habitable zone of Proxima', color: '#7ec8ff',
    a_AU: 0.04856, P_days: 11.1868, e: 0.11, mEarth: 1.07,
    discovery: 'Anglada-Escudé et al. 2016, Nature 536, 437',
  },
  proximaD: {
    id: 'proximaD', name: 'Proxima Centauri d', aliases: ['Proxima d', 'α Cen Cd'],
    type: 'Sub-Earth exoplanet · innermost known planet of Proxima', color: '#a8d4ff',
    a_AU: 0.02885, P_days: 5.122, e: 0.04, mEarth: 0.26,
    discovery: 'Faria et al. 2022, A&A 658, A115',
  },
};

export const SYSTEM = {
  name: 'Alpha Centauri',
  aliases: ['Alpha Centauri', 'α Centauri', 'Rigil Kentaurus', 'Toliman', 'Proxima Centauri', 'nearest star'],
  type: 'Triple star system · nearest to the Sun',
  color: '#ffe2a0',
  distLy: DIST_LY_AB,
};

export const CARDS = {
  system: {
    name: 'Alpha Centauri', color: '#ffe2a0',
    type: 'Triple star system · nearest stars to the Sun (A, B and Proxima)',
    rows: () => [
      ['Distance', `${DIST_LY_AB} light-years (AB) · Proxima ${DIST_LY_PROXIMA} ly · ~1.34 pc`],
      ['Where in the sky', 'Centaurus · RA 14h39m36s, Dec −60°50′ (far southern sky)'],
      ['Stars', 'A (G2V, yellow-white) · B (K1V, orange) · Proxima (M5.5V, red dwarf with flares)'],
      ['Planets', 'Proxima b (habitable zone) and Proxima d; Proxima c is disputed and not shown'],
    ],
    fact: 'Alpha Centauri is the closest star system to the Sun. A and B form a true binary that takes about 80 years to ' +
          'orbit once, coming as close as ~11 AU (Saturn\'s distance) and swinging out to ~35 AU. Proxima Centauri, a faint ' +
          'red dwarf about 13,000 AU from the pair, is slightly closer to us and hosts the nearest known exoplanets. ' +
          'A is a near twin of the Sun; from a planet around either star the other would shine as a brilliant second sun.',
  },
  A: {
    name: 'Alpha Centauri A (Rigil Kentaurus)', color: '#ffe9a8',
    type: 'G2V yellow-white dwarf · primary',
    rows: () => [
      ['Spectral type', 'G2V (Sun-like)'],
      ['Radius / mass', `${STARS.A.radiusSolar} R☉ · ${STARS.A.massSolar} M☉`],
      ['Luminosity', `${STARS.A.luminositySolar} L☉ · Teff ~${STARS.A.teff} K`],
      ['Orbit', `Binary with B · P = ${AB_ORBIT.P_yr} yr · a = ${AB_ORBIT.a_AU} AU · e = ${AB_ORBIT.e}`],
    ],
    fact: 'Rigil Kentaurus ("foot of the Centaur") is the brightest star in Centaurus and the fourth-brightest in the night ' +
          'sky. It is only a little larger and more luminous than the Sun, and about 5–6 billion years old. Together with B it ' +
          'is the nearest Sun-like star system — a prime target for Breakthrough Starshot\'s proposed laser-sail probes.',
  },
  B: {
    name: 'Alpha Centauri B (Toliman)', color: '#ffb070',
    type: 'K1V orange dwarf · secondary',
    rows: () => [
      ['Spectral type', 'K1V (cooler and orange than the Sun)'],
      ['Radius / mass', `${STARS.B.radiusSolar} R☉ · ${STARS.B.massSolar} M☉`],
      ['Luminosity', `${STARS.B.luminositySolar} L☉ · Teff ~${STARS.B.teff} K`],
      ['Orbit', `Binary with A · periastron ~${(AB_ORBIT.a_AU * (1 - AB_ORBIT.e)).toFixed(1)} AU · apastron ~${(AB_ORBIT.a_AU * (1 + AB_ORBIT.e)).toFixed(1)} AU`],
    ],
    fact: 'Toliman is a K-type dwarf a little smaller and cooler than the Sun. A candidate planet (α Cen Bb) announced in ' +
          '2012 was later shown to be a false signal from the star\'s own activity; no planet around B is confirmed today. ' +
          'Its orange colour contrasts with A\'s yellow-white, so a sky with both suns would look striking.',
  },
  proxima: {
    name: 'Proxima Centauri', color: '#ff6a4a',
    type: 'M5.5V flare star · nearest star to the Sun',
    rows: () => [
      ['Distance', `${DIST_LY_PROXIMA} light-years (closer than A and B)`],
      ['Spectral type', 'M5.5V red dwarf · radius ~0.15 R☉ · mass ~0.12 M☉'],
      ['Around AB', '~13,000 AU from A and B · orbital period ~550,000 years (effectively fixed on human timescales)'],
      ['Planets', 'Proxima b (HZ) and Proxima d; flares bathe them in X-rays and UV'],
    ],
    fact: 'Proxima is a tiny, cool red dwarf that still flares violently — its brightness can jump by magnitudes in minutes. ' +
          'It is gravitationally bound to A and B (Kervella et al. 2017) on a vast, slow orbit, so the three form one triple ' +
          'system. From Earth it is invisible to the naked eye; it was only found in 1915 by Robert Innes.',
  },
  proximaB: {
    name: 'Proxima Centauri b', color: '#7ec8ff',
    type: 'Terrestrial exoplanet · habitable zone of Proxima',
    rows: () => [
      ['Semi-major axis', `${PLANETS.proximaB.a_AU} AU (~7.2 million km)`],
      ['Orbital period', `${PLANETS.proximaB.P_days} days`],
      ['Minimum mass', `~${PLANETS.proximaB.mEarth} Earth masses (m sin i)`],
      ['Habitable zone', 'Receives ~65% of the flux Earth gets from the Sun; tidally locked is likely'],
    ],
    fact: 'Announced in 2016, Proxima b is the nearest known exoplanet and sits in Proxima\'s classical habitable zone. ' +
          'Whether liquid water can survive is an open question: the star\'s flares deliver harsh radiation, and a tidally ' +
          'locked world would have a permanent day side and night side. Still, it is the best nearby target for searching ' +
          'for an atmosphere (JWST, ELT, and future direct-imaging missions).',
  },
  proximaD: {
    name: 'Proxima Centauri d', color: '#a8d4ff',
    type: 'Sub-Earth exoplanet · innermost planet of Proxima',
    rows: () => [
      ['Semi-major axis', `${PLANETS.proximaD.a_AU} AU`],
      ['Orbital period', `${PLANETS.proximaD.P_days} days`],
      ['Minimum mass', `~${PLANETS.proximaD.mEarth} Earth masses (m sin i)`],
      ['Discovery', PLANETS.proximaD.discovery],
    ],
    fact: 'Proxima d is a lightweight inner planet found in ESPRESSO radial velocities (2022). At only about a quarter of ' +
          'an Earth mass it is one of the lightest exoplanets ever measured. It orbits well inside the habitable zone and ' +
          'is likely a bare or thinly-atmosphered rocky world, baked by Proxima\'s flares.',
  },
};
