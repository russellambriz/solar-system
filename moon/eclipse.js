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
