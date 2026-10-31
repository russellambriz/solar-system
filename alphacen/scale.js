// alphacen/scale.js — local distance helpers for the Alpha Centauri module.
// Galaxy/deep-space convention (galaxy.js, deepspace.js): 1 scene unit = 100 light-years.
// Solar-system convention (main.js): drawnDistance = scaleDistance(au) = a + b·AU^p.
// Nearby stars sit on the solar AU curve: convert ly → AU, then call the live scaleDistance so the
// scale slider still moves the system. Do not edit galaxy.js / deepspace.js / scale/.
export const AU_PER_LY = 63241.077;                         // IAU: 1 ly / 1 AU
export const GALAXY_LY_PER_UNIT = 100;                      // galaxy.js / deepspace.js

export function lyToAU(ly) { return ly * AU_PER_LY; }

/** Scene units from the Sun for a heliocentric distance in light-years (uses main.js's scaleDistance). */
export function scaleLy(ly, scaleDistance) {
  return scaleDistance(lyToAU(ly));
}

/** Scene units for an AU separation inside the system (binary orbit, planet orbits). */
export function scaleSystemAU(au, scaleDistance) {
  return scaleDistance(Math.max(au, 1e-9));
}

/** Galaxy-frame distance in units (1 unit = 100 ly). Kept for reference / ScaleBot. */
export function galaxyUnits(ly) {
  return ly / GALAXY_LY_PER_UNIT;
}
