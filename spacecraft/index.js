// spacecraft/index.js: Voyager 1 & 2, New Horizons, Parker Solar Probe, JWST and the ISS at approximate real positions
// for the sim date, plus the crewed Apollo landing sites and the planned Artemis south-pole landing area on the Moon.
//
// Usage (main.js):
//   import { createSpacecraft } from './spacecraft/index.js';
//   const spacecraft = createSpacecraft({ scene, bodies, renderer, isTouch, scaleDistance, orbitLines });
//   ...each solar-view frame: spacecraft.update(daysSinceJ2000, camera, dt);
//
// Every object has a label (tap it for an info card with real facts) and sits under a Layers toggle:
// #toggle-spacecraft (probes, JWST, ISS and their paths) and #toggle-landings (landing sites). Paths and orbits are
// also pushed into main.js's orbitLines, so the Orbits checkbox hides them too.
//
// Positions (AU, heliocentric ecliptic, then main.js's radial distance compression via scaleAU):
//   • Voyager 1 & 2, New Horizons: launch → each flyby (on main.js's own planet at that date) → a straight coast to the
//     measured mid-2026 position (data.js), then onward at today's speed. Their past path is drawn as a trail.
//   • Parker Solar Probe: Kepler orbit (its final 88-day orbit), same keplerAU() as the dwarf planets.
//   • JWST: Sun–Earth L2 (beyond Earth on the Sun–Earth line) plus a 6-month halo loop; drawn just outside the Moon's orbit.
//   • ISS: body.earth.latLonToWorld(lat, lon, 1500 km), an inclined orbit that follows Earth's tilt and spin.
//   • Landing sites: body.moon.latLonToWorld(lat, lon, 0) every frame (follows tidal lock, libration, size easing).
// Labels: placed after main.js's own labels (they never cover a planet's label), hidden behind the Sun/planets/Moon, on the
// Moon's far side, or when overlapping each other. ISS/JWST markers only show near Earth, landing sites only near the Moon.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { keplerAU, scaleAU, orbitPoints, SMALL_BODIES } from '../smallbodies.js';
import { PROBES, PARKER, JWST, ISS, SITES, EPOCH, KMS_TO_AU_YR, day } from './data.js';
import { MODELS } from './models.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const OBLIQUITY = 23.4393 * D2R;
const AU_KM = 149597870.7, LIGHT_SEC_PER_AU = 499.005, GM_SUN = 1.32712440018e11;   // km³/s²
const EARTH_R_KM = 6371;
const ISS_SLOW = 300;            // ISS laps shown 300× slower (one lap every ~1.9 s at the default 10 days/s)
const ISS_MAX_LAP_PER_SEC = 1 / 1.5;   // ...but never more than one lap per 1.5 s of real time at high time-warp
const JWST_L2 = 1.07;            // JWST drawn this many Moon-orbit radii from Earth (really ~4×, which would sit past Mars)
const JWST_HALO = [0.6, 0.4];    // halo loop half-widths (scene units): along Earth's motion, out of the ecliptic
const SITE_MIN_PX = 110;         // landing sites appear once the Moon's disc radius is at least this many CSS px
const TRAIL_END = day(2150, 1, 1);

const UP = new THREE.Vector3(0, 1, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), NEG_Y = new THREE.Vector3(0, -1, 0);
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function raDecToScene(raH, decDeg) {
  // equatorial → ecliptic → scene axes (x = ecliptic X, y = ecliptic north, z = −ecliptic Y; see smallbodies.js)
  const a = raH * 15 * D2R, d = decDeg * D2R;
  const xq = Math.cos(d) * Math.cos(a), yq = Math.cos(d) * Math.sin(a), zq = Math.sin(d);
  const X = xq, Y = yq * Math.cos(OBLIQUITY) + zq * Math.sin(OBLIQUITY), Z = -yq * Math.sin(OBLIQUITY) + zq * Math.cos(OBLIQUITY);
  return new THREE.Vector3(X, Z, -Y);
}

function canvasTexture(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dotTexture = () => canvasTexture((g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.28, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const ringTexture = () => canvasTexture((g) => {
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7;
  g.beginPath(); g.arc(32, 32, 22, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(32, 32, 7, 0, TAU); g.fill();
});

export function createSpacecraft({ scene, bodies, renderer, isTouch = false, scaleDistance, orbitLines = [] }) {
  const byName = (n) => bodies.find((b) => b.name === n);
  const earthB = byName('Earth'), moonB = byName('Moon');
  const planets = bodies.filter((b) => b.info && b.info.L0 !== undefined && !b.isMoon && !b.isSmall);
  const occluderBodies = [byName('Sun'), ...planets, moonB].filter(Boolean);
  const pluto = SMALL_BODIES.find((b) => b.name === 'Pluto');

  // heliocentric AU position of a planet with main.js's own model (circular orbit at the mean longitude), Pluto via Kepler
  function planetAU(name, t, out) {
    if (name === 'Pluto') return keplerAU(pluto, t, out);
    const p = planets.find((b) => b.name === name).info;
    const L = p.L0 * D2R + (t / p.period) * TAU;
    return out.set(Math.cos(L) * p.au, 0, -Math.sin(L) * p.au);
  }

  const root = new THREE.Group(); root.name = 'Spacecraft';
  const craftGroup = new THREE.Group(), sitesGroup = new THREE.Group(), labelRoot = new THREE.Group();
  root.add(craftGroup, sitesGroup, labelRoot);
  scene.add(root);
  const dotTex = dotTexture(), ringTex = ringTexture();

  // ---- Layers toggles -------------------------------------------------------------------------------------------
  const tCraft = document.getElementById('toggle-spacecraft'), tSites = document.getElementById('toggle-landings');
  let craftOn = tCraft ? tCraft.checked : true, sitesOn = tSites ? tSites.checked : true;
  tCraft?.addEventListener('change', () => { craftOn = tCraft.checked; });
  tSites?.addEventListener('change', () => { sitesOn = tSites.checked; });

  // ---- shared helpers ---------------------------------------------------------------------------------------------
  function makeLine(points, color, opacity, loop = false) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new (loop ? THREE.LineLoop : THREE.Line)(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    orbitLines.push(line);           // the Orbits checkbox toggles line.visible; our wrapper group handles launch dates + Layers
    return line;
  }
  function makeLabel(text, cls, item) {
    const wrap = document.createElement('div'); wrap.className = 'sc-wrap';
    const el = document.createElement('div');
    el.className = `label small solar-label sc-label ${cls}`;
    el.textContent = text;
    el.title = item.info.title || item.info.name;
    wrap.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(item); });
    const obj = new CSS2DObject(wrap);
    obj.visible = false;
    labelRoot.add(obj);
    item.labelObj = obj; item.labelEl = el; el._dy = null;
  }
  function makeSprite(tex, color, parent) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, sizeAttenuation: false }));
    s.renderOrder = 2;
    parent.add(s);
    return s;
  }

  const items = [];
  function addCraft(info, modelName, size, opts) {
    const obj = new THREE.Group(); obj.name = info.name; obj.visible = false;
    const built = MODELS[modelName]();
    built.group.scale.setScalar(size / built.ref);
    obj.add(built.group);
    craftGroup.add(obj);
    const item = { kind: 'craft', name: info.name, info, obj, model: built.group, size, pos: new THREE.Vector3(), active: false,
      sprite: makeSprite(dotTex, info.color, obj), markerPx: isTouch ? 11 : 9,
      labelMaxDist: Infinity, markerMaxDist: Infinity, prio: 10, ...opts };
    makeLabel(info.short || info.name, 'craft', item);
    items.push(item);
    return item;
  }

  // ---- escaping probes --------------------------------------------------------------------------------------------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function buildTrack(pr) {
    const pts = [{ t: pr.launch, p: planetAU('Earth', pr.launch, new THREE.Vector3()) }];
    for (const [planet, t] of pr.flybys) pts.push({ t, p: planetAU(planet, t, new THREE.Vector3()), arc: true });
    const last = pts[pts.length - 1];
    const end = { t: EPOCH, p: raDecToScene(pr.raH, pr.decDeg).multiplyScalar(pr.epochAU), arc: false };   // straight coast
    pts.push(end);
    const vel = end.p.clone().sub(last.p).normalize().multiplyScalar(pr.speedKms * KMS_TO_AU_YR / 365.25);   // AU/day after EPOCH
    return { pts, vel, lastFlyby: last.t };
  }
  function trackAU(track, t, out) {
    const { pts, vel } = track, n = pts.length;
    if (t < pts[0].t) return null;
    if (t >= pts[n - 1].t) return out.copy(pts[n - 1].p).addScaledVector(vel, t - pts[n - 1].t);
    let i = 0;
    while (t >= pts[i + 1].t) i++;
    const a = pts[i], b = pts[i + 1], f = (t - a.t) / (b.t - a.t);
    if (!b.arc) return out.lerpVectors(a.p, b.p, f);
    // planet-to-planet legs: radius, ecliptic longitude (always prograde) and latitude change smoothly with time
    const ra = a.p.length(), rb = b.p.length();
    const la = Math.atan2(-a.p.z, a.p.x), lb = Math.atan2(-b.p.z, b.p.x);
    const dl = (((lb - la) % TAU) + TAU) % TAU;
    const ba = Math.asin(a.p.y / ra), bb = Math.asin(b.p.y / rb);
    const r = ra + (rb - ra) * f, L = la + dl * f, B = ba + (bb - ba) * f;
    return out.set(r * Math.cos(B) * Math.cos(L), r * Math.sin(B), -r * Math.cos(B) * Math.sin(L));
  }
  const auToScene = (v) => scaleAU(v, scaleDistance);

  for (const pr of PROBES) {
    const item = addCraft(pr, pr.name === 'New Horizons' ? 'newHorizons' : 'voyager', 0.3, { prio: 10 - items.length });
    item.track = buildTrack(pr);
    item.posAU = new THREE.Vector3();
    // trail: past path from launch (dense through the flybys), drawn up to the current date; a 2-point tip joins the last
    // sample to the probe so the trail never lags
    const ts = [];
    for (let t = pr.launch; t < item.track.lastFlyby + 400; t += 8) ts.push(t);
    for (let t = item.track.lastFlyby + 400; t < TRAIL_END; t += 60) ts.push(t);
    const pts = ts.map((t) => auToScene(trackAU(item.track, t, new THREE.Vector3())));
    item.trailTimes = ts;
    item.trailWrap = new THREE.Group();
    item.trail = makeLine(pts, pr.color, 0.32);
    item.trail.geometry.setDrawRange(0, 0);
    item.tip = makeLine([pts[0], pts[0].clone()], pr.color, 0.32);
    item.trailWrap.add(item.trail, item.tip);
    craftGroup.add(item.trailWrap);
    item.place = (t) => {
      if (!trackAU(item.track, t, item.posAU)) return false;
      item.pos.copy(auToScene(_a.copy(item.posAU)));
      return true;
    };
  }

  // ---- Parker Solar Probe -----------------------------------------------------------------------------------------
  const parker = addCraft(PARKER, 'parker', 0.24, { prio: 6 });
  parker.posAU = new THREE.Vector3();
  parker.trailWrap = new THREE.Group();
  parker.trailWrap.add(makeLine(orbitPoints(PARKER.el, scaleDistance, 256), PARKER.color, 0.35, true));
  craftGroup.add(parker.trailWrap);
  parker.place = (t) => {
    if (t < PARKER.launch) return false;
    keplerAU(PARKER.el, t, parker.posAU);
    parker.pos.copy(auToScene(_a.copy(parker.posAU)));
    return true;
  };

  // ---- JWST at L2 ---------------------------------------------------------------------------------------------------
  const jwst = addCraft(JWST, 'jwst', 0.22, { prio: 7, labelMaxDist: 45, markerMaxDist: 80 });
  const _e = new THREE.Vector3(), _ur = new THREE.Vector3(), _ut = new THREE.Vector3(), _l2 = new THREE.Vector3();
  const halo = new THREE.Group();
  {
    const pts = [];
    for (let i = 0; i < 96; i++) pts.push(new THREE.Vector3(Math.cos(i / 96 * TAU), Math.sin(i / 96 * TAU), 0));
    halo.add(makeLine(pts, JWST.color, 0.3, true));
    halo.scale.set(JWST_HALO[0], JWST_HALO[1], 1);
    craftGroup.add(halo);
    jwst.trailWrap = halo;
  }
  const _basis = new THREE.Matrix4();
  jwst.place = (t) => {
    if (t < JWST.launch) return false;
    earthB.group.getWorldPosition(_e);
    _ur.copy(_e).normalize();                       // Sun → Earth
    _ut.crossVectors(UP, _ur);                      // direction of Earth's orbital motion
    _l2.copy(_e).addScaledVector(_ur, (moonB ? moonB.orbitDist : 3.2) * JWST_L2);
    const phi = ((t - JWST.arrive) / JWST.haloPeriod) * TAU;
    jwst.pos.copy(_l2).addScaledVector(_ut, JWST_HALO[0] * Math.cos(phi)).addScaledVector(UP, JWST_HALO[1] * Math.sin(phi));
    if (t < JWST.arrive) {                          // the month-long cruise out from Earth
      const f = smooth((t - JWST.launch) / (JWST.arrive - JWST.launch), 0, 1);
      _b.copy(_e).addScaledVector(_ur, earthB.radius * 1.1);
      jwst.pos.lerpVectors(_b, jwst.pos, f);
    }
    halo.position.copy(_l2);
    halo.quaternion.setFromRotationMatrix(_basis.makeBasis(_ut, UP, _ur));
    halo.visible = t >= JWST.arrive;
    return true;
  };

  // ---- ISS --------------------------------------------------------------------------------------------------------
  const iss = addCraft(ISS, 'iss', 0.1, { prio: 5, labelMaxDist: 12, markerMaxDist: 25 });
  const issIncl = ISS.inclination * D2R, issNode = 1.2;   // node: any fixed direction (the real one precesses ~5°/day)
  const issPeriodDays = ISS.periodMin / 1440;
  let issU = 0, issLastDays = null;
  const issR = earthB.radius * (1 + ISS.shownAltKm / EARTH_R_KM);
  // orbit ring in Earth's tilted (non-spinning) frame: x = −cos α, z = sin α matches latLonToWorld's longitude convention
  const issRA = (u) => issNode + Math.atan2(Math.cos(issIncl) * Math.sin(u), Math.cos(u));
  const issLat = (u) => Math.asin(Math.sin(issIncl) * Math.sin(u));
  {
    const pts = [];
    for (let i = 0; i < 128; i++) {
      const u = (i / 128) * TAU, a = issRA(u), lat = issLat(u);
      pts.push(new THREE.Vector3(-Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)).multiplyScalar(issR));
    }
    iss.trailWrap = new THREE.Group();
    iss.trailWrap.add(makeLine(pts, ISS.color, 0.28, true));
    earthB.tiltGroup.add(iss.trailWrap);
  }
  const issLatLon = (u, out) => {
    // inertial orbit → Earth-fixed lat/lon: subtract the drawn Earth's spin (main.js sets mesh.rotation.y)
    let lon = issRA(u) - Math.PI - earthB.mesh.rotation.y;
    lon = (((lon + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    out.lat = issLat(u) / D2R; out.lon = lon / D2R;
    return out;
  };
  const _ll = { lat: 0, lon: 0 }, _p2 = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
  iss.place = (t, dt) => {
    if (t < ISS.launch || !earthB.earth) return false;
    if (issLastDays === null) issLastDays = t;
    const cap = TAU * ISS_MAX_LAP_PER_SEC * dt;
    const du = Math.max(-cap, Math.min(cap, ((t - issLastDays) / (issPeriodDays * ISS_SLOW)) * TAU));
    issLastDays = t;
    issU = (issU + du) % TAU;
    issLatLon(issU, _ll);
    earthB.earth.latLonToWorld(_ll.lat, _ll.lon, ISS.shownAltKm, iss.pos);
    issLatLon(issU + 0.02, _ll);
    earthB.earth.latLonToWorld(_ll.lat, _ll.lon, ISS.shownAltKm, _p2);
    earthB.group.getWorldPosition(_e);
    _by.subVectors(iss.pos, _e).normalize();                                    // up
    _bz.subVectors(_p2, iss.pos); _bz.addScaledVector(_by, -_bz.dot(_by)).normalize();   // direction of flight
    _bx.crossVectors(_by, _bz);
    iss.model.quaternion.setFromRotationMatrix(_basis.makeBasis(_bx, _by, _bz));
    return true;
  };

  // ---- Moon landing sites ------------------------------------------------------------------------------------------
  SITES.forEach((s, k) => {
    const obj = new THREE.Group(); obj.name = s.name; obj.visible = false;
    sitesGroup.add(obj);
    const item = { kind: 'site', name: s.name, info: { ...s, color: s.artemis ? '#cdb8ff' : '#ffe2a8',
      type: s.artemis ? 'Planned crewed landing region' : 'Crewed Moon landing site' },
      obj, pos: new THREE.Vector3(), active: false, prio: 4 - k * 0.1, markerPx: s.artemis ? 13 : 11 };
    item.sprite = makeSprite(ringTex, s.artemis ? 0xc9b2ff : 0xffe2a8, obj);
    item.sprite.material.depthTest = false;      // sites sit on the surface; the far side is culled by a hemisphere test
    makeLabel(s.label || s.name, s.artemis ? 'site artemis' : 'site', item);
    items.push(item);
  });
  const sites = items.filter((i) => i.kind === 'site'), crafts = items.filter((i) => i.kind === 'craft');

  // ---- orientation of the deep-space craft ---------------------------------------------------------------------------
  const _dir = new THREE.Vector3();
  function orient(item) {
    if (item === iss) return;
    if (item === parker) item.model.quaternion.setFromUnitVectors(Y_AXIS, _dir.copy(item.pos).negate().normalize());   // shield → Sun
    else if (item === jwst) item.model.quaternion.setFromUnitVectors(NEG_Y, _dir.copy(item.pos).negate().normalize()); // sunshield → Sun
    else item.model.quaternion.setFromUnitVectors(Y_AXIS, _dir.subVectors(_e, item.pos).normalize());                  // dish → Earth
  }

  // ---- info card (fills main.js's #info-panel, like sgra.js) -------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  let open = null, openTitle = '', lastRefresh = 0, nowDays = 0;
  const fmtN = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  function liveValue(item, label, t) {
    if (item === parker) {
      const r = parker.posAU.length(), rKm = r * AU_KM, aKm = PARKER.el.a * AU_KM;
      if (label === 'Distance from Sun') return `${fmtN(rKm / 1e6, 1)} million km (${r.toFixed(3)} AU)`;
      const v = Math.sqrt(GM_SUN * (2 / rKm - 1 / aKm));
      const toPeri = ((((-(t - day(2026, 9, 4, 14, 53)) / PARKER.el.period) % 1) + 1) % 1) * PARKER.el.period;
      return `${fmtN(v)} km/s (${fmtN(Math.round(v * 3600 / 1000) * 1000)} km/h) · next closest pass in ${toPeri < 1.5 ? `${fmtN(toPeri * 24)} h` : `${fmtN(toPeri)} days`}`;
    }
    const r = item.posAU.length();
    if (label === 'Distance from Sun') return `${r.toFixed(1)} AU (${fmtN(r * AU_KM / 1e9, 1)} billion km)`;
    const fromEarth = _b.copy(item.posAU).sub(planetAU('Earth', t, _a)).length();
    const s = fromEarth * LIGHT_SEC_PER_AU, h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60);
    return `${h} h ${m} min one way (${fmtN(fromEarth, 1)} AU from Earth)`;
  }
  function fillRows(item, t, liveOnly) {
    item.info.rows.forEach(([label, value], k) => {
      if (k > 3 || (liveOnly && value !== 'live')) return;
      const id = ['info-diameter', 'info-distance', 'info-period', 'info-day'][k];
      if (!liveOnly) $(id + '-label').textContent = label;
      $(id).textContent = value === 'live' ? liveValue(item, label, t) : value;
    });
  }
  function showInfo(item) {
    if (!panel) return false;
    const i = item.info;
    openTitle = i.title || i.name;
    $('info-name').textContent = openTitle; $('info-name').style.color = i.color; $('info-type').textContent = i.type;
    fillRows(item, nowDays, false);
    $('info-fact').textContent = '💡 ' + i.fact;
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const o of items) o.labelEl.classList.toggle('active', o === item);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = item; lastRefresh = performance.now();
    return true;
  }
  const isOpenHere = () => open && !panel.classList.contains('hidden') && $('info-name').textContent === openTitle;
  function release() {           // our card was closed or replaced (e.g. a planet was tapped): restore the close button
    if (open) open.labelEl.classList.remove('active');
    open = null;
    if (closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
  }
  // ✕ on a spacecraft/landing-site card just closes the card (main.js's ✕ handler would fly back to the overview).
  // Capture phase on the panel runs before the button's own listener.
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    panel.classList.add('hidden');
    document.body.classList.remove('info-open');
    release();
  }, true);

  // ---- per-frame update ----------------------------------------------------------------------------------------------
  const _v = new THREE.Vector3(), _m = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
  const occ = occluderBodies.map((b) => ({ b, c: new THREE.Vector3(), r: 0 }));
  const bodyRects = [], placed = [], cands = [];
  function occluded(p, cam, skip) {
    _v.subVectors(p, cam);
    const L = _v.length(); _v.divideScalar(L);
    for (const o of occ) {
      if (o.b === skip) continue;
      _c.subVectors(o.c, cam);
      const tca = _c.dot(_v);
      if (tca <= 0) continue;
      const d2 = _c.lengthSq() - tca * tca;
      if (d2 >= o.r * o.r) continue;
      if (tca - Math.sqrt(o.r * o.r - d2) < L) return true;
    }
    return false;
  }
  const overlaps = (r, list) => list.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);

  function update(days, camera, dt = 1 / 60) {
    nowDays = days;
    const W = renderer.domElement.clientWidth || window.innerWidth, H = renderer.domElement.clientHeight || window.innerHeight;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), pxPerUnit = H / (2 * tanH);
    const spriteK = 2 * tanH / H;                // sizeAttenuation:false sprite scale per CSS px
    const cam = camera.position;
    for (const o of occ) { o.b.group.getWorldPosition(o.c); o.r = o.b.radius; }
    earthB.group.getWorldPosition(_e);
    cands.length = 0;

    // spacecraft
    craftGroup.visible = craftOn;
    for (const it of crafts) {
      it.active = craftOn && it.place(days, dt);
      it.obj.visible = it.active;
      if (it.trailWrap && it !== jwst) it.trailWrap.visible = it.active;
      if (it === jwst && !it.active) halo.visible = false;
      if (!it.active) { it.labelObj.visible = false; continue; }
      it.obj.position.copy(it.pos);
      orient(it);
      const dist = cam.distanceTo(it.pos), px = it.size / dist * pxPerUnit;
      it.model.visible = px > 1.2;
      const fade = 1 - smooth(px, it.markerPx * 0.6, it.markerPx * 1.6);
      it.sprite.visible = fade > 0.02 && dist < it.markerMaxDist;
      it.sprite.material.opacity = fade;
      it.sprite.scale.setScalar(it.markerPx * spriteK);
      if (it.trail) {                              // probe trail up to today
        const ts = it.trailTimes;
        let lo = 0, hi = ts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ts[mid] <= days) lo = mid; else hi = mid - 1; }
        it.trail.geometry.setDrawRange(0, lo + 1);
        const tp = it.tip.geometry.attributes.position, src = it.trail.geometry.attributes.position;
        tp.setXYZ(0, src.getX(lo), src.getY(lo), src.getZ(lo)); tp.setXYZ(1, it.pos.x, it.pos.y, it.pos.z);
        tp.needsUpdate = true;
        it.tip.geometry.computeBoundingSphere();
      }
      if (dist < it.labelMaxDist && !occluded(it.pos, cam, null)) cands.push(it);
      else it.labelObj.visible = false;
    }
    if (iss.active) iss.trailWrap.visible = cam.distanceTo(_e) < iss.labelMaxDist * 2.5;   // ISS ring only near Earth

    // landing sites (only when the Moon is big on screen)
    const moon = moonB && moonB.moon;
    let moonPx = 0;
    if (moon) { moonB.group.getWorldPosition(_m); moonPx = moonB.radius / cam.distanceTo(_m) * pxPerUnit; }
    const showSites = sitesOn && moon && moonPx > SITE_MIN_PX;
    sitesGroup.visible = !!showSites;
    for (const s of sites) {
      s.active = false;
      if (showSites) {
        moon.latLonToWorld(s.info.lat, s.info.lon, 0, s.pos);
        _n.subVectors(s.pos, _m).normalize();
        _v.subVectors(cam, s.pos).normalize();
        s.active = _n.dot(_v) > 0.12 && !occluded(s.pos, cam, moonB);     // near side of the Moon as seen from the camera
      }
      s.obj.visible = s.active;
      if (!s.active) { s.labelObj.visible = false; continue; }
      s.obj.position.copy(s.pos);
      s.sprite.scale.setScalar(s.markerPx * spriteK);
      s.sprite.material.opacity = smooth(moonPx, SITE_MIN_PX, SITE_MIN_PX * 1.4);
      cands.push(s);
    }

    placeLabels(camera, W, H);

    if (open) {
      if (!isOpenHere()) release();
      else if (performance.now() - lastRefresh > 300) { lastRefresh = performance.now(); fillRows(open, days, true); }
    }
  }

  // Labels: never on top of main.js's planet/moon labels; among ours, higher priority first; a label that would overlap is
  // nudged below its marker, then higher up, else hidden. Uses projected positions and cached sizes (no per-frame layout).
  function placeLabels(camera, W, H) {
    bodyRects.length = 0; placed.length = 0;
    if (cands.length) {
      for (const b of bodies) {
        const lab = b.labelEl;
        if (!lab || !lab._obj || lab.classList.contains('overlap')) continue;
        lab._obj.getWorldPosition(_v).project(camera);
        if (_v.z > 1 || _v.z < -1) continue;
        const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H;
        const w = lab._w || lab.textContent.length * 7 + 18, h = lab._h || 20;
        bodyRects.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
      }
    }
    cands.sort((a, b) => b.prio - a.prio);
    for (const it of cands) {
      _v.copy(it.pos).project(camera);
      if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { it.labelObj.visible = false; continue; }
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H;
      const el = it.labelEl;
      const w = el._w || el.textContent.length * 6.5 + 18, h = el._h || 20;
      const gap = it.markerPx / 2 + h / 2 + 3;
      let dy = null;
      for (const off of [-gap, gap, -gap - h - 2, gap + h + 2]) {
        const r = [cx - w / 2 - 2, cy + off - h / 2 - 2, cx + w / 2 + 2, cy + off + h / 2 + 2];
        if (!overlaps(r, bodyRects) && !overlaps(r, placed)) { dy = off; placed.push(r); break; }
      }
      it.labelObj.position.copy(it.pos);
      it.labelObj.visible = dy !== null;
      if (dy !== null && el._dy !== dy) { el.style.transform = `translateY(${Math.round(dy)}px)`; el._dy = dy; }
    }
  }
  // measure each label once, the first time it is on screen (cheap estimates are used until then)
  const measure = () => {
    for (const it of items) if (!it.labelEl._w && it.labelObj.visible && it.labelEl.offsetWidth) {
      it.labelEl._w = it.labelEl.offsetWidth; it.labelEl._h = it.labelEl.offsetHeight;
    }
    setTimeout(measure, 1000);
  };
  setTimeout(measure, 500);

  return {
    group: root, items, update,
    showInfo: (name) => { const it = items.find((i) => i.name === name || i.info.short === name); return it ? showInfo(it) : false; },
    get: (name) => items.find((i) => i.name === name || i.info.short === name),
    stats: () => ({ craftOn, sitesOn, active: items.filter((i) => i.active).map((i) => i.name),
      labels: items.filter((i) => i.labelObj.visible).map((i) => i.name), open: open && open.name }),
  };
}
