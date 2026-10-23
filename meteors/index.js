// meteors/: the major annual meteor showers, tied to the comets and asteroids that shed them (data and sources: meteors/data.js).
//
// Usage (main.js):
//   import { createMeteors } from './meteors/index.js';
//   const meteors = createMeteors({ scene, bodies, isTouch: IS_TOUCH, scaleDistance });
//   ...each solar-view frame: meteors.update(days, camera, dt);
//
// What is drawn:
//   • Debris streams: one faint particle ribbon per shower along its parent's orbit (JPL elements), thicker near the point
//     where Earth runs through it. Real streams are spread out and the parents' orbits pass up to ~0.1 AU from Earth's,
//     so near that point the drawn stream is eased onto Earth's position on the peak date (λ☉): the highlighted
//     crossing marker sits on Earth's orbit exactly where the sim's Earth is when the shower peaks.
//     All streams are one Points draw (6,600 points on desktop, 2,860 on touch); per-stream brightness is a uniform, and on
//     desktop the cloud is big enough for perf/'s frame-rate guard to thin it like the belts.
//   • While the sim date is inside a shower's IMO activity dates: a radiant marker on the sky (RA/Dec → scene with
//     constellations/' raDecToScene, at "infinity" like the star sphere) and meteor streaks falling on Earth from the
//     radiant's direction. The rate scales with the shower's ZHR and how close the date is to the peak. Streaks are drawn
//     around the enlarged globe so they can be seen (real meteors burn up 80–120 km high).
//   • A label at each crossing (tap/click for the card), a card row of buttons (parent comet, radiant constellation), and a
//     "meteor shower" button row on the parent comets' own cards.
// The #toggle-meteors Layers checkbox hides it all.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scaleAU } from '../smallbodies.js';
import { planetAU } from '../ephemeris/planets.js';
import { raDecToScene } from '../constellations/index.js';
import { SHOWERS, sunLongitude, daysAtLongitude, daysOf } from './data.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const J2000 = Date.UTC(2000, 0, 1, 12), DAY_MS = 86400000;
const OBL = 23.44 * D2R;
const BOISE_LAT = 43.6, BOISE_LON = -116.2;
const ORBIT_N = 720;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toScene(c, xo, yo, out) {          // orbital plane → J2000 ecliptic → scene axes (as comets/ and smallbodies.js)
  const w = c.peri * D2R, O = c.node * D2R, inc = c.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const X = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const Y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const Z = (sw * si) * xo + (cw * si) * yo;
  return out.set(X, Z, -Y);
}
const posFromE = (c, E, out) => toScene(c, c.a * (Math.cos(E) - c.e), c.a * Math.sqrt(1 - c.e * c.e) * Math.sin(E), out);

function canvasTexture(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = () => canvasTexture(64, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});
// radiant: a small starburst, rays pointing outward the way the meteors seem to fly
const radiantTex = () => canvasTexture(128, (g, n) => {
  const c = n / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.35);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, r0 = c * 0.28, r1 = c * (k % 2 ? 0.7 : 0.95);
    g.lineWidth = k % 2 ? 2 : 3;
    g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke();
  }
});

const STREAM_VERT = /* glsl */`
  attribute float aStream; attribute float aB; attribute vec3 color;
  uniform float uBoost[${SHOWERS.length}]; uniform float uPx;
  varying vec3 vC; varying float vA;
  void main() {
    float b = uBoost[int(aStream + 0.5)];
    vA = aB * b; vC = color;
    gl_PointSize = uPx * (0.7 + 1.1 * b);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const STREAM_FRAG = /* glsl */`
  varying vec3 vC; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = vA * (1.0 - smoothstep(0.2, 1.0, d));
    if (a < 0.003) discard;
    gl_FragColor = vec4(vC * a, a);
  }`;

export function createMeteors({ scene, bodies, isTouch = false, scaleDistance }) {
  const root = new THREE.Group(); root.name = 'MeteorShowers';
  scene.add(root);
  const earthB = bodies.find((b) => b.name === 'Earth');
  const toggle = document.getElementById('toggle-meteors');
  let on = toggle ? toggle.checked : true;
  toggle?.addEventListener('change', () => { on = toggle.checked; if (!on) release(true); });

  // seeded random so the streams look the same on every load
  let seed = 20261023;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;

  // ---- items: crossing point (Earth on the 2026 peak date) and the shaped orbit ----------------------------------------
  const PER = isTouch ? 260 : 600;
  const total = PER * SHOWERS.length;
  const posAU = new Float32Array(total * 3);
  const items = SHOWERS.map((s, k) => {
    const peak26 = daysAtLongitude(s.lon, daysOf(2026, 1 + Math.floor(((s.lon + 80) % 360) / 30), 15));
    const crossAU = planetAU('Earth', peak26, new THREE.Vector3());
    const p = s.parent, pts = [];
    for (let i = 0; i < ORBIT_N; i++) { const u = -1 + (2 * i) / ORBIT_N; pts.push(posFromE(p, Math.PI * u * u * u, new THREE.Vector3())); }
    let k0 = 0, best = Infinity;
    pts.forEach((q, i) => { const d = q.distanceToSquared(crossAU); if (d < best) { best = d; k0 = i; } });
    const delta = crossAU.clone().sub(pts[k0]), p0 = pts[k0].clone();
    for (const q of pts) { const d = q.distanceTo(p0); q.addScaledVector(delta, Math.exp(-((d / 0.7) ** 2))); }
    const near = [];                                 // samples within ~1.2 AU of the crossing: the dense part of the stream
    pts.forEach((q, i) => { if (q.distanceTo(crossAU) < 1.2) near.push(i); });
    // particles: 70 % around the crossing, 30 % along the whole orbit; the scatter grows with distance from the Sun
    for (let j = 0; j < PER; j++) {
      const idx = rand() < 0.7 && near.length ? near[Math.floor(rand() * near.length)] : Math.floor(rand() * ORBIT_N);
      const a = pts[idx], b = pts[(idx + 1) % ORBIT_N], t = rand();
      const r = a.length(), sc = 0.015 + 0.02 * Math.min(r, 6);
      const o = (k * PER + j) * 3;
      posAU[o] = a.x + (b.x - a.x) * t + gauss() * sc;
      posAU[o + 1] = a.y + (b.y - a.y) * t + gauss() * sc * 0.6;
      posAU[o + 2] = a.z + (b.z - a.z) * t + gauss() * sc;
    }
    return { name: s.name, info: s, k, crossAU, pos: new THREE.Vector3(), peak26, intensity: 0, rate: 0, inWindow: false, viewDist: 7 };
  });

  // ---- one Points draw for all streams ---------------------------------------------------------------------------------
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), aStream = new Float32Array(total), aB = new Float32Array(total);
  const c = new THREE.Color();
  for (const it of items) {
    c.set(it.info.color);
    for (let j = 0; j < PER; j++) {
      const i = it.k * PER + j, r = Math.hypot(posAU[i * 3], posAU[i * 3 + 1], posAU[i * 3 + 2]);
      col.set([c.r, c.g, c.b], i * 3);
      aStream[i] = it.k;
      aB[i] = (0.35 + 0.65 * rand() ** 2) * (1 - THREE.MathUtils.smoothstep(r, 6, 35) * 0.9);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aStream', new THREE.BufferAttribute(aStream, 1));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 1));
  geo.setAttribute('aAU', new THREE.BufferAttribute(posAU, 3));          // shuffled together with the rest by perf/
  const boost = new Array(SHOWERS.length).fill(0.3);
  const streamMat = new THREE.ShaderMaterial({
    uniforms: { uBoost: { value: boost }, uPx: { value: (isTouch ? 2.6 : 2.4) * Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: STREAM_VERT, fragmentShader: STREAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const streams = new THREE.Points(geo, streamMat);
  streams.name = 'MeteorStreams'; streams.frustumCulled = false;
  root.add(streams);

  // crossing markers + labels
  const gTex = glowTex();
  for (const it of items) {
    it.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, color: it.info.color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    root.add(it.marker);
    const wrap = document.createElement('div'); wrap.className = 'meteor-wrap';
    const el = document.createElement('div');
    el.className = 'label small solar-label meteor-label';
    el.textContent = '✷ ' + it.info.name;
    el.title = `${it.info.name} meteor shower: tap for facts`;
    wrap.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(it); });
    it.labelEl = el; it.labelObj = new CSS2DObject(wrap); it.labelObj.visible = false;
    root.add(it.labelObj);
  }

  let layoutKey = '';
  const _v = new THREE.Vector3();
  function layout() {
    const key = `${scaleDistance(1)}|${scaleDistance(30)}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const au = geo.attributes.aAU.array, p = geo.attributes.position;
    for (let i = 0; i < total; i++) {
      _v.set(au[i * 3], au[i * 3 + 1], au[i * 3 + 2]); scaleAU(_v, scaleDistance);
      p.array[i * 3] = _v.x; p.array[i * 3 + 1] = _v.y; p.array[i * 3 + 2] = _v.z;
    }
    p.needsUpdate = true;
    for (const it of items) { it.pos.copy(scaleAU(_v.copy(it.crossAU), scaleDistance)); it.marker.position.copy(it.pos); it.labelObj.position.copy(it.pos); }
  }

  // ---- sky: radiant markers (at "infinity", re-centred on the camera) ----------------------------------------------------
  const sky = new THREE.Group(); sky.name = 'MeteorRadiants';
  scene.add(sky);
  const rTex = radiantTex();
  for (const it of items) {
    it.radiantDir = raDecToScene(it.info.ra, it.info.dec, new THREE.Vector3());
    it.radiant = new THREE.Sprite(new THREE.SpriteMaterial({ map: rTex, color: it.info.color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    it.radiant.position.copy(it.radiantDir); it.radiant.visible = false;
    sky.add(it.radiant);
    const el = document.createElement('div');
    el.className = 'label small solar-label meteor-label radiant-label';
    el.textContent = `${it.info.name} radiant`;
    el.title = `Meteors of the ${it.info.name} seem to fly out of this point in ${it.info.conName}`;
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(it); });
    const wrap = document.createElement('div'); wrap.className = 'meteor-wrap radiant-wrap'; wrap.appendChild(el);
    it.radiantLabel = new CSS2DObject(wrap); it.radiantLabel.visible = false; it.radiantLabelEl = el;
    sky.add(it.radiantLabel);
    it.radiantLabel.position.copy(it.radiantDir);
  }

  // ---- streaks falling on Earth from the active radiants (one LineSegments draw, reused buffers) -------------------------
  const MAXS = isTouch ? 36 : 72;
  const sPos = new Float32Array(MAXS * 6), sCol = new Float32Array(MAXS * 6);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  const streaks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  streaks.frustumCulled = false; streaks.name = 'MeteorStreaks';
  root.add(streaks);
  const S = Array.from({ length: MAXS }, () => ({ alive: false, p: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, life: 0, max: 1, speed: 0, r: 1, g: 1, b: 1 }));
  const _e = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();
  let spawnAcc = 0;
  function spawn(it, R) {
    const s = S.find((x) => !x.alive); if (!s) return;
    const D = it.radiantDir;
    _a.set(0, 1, 0); if (Math.abs(D.y) > 0.9) _a.set(1, 0, 0);
    _a.cross(D).normalize(); _b.crossVectors(D, _a);
    const ang = rand() * TAU, rr = Math.sqrt(rand()) * R * 1.5;
    s.p.copy(_e).addScaledVector(D, R * (2 + rand() * 1.2)).addScaledVector(_a, Math.cos(ang) * rr).addScaledVector(_b, Math.sin(ang) * rr);
    s.d.copy(D).negate();
    s.speed = R * (0.9 + it.info.v / 40);       // faster showers streak faster
    s.len = R * (0.35 + it.info.v / 110);
    s.life = 0; s.max = 0.9 + rand() * 0.8; s.alive = true;
    c.set(it.info.color); s.r = 0.7 + 0.3 * c.r; s.g = 0.7 + 0.3 * c.g; s.b = 0.7 + 0.3 * c.b;
  }
  function updateStreaks(dt, cam, act) {
    const R = earthB.radius;
    earthB.group.getWorldPosition(_e);
    const near = cam.position.distanceTo(_e) < R * 90;
    streaks.visible = near && act.length > 0;
    if (!streaks.visible) { for (const s of S) s.alive = false; return; }
    for (const it of act) {
      spawnAcc += dt * (1.5 + 26 * Math.min(1, Math.sqrt(it.rate / 120))) * (isTouch ? 0.6 : 1);
      while (spawnAcc >= 1) { spawnAcc -= 1; spawn(it, R); }
    }
    let n = 0;
    for (const s of S) {
      if (!s.alive) continue;
      s.life += dt;
      s.p.addScaledVector(s.d, s.speed * dt);
      if (s.life > s.max || s.p.distanceTo(_e) < R * 1.01) { s.alive = false; continue; }
      const f = Math.sin(Math.PI * Math.min(1, s.life / s.max));
      _t.copy(s.p).addScaledVector(s.d, -s.len);
      sPos.set([s.p.x, s.p.y, s.p.z, _t.x, _t.y, _t.z], n * 6);
      sCol.set([s.r * f, s.g * f, s.b * f, 0, 0, 0], n * 6);
      n++;
    }
    sGeo.setDrawRange(0, n * 2);
    sGeo.attributes.position.needsUpdate = true; sGeo.attributes.color.needsUpdate = true;
  }

  // ---- timing helpers -------------------------------------------------------------------------------------------------
  const inWindow = (s, lon) => (s.fromLon <= s.toLon ? lon >= s.fromLon && lon <= s.toLon : lon >= s.fromLon || lon <= s.toLon);
  const peakNear = (s, days) => daysAtLongitude(s.lon, days);
  function nextPeak(s, days) {
    let d = peakNear(s, days);
    if (d < days - 0.5) d = daysAtLongitude(s.lon, d + 365.2422);
    return d;
  }
  const fmtDay = (d, withYear = true, withTime = false) => {
    const t = new Date(J2000 + d * DAY_MS);
    return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${withYear ? ' ' + t.getUTCFullYear() : ''}` +
      (withTime ? ` (~${String(t.getUTCHours()).padStart(2, '0')}h UT)` : '');
  };
  // Boise: how high the radiant gets and when (local clock time, roughly: no equation of time)
  function boiseText(s, days) {
    const maxAlt = 90 - Math.abs(BOISE_LAT - s.dec);
    const lam = sunLongitude(days) * D2R;
    const raSun = (Math.atan2(Math.cos(OBL) * Math.sin(lam), Math.cos(lam)) / D2R + 360) % 360;
    const lmt = ((12 + (s.ra - raSun) / 15) % 24 + 24) % 24;          // local mean time when the radiant is highest
    const t = new Date(J2000 + days * DAY_MS), m = t.getUTCMonth() + 1, dd = t.getUTCDate();
    const dst = (m > 3 && m < 11) || (m === 3 && dd >= 10) || (m === 11 && dd < 3);
    const clock = (lmt + (-BOISE_LON - (dst ? 90 : 105)) / 15 + 24) % 24;   // MST is the 105°W meridian's time, MDT 90°W's
    const h = Math.round(clock * 2) / 2, hh = Math.floor(h) % 24, mm = h % 1 ? '30' : '00';
    const ampm = `${((hh + 11) % 12) + 1}:${mm} ${hh < 12 ? 'a.m.' : 'p.m.'} ${dst ? 'MDT' : 'MST'}`;
    const circ = s.dec > 90 - BOISE_LAT;
    let best;
    if (clock < 4) best = 'up by mid-evening; best from about midnight to dawn';
    else if (clock < 6) best = 'best after midnight until dawn';
    else if (clock > 19) best = 'good from late evening, best around midnight';
    else if (clock < 12) best = circ ? 'up all night; best in the hours before dawn' : 'best in the last hours before dawn, as the radiant rises in the east';
    else best = circ ? 'up all night; best in the evening' : 'best in the evening after dark, before the radiant sets';
    return `Radiant in ${s.conName} (RA ${s.ra}°, Dec ${s.dec >= 0 ? '+' : '−'}${Math.abs(s.dec)}°). From Boise (43.6°N) it climbs to ${Math.round(maxAlt)}°` +
      `${circ ? ' and never sets' : ''}, highest about ${ampm}: ${best}. Look from a dark spot away from town lights; no telescope needed.`;
  }
  const speedWord = (v) => (v >= 60 ? 'very fast' : v >= 45 ? 'fast' : v >= 30 ? 'medium' : 'slow');

  function rateNow(s, days) {
    if (!inWindow(s, sunLongitude(days))) return 0;
    const dd = days - peakNear(s, days);
    return s.zhr * Math.max(0.06, Math.exp(-0.5 * (dd / s.hw) ** 2));
  }

  // ---- info card (fills main.js's #info-panel, like comets/) -----------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  const extra = document.createElement('div'); extra.id = 'meteor-extra'; extra.className = 'meteor-extra hidden';
  $('info-fact')?.after(extra);
  let open = null, lastRefresh = 0, lastDays = 0, extraFor = null;
  function rows(it, days) {
    const s = it.info, d = nextPeak(s, days), dIn = d - days;
    const act = inWindow(s, sunLongitude(days));
    const prev = peakNear(s, days);
    let when;
    if (Math.abs(days - prev) <= 0.5) when = `Peak is today! ${fmtDay(prev, true, true)}`;
    else if (act && prev < days && days - prev < 60) when = `Active now; the peak was ${Math.round(days - prev)} day${Math.round(days - prev) === 1 ? '' : 's'} ago. Next peak ${fmtDay(d, true, true)}, in ${Math.round(dIn)} days`;
    else when = `${act ? 'Active now. ' : ''}Next peak ${fmtDay(d, true, true)}, in ${Math.round(dIn)} day${Math.round(dIn) === 1 ? '' : 's'}`;
    const from = `${s.from[1]} ${MONTHS[s.from[0] - 1]}`, to = `${s.to[1]} ${MONTHS[s.to[0] - 1]}`;
    const r = rateNow(s, days);
    return [
      ['Parent', `${s.parent.name}, a ${s.parent.kind}`],
      ['Peak', `${when}, when the Sun reaches ${s.lon}° ecliptic longitude. Active ${from} – ${to}`],
      ['Rate & speed', `Up to ~${s.zhr} meteors an hour at the peak (ZHR: dark sky, radiant overhead)${r > 0 ? `; ~${Math.max(1, Math.round(r))} on this date` : ''}. ` +
        `They hit the air at ${s.v} km/s (${speedWord(s.v)})`],
      ['From Boise', boiseText(s, d)],
    ];
  }
  function fill(it, days) {
    const ids = ['info-diameter', 'info-distance', 'info-period', 'info-day'];
    rows(it, days).forEach(([label, value], k) => { $(ids[k] + '-label').textContent = label; $(ids[k]).textContent = value; });
  }
  function showInfo(it) {
    if (!panel || !it) return false;
    const s = it.info;
    $('info-name').textContent = `${s.name} meteor shower`; $('info-name').style.color = s.color;
    $('info-type').textContent = `Meteor shower · IAU ${s.code} · from ${s.parent.name.replace(/ \(.*\)$/, '')}`;
    fill(it, lastDays);
    $('info-fact').textContent = '💡 ' + s.fact + ' (Here the streaks are drawn around the enlarged Earth; real meteors burn up 80–120 km high.)';
    for (const id of ['info-phase-row', 'info-sky-row']) $(id)?.classList.add('hidden');
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const o of items) o.labelEl.classList.toggle('active', o === it);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = it; lastRefresh = performance.now();
    setExtra('shower', it);
    return true;
  }
  const isOpenHere = () => open && !panel.classList.contains('hidden') && $('info-name').textContent === `${open.info.name} meteor shower`;
  function release(hide) {
    if (open) open.labelEl.classList.remove('active');
    if (hide && open && isOpenHere()) { panel.classList.add('hidden'); document.body.classList.remove('info-open'); }
    open = null;
    if (closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
    clearExtra();
  }
  // ✕ on a shower card just closes the card (main.js's own ✕ handler would fly back to the overview)
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    release(true);
  }, true);
  // buttons under the fact: on a shower card → parent comet (if drawn) and radiant constellation; on a parent comet's card → its showers
  function button(text, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'meteor-btn'; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function clearExtra() { extraFor = null; extra.replaceChildren(); extra.classList.add('hidden'); }
  function setExtra(kind, it) {
    const key = kind + ':' + (it?.name || it);
    if (extraFor === key) return;
    extraFor = key;
    extra.replaceChildren();
    if (kind === 'shower') {
      const s = it.info, sol = window.solar;
      if (s.parent.cometName) extra.append(button(`☄ Parent: ${s.parent.cometName}`, () => sol?.search?.go(s.parent.cometName)));
      extra.append(button(`✦ Radiant in ${s.conName}`, () => sol?.constellations?.select(s.con)));
    } else {
      for (const o of items.filter((x) => x.info.parent.cometName === it)) extra.append(button(`✷ ${o.info.name} meteor shower`, () => showInfo(o)));
    }
    extra.classList.toggle('hidden', !extra.children.length);
  }
  const parentNames = new Set(items.map((i) => i.info.parent.cometName).filter(Boolean));
  function checkCard() {
    if (open && isOpenHere()) return;
    if (open) release(false);
    const shown = panel && !panel.classList.contains('hidden');
    const nm = shown ? $('info-name').textContent : '';
    if (shown && on && parentNames.has(nm)) setExtra('comet', nm); else if (extraFor) clearExtra();
  }

  // ---- labels: keep clear of main.js's body labels and of each other ----------------------------------------------------
  const PX = isTouch ? 8 : 0, PY = isTouch ? 12 : 0, rects = [];
  const overlaps = (r) => rects.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  function placeLabels(camera, W, H) {
    rects.length = 0;
    for (const b of bodies) {
      const lab = b.labelEl;
      if (!lab || !lab._obj || lab.classList.contains('overlap')) continue;
      lab._obj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, w = lab._w || lab.textContent.length * 7 + 18, h = lab._h || 20;
      rects.push([cx - w / 2 - PX, cy - h / 2 - PY, cx + w / 2 + PX, cy + h / 2 + PY]);
    }
    const order = [...items].sort((a, b) => (b.inWindow - a.inWindow) || ((b === open) - (a === open)) || (b.info.zhr - a.info.zhr));
    for (const it of order) {
      _v.copy(it.pos).project(camera);
      let vis = !(_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05);
      if (vis) {
        const el = it.labelEl;
        if (!el._w && el.offsetWidth) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
        const w = el._w || el.textContent.length * 6.5 + 18, h = el._h || 20;
        const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H + 16;   // CSS nudges the label 16 px below the marker
        const r = [cx - w / 2 - 2 - PX, cy - h / 2 - 2 - PY, cx + w / 2 + 2 + PX, cy + h / 2 + 2 + PY];
        vis = !overlaps(r);
        if (vis) rects.push(r);
      }
      it.labelObj.visible = vis;
    }
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------
  let frame = 0, time = 0;
  const active = [];
  function update(days, camera, dt = 1 / 60) {
    lastDays = days; time += dt;
    root.visible = sky.visible = on;
    if (!on) { for (const it of items) { it.labelObj.visible = false; it.radiantLabel.visible = false; } return; }
    layout();
    const lon = sunLongitude(days);
    const H = window.innerHeight, k = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / H;
    active.length = 0;
    for (const it of items) {
      const s = it.info;
      it.inWindow = inWindow(s, lon);
      it.rate = it.inWindow ? rateNow(s, days) : 0;
      it.intensity = it.inWindow ? Math.min(1, 0.25 + 0.75 * Math.sqrt(it.rate / 100)) : 0;
      if (it.inWindow) active.push(it);
    }
    const nAct = active.length;
    for (const it of items) {
      const sel = it === open;
      boost[it.k] = Math.min(1.4, 0.4 + 0.8 * it.intensity + (sel ? 0.5 : 0));
      const pulse = it.inWindow ? 0.75 + 0.25 * Math.sin(time * 3 + it.k) : 1;
      it.marker.scale.setScalar((it.inWindow || sel ? 16 : 10) * pulse * k);
      it.marker.material.opacity = it.inWindow || sel ? 0.95 : 0.55;
      // radiant on the sky while active (or while its card is open)
      const showR = it.inWindow || sel;
      it.radiant.visible = showR;
      it.radiantLabel.visible = showR && (sel || it.intensity > 0.3 || nAct <= 2);
      if (showR) {
        const I = Math.max(it.intensity, sel ? 0.8 : 0);
        it.radiant.scale.setScalar((isTouch ? 34 : 30) * (0.6 + 0.4 * I) * k / (camera.far * 0.42));   // undo the sky group's scale
        it.radiant.material.opacity = 0.35 + 0.6 * I;
      }
    }
    // the sky group sits at "infinity" like the star sphere; sprites with sizeAttenuation off keep their pixel size
    sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.42);
    active.sort((a, b) => b.rate - a.rate);
    if (active.length > 2) active.length = 2;
    updateStreaks(Math.min(dt, 0.1), camera, active);
    if ((frame++ % 3) === 0) placeLabels(camera, window.innerWidth, H);
    if (performance.now() - lastRefresh > 300) {
      lastRefresh = performance.now();
      if (open && isOpenHere()) fill(open, days);
      checkCard();
    }
  }

  return {
    group: root, sky, items, update,
    showInfo: (name) => { const it = items.find((i) => i.name === name || i.info.key === name); return it ? showInfo(it) : false; },
    get: (name) => items.find((i) => i.name === name),
    isOn: () => on,
    stats: () => ({ on, points: total, active: items.filter((i) => i.inWindow).map((i) => ({ name: i.name, rate: +i.rate.toFixed(1) })),
      streaks: S.filter((s) => s.alive).length, open: open && open.name,
      labels: items.filter((i) => i.labelObj.visible).map((i) => i.name),
      nextPeaks: items.map((i) => ({ name: i.name, peak: fmtDay(nextPeak(i.info, lastDays), true, true) })) }),
  };
}
