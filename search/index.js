// search/index.js: find any object by name and fly there, plus a grouped, filterable object list.
//
// Usage (main.js, once everything exists, before the first frame):
//   const search = createSearch({ bodies, spacecraft, comets, localGroup, galaxy, camera, controls, focusOn, flyTo, flyToFixed,
//     galaxyFly, enterGalaxy, exitGalaxy, getMode, getGalaxyFocus, isTransitioning, flyToAndromeda, flyToMilkyWay, flyToSombrero,
//     flyToSgrA, flyToTon618, flyToLocalGroup, showGalaxyInfo, scaleDistance, scene, isCompact, setPanelCollapsed,
//     releaseFocus });   releaseFocus: stop following the focused body (as goOverview does) without flying anywhere
//   galaxy spin flag: ... && !search.holdsSpin()   (keeps a searched nebula/cluster in view while you look at it)
//
// Camera moves only use main.js's own functions (no new camera code):
//   • planets, moons, dwarf planets, the Sun: focusOn(body)
//   • spacecraft and comets: flyTo(goalCam, goalTarget) with function goals, so the moving object stays tracked in flight;
//     the ISS and JWST ride along with Earth, so they use focusOn(Earth); landing sites use focusOn(Moon)
//   • galaxies: main.js's flyToAndromeda / flyToSombrero / … (entering the galaxy view first if needed);
//     nebulae and clusters: galaxyFly() stages, like the Sombrero
// Long trips across the Solar System are cinematic: the camera passes the orbits and belts in between (asteroid belt,
// Jupiter's orbit, Kuiper belt…) with temporary labels and highlight rings, ~1.5 s per landmark. A Skip button (or Esc in
// the search box) jumps straight to the destination.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const LIGHT_MIN_PER_AU = 8.317;
// landmarks a long trip can pass (heliocentric distance in AU)
const LANDMARKS = [
  { r: 0.387, name: "Mercury's orbit" }, { r: 0.723, name: "Venus's orbit" }, { r: 1.0, name: "Earth's orbit" },
  { r: 1.524, name: "Mars's orbit" }, { r: 2.7, name: 'Main asteroid belt', range: '2.2–3.3 AU', belt: [2.2, 3.3] },
  { r: 5.2, name: "Jupiter's orbit" }, { r: 9.54, name: "Saturn's orbit" }, { r: 19.2, name: "Uranus's orbit" },
  { r: 30.1, name: "Neptune's orbit" }, { r: 42, name: 'Kuiper belt', range: '30–50 AU', belt: [30, 50] },
  { r: 121.6, name: 'Heliopause: interstellar space begins', range: '~120 AU' },
];
const ALIASES = {
  Sun: ['sol', 'star'], Moon: ['luna'], 'James Webb Space Telescope': ['jwst', 'webb'], 'International Space Station': ['iss', 'space station'],
  'Parker Solar Probe': ['parker', 'psp'], "Halley's Comet": ['halley', '1p', '1p/halley'], 'Comet Hale-Bopp': ['hale bopp', 'c/1995 o1'],
  "1I/'Oumuamua": ['oumuamua', '1i', '1i oumuamua', 'a/2017 u1', '1i/2017 u1', 'interstellar'], '2I/Borisov': ['borisov', '2i', '2i borisov', 'c/2019 q4', 'interstellar'],
  '3I/ATLAS': ['3i', 'atlas', '3i atlas', 'c/2025 n1', 'interstellar'],
  'Andromeda Galaxy (M31)': ['m31', 'andromeda'], 'Sombrero Galaxy (M104)': ['m104', 'sombrero'], 'Sagittarius A*': ['sgr a*', 'sgr a', 'black hole', 'galactic center'],
  'TON 618': ['quasar', 'ton618'], 'Milky Way': ['our galaxy', 'galaxy'], 'Large Magellanic Cloud (LMC)': ['lmc', 'magellanic'],
  'Small Magellanic Cloud (SMC)': ['smc', 'magellanic'], 'Triangulum Galaxy (M33)': ['m33', 'triangulum'], 'Artemis landing area': ['artemis', 'south pole'],
};
const KIND = {
  star: { icon: '☀', tag: 'Star', color: '#ffcc55' }, planet: { icon: '●', tag: 'Planet' }, moon: { icon: '◐', tag: 'Moon' },
  dwarf: { icon: '○', tag: 'Dwarf planet' }, asteroid: { icon: '◇', tag: 'Asteroid' }, craft: { icon: '🛰', tag: 'Spacecraft' },
  site: { icon: '⚑', tag: 'Moon landing site' }, comet: { icon: '☄', tag: 'Comet' }, galaxy: { icon: '🌌', tag: 'Galaxy' },
  blackhole: { icon: '⚫', tag: 'Black hole' }, quasar: { icon: '✴', tag: 'Quasar' }, nebula: { icon: '✺', tag: 'Nebula' },
  cluster: { icon: '✧', tag: 'Star cluster' },
};
const DEEP_KIND = { nebula: ['nebula', 'Emission nebula'], snr: ['nebula', 'Supernova remnant'], open: ['cluster', 'Open star cluster'], globular: ['cluster', 'Globular cluster'] };
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9*/+]+/g, ' ').trim();
const fmtN = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function createSearch(api) {
  const { bodies, spacecraft, comets, localGroup, galaxy, camera, controls, focusOn, flyTo, flyToFixed, galaxyFly, enterGalaxy, exitGalaxy,
    getMode, getGalaxyFocus, isTransitioning, scaleDistance, scene } = api;
  const byName = (n) => bodies.find((b) => b.name === n);
  const earthB = byName('Earth'), moonB = byName('Moon');
  const entries = [];
  const add = (e) => {
    e.kindInfo = KIND[e.kind];
    e.keys = [norm(e.name), ...(e.aliases || []).map(norm)];
    entries.push(e);
    return e;
  };

  // ---- inverse of main.js's distance compression (scene units → AU), for trip planning --------------------------------
  const sceneToAU = (r) => {
    if (r <= scaleDistance(0.001)) return 0;
    let lo = 0, hi = 4000;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (scaleDistance(m) < r) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };

  // ---- entries --------------------------------------------------------------------------------------------------------
  for (const b of bodies) {
    const kind = b.name === 'Sun' ? 'star' : b.isMoon ? 'moon' : b.isSmall ? (b.name === 'Vesta' ? 'asteroid' : 'dwarf') : 'planet';
    add({ name: b.name, kind, color: b.info.color, body: b, sub: b.isMoon && b.parent ? `Moon of ${b.parent.name}` : null,
      aliases: ALIASES[b.name], go: () => goBody(b) });
  }
  const showWhenIdle = (fn) => { afterArrival = { when: () => true, run: fn }; };
  for (const it of spacecraft?.items || []) {
    const name = it.info.title || it.name;
    if (it.kind === 'site') {
      add({ name: it.name, kind: 'site', color: it.info.color, aliases: ALIASES[it.name], sub: 'On the Moon',
        go: () => goSolar(() => { focusOn(moonB); showWhenIdle(() => spacecraft.showInfo(it.name)); }, moonB.group) });
    } else if (it.name === 'International Space Station' || it.name === 'James Webb Space Telescope') {
      add({ name, kind: 'craft', color: it.info.color, aliases: ALIASES[it.name], sub: it.name === 'International Space Station' ? 'Orbiting Earth' : 'At Sun–Earth L2',
        go: () => goSolar(() => { focusOn(earthB); showWhenIdle(() => spacecraft.showInfo(it.name)); }, earthB.group) });
    } else {
      add({ name, kind: 'craft', color: it.info.color, aliases: ALIASES[it.name], track: it,
        go: () => goTracked(it, Math.max(1.4, it.size * 6), () => spacecraft.showInfo(it.name)) });
    }
  }
  for (const it of comets?.items || []) {
    add({ name: it.info.name, kind: 'comet', color: it.info.color, aliases: ALIASES[it.info.name], track: it,
      sub: it.info.hyperbolic ? 'Interstellar visitor' : null,
      go: () => goTracked(it, () => Math.max(2.5, (it.ion?.userData.pts[0].distanceTo(it.ion.userData.pts.at(-1)) || 0) * 0.9), () => comets.showInfo(it.info.name)) });
  }
  const galaxyGo = (fn) => () => {
    if (getMode() === 'solar') { endTrip(); enterGalaxy(fn); } else if (getMode() === 'galaxy') fn();
  };
  add({ name: 'Milky Way', kind: 'galaxy', color: '#b9c6ff', aliases: ALIASES['Milky Way'], sub: 'Our galaxy',
    go: galaxyGo(() => (getGalaxyFocus() === 'mw' ? api.showGalaxyInfo() : api.flyToMilkyWay())) });
  add({ name: 'Andromeda Galaxy (M31)', kind: 'galaxy', color: '#ffd9a0', aliases: ALIASES['Andromeda Galaxy (M31)'], sub: '2.5 million ly', go: galaxyGo(() => api.flyToAndromeda()) });
  add({ name: 'Sombrero Galaxy (M104)', kind: 'galaxy', color: '#ffe6b0', aliases: ALIASES['Sombrero Galaxy (M104)'], sub: '31 million ly', go: galaxyGo(() => api.flyToSombrero()) });
  add({ name: 'Sagittarius A*', kind: 'blackhole', color: '#ffb070', aliases: ALIASES['Sagittarius A*'], sub: 'Black hole at the galactic center', go: galaxyGo(() => api.flyToSgrA()) });
  add({ name: 'TON 618', kind: 'quasar', color: '#bcd0ff', aliases: ALIASES['TON 618'], sub: '10.8 billion ly', go: galaxyGo(() => api.flyToTon618()) });
  for (const key of localGroup?.keys || []) {
    const info = localGroup.info[key];
    add({ name: info.name, kind: 'galaxy', color: info.color, aliases: ALIASES[info.name], sub: info.rows[0][1], go: galaxyGo(() => api.flyToLocalGroup(key)) });
  }
  for (const o of galaxy?.deep?.objects || []) {
    const [kind, tag] = DEEP_KIND[o.kind] || ['nebula', 'Deep-sky object'];
    add({ name: o.name, kind, color: kind === 'cluster' ? '#cfe0ff' : '#ffb8d0', sub: `${tag} · ${fmtN(o.distLy)} ly`, deep: o, tag,
      go: galaxyGo(() => flyToDeep(o, tag)) });
  }

  // ---- fly-to actions -------------------------------------------------------------------------------------------------
  let afterArrival = null;      // { when(), run() }: once the camera settles (e.g. open a craft's card after focusing Earth)
  function goBody(b) {
    if (getMode() === 'galaxy') { endTrip(); exitGalaxy(() => focusOn(b)); return; }
    if (getMode() !== 'solar') return;
    trip(b.group.getWorldPosition(new THREE.Vector3()), () => focusOn(b));
  }
  function goSolar(final, group) {
    if (getMode() === 'galaxy') { endTrip(); exitGalaxy(final); return; }
    if (getMode() !== 'solar') return;
    trip(group.getWorldPosition(new THREE.Vector3()), final);
  }
  // spacecraft / comets: function goals track the moving object during the flight
  function goTracked(it, dist, onArrive) {
    const final = () => {
      const d = typeof dist === 'function' ? dist() : dist;
      const dir = it.pos.clone().normalize().add(new THREE.Vector3(0, 0.55, 0)).normalize();   // from outside, a little above
      if (it.pos.lengthSq() < 1e-6) dir.set(0, 0.5, 0.86);
      flyTo(() => it.pos.clone().addScaledVector(dir, d), () => it.pos.clone(), 1.6, onArrive);
    };
    if (getMode() === 'galaxy') { endTrip(); exitGalaxy(final); return; }
    if (getMode() !== 'solar') return;
    if (!it.active && it.active !== undefined) { onArrive(); return; }      // not launched yet / hidden: just show the card
    // stop following the focused planet/moon first: main.js's follow (and the Earth/Moon arrival drift) would pull the
    // camera back to it once this flight ends
    api.releaseFocus?.();
    trip(it.pos.clone(), final);
  }
  // nebulae and clusters ride on the turning disk: function goals in group space, and the disk holds still while you look
  let deepHold = null;
  function flyToDeep(o, tag) {
    const world = () => galaxy.group.localToWorld(o.position.clone());
    const p = world(), sun = galaxy.sunWorldPos(new THREE.Vector3());
    const dir = sun.sub(p).normalize().add(new THREE.Vector3(0, 0.6, 0)).normalize();
    // ≥ 110 units: main.js drops back to the Solar System when the Milky Way view is zoomed in closer than ~92 units
    const d = Math.max(110, (o.size || 6) * 8);
    if (getGalaxyFocus() !== 'mw') {                                  // come home to the Milky Way first, then continue
      api.flyToMilkyWay();
      afterArrival = { when: () => getMode() === 'galaxy' && getGalaxyFocus() === 'mw', run: () => flyToDeep(o, tag) };
      return;
    }
    deepHold = { world, d };
    galaxyFly(p.clone().addScaledVector(dir, d * 6), p.clone(), p.clone().addScaledVector(dir, d), p.clone(), () => showDeepInfo(o, tag));
  }
  function showDeepInfo(o, tag) {
    const $ = (id) => document.getElementById(id);
    if (!$('info-panel')) return;
    $('info-name').textContent = o.name; $('info-name').style.color = '#ffc6dc'; $('info-type').textContent = `${tag} in the Milky Way`;
    const rows = [['Distance', `~${fmtN(o.distLy)} light-years`], ['Light travel time', `${fmtN(o.distLy)} years: we see it as it was then`],
      ['Galactic position', `longitude ${o.l.toFixed(1)}°, latitude ${o.b.toFixed(1)}°`], ['Shown', 'Much larger than life, so it is visible at galaxy scale']];
    ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => { $(id + '-label').textContent = rows[k][0]; $(id).textContent = rows[k][1]; });
    $('info-fact').textContent = '💡 ' + (o.desc || '');
    $('info-panel').classList.remove('hidden'); $('info-panel').scrollTop = 0;
    document.body.classList.add('info-open');
  }
  function holdsSpin() {
    if (!deepHold || getMode() === 'solar') return false;
    if (camera.position.distanceTo(deepHold.world()) > deepHold.d * 4) { deepHold = null; return false; }
    return true;
  }

  // ---- cinematic trips across the Solar System ------------------------------------------------------------------------
  const tripRoot = new THREE.Group(); tripRoot.name = 'SearchTrip';
  scene.add(tripRoot);
  let active = null;     // { stages, i, final, extras: [{ obj, ring, t0 }] }
  const skipBtn = document.createElement('button');
  skipBtn.id = 'trip-skip'; skipBtn.className = 'hidden'; skipBtn.textContent = 'Skip ⏭';
  skipBtn.setAttribute('aria-label', 'Skip the flight and go straight there');
  document.body.appendChild(skipBtn);
  skipBtn.addEventListener('click', () => skipTrip());
  function trip(destScene, final) {
    endTrip();
    const fromScene = controls.target.clone();
    // starting from the overview (looking at the Sun) counts as starting in the inner Solar System
    const r0 = fromScene.lengthSq() > 1 ? Math.max(0.3, sceneToAU(fromScene.length())) : 1, r1 = Math.max(0.3, sceneToAU(destScene.length()));
    const lo = Math.min(r0, r1), hi = Math.max(r0, r1);
    let marks = hi / lo < 2.5 ? [] : LANDMARKS.filter((m) => m.r > lo * 1.18 && m.r < hi / 1.18);
    if (marks.length > 3) marks = [marks[0], marks[Math.floor(marks.length / 2)], marks[marks.length - 1]];
    if (r1 < r0) marks.reverse();
    if (!marks.length) { final(); return; }
    // route directions: from where we look now to the destination (sideways from the Sun if we start at the Sun)
    const d0 = fromScene.lengthSq() > 1 ? fromScene.clone().normalize() : destScene.clone().normalize();
    const d1 = destScene.lengthSq() > 1e-6 ? destScene.clone().normalize() : d0.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(d0, d1), qi = new THREE.Quaternion();
    const pts = marks.map((m, k) => {
      const f = (k + 1) / (marks.length + 1);
      const dir = d0.clone().applyQuaternion(qi.identity().slerp(q, f));
      return dir.multiplyScalar(scaleDistance(m.r));
    });
    const stages = marks.map((m, k) => {
      const at = pts[k], next = pts[k + 1] || destScene, fwd = next.clone().sub(at).normalize();
      const lift = Math.max(2.5, at.length() * 0.12);
      return { mark: m, at, cam: at.clone().addScaledVector(fwd, -lift * 1.6).add(new THREE.Vector3(0, lift, 0)), look: at.clone().lerp(next, 0.35) };
    });
    active = { stages, i: 0, final, extras: [], started: performance.now() };
    skipBtn.classList.remove('hidden');
    nextStage();
    loop();
  }
  function nextStage() {
    if (!active) return;
    if (active.i >= active.stages.length) { const f = active.final; endTrip(true); f(); return; }
    const st = active.stages[active.i++];
    showLandmark(st);
    active.stageAt = performance.now();
    flyToFixed(st.cam, st.look, 1.5, nextStage);
  }
  function showLandmark(st) {
    const m = st.mark;
    const el = document.createElement('div');
    el.className = 'label solar-label trip-label';
    el.innerHTML = `<b>${m.name}</b><span>${m.range || `${m.r} AU`} · sunlight takes ${fmtLight(m.r)}</span>`;
    const obj = new CSS2DObject(el); obj.position.copy(st.at).add(new THREE.Vector3(0, Math.max(1.2, st.at.length() * 0.04), 0));
    tripRoot.add(obj);
    // a glowing band on the orbit (the whole width of a belt), flat in the planets' plane
    const R0 = m.belt ? scaleDistance(m.belt[0]) : scaleDistance(m.r), R1 = m.belt ? scaleDistance(m.belt[1]) : R0;
    const w = Math.max(0.12, R0 * 0.012);
    const ring = new THREE.Group();
    const band = new THREE.Mesh(new THREE.RingGeometry(R0 - w, R1 + w, 192, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    band.userData.peak = m.belt ? 0.16 : 0.55;
    ring.add(band);
    tripRoot.add(ring);
    active.extras.push({ obj, el, ring, t0: performance.now() });
  }
  const fmtLight = (au) => { const m = au * LIGHT_MIN_PER_AU; return m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`; };
  function skipTrip() {
    if (!active) return;
    const f = active.final; endTrip(); f();
  }
  function endTrip(keepLabels = false) {
    skipBtn.classList.add('hidden');
    if (!active) return;
    const extras = active.extras;
    active = null;
    // fade the landmark labels/rings out over a second (or drop them now)
    const t0 = performance.now(), fade = () => {
      const k = keepLabels ? 1 - (performance.now() - t0) / 1200 : 0;
      for (const x of extras) {
        x.el.style.opacity = String(Math.max(0, k));
        x.ring.children.forEach((l) => (l.material.opacity = l.userData.peak * Math.max(0, k)));
      }
      if (k > 0) requestAnimationFrame(fade);
      else for (const x of extras) { x.obj.removeFromParent(); x.el.remove(); x.ring.children.forEach((l) => { l.geometry.dispose(); l.material.dispose(); }); x.ring.removeFromParent(); }
    };
    fade();
  }
  // fade-in of landmark rings, and a watchdog: if something else took over the camera (Esc, a tap on a planet), end the trip
  function loop() {
    if (!active) return;
    const now = performance.now();
    for (const x of active.extras) {
      const k = Math.min(1, (now - x.t0) / 500);
      x.ring.children.forEach((l) => (l.material.opacity = l.userData.peak * k));
    }
    if (!isTransitioning() && now - (active.stageAt || 0) > 150) { endTrip(true); return; }
    requestAnimationFrame(loop);
  }
  // after a focus/fly settles, open the card that was asked for (ISS/JWST/landing sites)
  (function arrivalWatch() {
    if (afterArrival && !active && !isTransitioning() && afterArrival.when()) { const f = afterArrival.run; afterArrival = null; f(); }
    requestAnimationFrame(arrivalWatch);
  })();

  // ---- search box + results ---------------------------------------------------------------------------------------------
  const navBody = document.querySelector('#nav-panel .panel-body'), list = document.getElementById('body-list');
  const wrap = document.createElement('div'); wrap.className = 'search-wrap';
  wrap.innerHTML = '<input type="search" id="search-input" placeholder="Search: planets, moons, spacecraft…" autocomplete="off" ' +
    'autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Search for an object and fly there" aria-controls="search-results" />' +
    '<div id="search-results" class="search-results hidden" role="listbox" aria-label="Search results"></div>';
  navBody?.insertBefore(wrap, list);
  const input = wrap.querySelector('input'), results = wrap.querySelector('#search-results');
  let shown = [], sel = 0;
  function score(e, q) {
    let best = 0;
    for (const k of e.keys) {
      if (k === q) best = Math.max(best, 100);
      else if (k.startsWith(q)) best = Math.max(best, 80);
      else if (k.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 60);
      else if (k.includes(q)) best = Math.max(best, 40);
    }
    if (best && (e.kind === 'planet' || e.kind === 'star')) best += 5;
    return best;
  }
  function find(text, n = 8) {
    const q = norm(text);
    if (!q) return [];
    return entries.map((e) => [score(e, q), e]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
  }
  function render() {
    results.innerHTML = '';
    results.classList.toggle('hidden', !shown.length);
    shown.forEach((e, k) => {
      const b = document.createElement('button');
      b.className = 'search-hit' + (k === sel ? ' sel' : '');
      b.setAttribute('role', 'option');
      b.innerHTML = `<span class="ico" style="color:${e.color || e.kindInfo.color || '#cfd8ee'}">${e.kindInfo.icon}</span>` +
        `<span class="nm"></span><span class="tag">${e.sub || e.kindInfo.tag}</span>`;
      b.querySelector('.nm').textContent = e.name;
      b.addEventListener('click', () => choose(e));
      results.appendChild(b);
    });
  }
  function choose(e) {
    input.value = ''; shown = []; render(); filterList('');
    input.blur();
    if (api.isCompact?.()) api.setPanelCollapsed?.('nav-panel', true);
    e.go();
  }
  input.addEventListener('input', () => { shown = find(input.value); sel = 0; render(); filterList(input.value); });
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();                                      // keep the app's single-key shortcuts (A, S, G…) out of typing
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (shown.length) { sel = (sel + (ev.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; render(); } }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (shown[sel]) choose(shown[sel]); }
    else if (ev.key === 'Escape') { input.value = ''; shown = []; render(); filterList(''); input.blur(); }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
      ev.preventDefault();
      if (document.getElementById('nav-panel')?.classList.contains('collapsed')) api.setPanelCollapsed?.('nav-panel', false);
      input.focus();
    }
  });

  // ---- grouped, filterable object list ---------------------------------------------------------------------------------
  // main.js builds the bodies list (Sun, planets with folded moons, asteroid belt, dwarf planets); we add a top header and
  // collapsible groups for spacecraft, comets, landing sites and the deep sky, and filter everything as you type.
  if (list) {
    const top = document.createElement('div'); top.className = 'list-header'; top.textContent = '☀ Sun & planets';
    list.insertBefore(top, list.firstChild);
    const groups = [
      ['craft', '🛰 Spacecraft'], ['comet', '☄ Comets'], ['site', '⚑ Moon landings'],
      [['galaxy', 'blackhole', 'quasar'], '🌌 Galaxies & black holes'], [['nebula', 'cluster'], '✺ Nebulae & star clusters'],
    ];
    for (const [kinds, title] of groups) {
      const ks = [].concat(kinds), items = entries.filter((e) => ks.includes(e.kind));
      if (!items.length) continue;
      const g = document.createElement('div'); g.className = 'list-group collapsed';
      const h = document.createElement('button'); h.className = 'list-header group-toggle'; h.setAttribute('aria-expanded', 'false');
      h.innerHTML = `<span>${title}</span><span class="n">${items.length} ▸</span>`;
      h.addEventListener('click', () => { const c = g.classList.toggle('collapsed'); h.setAttribute('aria-expanded', String(!c)); h.querySelector('.n').textContent = `${items.length} ${c ? '▸' : '▾'}`; });
      g.appendChild(h);
      for (const e of items) {
        const b = document.createElement('button'); b.className = 'small-body extra-item';
        b.innerHTML = `<span class="dot" style="background:${e.color || '#cfd8ee'}"></span><span class="nm"></span>`;
        b.querySelector('.nm').textContent = e.name;
        b.addEventListener('click', () => { if (api.isCompact?.()) api.setPanelCollapsed?.('nav-panel', true); e.go(); });
        e.listButton = b; g.appendChild(b);
      }
      list.appendChild(g);
    }
  }
  function filterList(text) {
    if (!list) return;
    const q = norm(text);
    list.classList.toggle('filtering', !!q);
    for (const e of entries) {
      const el = e.body ? e.body.button : e.listButton;
      if (!el) continue;
      const hit = !q || score(e, q) > 0;
      const row = el.parentElement?.classList.contains('list-row') ? el.parentElement : el;
      row.dataset.match = hit ? 'yes' : 'no';
      if (row !== el) el.dataset.match = row.dataset.match;
    }
  }

  return {
    entries, find, holdsSpin, skipTrip,
    go: (name) => { const e = find(name, 1)[0]; if (e) e.go(); return e?.name ?? null; },
    isTripping: () => !!active,
    stats: () => ({ entries: entries.length, trip: active ? { stage: active.i, of: active.stages.length, marks: active.stages.map((s) => s.mark.name) } : null }),
  };
}
