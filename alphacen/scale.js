// alphacen/scale.js — local distance helpers for the Alpha Centauri module.
// Galaxy/deep-space convention (galaxy.js, deepspace.js): 1 scene unit = 100 light-years.
// Solar-system convention (main.js): drawnDistance = scaleDistance(au) = a + b·AU^p.
// Nearby-star heliocentric distances are soft-capped onto that curve so the system sits past the
// heliosphere (~200 units) but inside the solar camera far plane (~6000) — cards always show the
// true light-year distance. Intra-system AU (binary, planets) use scaleDistance unchanged.
// Do not edit galaxy.js / deepspace.js / scale/.
export const AU_PER_LY = 63241.077;                         // IAU: 1 ly / 1 AU
export const GALAXY_LY_PER_UNIT = 100;                      // galaxy.js / deepspace.js
export const NEARBY_HINGE_AU = 1000;                        // start soft-cap beyond ~1000 AU
export const NEARBY_LOG_K = 1800;                           // log stretch past the hinge

export function lyToAU(ly) { return ly * AU_PER_LY; }

/**
 * Scene units from the Sun for a heliocentric distance in light-years.
 * Below ~1000 AU: identical to scaleDistance. Beyond: log soft-cap so 4.37 ly ≈ 3000 units.
 */
export function scaleLy(ly, scaleDistance) {
  const raw = scaleDistance(Math.max(lyToAU(ly), 1e-9));
  const hinge = scaleDistance(NEARBY_HINGE_AU);
  if (raw <= hinge) return raw;
  return hinge + Math.log10(raw / hinge) * NEARBY_LOG_K;
}

/** Scene units for an AU separation inside the system (binary orbit, planet orbits). */
export function scaleSystemAU(au, scaleDistance) {
  return scaleDistance(Math.max(au, 1e-9));
}

/** Galaxy-frame distance in units (1 unit = 100 ly). Kept for reference / ScaleBot. */
export function galaxyUnits(ly) {
  return ly / GALAXY_LY_PER_UNIT;
}
