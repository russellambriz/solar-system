// ui/skyreadout.js: "Seen from Earth" row on the info card of Saturn, Uranus and Neptune and of their major moons.
// Uses the real positions of ephemeris/satellites.js (JPL mean elements fitted to JPL Horizons) for the sim date, plus the
// planets' real positions (ephemeris/planets.js) and the light time, to say where a moon appears next to its planet in
// the sky as seen from Earth: its separation (′ arcminutes / ″ arcseconds) and compass direction (E = east on the sky),
// or that it is passing in front of / behind the planet's disc.
//   Saturn card:  Titan 2.9′ E · Iapetus 8.3′ W        Titan card:  2.9′ east of Saturn · real position (JPL)
// The row (#info-sky-row in index.html) is only shown while the focused body's own card is open.
import { planetAU } from '../ephemeris/planets.js';
import { SAT_ELEMENTS, skyOffset } from '../ephemeris/satellites.js';

const AU_KM = 149597870.7, LIGHT_DAY_PER_AU = 0.0057755183;
const OBL = 23.4392911 * Math.PI / 180, CE = Math.cos(OBL), SE = Math.sin(OBL);
const PLANET_R_KM = { Saturn: 60268, Uranus: 25559, Neptune: 24764 };
const HEADLINE = { Saturn: ['Titan', 'Iapetus'], Uranus: ['Titania', 'Oberon'], Neptune: ['Triton'] };
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const WORDS = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };

const fmtSep = (as) => (as < 59.5 ? `${Math.round(as)}″` : `${(as / 60).toFixed(as < 600 ? 1 : 0)}′`);

export function createSkyReadout({ getFocused, $ = (id) => document.getElementById(id) }) {
  const row = $('info-sky-row'), cell = $('info-sky');
  let last = 0, shownFor = null;
  const _e = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  const _p = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

  /** Where `moon` appears next to `planet` from Earth at `days` since J2000. */
  function offset(planet, moon, days) {
    planetAU('Earth', days, _e);
    planetAU(planet, days, _p);
    // scene axes (x, north, −y_ecl) → J2000 ecliptic → ICRF
    const xe = _p.x - _e.x, ye = -(_p.z - _e.z), ze = _p.y - _e.y;
    const dAU = Math.hypot(xe, ye, ze);
    const los = [xe / dAU, (ye * CE - ze * SE) / dAU, (ye * SE + ze * CE) / dAU];
    const o = skyOffset(moon, days - dAU * LIGHT_DAY_PER_AU, los, dAU * AU_KM);   // as it was when the light left
    if (!o) return null;
    o.disc = (PLANET_R_KM[planet] / (dAU * AU_KM)) * 206264.806;
    o.dir = DIRS[Math.round(o.pa / 45) % 8];
    return o;
  }
  const phrase = (o, planet, long) => {
    if (o.sep < o.disc) return o.behind ? `hidden behind ${planet}` : `crossing in front of ${planet}`;
    return long ? `${fmtSep(o.sep)}\u00a0${WORDS[o.dir]} of ${planet}` : `${fmtSep(o.sep)}\u00a0${o.dir}`;
  };

  function text(b, days) {
    if (!b) return null;
    if (HEADLINE[b.name]) {
      return HEADLINE[b.name].map((m) => { const o = offset(b.name, m, days); return o ? `${m}\u00a0${phrase(o, b.name, false)}` : ''; })   // no-break spaces: each moon's entry stays on one line
        .filter(Boolean).join(' · ');
    }
    if (b.isMoon && SAT_ELEMENTS[b.name]) {
      const planet = SAT_ELEMENTS[b.name].planet, o = offset(planet, b.name, days);
      return o ? `${phrase(o, planet, true)} · real position (JPL)` : null;
    }
    return null;
  }

  function update(days) {
    if (!row || !cell) return;
    const f = getFocused?.();
    const open = f && !$('info-panel')?.classList.contains('hidden') && $('info-name')?.textContent === f.info?.name;
    const want = open && (HEADLINE[f.name] || (f.isMoon && SAT_ELEMENTS[f.name])) ? f : null;
    if (!want) { if (shownFor) { row.classList.add('hidden'); shownFor = null; } return; }
    const now = performance.now();
    if (want === shownFor && now - last < 250) return;
    last = now;
    const t = text(want, days);
    if (t && cell.textContent !== t) cell.textContent = t;
    row.classList.toggle('hidden', !t);
    shownFor = want;
  }

  return { update, offset, text: (name, days) => text({ name, isMoon: !HEADLINE[name], info: {} }, days) };
}
