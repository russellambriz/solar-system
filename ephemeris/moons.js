// ephemeris/moons.js: mean longitudes for Earth's Moon and Jupiter's Galilean moons (J2000 ecliptic / planet frame).
// Moon: Meeus Astronomical Algorithms (mean longitude + leading equation-of-center term) so phases match the calendar.
// Galilean: Meeus Ch. 44 mean longitudes shifted from the 1950 epoch to J2000 (relative angles keep the Laplace resonance).
// Scene axes match ephemeris/planets.js: x = ecliptic X, y = north, z = −ecliptic Y → longitude L → (cos L, 0, −sin L).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Moon's geocentric ecliptic longitude (radians) at `days` since J2000. ~1° accuracy → phases within a few hours. */
export function moonEclipticLongitude(days) {
  // Meeus: L' = 218.3164591 + 481267.88134236 T; M = 134.9633964 + 477198.8675055 T (T in Julian centuries)
  const Lp = 218.3164591 + 13.17639648 * days;           // mean longitude (deg); 481267.88134236/36525
  const M = (134.9633964 + 13.06499295 * days) * D2R;    // mean anomaly; 477198.8675055/36525
  return (Lp + 6.289 * Math.sin(M)) * D2R;               // + equation of center (~22640″)
}

/** Sidereal month used with the mean motion above (360° / 13.17639648°/d). */
export const MOON_SIDEREAL_DAYS = 360 / 13.17639648;      // ≈ 27.321662

// Meeus mean longitudes at 1950.0 + mean motions (°/day); converted to J2000 (18262.5 d later).
const GALILEAN = {
  Io:       { L0: (106.07719 + 203.488955790 * 18262.5) % 360, n: 203.488955790 },
  Europa:   { L0: (175.73161 + 101.374724735 * 18262.5) % 360, n: 101.374724735 },
  Ganymede: { L0: (120.55883 + 50.317609207 * 18262.5) % 360, n: 50.317609207 },
  Callisto: { L0: (84.44459 + 21.571071177 * 18262.5) % 360, n: 21.571071177 },
};

/** Mean orbital longitude (radians) of a Galilean moon in Jupiter's equatorial frame at `days` since J2000. */
export function galileanLongitude(name, days) {
  const g = GALILEAN[name];
  if (!g) return 0;
  return ((g.L0 + g.n * days) % 360) * D2R;
}

export function galileanElements(name) {
  const g = GALILEAN[name];
  if (!g) return null;
  return { L0: g.L0 * D2R, period: 360 / g.n };
}

/**
 * Anchor a slowed moon so that at `days` its `phase + days/(period·slow)·2π` equals the real mean longitude.
 * While time runs the moon still moves at the slowed rate (readable at 10 days/s); picking a date snaps it back.
 */
export function anchorMoonPhase(b, days, realLonRad) {
  b.phase = realLonRad - (days / (b.period * b.slow)) * Math.PI * 2;
}

/** Illuminated fraction and phase name from Sun–Earth–Moon geometry (scene positions; Sun at origin). */
export function moonPhaseFromPositions(earthPos, moonPos) {
  // Earth→Sun = −earth; Earth→Moon = moon − earth
  const ex = earthPos.x, ey = earthPos.y, ez = earthPos.z;
  const mx = moonPos.x - ex, my = moonPos.y - ey, mz = moonPos.z - ez;
  const eLen = Math.hypot(ex, ey, ez) || 1;
  const mLen = Math.hypot(mx, my, mz) || 1;
  // elongation ψ between Earth→Moon and Earth→Sun (0 = new, π = full)
  const cosElong = Math.max(-1, Math.min(1, (-ex * mx - ey * my - ez * mz) / (eLen * mLen)));
  const elong = Math.acos(cosElong);
  const lit = (1 - cosElong) / 2;                         // (1 − cos ψ)/2 with ψ = Sun–Earth–Moon angle

  // Signed angle in the ecliptic xz-plane to tell waxing from waning (scene: z = −Y_ecliptic)
  const eLon = Math.atan2(-ez, ex);                       // Earth's heliocentric longitude ≈ Sun's geocentric + π
  const mLon = Math.atan2(-mz, mx);                       // Moon's geocentric longitude
  let fromSun = (mLon - eLon - Math.PI) % (Math.PI * 2);  // 0 = new, π = full
  if (fromSun < 0) fromSun += Math.PI * 2;
  const waxing = fromSun <= Math.PI;

  let name;
  if (lit < 0.02) name = 'New Moon';
  else if (lit > 0.98) name = 'Full Moon';
  else if (lit < 0.40) name = waxing ? 'Waxing crescent' : 'Waning crescent';
  else if (lit < 0.60) name = waxing ? 'First quarter' : 'Last quarter';
  else name = waxing ? 'Waxing gibbous' : 'Waning gibbous';

  return {
    name,
    lit,                                                  // 0…1
    litPct: Math.round(lit * 100),
    elongationDeg: elong * R2D,
    label: `${name} · ${Math.round(lit * 100)}% lit`,
  };
}
