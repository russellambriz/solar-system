// moon/eclipse.js — lunar eclipses: where Earth's shadow falls on the Moon, from the real Sun and Moon.
//
// The scene's Moon orbit is drawn ~10x closer than the real one and its 5.1° tilt has a fixed node, so the scene's own
// geometry would put the Moon in Earth's shadow at almost every full Moon (or never). Instead the shadow comes from the
// true positions: a truncated Meeus lunar theory (ch. 47, the largest terms: longitude ~0.1°, latitude ~0.05°,
// distance ~300 km) and the low-precision Sun (ch. 25). That puts eclipses on their real dates with roughly the right
// depth, e.g. the total eclipse of 2026-03-03 (greatest ~11:34 UTC) and the deep partial of 2026-08-28 (~04:13 UTC),
// and the shadow sits at the real offset from the Moon's centre (in Moon radii), so it sweeps across the right way.
// Shadow size: the classical rule (Danjon/Chauvenet): umbra radius = 1.02 (pi_moon + pi_sun - s_sun), penumbra =
// 1.02 (pi_moon + pi_sun + s_sun); the 2% is Earth's atmosphere making the shadow slightly bigger than the solid Earth.
const D2R = Math.PI / 180;
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Earth's shadow relative to the Moon at `days` since J2000 (TT ~ UT here; the ~69 s difference doesn't matter).
 * All lengths are in MOON RADII on the plane of the sky at the Moon:
 *   x, y   the Moon's centre minus the shadow's centre, x = east (increasing ecliptic longitude), y = ecliptic north
 *   umbra, penumbra   shadow radii
 *   umbralMag, penumbralMag   standard magnitudes (fraction of the Moon's diameter inside each shadow; <0 = outside)
 */
export function earthShadow(days, out = {}) {
  const d = days;
  const Lp = 218.3164477 + 13.17639648 * d;       // Moon mean longitude
  const D = (297.8501921 + 12.19074912 * d) * D2R; // mean elongation
  const M = (357.5291092 + 0.98560028 * d) * D2R;  // Sun mean anomaly
  const Mp = (134.9633964 + 13.06499295 * d) * D2R; // Moon mean anomaly
  const F = (93.2720950 + 13.22935024 * d) * D2R;  // argument of latitude
  const lonM = Lp + 6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * Mp)
    - 0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F) + 0.059 * Math.sin(2 * D - 2 * Mp) + 0.057 * Math.sin(2 * D - M - Mp)
    + 0.053 * Math.sin(2 * D + Mp) + 0.046 * Math.sin(2 * D - M) - 0.041 * Math.sin(M - Mp) - 0.035 * Math.sin(D) - 0.031 * Math.sin(M + Mp);
  const latM = 5.128 * Math.sin(F) + 0.281 * Math.sin(Mp + F) + 0.278 * Math.sin(Mp - F) + 0.173 * Math.sin(2 * D - F)
    + 0.055 * Math.sin(2 * D - Mp + F) + 0.046 * Math.sin(2 * D - Mp - F) + 0.033 * Math.sin(2 * D + F) + 0.017 * Math.sin(2 * Mp + F);
  const distKm = 385000.56 - 20905.355 * Math.cos(Mp) - 3699.111 * Math.cos(2 * D - Mp) - 2955.968 * Math.cos(2 * D)
    - 569.925 * Math.cos(2 * Mp) + 48.888 * Math.cos(M) + 246.158 * Math.cos(2 * D - 2 * Mp) - 152.138 * Math.cos(2 * D - M - Mp)
    - 170.733 * Math.cos(2 * D + Mp) - 204.586 * Math.cos(2 * D - M) - 129.62 * Math.cos(M - Mp) + 108.743 * Math.cos(D);
  const lonS = 280.46646 + 0.98564736 * d + (1.914602 * Math.sin(M) + 0.019993 * Math.sin(2 * M)) - 0.00569;  // apparent (aberration)
  const rAU = 1.000140 - 0.016708 * Math.cos(M) - 0.000141 * Math.cos(2 * M);

  const piM = Math.asin(6378.14 / distKm) / D2R;   // Moon's horizontal parallax (deg)
  const sM = Math.asin(1737.4 / distKm) / D2R;     // Moon's semi-diameter
  const sS = 0.26656 / rAU, piS = 0.002442 / rAU;   // Sun's semi-diameter and parallax
  const umbra = 1.02 * (piM + piS - sS), pen = 1.02 * (piM + piS + sS);
  const x = wrap180(lonM - lonS - 180) * Math.cos(latM * D2R), y = latM;
  const sep = Math.hypot(x, y);
  out.x = x / sM; out.y = y / sM;
  out.umbra = umbra / sM; out.penumbra = pen / sM;
  out.umbralMag = (umbra + sM - sep) / (2 * sM);
  out.penumbralMag = (pen + sM - sep) / (2 * sM);
  out.type = out.umbralMag >= 1 ? 'total' : out.umbralMag > 0 ? 'partial' : out.penumbralMag > 0 ? 'penumbral' : 'none';
  return out;
}

/**
 * Lunar eclipses between two dates (ms since 1970, UTC), for the Events timeline. Steps from full Moon to full Moon,
 * finds greatest eclipse (closest approach of the Moon's centre to the shadow axis) and keeps the ones that reach the
 * umbra (partial and total); penumbral ones are left out since most are too faint to notice.
 * Returns [{ ms, type, umbralMag, penumbralMag }], greatest-eclipse time good to ~10 minutes.
 */
export function findLunarEclipses(fromMs, toMs, { penumbral = false } = {}) {
  const J2000 = Date.UTC(2000, 0, 1, 12), DAY = 86400000, SYN = 29.530588853;
  const tmp = {};
  const sepAt = (d) => { earthShadow(d, tmp); return Math.hypot(tmp.x, tmp.y); };
  // first full Moon on or after fromMs (mean phase is enough to start; the search below finds the true minimum)
  const d0 = (fromMs - J2000) / DAY, d1 = (toMs - J2000) / DAY;
  let k = Math.ceil((d0 - 5.259722 - 0.5 * SYN) / SYN - 1e-9);   // mean new Moon 2000-01-06 18:14 UTC = day 5.259722
  const out = [];
  for (let d = 5.259722 + (k + 0.5) * SYN; d < d1 + 1; d += SYN) {
    // greatest eclipse: golden-section search for the smallest separation within ±1 day of mean full Moon
    // (the true full Moon wanders up to ~14 h from the mean one)
    let a = d - 1, b = d + 1;
    const gr = 0.6180339887;
    let c = b - gr * (b - a), e = a + gr * (b - a), fc = sepAt(c), fe = sepAt(e);
    for (let i = 0; i < 40; i++) {
      if (fc < fe) { b = e; e = c; fe = fc; c = b - gr * (b - a); fc = sepAt(c); }
      else { a = c; c = e; fc = fe; e = a + gr * (b - a); fe = sepAt(e); }
    }
    const t = 0.5 * (a + b);
    if (t < d0 || t > d1) continue;
    const r = earthShadow(t, {});
    if (r.type === 'none' || (r.type === 'penumbral' && !penumbral)) continue;
    out.push({ ms: Math.round(J2000 + t * DAY), type: r.type, umbralMag: r.umbralMag, penumbralMag: r.penumbralMag });
  }
  return out;
}

// ui/index.js Events: umbral lunar eclipses (partial and total) from a year back to ten years ahead of page load,
// as [date, title, target, kind, card, ms] with ms at greatest eclipse, so picking one lands mid-eclipse.
export const LUNAR_ECLIPSE_EVENTS = (() => {
  try {
    const now = Date.now(), Y = 365.25 * 86400000;
    return findLunarEclipses(now - Y, now + 10 * Y).map((e) => {
      const hhmm = new Date(e.ms).toISOString().slice(11, 16);
      const title = e.type === 'total'
        ? `Total lunar eclipse: the Moon turns copper red in Earth's shadow (greatest ${hhmm} UTC)`
        : `Partial lunar eclipse: ${Math.round(e.umbralMag * 100)}% of the Moon's width in Earth's shadow (greatest ${hhmm} UTC)`;
      return [new Date(e.ms).toISOString().slice(0, 10), title, 'Moon', 'moon', undefined, e.ms];
    });
  } catch (err) { console.warn('moon: eclipse events', err); return []; }
})();
