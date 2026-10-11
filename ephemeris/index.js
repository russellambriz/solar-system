// ephemeris/index.js: real planet positions for the sim date, and a date picker.
//
// Usage (main.js):
//   import { createRealPositions } from './ephemeris/index.js';
//   const realPositions = createRealPositions({ bodies, scaleDistance, getTime: () => simTime, setTime: (ms) => { simTime = ms; } });
//   in updateBodies(): realPositions.place(body, days) puts a planet on its Keplerian orbit (ephemeris/planets.js:
//   JPL elements with eccentricity, inclination and their slow drift), then main.js's radial distance compression.
//   body.orbit (the planet's orbit line) is reshaped to the real tilted ellipse, and redrawn when the date moves on by
//   more than 20 years (the elements drift slowly).
//
// The date picker (#date-input + #today-btn in the Controls panel) jumps the sim clock to noon UTC on the chosen day,
// from 1000 AD to 3000 AD. The sim keeps running (or stays paused) from there; the field follows the sim date.
import { scaleAU } from '../smallbodies.js';
import { planetAU, planetOrbitAU, PLANET_NAMES } from './planets.js';

const DAY_MS = 86400000, J2000 = Date.UTC(2000, 0, 1, 12);
const ORBIT_REFRESH_DAYS = 365.25 * 20;
const MIN_YEAR = 1000, MAX_YEAR = 3000;

export function createRealPositions({ bodies, scaleDistance, getTime, setTime }) {
  const planets = new Set(PLANET_NAMES);
  let orbitDays = null;

  function redrawOrbits(days) {
    orbitDays = days;
    for (const b of bodies) {
      if (!planets.has(b.name) || !b.orbit) continue;
      const pts = planetOrbitAU(b.name, days, 256).map((p) => scaleAU(p, scaleDistance));
      b.orbit.geometry.setFromPoints(pts);
      b.orbit.geometry.computeBoundingSphere();
    }
  }

  /** Place a planet body for `days` since J2000. Returns false for anything that isn't one of the eight planets. */
  function place(b, days) {
    if (!planets.has(b.name)) return false;
    if (orbitDays === null || Math.abs(days - orbitDays) > ORBIT_REFRESH_DAYS) redrawOrbits(days);
    scaleAU(planetAU(b.name, days, b.group.position), scaleDistance);
    return true;
  }

  // ---- date picker -------------------------------------------------------------------------------------------------
  const input = document.getElementById('date-input'), today = document.getElementById('today-btn');
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  if (input) {
    input.min = `${MIN_YEAR}-01-01`; input.max = `${MAX_YEAR}-12-31`;
    const jump = () => {
      const m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(input.value);
      if (!m) return;
      const y = +m[1];
      if (y < MIN_YEAR || y > MAX_YEAR) { input.value = iso(getTime()); return; }
      setTime(Date.UTC(y, +m[2] - 1, +m[3], 12));
    };
    input.addEventListener('change', jump);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { jump(); input.blur(); } e.stopPropagation(); });   // keep app shortcuts out
    // keep the field on the sim date while it runs (not while someone is editing it)
    const sync = () => { if (document.activeElement !== input) { const v = iso(getTime()); if (input.value !== v) input.value = v; } };
    sync();
    setInterval(sync, 250);
  }
  today?.addEventListener('click', () => setTime(Date.now()));

  return {
    place, redrawOrbits,
    positionAU: (name, days, out) => planetAU(name, days, out),
    jumpTo: (ms) => setTime(ms),
    daysAt: (ms) => (ms - J2000) / DAY_MS,
  };
}
