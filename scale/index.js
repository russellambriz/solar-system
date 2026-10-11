// scale/index.js: tools that make the Solar System's real scale felt.
//
//  1. Scale slider (Controls): morphs drawn distances from the comfortable compressed view (a + b·AU^0.55, Earth at
//     20 units) to true distance ratios (20 units per AU), keeping Earth's orbit fixed; live readout of the compression.
//     Everything placed through main.js's scaleDistance follows at once (planets, dwarf planets, spacecraft, comets);
//     what was drawn once (orbit lines, probe trails, the belts' shader) is rebuilt, the zoom-out limit and the overview
//     pull back as the system spreads out, and the background stars follow the camera so they stay "at infinity".
//     Planet sizes are not changed (Earth/Moon arrival framing and the Moon's size easing depend on them): the
//     comparisons below show true sizes instead.
//  2. Distance HUD (Layers → "Distances"): camera's distance from the Sun with light time, and the selected object's
//     distance from the Sun and from Earth (signal delay for spacecraft); in the galaxy view, light-years from the Sun.
//  3. Scale section in a focused body's info card: size in Earth diameters, distance and light time, plus
//     • "Earth for scale": a ghost Earth beside the body at its TRUE size relative to the body as drawn;
//     • "True-scale moon orbits": ghost orbits and moons at their true distances and sizes in units of the drawn planet
//       (e.g. the Moon 60 Earth radii out), while the rest of the view stays compressed.
//
// Usage (main.js): const scaleTools = createScaleTools({ DIST_SCALE, scaleDistance, bodies, smallBodies, belts, starfield,
//   realPositions, spacecraft, comets, camera, controls, OVERVIEW_POS, setSolarMaxDist, getMode, getFocused, galaxy, scene });
//   every frame: scaleTools.update(days, camera, inGalaxy)
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { orbitPoints, keplerAU } from '../smallbodies.js';

const EARTH_KM = 12742, AU_KM = 149597870.7, LIGHT_S_PER_AU = 499.005, LIGHT_KM_S = 299792.458;
const BASE = { a: 6, b: 14, p: 0.55 };
const SOLAR_MAX_BASE = 900, NEPTUNE_AU = 30.07;
const fmtN = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export function fmtLight(sec) {
  if (sec < 1) return `${(sec * 1000).toFixed(0)} ms`;
  if (sec < 90) return `${sec.toFixed(sec < 10 ? 1 : 0)} s`;
  const m = sec / 60;
  if (m < 90) return `${Math.floor(m)} min ${Math.round(sec - Math.floor(m) * 60)} s`;
  const h = m / 60;
  return h < 48 ? `${Math.floor(h)} h ${Math.round(m - Math.floor(h) * 60)} min` : `${(h / 24).toFixed(1)} days`;
}
const fmtAU = (au) => (au < 0.01 ? `${fmtN(au * AU_KM)} km` : `${au.toFixed(au < 10 ? 2 : 1)} AU`);
// true distance of a moon from its planet in km (outer moons carry `a`; the others say it in their distance text)
const trueKm = (info) => info.a || (+(/([\d,]+)\s*km/.exec(info.distanceText || '')?.[1] || '').replace(/,/g, '') || null);

export function createScaleTools(o) {
  const { DIST_SCALE, scaleDistance, bodies, camera, controls } = o;
  const byName = (n) => bodies.find((b) => b.name === n);
  const earthB = byName('Earth');
  const $ = (id) => document.getElementById(id);
  const store = { get: (k) => { try { return localStorage.getItem('solar.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('solar.' + k, v); } catch (e) { /* private mode */ } } };

  // ---- 1. distance-scale morph ---------------------------------------------------------------------------------------
  const overviewBase = o.OVERVIEW_POS.clone();
  let s = 0, target = 0, days = 0;
  const paramsAt = (t) => ({ a: BASE.a * (1 - t), b: 20 - BASE.a * (1 - t), p: BASE.p + (1 - BASE.p) * t });   // Earth stays at 20
  function applyScale(t) {
    Object.assign(DIST_SCALE, paramsAt(t));
    for (const bt of o.belts || []) { const u = bt.material.uniforms; u.uDistA.value = DIST_SCALE.a; u.uDistB.value = DIST_SCALE.b; u.uDistP.value = DIST_SCALE.p; }
    o.realPositions?.redrawOrbits(days);
    for (const b of o.smallBodies || []) {
      if (!b.orbit || !b.info?.a) continue;
      const pts = orbitPoints(b.info, scaleDistance, 512), pos = b.orbit.geometry.attributes.position;
      if (pos.count === pts.length) { pts.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z)); pos.needsUpdate = true; b.orbit.geometry.computeBoundingSphere(); }
    }
    o.spacecraft?.rebuild?.();
    o.comets?.rebuild?.();
    // room to zoom out (the galaxy switch distance), the overview and the far plane grow with Neptune's drawn distance
    const grow = scaleDistance(NEPTUNE_AU) / (BASE.a + BASE.b * Math.pow(NEPTUNE_AU, BASE.p));
    o.setSolarMaxDist?.(SOLAR_MAX_BASE * grow);
    const ov = scaleDistance(7) / (BASE.a + BASE.b * Math.pow(7, BASE.p));
    o.OVERVIEW_POS.copy(overviewBase).multiplyScalar(ov);
    farWanted = Math.max(6000, SOLAR_MAX_BASE * grow + 4000);
    readout();
  }
  let farWanted = 6000;

  // UI: Controls row with a 5-step slider (snaps to 0/25/50/75/100 %, moves smoothly in between)
  const ctl = document.createElement('div');
  ctl.className = 'scale-ctl';
  ctl.innerHTML = '<label class="row slider-row" for="scale-slider"><span>Scale</span><span id="scale-value">Comfortable</span></label>' +
    '<input type="range" id="scale-slider" min="0" max="100" step="25" value="0" list="scale-steps" aria-label="Distance scale: comfortable to true distances" />' +
    '<datalist id="scale-steps"><option value="0"></option><option value="25"></option><option value="50"></option><option value="75"></option><option value="100"></option></datalist>' +
    '<div class="scale-ends"><span>Comfortable</span><span>True distances</span></div><div id="scale-readout" class="scale-readout"></div>';
  const anchor = document.querySelector('#controls .date-row') || document.querySelector('#controls .row.buttons');
  anchor?.after(ctl);
  const slider = $('scale-slider');
  slider?.addEventListener('input', () => { target = +slider.value / 100; store.set('scale', slider.value); });
  const saved = +store.get('scale');
  if (slider && saved > 0 && saved <= 100) { slider.value = String(saved); target = saved / 100; }
  const STEP_NAMES = ['Comfortable', 'Less squeezed', 'Halfway', 'Nearly true', 'True distances'];
  function readout() {
    const draw = scaleDistance(NEPTUNE_AU) / scaleDistance(1), squeeze = NEPTUNE_AU / draw;
    const v = $('scale-value'); if (v) v.textContent = STEP_NAMES[Math.round(s * 4)];
    const r = $('scale-readout');
    if (r) r.innerHTML = squeeze < 1.02
      ? 'Distances: <b>true ratios</b> (1 AU = 20 units). Sizes still enlarged (Earth ~1,100×) so planets stay visible.'
      : `Distances ∝ AU<sup>${DIST_SCALE.p.toFixed(2)}</sup>: Neptune is drawn <b>${squeeze.toFixed(1)}× too close</b> to the Sun (compared with Earth).`;
    const note = $('scale-note-dist');
    if (note) note.innerHTML = squeeze < 1.02 ? 'distances are at true ratios' : `distances are compressed (∝ AU<sup>${DIST_SCALE.p.toFixed(2)}</sup>)`;
  }

  // ---- 2. distance HUD ---------------------------------------------------------------------------------------------
  const hud = document.createElement('div');
  hud.id = 'scale-hud'; hud.className = 'scale-hud';
  hud.innerHTML = '<div class="l1"></div><div class="l2"></div>';
  document.body.appendChild(hud);
  const toggle = $('toggle-hud');
  let hudOn = store.get('hud') !== '0';
  if (toggle) { toggle.checked = hudOn; toggle.addEventListener('change', () => { hudOn = toggle.checked; store.set('hud', hudOn ? '1' : '0'); }); }
  const _a = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3();
  const sceneToAU = (r) => {
    if (r <= scaleDistance(0.0001)) return 0;
    let lo = 0, hi = 5000;
    for (let k = 0; k < 48; k++) { const m = (lo + hi) / 2; if (scaleDistance(m) < r) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // true heliocentric position (AU) of a body / craft / comet, or null
  function bodyAU(b, out) {
    if (!b) return null;
    if (b.name === 'Sun') return out.set(0, 0, 0);
    if (b.isMoon) return bodyAU(b.parent, out);
    if (b.info?.L0 !== undefined && o.realPositions) return o.realPositions.positionAU(b.name, days, out);
    if (b.isSmall && b.info?.a) return keplerAU(b.info, days, out);
    return null;
  }
  function selected() {
    const f = o.getFocused?.();
    const name = $('info-name')?.textContent, open = !$('info-panel')?.classList.contains('hidden');
    const sc = o.spacecraft?.stats?.().open, cm = o.comets?.stats?.().open;
    if (open && sc) { const it = o.spacecraft.get(sc); if (it && it.posAU && name === (it.info.title || it.info.name)) return { kind: 'craft', it }; }
    if (open && cm) { const it = o.comets.get(cm); if (it && name === it.info.name) return { kind: 'comet', it }; }
    return f ? { kind: 'body', b: f } : null;
  }
  function hudText(inGalaxy) {
    if (inGalaxy) {
      const sun = o.galaxy.sunWorldPos(_w), ly = camera.position.distanceTo(sun) * 100;
      return [`📷 Camera: ~${ly < 1e6 ? fmtN(ly) + ' light-years' : fmtN(ly / 1e6, 1) + ' million light-years'} from the Sun`,
        'Light from here would take as many years to reach Earth'];
    }
    const camAU = sceneToAU(camera.position.length());
    const l1 = `📷 Camera: ${fmtAU(camAU)} from the Sun · sunlight takes ${fmtLight(camAU * LIGHT_S_PER_AU)}`;
    const sel = selected();
    if (!sel) return [l1, ''];
    o.realPositions?.positionAU('Earth', days, _e);
    if (sel.kind === 'craft' || sel.kind === 'comet') {
      const p = sel.it.posAU, r = p.length(), fromE = _a.copy(p).sub(_e).length();
      const nm = sel.it.info.short || sel.it.info.name;
      return [l1, `${nm}: ${fmtAU(r)} from the Sun · ${sel.kind === 'craft' ? 'radio signal' : 'light'} from Earth takes ${fmtLight(fromE * LIGHT_S_PER_AU)}`];
    }
    const b = sel.b;
    if (b.isMoon) {
      const km = trueKm(b.info);
      return [l1, km ? `${b.name}: ${fmtN(km)} km from ${b.parent.name} · light takes ${fmtLight(km / LIGHT_KM_S)}` : `${b.name}`];
    }
    if (!bodyAU(b, _a)) return [l1, ''];
    const r = _a.length(), fromE = _a.sub(_e).length();
    if (b.name === 'Sun') return [l1, `Sun: light reaches Earth in ${fmtLight(_e.length() * LIGHT_S_PER_AU)}`];
    if (b.name === 'Earth') return [l1, `Earth: ${fmtAU(r)} from the Sun · sunlight takes ${fmtLight(r * LIGHT_S_PER_AU)}`];
    return [l1, `${b.name}: ${fmtAU(r)} from the Sun (${fmtLight(r * LIGHT_S_PER_AU)}) · ${fmtAU(fromE)} from Earth (${fmtLight(fromE * LIGHT_S_PER_AU)})`];
  }

  // ---- 3. scale section in a focused body's card: size, ghost Earth, true-scale moon orbits ---------------------------
  const sec = document.createElement('div');
  sec.id = 'scale-compare'; sec.className = 'scale-compare hidden';
  sec.innerHTML = '<div class="sz"></div><div class="btns"><button type="button" class="ghost-btn">👻 Earth for scale</button>' +
    '<button type="button" class="orbit-btn">📏 True-scale moon orbits</button></div><div class="note"></div>';
  $('info-panel')?.appendChild(sec);
  const ghostBtn = sec.querySelector('.ghost-btn'), orbitBtn = sec.querySelector('.orbit-btn');
  let cardBody = null, ghostOn = false, orbitsOn = false;
  const ghostRoot = new THREE.Group(); ghostRoot.name = 'ScaleGhosts';
  o.scene.add(ghostRoot);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x8fc4ff, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false });
  const ghostEarth = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), ghostMat);
  ghostEarth.visible = false; ghostRoot.add(ghostEarth);
  const ghostLabel = makeLabel('Earth at true relative size');
  ghostEarth.add(ghostLabel.obj);
  const orbitGhosts = [];          // { moon, ring, ball, label }
  function makeLabel(text) {
    const el = document.createElement('div'); el.className = 'label solar-label small ghost-label'; el.textContent = text;
    const obj = new CSS2DObject(el); obj.center.set(0.5, -0.6);           // below the ghost, clear of the planet's own label above
    return { el, obj };
  }
  ghostBtn.addEventListener('click', () => { ghostOn = !ghostOn; refreshButtons(); });
  orbitBtn.addEventListener('click', () => { orbitsOn = !orbitsOn; buildOrbitGhosts(); refreshButtons(); });
  function refreshButtons() {
    ghostBtn.classList.toggle('active', ghostOn); orbitBtn.classList.toggle('active', orbitsOn);
    ghostBtn.textContent = cardBody?.name === 'Earth' ? '👻 Moon for scale' : '👻 Earth for scale';
  }
  const systemOf = (b) => (b && b.isMoon ? b.parent : b);
  function buildOrbitGhosts() {
    for (const g of orbitGhosts) { g.ring.removeFromParent(); g.ring.geometry.dispose(); g.ball.removeFromParent(); g.label?.obj.removeFromParent(); g.label?.el.remove(); }
    orbitGhosts.length = 0;
    const sys = systemOf(cardBody);
    if (!orbitsOn || !sys?.moons?.length) return;
    const pR = sys.radius, pKm = sys.info.diameter / 2;
    sys.moons.forEach((m, k) => {
      const km = trueKm(m.info);
      if (!km) return;
      const R = pR * (km / pKm);
      const pts = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffd27a, dashSize: R * 0.04, gapSize: R * 0.03, transparent: true, opacity: 0.6, depthWrite: false }));
      ring.computeLineDistances();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(Math.max(pR * (m.info.diameter / sys.info.diameter), 0.002), 20, 14), ghostMat);
      const label = k < 1 || sys.moons.length <= 2 ? makeLabel(`${m.name} at true distance (${fmtN(km / pKm, 1)} ${sys.name} radii)`) : null;
      if (label) ball.add(label.obj);
      ghostRoot.add(ring, ball);
      orbitGhosts.push({ moon: m, ring, ball, label, R });
    });
  }
  function updateCard() {
    const f = o.getFocused?.();
    const open = !$('info-panel')?.classList.contains('hidden') && f && $('info-name')?.textContent === f.info.name;
    const b = open ? f : null;
    if (b !== cardBody) { cardBody = b; ghostOn = false; orbitsOn = false; buildOrbitGhosts(); refreshButtons(); }
    sec.classList.toggle('hidden', !b);
    if (!b) return;
    const d = b.info.diameter, xEarth = d / EARTH_KM;
    const drawn = (b.radius / earthB.radius) / xEarth;
    sec.querySelector('.sz').innerHTML = b.name === 'Earth'
      ? 'Earth: 12,742 km across. The Moon is 0.27× as wide and orbits <b>30 Earth diameters</b> away.'
      : `${b.name}: <b>${xEarth >= 1 ? fmtN(xEarth, 1) + '×' : fmtN(1 / xEarth, 1) + '× smaller than'} Earth's diameter</b> (${fmtN(d)} km). ` +
        `Here it is drawn ${drawn > 1.05 ? fmtN(drawn, 1) + '× too big' : drawn < 0.95 ? fmtN(1 / drawn, 1) + '× too small' : 'about right'} next to Earth.`;
    const sys = systemOf(b);
    orbitBtn.classList.toggle('hidden', !sys?.moons?.some((m) => trueKm(m.info)));
    const note = sec.querySelector('.note');
    const first = orbitsOn && orbitGhosts[0];
    note.textContent = first ? `True scale: ${first.moon.name} orbits ${fmtN(first.R / sys.radius, 1)} ${sys.name} radii out (drawn at ${fmtN(first.moon.orbitDist / sys.radius, 1)}). Zoom out to see the dashed rings.` : '';
  }
  const _r = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
  function updateGhosts() {
    const b = cardBody;
    ghostEarth.visible = !!(b && ghostOn);
    ghostLabel.obj.visible = ghostEarth.visible;              // CSS2D labels ignore their parent's visibility
    if (ghostEarth.visible) {
      // Earth beside the body at its true size relative to the body as drawn (for Earth: the Moon at its true size)
      const isEarth = b.name === 'Earth', gr = b.radius * (isEarth ? 3474 / 12742 : EARTH_KM / b.info.diameter);
      ghostEarth.scale.setScalar(Math.max(gr, 1e-3));
      b.group.getWorldPosition(_c);
      _r.set(1, 0, 0).applyQuaternion(camera.quaternion);
      ghostEarth.position.copy(_c).addScaledVector(_r, (b.radius + gr) * 1.3 + 0.05);
      ghostLabel.el.textContent = isEarth ? 'Moon at true relative size' : 'Earth at true relative size';
    }
    const sys = systemOf(b);
    for (const g of orbitGhosts) {
      sys.group.getWorldPosition(_c);
      g.moon.group.parent.getWorldQuaternion(_q);
      g.ring.position.copy(_c); g.ring.quaternion.copy(_q);
      g.moon.group.getWorldPosition(_r).sub(_c);
      if (_r.lengthSq() > 1e-12) g.ball.position.copy(_c).addScaledVector(_r.normalize(), g.R);
    }
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  let lastHud = 0;
  function update(d, cam, inGalaxy) {
    if (d !== null && d !== undefined) days = d;
    if (Math.abs(target - s) > 1e-4) {
      s += (target - s) * 0.18;                                       // smooth morph toward the chosen step
      if (Math.abs(target - s) < 0.002) s = target;
      applyScale(s);
    }
    if (!inGalaxy) {
      if (o.starfield) o.starfield.position.copy(cam.position);       // stars at infinity (the view can now reach far out)
      if (o.getMode?.() === 'solar' && Math.abs(cam.far - farWanted) > 1) { cam.far = farWanted; cam.updateProjectionMatrix(); }
    }
    updateCard();
    updateGhosts();
    const now = performance.now();
    if (now - lastHud > 200) {
      lastHud = now;
      const skip = document.getElementById('trip-skip'), tripping = skip && !skip.classList.contains('hidden');
      const show = hudOn && !tripping && !document.body.classList.contains('clean-view');
      hud.classList.toggle('hidden', !show);
      if (show) { const [l1, l2] = hudText(inGalaxy); hud.querySelector('.l1').textContent = l1; hud.querySelector('.l2').textContent = l2; hud.querySelector('.l2').classList.toggle('hidden', !l2); }
    }
  }
  if (target > 0) { s = target; applyScale(s); } else readout();

  return {
    update, setScale: (t) => { target = Math.max(0, Math.min(1, t)); if (slider) slider.value = String(Math.round(target * 100)); },
    stats: () => ({ s, target, params: { ...DIST_SCALE }, neptune: +scaleDistance(NEPTUNE_AU).toFixed(1), hud: hud.textContent, card: cardBody?.name ?? null, ghostOn, orbitsOn, ghosts: orbitGhosts.length }),
    toggleGhost: () => ghostBtn.click(), toggleOrbits: () => orbitBtn.click(),
  };
}
