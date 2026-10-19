// asteroids/index.js: famous asteroids and near-Earth objects on their real orbits (elements in asteroids/data.js):
// 99942 Apophis (with its 13 Apr 2029 Earth flyby), 101955 Bennu, 162173 Ryugu, 65803 Didymos + Dimorphos, 16 Psyche,
// 433 Eros and 2024 YR4. Vesta and Ceres are main.js bodies already (smallbodies.js) and are not repeated.
//
// Hooked in by comets/index.js (no main.js changes): createComets() builds this with the same scene, bodies, renderer,
// isTouch, scaleDistance and orbitLines, calls update() every solar-view frame (passing the screen rects its own labels
// took, so labels never overlap) and rebuild() after scale/ changes the distance scale. comets.asteroids is this object;
// search/ and ui/ read its items for search, the object list, the mini-map and the Events timeline.
//
// Positions: two-body Kepler orbits (Newton on M = E − e sin E) in the heliocentric J2000-ecliptic frame, then main.js's
// radial distance compression (scaleAU), exactly like comets/index.js and the dwarf planets. Apophis switches from its
// pre-flyby to its post-flyby elements at the 2029 closest approach. Near Earth the drawn position is pushed out of
// Earth's (hugely enlarged) globe: the Earth→asteroid offset keeps its direction, but its drawn length L becomes
// L + 2R·exp(−L / 2R) (R = Earth's drawn radius), so a close pass swings around Earth instead of hiding inside it.
// The cards always show the true (unscaled) distances.
//
// Each asteroid: a small procedural mesh (asteroids/shapes.js, enlarged ~10⁵× so its shape can be seen; it spins in real
// time, slowed), a constant-size marker dot, a faint orbit line (Orbits checkbox), a label that opens its info card in
// main.js's #info-panel, and the Layers → Famous asteroids checkbox (#toggle-notable) hides them all.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scaleAU } from '../smallbodies.js';
import { planetAU } from '../ephemeris/planets.js';
import { createAsteroidMesh } from './shapes.js';
import { ASTEROIDS, APOPHIS_TCA, APOPHIS_TCA_KM } from './data.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2, AU_KM = 149597870.7, JD2000 = 2451545.0, OBLIQ = 23.4392911 * D2R;
const EARTH_R_KM = 6371;

function solveKepler(M, e) {
  M = ((M + Math.PI) % TAU + TAU) % TAU - Math.PI;
  let E = M + 0.85 * e * Math.sign(Math.sin(M) || 1);
  for (let k = 0; k < 30; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
  return E;
}
// orbital plane (x toward perihelion) → J2000 ecliptic → scene axes (x = ecl X, y = ecl Z, z = −ecl Y; as smallbodies.js)
function toScene(el, xo, yo, out) {
  const w = el.peri * D2R, O = el.node * D2R, inc = el.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const X = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const Y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const Z = (sw * si) * xo + (cw * si) * yo;
  return out.set(X, Z, -Y);
}
const posFromE = (el, E, out) => toScene(el, el.a * (Math.cos(E) - el.e), el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E), out);
export function asteroidAU(el, days, out = new THREE.Vector3()) {
  const M = (el.M + el.n * (days + JD2000 - el.epoch)) * D2R;
  return posFromE(el, solveKepler(M, el.e), out);
}
// spin pole → scene direction (RA/Dec J2000 equatorial, or ecliptic lon/lat)
function poleDir(p) {
  if (!p) return new THREE.Vector3(0, 1, 0);
  let X, Y, Z;
  if (p.ra !== undefined) {
    const a = p.ra * D2R, d = p.dec * D2R, x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
    X = x; Y = Math.cos(OBLIQ) * y + Math.sin(OBLIQ) * z; Z = -Math.sin(OBLIQ) * y + Math.cos(OBLIQ) * z;
  } else {
    const l = p.lon * D2R, b = p.lat * D2R;
    X = Math.cos(b) * Math.cos(l); Y = Math.cos(b) * Math.sin(l); Z = Math.sin(b);
  }
  return new THREE.Vector3(X, Z, -Y).normalize();
}

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAsteroids({ scene, bodies, isTouch = false, scaleDistance, orbitLines = [] }) {
  const root = new THREE.Group(); root.name = 'FamousAsteroids';
  const labelRoot = new THREE.Group(); root.add(labelRoot);
  scene.add(root);
  const glowTex = glowTexture();
  const earthB = bodies.find((b) => b.name === 'Earth');
  const ORBIT_N = isTouch ? 160 : 320;

  const toggle = document.getElementById('toggle-notable'), orbitsToggle = document.getElementById('toggle-orbits');
  let on = toggle ? toggle.checked : true;
  toggle?.addEventListener('change', () => { on = toggle.checked; });

  const elementsAt = (a, days) => (a.post && days >= a.post.from ? a.post.el : a.el);
  // Apophis: the two element sets are blended over ±1.5 days around the flyby (two-body arcs can't follow Earth's
  // pull, so at closest approach they disagree by ~0.001 AU); everywhere else one set is used as is
  const BLEND = 1.5, _p2 = new THREE.Vector3();
  function positionAU(a, days, out) {
    if (!a.post || Math.abs(days - a.post.from) >= BLEND) return asteroidAU(elementsAt(a, days), days, out);
    asteroidAU(a.el, days, out);
    return out.lerp(asteroidAU(a.post.el, days, _p2), THREE.MathUtils.smoothstep(days, a.post.from - BLEND, a.post.from + BLEND));
  }
  function orbitPointsAU(el) {
    const pts = [];
    for (let k = 0; k < ORBIT_N; k++) pts.push(posFromE(el, (k / ORBIT_N) * TAU, new THREE.Vector3()));
    return pts;
  }
  const items = ASTEROIDS.map((a, k) => {
    const it = { name: a.name, info: a, prio: 1 - k * 0.01, posAU: new THREE.Vector3(), pos: new THREE.Vector3(), r: 0, earthAU: 0,
      markerPx: isTouch ? 9 : 7, elKey: null, notable: true };
    it.size = a.moonlet ? a.size * (a.moonlet.dist + 1) : a.size;           // fly-to framing radius (Didymos: include Dimorphos)
    // orbit (redrawn when Apophis switches element sets, or the distance scale changes)
    it.orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: ORBIT_N }, () => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: a.color, transparent: true, opacity: a.kind === 'neo' ? 0.26 : 0.3, depthWrite: false }));
    it.orbitLine.frustumCulled = false;
    orbitLines.push(it.orbitLine);
    it.orbitWrap = new THREE.Group(); it.orbitWrap.add(it.orbitLine); root.add(it.orbitWrap);
    // head: marker + tilt (spin pole) → spin → rock
    it.head = new THREE.Group(); root.add(it.head);
    it.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: a.color, transparent: true, depthWrite: false, sizeAttenuation: false }));
    it.marker.renderOrder = 4;
    it.tilt = new THREE.Group();
    it.tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleDir(a.pole));
    it.spin = new THREE.Group(); it.tilt.add(it.spin);
    it.rock = createAsteroidMesh(a.shape, a.size, isTouch);
    it.spin.add(it.rock);
    if (a.tumble) it.rock.rotation.set(0.6, 0, 0.35);
    it.spinRate = Math.min(1.5, TAU / (a.spinH * 4));                      // rad per real second: real periods, sped up ×900
    if (a.moonlet) {                                                         // Dimorphos: tidally locked, in Didymos's equator
      const m = a.moonlet;
      it.moonPivot = new THREE.Group(); it.tilt.add(it.moonPivot);
      it.moonlet = createAsteroidMesh(m.shape, m.size, isTouch);
      it.moonlet.position.set(a.size * m.dist, 0, 0);
      it.moonPivot.add(it.moonlet);
      const ring = [];
      for (let i = 0; i < 64; i++) { const t = (i / 64) * TAU; ring.push(new THREE.Vector3(Math.cos(t) * a.size * m.dist, 0, Math.sin(t) * a.size * m.dist)); }
      it.moonRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring),
        new THREE.LineBasicMaterial({ color: 0xb8c4e6, transparent: true, opacity: 0.35, depthWrite: false }));
      it.tilt.add(it.moonRing);
      orbitLines.push(it.moonRing);
    }
    it.head.add(it.marker, it.tilt);
    makeLabel(it);
    return it;
  });

  function makeLabel(it) {
    const wrap = document.createElement('div'); wrap.className = 'comet-wrap';
    const el = document.createElement('div');
    el.className = 'label small solar-label ast-label' + (it.info.kind === 'neo' ? ' neo' : '');
    el.textContent = it.info.short;
    el.title = it.info.name;
    wrap.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(it); });
    it.labelObj = new CSS2DObject(wrap); it.labelObj.visible = false;
    it.labelEl = el; el._dy = null;
    labelRoot.add(it.labelObj);
  }

  // ---- info card (fills main.js's #info-panel, like comets/) ---------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  let open = null, lastRefresh = 0, follow = null;
  const fmtN = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const kmText = (km) => (km >= 1e9 ? `${fmtN(km / 1e9, 2)} billion km` : km >= 1e7 ? `${fmtN(km / 1e6)} million km` : km >= 1e6 ? `${fmtN(km / 1e6, 1)} million km` : `${fmtN(km)} km`);
  const yearsText = (d) => (d < 730 ? `${fmtN(d)} days` : `${fmtN(d / 365.25, 2)} years`);
  let days = 0;
  function liveValue(it, label) {
    const el = elementsAt(it.info, days);
    if (label === 'Distance from Sun') {
      const q = el.a * (1 - el.e), Q = el.a * (1 + el.e);
      return `${fmtN(it.r, 2)} AU (${kmText(it.r * AU_KM)}) · orbit ${fmtN(q, 2)}–${fmtN(Q, 2)} AU, one lap every ${yearsText(360 / el.n)}`;
    }
    // distance from Earth: true two-body distance (not the compressed drawing)
    const au = it.earthAU, km = au * AU_KM;
    let s = au < 0.02 ? `${kmText(km)} (${fmtN(km / 384400, 1)}× the Moon's distance)` : `${fmtN(au, 2)} AU (${kmText(km)})`;
    if (it.info.short === 'Apophis') {
      const dd = days - APOPHIS_TCA;
      if (Math.abs(dd) < 20) {
        s += ` in this two-body model. Real closest pass (JPL): 13 Apr 2029 21:46 UT${dd < 0 ? `, in ${fmtN(-dd, dd > -2 ? 1 : 0)} days` : ''}, ` +
          `${fmtN(APOPHIS_TCA_KM)} km from Earth's centre = ${fmtN(Math.round((APOPHIS_TCA_KM - EARTH_R_KM) / 100) * 100)} km above the surface, ` +
          `lower than geostationary satellites (35,786 km)`;
      } else if (dd < 0 && dd > -3650) s += ` · flyby 13 Apr 2029: 31,600 km above Earth's surface`;
    }
    return s;
  }
  function fillRows(it, liveOnly) {
    it.info.rows.forEach(([label, value], k) => {
      if (k > 3 || (liveOnly && value !== 'live')) return;
      const id = ['info-diameter', 'info-distance', 'info-period', 'info-day'][k];
      if (!liveOnly) $(id + '-label').textContent = label;
      $(id).textContent = value === 'live' ? liveValue(it, label) : value;
    });
  }
  function showInfo(it, followIt = false) {
    if (!panel) return false;
    $('info-name').textContent = it.info.name; $('info-name').style.color = it.info.color; $('info-type').textContent = it.info.type;
    $('info-phase-row')?.classList.add('hidden');
    fillRows(it, false);
    $('info-fact').textContent = '💡 ' + it.info.fact;
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const o of items) o.labelEl.classList.toggle('active', o === it);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = it; lastRefresh = performance.now();
    if (followIt) startFollow(it);
    return true;
  }
  const isOpenHere = () => open && !panel.classList.contains('hidden') && $('info-name').textContent === open.info.name;
  function release() {
    if (open) open.labelEl.classList.remove('active');
    open = null; follow = null;
    if (closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
  }
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    panel.classList.add('hidden');
    document.body.classList.remove('info-open');
    release();
  }, true);

  // ---- keep the camera with an asteroid after a fly-to (they move fast at 10 days/s). Same as main.js's planet follow:
  // shift camera and target by the asteroid's motion. Stops as soon as anything else moves the target (a pan, a fly-to,
  // a planet tap) or the card closes. Controls come from window.solar (set by main.js after start-up).
  const lastFollow = new THREE.Vector3(), lastTarget = new THREE.Vector3(), _d = new THREE.Vector3();
  function startFollow(it) {
    const controls = window.solar?.controls;
    follow = controls ? it : null;
    if (follow) { lastFollow.copy(it.pos); lastTarget.copy(controls.target); }
  }
  function applyFollow(camera) {
    const controls = window.solar?.controls;
    if (!follow || !controls) return;
    if (open !== follow || controls.target.distanceToSquared(lastTarget) > 1e-8) { follow = null; return; }
    _d.subVectors(follow.pos, lastFollow);
    camera.position.add(_d); controls.target.add(_d);
    lastFollow.copy(follow.pos); lastTarget.copy(controls.target);
  }

  // ---- per frame -------------------------------------------------------------------------------------------------------
  const occ = bodies.filter((b) => b.name === 'Sun' || (!b.isMoon && !b.isSmall)).map((b) => ({ b, c: new THREE.Vector3(), r: 0 }));
  const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3(), _eAU = new THREE.Vector3(), _rel = new THREE.Vector3();
  let time = 0;
  function occluded(p, cam) {
    _v.subVectors(p, cam);
    const L = _v.length(); _v.divideScalar(L);
    for (const o of occ) {
      _c.subVectors(o.c, cam);
      const tca = _c.dot(_v);
      if (tca <= 0) continue;
      const d2 = _c.lengthSq() - tca * tca;
      if (d2 < o.r * o.r && tca - Math.sqrt(o.r * o.r - d2) < L) return true;
    }
    return false;
  }
  function placeOrbit(it, el) {
    const pos = it.orbitLine.geometry.attributes.position;
    orbitPointsAU(el).forEach((p, i) => { scaleAU(p, scaleDistance); pos.setXYZ(i, p.x, p.y, p.z); });
    pos.needsUpdate = true;
    it.orbitLine.geometry.computeBoundingSphere();
  }
  let scaleKey = '';
  function update(d, camera, dt = 1 / 60, taken = []) {
    days = d;
    root.visible = on;
    for (const it of items) it.labelObj.visible = false;
    if (!on) { if (open && !isOpenHere()) release(); return; }
    time += dt;
    const key = `${scaleDistance(1)}|${scaleDistance(30)}`;
    if (key !== scaleKey) { scaleKey = key; for (const it of items) it.elKey = null; }   // scale slider moved: redraw orbits
    const cam = camera.position;
    const H = window.innerHeight || 800, W = window.innerWidth || 1280;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), pxPerUnit = H / (2 * tanH);
    for (const o of occ) { o.b.group.getWorldPosition(o.c); o.r = o.b.radius; }
    planetAU('Earth', d, _eAU);
    if (earthB) earthB.group.getWorldPosition(_e);
    const R2 = earthB ? earthB.radius * 2 : 0;
    const cands = [];
    for (const it of items) {
      const el = elementsAt(it.info, d);
      if (it.elKey !== el) { it.elKey = el; placeOrbit(it, el); }
      positionAU(it.info, d, it.posAU);
      it.r = it.posAU.length();
      it.earthAU = _rel.subVectors(it.posAU, _eAU).length();
      it.pos.copy(scaleAU(_v.copy(it.posAU), scaleDistance));
      if (earthB && R2 > 0) {                                     // keep it out of the enlarged Earth on a close pass
        _rel.subVectors(it.pos, _e);
        const L = _rel.length();
        if (L < R2 * 6) {
          const L2 = L + R2 * Math.exp(-L / R2);
          if (L > 1e-9) it.pos.copy(_e).addScaledVector(_rel, L2 / L);
          else it.pos.copy(_e).add(_rel.set(0, L2, 0));
        }
      }
      it.head.position.copy(it.pos);
      // spin (real time, slowed); Apophis tumbles: a second, slower wobble about another axis
      it.spin.rotation.y += dt * it.spinRate;
      if (it.info.tumble) { it.rock.rotation.x += dt * 0.07; it.rock.rotation.z += dt * 0.031; }
      if (it.moonPivot) it.moonPivot.rotation.y = time * (TAU / 14);   // one orbit per ~14 s, locked face (pivot carries it)
      const dist = Math.max(1e-6, cam.distanceTo(it.pos));
      const rockPx = (it.info.size / dist) * pxPerUnit;
      it.marker.scale.setScalar((it.markerPx * 2 * tanH) / H);
      it.marker.material.opacity = 1 - THREE.MathUtils.smoothstep(rockPx, 3, 12) * 0.85;
      it.rock.visible = rockPx > 0.6;
      if (it.moonlet) {                                              // the moonlet's orbit ring also obeys Layers → Orbits
        it.moonlet.visible = rockPx > 2;
        it.moonRing.visible = rockPx > 2 && (!orbitsToggle || orbitsToggle.checked);
      }
      if (!occluded(it.pos, cam)) cands.push(it);
    }
    placeLabels(camera, cands, W, H, taken);
    applyFollow(camera);
    if (open) {
      if (!isOpenHere()) release();
      else if (performance.now() - lastRefresh > 300) { lastRefresh = performance.now(); fillRows(open, true); }
    }
  }

  // labels: never over main.js's labels or the comet labels (taken); above the marker, else below, else hidden. On touch
  // every label has a ≥ 44 px tap area (CSS ::before, 12 px above/below, 8 px to the sides), so keep those areas apart too.
  const PX = isTouch ? 8 : 0, PY = isTouch ? 12 : 0;
  const bodyRects = [], placed = [];
  const overlaps = (r, list) => list.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  function placeLabels(camera, cands, W, H, taken) {
    bodyRects.length = 0; placed.length = 0;
    if (!cands.length) return;
    for (const b of bodies) {
      const lab = b.labelEl;
      if (!lab || !lab._obj || lab.classList.contains('overlap')) continue;
      lab._obj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, w = lab._w || lab.textContent.length * 7 + 18, h = lab._h || 20;
      bodyRects.push([cx - w / 2 - PX, cy - h / 2 - PY, cx + w / 2 + PX, cy + h / 2 + PY]);
    }
    for (const r of taken) bodyRects.push(r);
    // the open card's asteroid first, then by list order
    cands.sort((a, b) => (b === open) - (a === open) || b.prio - a.prio);
    for (const it of cands) {
      _v.copy(it.pos).project(camera);
      if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, el = it.labelEl;
      if (!el._w && el.offsetWidth) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
      const dist = Math.max(1e-6, camera.position.distanceTo(it.pos));
      const rockPx = (it.size / dist) * (H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
      const w = el._w || el.textContent.length * 6.5 + 18, h = el._h || 20, gap = Math.max(it.markerPx / 2, Math.min(rockPx, H * 0.3)) + h / 2 + 3;
      let dy = null;
      for (const off of [-gap, gap, -gap - h - 2, gap + h + 2]) {
        const r = [cx - w / 2 - 2 - PX, cy + off - h / 2 - 2 - PY, cx + w / 2 + 2 + PX, cy + off + h / 2 + 2 + PY];
        if (!overlaps(r, bodyRects) && !overlaps(r, placed)) { dy = off; placed.push(r); break; }
      }
      it.labelObj.position.copy(it.pos);
      it.labelObj.visible = dy !== null;
      if (dy !== null && el._dy !== dy) { el.style.transform = `translateY(${Math.round(dy)}px)`; el._dy = dy; }
    }
  }

  function rebuild() { for (const it of items) it.elKey = null; }

  // fly-to framing for search/: look from the sunlit side (~55° from the Sun direction, a little above), close enough
  // to see the shape; on a close pass of Earth, back off so Earth and the asteroid both fit, side by side
  const bigBodies = bodies.filter((b) => b.name !== 'Earth' && b.name !== 'Sun' && !b.isMoon && !b.isSmall);
  function framing(it) {
    const toSun = _f1.copy(it.pos).negate();
    if (toSun.lengthSq() < 1e-9) toSun.set(0, 0, 1);
    toSun.normalize();
    const side = _f2.crossVectors(toSun, _up).normalize();
    const dir = toSun.clone().multiplyScalar(Math.cos(0.95)).addScaledVector(side, Math.sin(0.95)).add(_f3.set(0, 0.35, 0)).normalize();
    let dist = Math.max(0.35, it.size * 6.5);
    const offset = new THREE.Vector3();
    if (earthB) {
      const E = earthB.group.getWorldPosition(new THREE.Vector3()), sep = E.distanceTo(it.pos), R = earthB.radius;
      if (sep < R * 8) {
        // close pass: aim at the middle of the span from the asteroid to Earth's far limb and back off until it all fits
        // (the narrower of the two field-of-view axes, with a margin for the panels). Look from across the
        // Earth–asteroid line; of 12 directions around that line, prefer the sunlit side (Earth's day side shows), a
        // little towards the asteroid (so Earth can't hide it), and none with a big planet looming right behind.
        const e = E.clone().sub(it.pos).normalize();
        offset.copy(e).multiplyScalar((sep + R) * 0.5);
        const aim = it.pos.clone().add(offset);
        const cam = window.solar?.camera, fov = THREE.MathUtils.degToRad(cam?.fov || 50), aspect = cam?.aspect || 1.6;
        const halfFov = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect));
        dist = ((sep + R) * 0.5 * 1.2 + R * 0.3) / Math.tan(halfFov) * (aspect < 1 ? 1.3 : 1);   // portrait: room for the sheet
        const p0 = toSun.clone().addScaledVector(e, -toSun.dot(e));
        if (p0.lengthSq() < 1e-6) p0.copy(side);
        p0.normalize();
        const q = new THREE.Vector3().crossVectors(e, p0).normalize();
        const cand = new THREE.Vector3(), c = new THREE.Vector3(), to = new THREE.Vector3(), toB = new THREE.Vector3(), bp = new THREE.Vector3();
        let best = -Infinity, bestK = -1;
        const proj = (cd, p, out) => {                 // where p lands on screen seen from aim + cd·dist (main.js's camera)
          _cam.copy(cam); _cam.position.copy(aim).addScaledVector(cd, dist); _cam.up.set(0, 1, 0); _cam.lookAt(aim);
          _cam.updateMatrixWorld(); return out.copy(p).project(_cam);
        };
        for (let k = 0; k < 12; k++) {
          const t = (k / 12) * TAU;
          cand.copy(p0).multiplyScalar(Math.cos(t)).addScaledVector(q, Math.sin(t)).multiplyScalar(0.9).addScaledVector(e, -0.25).add(_f3.set(0, 0.18, 0)).normalize();
          c.copy(aim).addScaledVector(cand, dist);
          to.subVectors(aim, c).normalize();
          let score = Math.cos(t) * 1.0 + cand.y * 0.3;                            // sunlit, slightly from above
          if (cam) {                // the info card sits on the right: prefer the asteroid left of (or under) Earth, not right of it;
            const pa = proj(cand, it.pos, _f4), pe = proj(cand, E, _f5);     // on a portrait iPad it is a bottom-right sheet: also
            score += THREE.MathUtils.clamp(pe.x - pa.x, -0.4, 0.4) + (aspect < 1 ? THREE.MathUtils.clamp(pa.y - pe.y, -0.4, 0.4) * 0.5 : 0);   // prefer it above
          }
          for (const b of bigBodies) {
            b.group.getWorldPosition(bp);
            toB.subVectors(bp, c); const D = toB.length(); toB.divideScalar(D);
            const ang = Math.acos(THREE.MathUtils.clamp(toB.dot(to), -1, 1)), angR = Math.asin(Math.min(1, b.radius / D));
            if (ang - angR < fov * 0.75) score -= 3 * Math.min(1, angR / 0.05);  // a planet disc in (or just outside) the view
          }
          if (score > best) { best = score; bestK = k; dir.copy(cand); }
        }
        // slide the view so the asteroid stays clear of the info card (right side; a bottom-right sheet on a portrait iPad)
        // and the mini-map (bottom right), keeping Earth's centre well inside the screen
        if (cam && bestK >= 0) {
          const pa = proj(dir, it.pos, _f4).clone(), pe = proj(dir, E, _f5).clone();
          let sx, sy = 0;
          if (aspect >= 1) {                                                        // desktop / landscape: a little left of centre
            sx = Math.min(-0.08 - (pa.x + pe.x) / 2, 0.02 - pa.x);
            sx = Math.max(sx, -0.35 - Math.min(pa.x, pe.x));
          } else {                                                                  // portrait: centred; lift it above the sheet
            sx = THREE.MathUtils.clamp(-(pa.x + pe.x) / 2, -0.3 - pe.x, 0.3 - pe.x);
            if (pa.x + sx > 0.1 && pa.y < 0.24) sy = Math.min(0.24 - pa.y, 0.45 - pe.y);
          }
          const right = _f4.setFromMatrixColumn(_cam.matrixWorld, 0).normalize(), up = _f5.setFromMatrixColumn(_cam.matrixWorld, 1).normalize();
          const tanV = Math.tan(fov / 2);
          offset.addScaledVector(right, -sx * dist * tanV * aspect).addScaledVector(up, -sy * dist * tanV);
        }
        return { dir, dist, offset };
      }
    }
    // portrait iPad: the card is a sheet over the lower half, so aim a little below the asteroid to lift it up the screen
    const cam = window.solar?.camera;
    if (cam && cam.aspect < 1) {
      _cam.copy(cam); _cam.position.copy(it.pos).addScaledVector(dir, dist); _cam.up.set(0, 1, 0); _cam.lookAt(it.pos); _cam.updateMatrixWorld();
      offset.copy(_f4.setFromMatrixColumn(_cam.matrixWorld, 1).normalize()).multiplyScalar(-0.4 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    }
    return { dir, dist, offset };
  }
  const _f1 = new THREE.Vector3(), _f2 = new THREE.Vector3(), _f3 = new THREE.Vector3(), _f4 = new THREE.Vector3(), _f5 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const _cam = new THREE.PerspectiveCamera();

  const get = (name) => items.find((i) => i.name === name || i.info.short === name);
  return {
    group: root, items, update, rebuild, get, elementsAt, asteroidAU, positionAU, framing,
    showInfo: (name, followIt = false) => { const it = get(name); return it ? showInfo(it, followIt) : false; },
    isOn: () => on,
    stats: () => ({ on, open: open && open.info.short, following: follow && follow.info.short,
      asteroids: items.map((i) => ({ name: i.info.short, r: +i.r.toFixed(4), earthAU: +i.earthAU.toFixed(6), label: i.labelObj.visible,
        pos: i.pos.toArray().map((x) => +x.toFixed(3)) })) }),
  };
}
