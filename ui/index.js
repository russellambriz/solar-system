// ui/index.js: interface helpers that sit on top of main.js without changing how it works.
//  • Help overlay: "?" in the Controls header, or the ? key. Mouse/keyboard and touch controls plus a few things to try;
//    ✕, Esc, ? or a tap outside the card closes it.
//  • Clean view: the 🖼 button in Controls, or H, hides every panel and note so only the sky is left; "Show interface"
//    (or H) brings them back.
//  • "Why is this not to scale?": the bottom-left notes start folded to one line and open on a tap (remembered).
//  • Mini-map (Layers → Mini-map, or M): top-down view of the Solar System on a log distance scale with the planets'
//    real orbits, the belts, dwarf planets, comets, famous asteroids and probes (anything past 50 AU sits on the rim), plus where the
//    camera is and which way it looks. Tap a dot to fly there. It moves clear of open panels and hides in the galaxy view.
//  • Events (Controls, under the date): a 1965–2065 timeline with markers, ◀ ▶ and a list of flybys, comet visits and
//    landings, asteroid and comet missions, comet perihelia (famous.js) and Apophis's 2029 flyby. Picking one jumps to that day, pauses, and flies to the object.
//  • Motion trails (Layers → Trails): each planet and dwarf planet trails the last eighth of its orbit, with dots at
//    equal time steps; they spread out near the Sun, where it moves fastest (Kepler's second law).
//  • Signal delay on the probes' labels while Layers → Distances is on (spacecraft.setSignalDelay).
//  • "Seen from Earth" row on the Saturn / Uranus / Neptune cards and their moons' cards (skyreadout.js).
//
// Usage (main.js): const ui = createUI({ bodies, smallBodies, scene, camera, scaleDistance, realPositions, search,
//   spacecraft, comets, getMode, getFocused, isPaused, togglePause, isTransitioning, isTouch, isCompact });
//   every frame: ui.update(days, camera, inGalaxy)
import * as THREE from 'three';
import { keplerAU, scaleAU } from '../smallbodies.js';
import { planetAU, planetOrbitAU, PLANET_NAMES } from '../ephemeris/planets.js';
import { createSkyReadout } from './skyreadout.js';

const J2000 = Date.UTC(2000, 0, 1, 12), DAY_MS = 86400000;
const TL_FROM = Date.UTC(1965, 0, 1), TL_TO = Date.UTC(2065, 0, 1);
// [date, what happened, object to fly to (a search name), kind, card to open on arrival]. Planets are drawn ~1,000× too big, so
// at a flyby the probe sits inside the drawn planet: fly to the planet and open the probe's card (its path runs into it).
const EVENTS = [
  ['1966-11-17', 'Leonid meteor storm: Earth runs through comet Tempel-Tuttle\'s fresh dust', '55P/Tempel-Tuttle', 'comet'],
  ['1969-07-20', 'Apollo 11 lands on the Moon', 'Apollo 11', 'moon'],
  ['1972-12-11', 'Apollo 17: the last crewed Moon landing so far', 'Apollo 17', 'moon'],
  ['1979-03-05', 'Voyager 1 flies past Jupiter', 'Jupiter', 'craft', 'Voyager 1'],
  ['1979-07-09', 'Voyager 2 flies past Jupiter', 'Jupiter', 'craft', 'Voyager 2'],
  ['1980-11-12', 'Voyager 1 flies past Saturn', 'Saturn', 'craft', 'Voyager 1'],
  ['1981-08-26', 'Voyager 2 flies past Saturn', 'Saturn', 'craft', 'Voyager 2'],
  ['1986-01-24', 'Voyager 2 flies past Uranus', 'Uranus', 'craft', 'Voyager 2'],
  ['1986-02-09', "Halley's Comet rounds the Sun", "Halley's Comet", 'comet'],
  ['1989-08-25', 'Voyager 2 flies past Neptune', 'Neptune', 'craft', 'Voyager 2'],
  ['1990-02-14', 'Voyager 1 takes the "Pale Blue Dot" photo of Earth', 'Voyager 1', 'craft'],
  ['1992-12-12', 'Comet Swift-Tuttle, parent of the Perseids, rounds the Sun', '109P/Swift-Tuttle', 'comet'],
  ['1997-04-01', 'Comet Hale-Bopp rounds the Sun', 'Comet Hale-Bopp', 'comet'],
  ['1998-02-28', 'Comet Tempel-Tuttle, parent of the Leonids, rounds the Sun', '55P/Tempel-Tuttle', 'comet'],
  ['2001-02-12', 'NEAR Shoemaker lands on asteroid Eros', '433 Eros', 'asteroid'],
  ['2004-01-02', 'Stardust flies through comet Wild 2\'s coma and catches its dust', '81P/Wild 2', 'comet'],
  ['2005-07-04', 'Deep Impact fires an impactor into comet Tempel 1', '9P/Tempel 1', 'comet'],
  ['2006-08-24', 'Pluto is reclassified as a dwarf planet', 'Pluto', 'body'],
  ['2012-08-25', 'Voyager 1 reaches interstellar space', 'Voyager 1', 'craft'],
  ['2014-11-12', 'Philae, from Rosetta, lands on comet 67P', '67P/Churyumov-Gerasimenko', 'comet'],
  ['2015-07-14', 'New Horizons flies past Pluto', 'Pluto', 'craft', 'New Horizons'],
  ['2017-09-09', "'Oumuamua, the first known interstellar object, rounds the Sun", "1I/'Oumuamua", 'visitor'],
  ['2018-06-27', 'Hayabusa2 arrives at asteroid Ryugu', '162173 Ryugu', 'asteroid'],
  ['2018-11-05', 'Voyager 2 reaches interstellar space', 'Voyager 2', 'craft'],
  ['2019-12-08', 'Interstellar comet 2I/Borisov rounds the Sun', '2I/Borisov', 'visitor'],
  ['2020-07-03', 'Comet NEOWISE rounds the Sun: the great comet of 2020', 'Comet NEOWISE (C/2020 F3)', 'comet'],
  ['2020-10-20', 'OSIRIS-REx grabs a sample of asteroid Bennu', '101955 Bennu', 'asteroid'],
  ['2021-11-02', 'Comet 67P rounds the Sun', '67P/Churyumov-Gerasimenko', 'comet'],
  ['2022-01-24', 'JWST arrives at Sun–Earth L2', 'James Webb Space Telescope', 'craft'],
  ['2022-03-04', 'Comet Tempel 1 rounds the Sun', '9P/Tempel 1', 'comet'],
  ['2022-09-26', 'DART crashes into Dimorphos, moonlet of Didymos', '65803 Didymos', 'asteroid'],
  ['2022-12-15', 'Comet Wild 2 rounds the Sun', '81P/Wild 2', 'comet'],
  ['2023-10-22', 'Comet Encke, parent of the Taurids, rounds the Sun', '2P/Encke', 'comet'],
  ['2024-09-27', 'Comet Tsuchinshan-ATLAS rounds the Sun: the great comet of 2024', 'Comet Tsuchinshan-ATLAS (C/2023 A3)', 'comet'],
  ['2024-12-24', "Parker Solar Probe's record close pass of the Sun", 'Parker Solar Probe', 'craft'],
  ['2025-10-29', 'Interstellar comet 3I/ATLAS rounds the Sun', '3I/ATLAS', 'visitor'],
  ['2027-02-10', 'Comet Encke returns', '2P/Encke', 'comet'],
  ['2028-02-13', 'Comet Tempel 1 returns, on a wider orbit after passing Jupiter', '9P/Tempel 1', 'comet'],
  ['2028-04-08', 'Comet 67P returns', '67P/Churyumov-Gerasimenko', 'comet'],
  ['2029-04-13', 'Apophis passes closer to Earth than geostationary satellites', '99942 Apophis', 'asteroid'],
  ['2029-05-14', 'Comet Wild 2 returns', '81P/Wild 2', 'comet'],
  ['2031-05-20', 'Comet Tempel-Tuttle returns: Leonid storms may follow', '55P/Tempel-Tuttle', 'comet'],
  ['2032-12-22', 'Asteroid 2024 YR4 misses the Moon by ~21,000 km', '2024 YR4', 'asteroid'],
  ['2061-07-28', "Halley's Comet returns", "Halley's Comet", 'comet'],
].map(([date, title, target, kind, card]) => ({ date, title, target, kind, card, ms: Date.parse(date + 'T12:00:00Z') }))
  .sort((a, b) => a.ms - b.ms);
const KIND_COLOR = { moon: '#ffd27a', craft: '#8fe3ff', comet: '#c9f2ff', visitor: '#e98cff', body: '#d9b99a', asteroid: '#ffb48a' };

export function createUI(o) {
  const { bodies, camera, scaleDistance } = o;
  const isTouch = !!o.isTouch;
  const $ = (id) => document.getElementById(id);
  const store = { get: (k) => { try { return localStorage.getItem('solar.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('solar.' + k, v); } catch (e) { /* private mode */ } } };
  let days = 0, inGal = false;

  // ---- help overlay ------------------------------------------------------------------------------------------------
  const K = (k) => `<kbd>${k}</kbd>`;
  const keyRows = [
    [`${K('Drag')} ${K('Scroll')} ${K('Right-drag')}`, 'Rotate, zoom, pan'],
    [K('Click'), 'A planet, label or list name: fly there and follow it'],
    [K('/'), 'Search for anything (↑ ↓ to pick, Enter to go)'],
    [K('Esc'), 'Back to the overview (in the galaxy view: back home)'],
    [K('Space'), 'Pause / play'],
    [`${K('G')} ${K('A')} ${K('S')} ${K('C')} ${K('T')}`, 'Galaxy view, Andromeda, Sombrero, Sgr A*, TON 618'],
    [K('H'), 'Clean view: hide the interface'],
    [K('M'), 'Mini-map on / off'],
    [K('?'), 'This help'],
  ];
  const touchRows = [
    ['One finger · pinch · two fingers', 'Rotate · zoom · pan'],
    ['Tap', 'A planet, label or list name: fly there and follow it'],
    ['▸', 'Beside a planet in the list: show its moons'],
    ['Search box', 'Top of the list: find anything and fly there'],
    ['⟲ Overview · ✕', 'Back out'],
    ['🌌 Galaxy · pinch far out', 'The Milky Way, then Andromeda and beyond'],
    ['🖼', 'In Controls: clean view (tap Show interface to return)'],
  ];
  const tries = [
    'Search <b>Voyager 1</b>: on the way the camera passes the planets\' orbits and the edge of interstellar space.',
    'Controls → <b>Scale</b>: slide to True distances, then zoom out to see how empty the outer Solar System is.',
    'Open a planet\'s card and tap <b>👻 Earth for scale</b> or <b>📏 True-scale moon orbits</b>.',
    'Controls → <b>Events</b>: watch Voyager 2 pass Neptune (1989) or Halley\'s Comet round the Sun (1986).',
    'Layers → <b>Trails</b>: the dots mark equal times; they spread out near the Sun, where planets move fastest.',
    'Layers → <b>Distances</b>: how long light and radio signals take to reach whatever you pick.',
  ];
  const table = (list) => `<table>${list.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  const secKeys = `<section><h3>🖱 Mouse &amp; keyboard</h3>${table(keyRows)}</section>`;
  const secTouch = `<section><h3>👆 Touch</h3>${table(touchRows)}</section>`;
  const help = document.createElement('div');
  help.id = 'help-overlay'; help.className = 'help-overlay hidden';
  help.setAttribute('role', 'dialog'); help.setAttribute('aria-modal', 'true'); help.setAttribute('aria-labelledby', 'help-title');
  help.innerHTML = `<div class="help-card scrollable"><button type="button" class="help-close" aria-label="Close help">✕</button>` +
    `<h2 id="help-title">How to explore</h2><div class="help-cols">${isTouch ? secTouch + secKeys : secKeys + secTouch}</div>` +
    `<h3>✨ Things to try</h3><ul>${tries.map((t) => `<li>${t}</li>`).join('')}</ul>` +
    `<p class="help-foot">${isTouch ? 'Tap <b>?</b> in Controls' : `Press ${K('?')}`} to open this again.</p></div>`;
  document.body.appendChild(help);
  let helpOpen = false, lastFocus = null;
  function setHelp(on) {
    helpOpen = on;
    help.classList.toggle('hidden', !on);
    if (on) { lastFocus = document.activeElement; help.querySelector('.help-card').scrollTop = 0; help.querySelector('.help-close').focus({ preventScroll: true }); }
    else if (lastFocus && lastFocus !== document.body && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  help.addEventListener('click', (e) => { if (e.target === help || e.target.closest('.help-close')) setHelp(false); });
  const helpBtn = document.createElement('button');
  helpBtn.type = 'button'; helpBtn.id = 'help-btn'; helpBtn.className = 'head-btn'; helpBtn.textContent = '?';
  helpBtn.title = 'Help (?)'; helpBtn.setAttribute('aria-label', 'Help: controls and things to try');
  document.querySelector('#controls .panel-head .collapse-btn')?.before(helpBtn);
  helpBtn.addEventListener('click', () => setHelp(true));

  // ---- clean view --------------------------------------------------------------------------------------------------
  const cleanBtn = document.createElement('button');
  cleanBtn.type = 'button'; cleanBtn.id = 'clean-btn'; cleanBtn.textContent = '🖼';
  cleanBtn.title = 'Clean view: hide the interface (H)'; cleanBtn.setAttribute('aria-label', 'Clean view: hide the interface');
  document.querySelector('#controls .row.buttons')?.appendChild(cleanBtn);
  const exitBtn = document.createElement('button');
  exitBtn.type = 'button'; exitBtn.id = 'clean-exit'; exitBtn.className = 'clean-exit hidden';
  exitBtn.innerHTML = `Show interface${isTouch ? '' : ` ${K('H')}`}`;
  document.body.appendChild(exitBtn);
  let clean = false, dimTimer = 0;
  function setClean(on) {
    clean = on;
    document.body.classList.toggle('clean-view', on);
    exitBtn.classList.toggle('hidden', !on); exitBtn.classList.remove('dim');
    clearTimeout(dimTimer);
    if (on) { dimTimer = setTimeout(() => exitBtn.classList.add('dim'), 2500); if (helpOpen) setHelp(false); }
  }
  cleanBtn.addEventListener('click', () => setClean(true));
  exitBtn.addEventListener('click', () => setClean(false));

  // keys: ? help, H clean view, M mini-map. Capture phase, so an open help card also keeps Esc and the app's
  // single-letter shortcuts from reaching main.js. Text fields keep their keys.
  window.addEventListener('keydown', (e) => {
    const a = document.activeElement, typing = a && (/^(TEXTAREA|SELECT)$/.test(a.tagName) || (a.tagName === 'INPUT' && !/^(range|checkbox|button)$/.test(a.type)));
    if (helpOpen) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); setHelp(false); }
      if (e.key !== 'Tab') e.stopPropagation();            // a focused button still gets Enter / Space (default action)
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?') { e.preventDefault(); e.stopPropagation(); setHelp(true); }
    else if (e.key === 'h' || e.key === 'H') { e.stopPropagation(); setClean(!clean); }
    else if (e.key === 'm' || e.key === 'M') { e.stopPropagation(); setMap(!mapOn); }
  }, true);

  // ---- "Why is this not to scale?" ---------------------------------------------------------------------------------
  for (const note of [$('scale-note'), $('galaxy-note')]) {
    const btn = note?.querySelector('.why-btn');
    if (!btn) continue;
    const key = 'why.' + note.id;
    const set = (open) => { note.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    set(store.get(key) === '1');
    btn.addEventListener('click', () => {
      const open = !note.classList.contains('open');
      set(open); store.set(key, open ? '1' : '0');
      window.dispatchEvent(new Event('resize'));          // main.js re-places the notes beside a tall body list
    });
  }

  // ---- mini-map ----------------------------------------------------------------------------------------------------
  const MAP_AU = 50, MAP_K = 0.35;
  const SIZE = isTouch ? 150 : 164, C = SIZE / 2, RMAX = C - 9, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mapR = (au) => RMAX * Math.log1p(Math.min(au, MAP_AU) / MAP_K) / Math.log1p(MAP_AU / MAP_K);
  const mapBox = document.createElement('div');
  mapBox.id = 'minimap'; mapBox.className = 'minimap hidden';
  mapBox.innerHTML = '<canvas role="img" aria-label="Mini-map: top view of the Solar System. Tap a planet to fly there."></canvas>' +
    '<div class="mm-cap">Top view · log distance</div>';
  document.body.appendChild(mapBox);
  const cv = mapBox.querySelector('canvas'), ctx = cv.getContext('2d'), cap = mapBox.querySelector('.mm-cap');
  cv.width = cv.height = Math.round(SIZE * dpr); cv.style.width = cv.style.height = SIZE + 'px';
  const mapToggle = $('toggle-minimap'), savedMap = store.get('minimap');
  let mapOn = savedMap === null ? !o.isCompact?.() : savedMap === '1';
  if (mapToggle) { mapToggle.checked = mapOn; mapToggle.addEventListener('change', () => setMap(mapToggle.checked)); }
  function setMap(on) { mapOn = on; if (mapToggle) mapToggle.checked = on; store.set('minimap', on ? '1' : '0'); lastDraw = 0; }

  const planets = PLANET_NAMES.map((n) => bodies.find((b) => b.name === n)).filter(Boolean);
  const dwarfs = (o.smallBodies || []).filter((b) => !b.isMoon && b.info?.a && b.info?.period);
  const _p = new THREE.Vector3(), _f = new THREE.Vector3();
  let picks = [], orbitCache = null, orbitDays = NaN;
  const toMap = (v) => { const r = Math.hypot(v.x, v.z); if (r < 1e-9) return [C, C, 0]; const k = mapR(r) / r; return [C + v.x * k, C + v.z * k, r]; };
  function dot(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function mark(v, size, color, name, shape) {
    const [x, y, r] = toMap(v);
    if (r > MAP_AU) {                                   // past the rim: a small arrowhead pointing outward
      const a = Math.atan2(y - C, x - C), s = size + 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      ctx.lineTo(x + Math.cos(a + 2.4) * s, y + Math.sin(a + 2.4) * s);
      ctx.lineTo(x + Math.cos(a - 2.4) * s, y + Math.sin(a - 2.4) * s);
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    } else if (shape === 'craft') {
      ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    } else dot(x, y, size, color);
    picks.push({ x, y, name, w: shape === 'planet' ? 0 : 4 });       // planets win ties
  }
  const sceneToAU = (r) => {
    if (r <= scaleDistance(0)) return 0;
    let lo = 0, hi = 5000;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (scaleDistance(m) < r) lo = m; else hi = m; }
    return lo;
  };
  function drawMap() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.beginPath(); ctx.arc(C, C, RMAX + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4, 8, 22, 0.8)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120, 150, 255, 0.28)'; ctx.stroke();
    const band = (a, b, color) => { const r0 = mapR(a), r1 = mapR(b); ctx.beginPath(); ctx.arc(C, C, (r0 + r1) / 2, 0, Math.PI * 2); ctx.lineWidth = r1 - r0; ctx.strokeStyle = color; ctx.stroke(); };
    band(2.2, 3.3, 'rgba(200, 170, 120, 0.16)');
    band(30, 50, 'rgba(130, 170, 230, 0.11)');
    // planets' real (eccentric) orbits, re-sampled every ~3 months of sim time
    if (!orbitCache || Math.abs(days - orbitDays) > 90) {
      orbitDays = days;
      orbitCache = planets.map((b) => planetOrbitAU(b.name, days, 72).map((p) => toMap(p)));
    }
    ctx.lineWidth = 1; ctx.globalAlpha = 0.32;
    planets.forEach((b, k) => {
      ctx.beginPath();
      orbitCache[k].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.strokeStyle = b.info.color; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    picks = [{ x: C, y: C, name: 'Sun', w: 2 }];
    ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 8; dot(C, C, 3.6, '#ffd27a'); ctx.shadowBlur = 0;
    for (const b of dwarfs) mark(keplerAU(b.info, days, _p), 1.8, b.info.color || '#cccccc', b.name);
    for (const it of o.comets?.items || []) if (it.posAU && it.posAU.lengthSq() > 0) mark(it.posAU, 1.8, it.info.hyperbolic ? it.info.color : '#c9f2ff', it.info.name);
    if (o.comets?.asteroids?.isOn()) for (const it of o.comets.asteroids.items) if (it.posAU.lengthSq() > 0) mark(it.posAU, 1.6, it.info.color, it.info.name);
    for (const it of o.spacecraft?.items || []) {
      if (it.kind !== 'craft' || !it.active || !it.posAU || it.posAU.lengthSq() < 0.01) continue;        // JWST/ISS ride with Earth
      mark(it.posAU, 2.4, '#8fe3ff', it.name, 'craft');
    }
    for (const b of planets) mark(planetAU(b.name, days, _p), b.radius > 3 ? 3.6 : 2.9, b.info.color, b.name, 'planet');
    // the focused object
    const f = o.getFocused?.(), fname = f ? (f.isMoon ? f.parent?.name : f.name) : null;
    const hit = fname && picks.find((p) => p.name === fname);
    if (hit) { ctx.beginPath(); ctx.arc(hit.x, hit.y, 6.5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd27a'; ctx.stroke(); }
    // the camera: where it is and which way it looks
    const cp = camera.position, h = Math.hypot(cp.x, cp.z), au = sceneToAU(cp.length());
    _p.set(h > 1e-6 ? cp.x / h : 0, 0, h > 1e-6 ? cp.z / h : 0).multiplyScalar(Math.max(au * (h / Math.max(cp.length(), 1e-6)), 0));
    const [cx, cy] = toMap(_p);
    camera.getWorldDirection(_f);
    const fl = Math.hypot(_f.x, _f.z);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.lineWidth = 1.2;
    if (fl > 0.2) {
      const a = Math.atan2(_f.z, _f.x), half = 0.45;
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 22, a - half, a + half); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // tap/click a dot to fly there (search.go: the same fly-to, cinematic on long trips)
  let down = null;
  const nearest = (x, y) => {
    let best = null, bd = isTouch ? 24 : 15;
    for (const p of picks) { const d = Math.hypot(p.x - x, p.y - y) + p.w; if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) { down = null; return; }
    down = null;
    const p = nearest(...local(e));
    if (p) o.search?.go(p.name);
  });
  cv.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const p = nearest(...local(e)); cap.textContent = p ? p.name : 'Top view · log distance'; cv.style.cursor = p ? 'pointer' : 'default'; });
  cv.addEventListener('pointerleave', () => { cap.textContent = 'Top view · log distance'; });
  // keep it clear of the panels: try the bottom-right corner, then just left of whatever covers it; hide if nothing fits
  let shift = 0;
  function layoutMap() {
    const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
    const obstacles = ['controls', 'info-panel', 'nav-panel', 'scale-note', 'galaxy-note'].map((id) => rectOf($(id))).filter(Boolean);
    const r0 = mapBox.getBoundingClientRect();
    let s = 0, ok = false;
    for (let k = 0; k < 5; k++) {
      const dx = s - shift, L = r0.left - dx, R = r0.right - dx;
      if (L < 4) break;
      const hit = obstacles.find((b) => L < b.right + 6 && R > b.left - 6 && r0.top < b.bottom + 6 && r0.bottom > b.top - 6);
      if (!hit) { ok = true; break; }
      s += R - (hit.left - 10);
    }
    if (ok && s !== shift) { shift = s; mapBox.style.setProperty('--mm-shift', `${Math.round(s)}px`); }
    mapBox.classList.toggle('squeezed', !ok);
  }

  // ---- events timeline (Controls, under the date) ------------------------------------------------------------------
  const xOf = (ms) => ((ms - TL_FROM) / (TL_TO - TL_FROM)) * 100;
  const evBox = document.createElement('details');
  evBox.id = 'events'; evBox.className = 'events';
  const ticks = [1970, 1980, 1990, 2000, 2010, 2020, 2030, 2040, 2050, 2060].map((y) =>
    `<span class="tl-tick${y % 30 === 0 ? ' major' : ''}" style="left:${xOf(Date.UTC(y, 0, 1)).toFixed(2)}%">${y % 30 === 0 ? `<i>${y}</i>` : ''}</span>`).join('');
  const dots = EVENTS.map((e, k) => `<span class="tl-dot" data-k="${k}" title="${e.date}: ${e.title.replace(/"/g, '&quot;')}" style="left:${xOf(e.ms).toFixed(2)}%;background:${KIND_COLOR[e.kind]}"></span>`).join('');
  evBox.innerHTML = '<summary>📅 Events</summary>' +
    `<div class="tl-strip" aria-hidden="true"><div class="tl-axis"></div>${ticks}${dots}<div class="tl-now"></div></div>` +
    '<div class="tl-row"><button type="button" class="tl-prev" aria-label="Previous event" title="Previous event">◀</button>' +
    `<select id="event-select" aria-label="Jump to an event"><option value="">Pick an event…</option>${EVENTS.map((e, k) => `<option value="${k}">${e.date.slice(0, 4)} · ${e.title}</option>`).join('')}</select>` +
    '<button type="button" class="tl-next" aria-label="Next event" title="Next event">▶</button></div><div class="tl-cap"></div>';
  const anchor = document.querySelector('#controls .date-row');
  if (anchor) anchor.after(evBox); else document.querySelector('#controls .panel-body')?.appendChild(evBox);
  evBox.open = !o.isCompact?.();
  const strip = evBox.querySelector('.tl-strip'), needle = evBox.querySelector('.tl-now'), select = evBox.querySelector('select');
  const prevBtn = evBox.querySelector('.tl-prev'), nextBtn = evBox.querySelector('.tl-next'), tlCap = evBox.querySelector('.tl-cap');
  let shownEvent = null, pendingGo = null, pendingCard = null;
  function choose(e) {
    o.realPositions.jumpTo(e.ms);
    if (!o.isPaused?.()) o.togglePause?.();
    select.value = String(EVENTS.indexOf(e));
    tlCap.textContent = `⏸ ${e.date}: ${e.title}`;
    shownEvent = e;
    pendingGo = e.target;                 // fly after the next frame has moved everything to the new date
    pendingCard = e.card ? { name: e.card, at: e.target, until: performance.now() + 120000 } : null;
  }
  const simMs = () => J2000 + days * DAY_MS;
  const nextEvent = () => EVENTS.find((e) => e.ms > simMs() + DAY_MS / 2);
  const prevEvent = () => [...EVENTS].reverse().find((e) => e.ms < simMs() - DAY_MS / 2);
  select.addEventListener('change', () => { const e = EVENTS[+select.value]; if (select.value !== '' && e) choose(e); });
  select.addEventListener('keydown', (e) => e.stopPropagation());                   // letters pick options, not app shortcuts
  prevBtn.addEventListener('click', () => { const e = prevEvent(); if (e) choose(e); });
  nextBtn.addEventListener('click', () => { const e = nextEvent(); if (e) choose(e); });
  // tap the strip: the nearest marker if one is close, otherwise that date
  strip.addEventListener('click', (ev) => {
    const r = strip.getBoundingClientRect(), x = ev.clientX - r.left;
    let best = null, bd = isTouch ? 14 : 9;
    for (const e of EVENTS) { const d = Math.abs((xOf(e.ms) / 100) * r.width - x); if (d < bd) { bd = d; best = e; } }
    if (best) choose(best);
    else { o.realPositions.jumpTo(Math.round((TL_FROM + (x / r.width) * (TL_TO - TL_FROM)) / DAY_MS) * DAY_MS + DAY_MS / 2); shownEvent = null; tlCap.textContent = ''; select.value = ''; }
  });
  function updateTimeline() {
    const ms = simMs(), x = xOf(ms);
    needle.style.left = `${Math.min(100, Math.max(0, x)).toFixed(2)}%`;
    needle.classList.toggle('out', x < 0 || x > 100);
    prevBtn.disabled = !prevEvent(); nextBtn.disabled = !nextEvent();
    if (shownEvent && Math.abs(ms - shownEvent.ms) > 2 * DAY_MS) { shownEvent = null; tlCap.textContent = ''; select.value = ''; }
  }

  // ---- motion trails -----------------------------------------------------------------------------------------------
  const TRAIL_N = 72, DOT_EVERY = 8;
  const trailRoot = new THREE.Group();
  trailRoot.name = 'MotionTrails'; trailRoot.visible = false;
  o.scene.add(trailRoot);
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const trails = [...planets, ...dwarfs].map((b) => {
    const pos = new Float32Array(TRAIL_N * 3), col = new Float32Array(TRAIL_N * 3), c = new THREE.Color(b.info.color);
    for (let i = 0; i < TRAIL_N; i++) { const f = Math.pow(1 - i / (TRAIL_N - 1), 1.3) * 0.95; col.set([c.r * f, c.g * f, c.b * f], i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const idx = []; for (let i = DOT_EVERY; i < TRAIL_N; i += DOT_EVERY) idx.push(i);
    const dpos = new Float32Array(idx.length * 3), dcol = new Float32Array(idx.length * 3);
    idx.forEach((i, k) => dcol.set(col.subarray(i * 3, i * 3 + 3).map((v) => Math.min(1, v * 1.4)), k * 3));
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dg.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    const pts = new THREE.Points(dg, new THREE.PointsMaterial({ size: isTouch ? 6 : 5, sizeAttenuation: false, map: dotTex, vertexColors: true,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = pts.frustumCulled = false;
    trailRoot.add(line, pts);
    const a = b.info.au || b.info.a;
    const period = b.info.period && !PLANET_NAMES.includes(b.name) ? b.info.period : 365.25 * Math.pow(a, 1.5);
    return { b, line, pts, pos, dpos, idx, step: period / 8 / (TRAIL_N - 1), planet: PLANET_NAMES.includes(b.name) };
  });
  const trailToggle = $('toggle-trails');
  let trailsOn = store.get('trails') === '1', trailKey = '';
  if (trailToggle) { trailToggle.checked = trailsOn; trailToggle.addEventListener('change', () => { trailsOn = trailToggle.checked; store.set('trails', trailsOn ? '1' : '0'); }); }
  function updateTrails() {
    trailRoot.visible = trailsOn && !inGal;
    if (!trailRoot.visible) return;
    const key = `${days}|${scaleDistance(1)}|${scaleDistance(30)}`;
    if (key === trailKey) return;                       // paused and same scale: nothing moved
    trailKey = key;
    for (const t of trails) {
      for (let i = 0; i < TRAIL_N; i++) {
        const d = days - i * t.step;
        if (t.planet) planetAU(t.b.name, d, _p); else keplerAU(t.b.info, d, _p);
        scaleAU(_p, scaleDistance);
        t.pos[i * 3] = _p.x; t.pos[i * 3 + 1] = _p.y; t.pos[i * 3 + 2] = _p.z;
      }
      t.idx.forEach((i, k) => { t.dpos[k * 3] = t.pos[i * 3]; t.dpos[k * 3 + 1] = t.pos[i * 3 + 1]; t.dpos[k * 3 + 2] = t.pos[i * 3 + 2]; });
      t.line.geometry.attributes.position.needsUpdate = true;
      t.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---- probes' signal delay on their labels follows Layers → Distances ---------------------------------------------
  const hudToggle = $('toggle-hud');
  const syncDelay = () => o.spacecraft?.setSignalDelay?.(hudToggle ? hudToggle.checked : true);
  hudToggle?.addEventListener('change', syncDelay);
  syncDelay();

  // ---- per frame ---------------------------------------------------------------------------------------------------
  let lastUi = 0, lastDraw = 0, lastLayout = 0;
  function update(d, cam, inGalaxy) {
    days = d; inGal = !!inGalaxy;
    updateTrails();
    skyReadout.update(d);
    if (pendingGo) { const t = pendingGo; pendingGo = null; o.search?.go(t); }
    else if (pendingCard) {                              // the probe's card once the camera has arrived at the planet
      if (performance.now() > pendingCard.until) pendingCard = null;
      else if (!o.isTransitioning?.() && !o.search?.isTripping?.()) {
        if (o.getFocused?.()?.name === pendingCard.at) o.spacecraft?.showInfo(pendingCard.name);   // not if you went elsewhere meanwhile
        pendingCard = null;
      }
    }
    const now = performance.now();
    if (now - lastUi < 120) return;
    lastUi = now;
    updateTimeline();
    const show = mapOn && !inGal && o.getMode?.() === 'solar' && !clean;
    mapBox.classList.toggle('hidden', !show);
    if (!show) return;
    if (now - lastLayout > 400) { lastLayout = now; layoutMap(); }
    if (now - lastDraw > 140) { lastDraw = now; drawMap(); }
  }

  const skyReadout = createSkyReadout({ getFocused: o.getFocused });

  return {
    update, setHelp, setClean, setMap, skyReadout, events: EVENTS, choose: (k) => EVENTS[k] && choose(EVENTS[k]),
    stats: () => ({ helpOpen, clean, mapOn, mapShown: !mapBox.classList.contains('hidden') && !mapBox.classList.contains('squeezed'), shift,
      picks: picks.map((p) => p.name), trailsOn, trails: trails.length, event: shownEvent?.date ?? null,
      events: EVENTS.length, eventsOpen: evBox.open }),
  };
}
