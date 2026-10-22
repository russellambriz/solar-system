// constellations/: real bright stars (V <= 5) at their true RA/Dec plus faint stick figures and names for the 88 IAU
// constellations, on a sky sphere that is re-centred on the camera every frame (so it sits "at infinity").
// Drawn first in the opaque pass with depthTest/depthWrite off (like the Milky Way sky band), so planets, rings and
// Earth's/Moon's night sides always cover it. One Points draw + one LineSegments draw.
// Data: d3-celestial (Olaf Frohn, BSD-3-Clause), stars from HYG/Hipparcos. See data.js.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { STARS, LINES, NAMES } from './data.js';
import { INFO } from './info.js';

const D2R = Math.PI / 180;
const OBLIQUITY = 23.44 * D2R;              // J2000 mean obliquity of the ecliptic
const CE = Math.cos(OBLIQUITY), SE = Math.sin(OBLIQUITY);

// RA/Dec (degrees) -> unit vector in the scene's ecliptic frame (same convention as galaxy.js:
// ecliptic plane = XZ, north = +Y, longitude λ: x = cos λ, z = −sin λ).
export function raDecToScene(raDeg, decDeg, out = new THREE.Vector3()) {
  const a = raDeg * D2R, d = decDeg * D2R;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d); // equatorial
  const ye = y * CE + z * SE, ze = -y * SE + z * CE;                                  // rotate about x by ε
  return out.set(x, ze, -ye);
}

// B-V colour index -> RGB (Ballesteros 2012 temperature, then a simple blackbody-ish ramp)
function bvColor(bv, c) {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  let r, g, b;
  if (t >= 6600) { r = 1.29 * Math.pow(t / 100 - 60, -0.1332); g = 1.13 * Math.pow(t / 100 - 60, -0.0755); } else { r = 1; g = (99.47 * Math.log(t / 100) - 161.12) / 255; }
  if (t >= 6600) b = 1; else if (t <= 1900) b = 0; else b = (138.52 * Math.log(t / 100 - 10) - 305.04) / 255;
  return c.setRGB(Math.min(1, r), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b)));
}

export function createConstellations({ scene, renderer, isTouch = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Constellations';
  const R = 1;                                // unit sphere; group is scaled to sit just inside the camera's far plane
  const maxMag = isTouch ? 4.5 : 5.0;
  const v = new THREE.Vector3(), c = new THREE.Color();

  // --- stars: one Points draw, colour from B-V, size from magnitude ---
  let n = 0; while (n * 4 < STARS.length && STARS[n * 4 + 2] / 100 <= maxMag) n++;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    raDecToScene(STARS[i * 4] / 100, STARS[i * 4 + 1] / 100, v).multiplyScalar(R).toArray(pos, i * 3);
    const mag = STARS[i * 4 + 2] / 100;
    bvColor(STARS[i * 4 + 3] / 100, c).toArray(col, i * 3);
    size[i] = Math.max(2.4, 9 - 1.2 * (mag + 1.5));     // px (before pixel ratio): Sirius ~6, mag 5 ~1.3
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const sMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uPR: { value: renderer ? renderer.getPixelRatio() : 1 } },
    vertexShader: /* glsl */`
      attribute float size; attribute vec3 color; varying vec3 vCol; varying float vB; uniform float uPR;
      void main() { vCol = color; vB = clamp(size / 3.5, 0.6, 1.0); gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying vec3 vCol; varying float vB;
      void main() { vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0; float a = smoothstep(1.0, 0.0, r); a = sqrt(a) * 1.6;
        gl_FragColor = vec4(vCol * a * vB * uOpacity, 1.0); }`,
    transparent: false, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(sGeo, sMat);
  points.renderOrder = -9; points.frustumCulled = false;   // after the sky band (-10), before everything else
  group.add(points);

  // --- stick figures: one LineSegments draw ---
  const seg = [];
  for (const abbr in LINES) for (const pl of LINES[abbr]) {
    for (let i = 0; i + 3 < pl.length; i += 2) {
      raDecToScene(pl[i] / 100, pl[i + 1] / 100, v); seg.push(v.x, v.y, v.z);
      raDecToScene(pl[i + 2] / 100, pl[i + 3] / 100, v); seg.push(v.x, v.y, v.z);
    }
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const LINE_OPACITY = 0.17;
  const lMat = new THREE.LineBasicMaterial({ color: 0x6f8fd0, transparent: false, opacity: 1, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  lMat.color.multiplyScalar(LINE_OPACITY / 0.5);
  const baseLineColor = lMat.color.clone();
  const lines = new THREE.LineSegments(lGeo, lMat);
  lines.renderOrder = -9; lines.frustumCulled = false;
  group.add(lines);

  // --- names: small, dim .label elements ---
  const labels = [];
  const labelGroup = new THREE.Group();
  group.add(labelGroup);
  for (const [abbr, name, ra, dec] of NAMES) {
    const el = document.createElement('div');
    el.className = 'label const-label';
    el.textContent = name;
    el.dataset.abbr = abbr;
    const o = new CSS2DObject(el);
    raDecToScene(ra / 100, dec / 100, o.position);
    labelGroup.add(o);
    labels.push(el);
  }
  scene.add(group);

  let enabled = true, fade = 1, lastMode = 'solar', outgoing = true, frame = 0;
  const own = new Set(labels);
  const _bp = new THREE.Vector3(), _bs = new THREE.Vector3();
  let lastCamera = null;
  function setEnabled(on) { enabled = on; group.visible = on && fade > 0.001; if (!on) clear(); }

  function hideOverlaps() {
    const layer = labels.find((e) => e.parentElement)?.parentElement;  // CSS2DRenderer root
    if (!layer) return;
    const rects = [];
    for (const el of layer.querySelectorAll('.label')) {
      if (own.has(el) || el.classList.contains('overlap') || el.classList.contains('off') || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect(); if (r.width) rects.push(r);
    }
    // projected discs of planets / moons / Sun (window.solar.bodies; each body's mesh world radius -> screen radius)
    const discs = [], bodies = window.solar?.bodies, cam = lastCamera;
    if (bodies && cam) {
      const k = innerHeight / 2 / Math.tan(cam.fov * D2R / 2);
      for (const b of bodies) {
        if (!b.mesh || !b.radius) continue;
        b.mesh.getWorldPosition(_bp); const d = _bp.distanceTo(cam.position);
        b.mesh.getWorldScale(_bs);
        const gr = b.mesh.geometry?.parameters?.radius || b.radius;   // geometry radius x world scale (Moon size easing lives in a parent scale)
        const rpx = (gr * _bs.x) / Math.max(d, 1e-6) * k;
        if (rpx < 3) continue;
        _bp.project(cam); if (_bp.z > 1) continue;
        discs.push([(_bp.x + 1) / 2 * innerWidth, (1 - _bp.y) / 2 * innerHeight, rpx * 1.08]);
      }
    }
    for (const el of labels) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const hit = rects.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 4 && r.bottom > p.top - 4) ||
        discs.some(([x, y, rr]) => { const nx = Math.max(r.left, Math.min(x, r.right)), ny = Math.max(r.top, Math.min(y, r.bottom)); return (nx - x) ** 2 + (ny - y) ** 2 < rr * rr; });
      el.classList.toggle('overlap', hit);
    }
  }

  // mode: 'solar' | 'galaxy' | 'transit'; transition: window.solar.getTransitionInfo()-style { t } or null;
  // inSolarScene: whether the solar-system scene is being rendered
  function update(camera, { mode = 'solar', transition = null, inSolarScene = true } = {}) {
    if (mode === 'transit' && lastMode !== 'transit') outgoing = lastMode === 'solar';
    lastMode = mode;
    let target = 1;
    if (!inSolarScene || mode === 'galaxy') target = 0;
    else if (mode === 'transit') { const t = transition ? Math.min(1, Math.max(0, transition.t)) : 1; target = outgoing ? 1 - t : t; }
    fade = target;
    group.visible = enabled && fade > 0.001;
    if (!group.visible) return;
    lastCamera = camera;
    group.position.copy(camera.position);                       // at infinity
    group.scale.setScalar(camera.far * 0.45);
    sMat.uniforms.uOpacity.value = fade;
    lMat.color.copy(baseLineColor).multiplyScalar(fade);
    hlLineMat.opacity = 0.95 * fade; hlStarMat.uniforms.uOpacity.value = fade;
    const op = String(0.55 * fade);
    if ((frame++ % 3) === 0) { for (const el of labels) el.style.opacity = el.dataset.abbr === selected ? String(fade) : op; hideOverlaps(); }
  }

  // ---- selection: picking, highlight, info card, events ------------------------------------------------------------------
  // Public API (for search, main.js and camera code such as ScaleBot's turn-to-face/FOV zoom):
  //   getTarget(abbr) -> { abbr, name, centerDir: THREE.Vector3 (unit, world space), radiusDeg } | null
  //   select(abbr), clear(), selected (abbr|null), pickAt(clientX, clientY, camera, slopPx) -> abbr|null
  //   window events: 'constellation-select' (detail = getTarget(abbr)), 'constellation-clear' (detail = { abbr })
  const FIG = {};                                  // abbr -> { dirs: unit vectors of the figure's vertices, segs: [[a,b],...] }
  for (const abbr in LINES) {
    const dirs = [], segs = [], key = (x, y) => x + ',' + y, idx = new Map();
    const at = (ra, de) => { const k = key(ra, de); if (!idx.has(k)) { idx.set(k, dirs.length); dirs.push(raDecToScene(ra / 100, de / 100)); } return idx.get(k); };
    for (const pl of LINES[abbr]) for (let i = 0; i + 3 < pl.length; i += 2) segs.push([at(pl[i], pl[i + 1]), at(pl[i + 2], pl[i + 3])]);
    const centre = new THREE.Vector3(); for (const d of dirs) centre.add(d); centre.normalize();
    let radiusDeg = 0; for (const d of dirs) radiusDeg = Math.max(radiusDeg, centre.angleTo(d) / D2R);
    FIG[abbr] = { dirs, segs, centre, radiusDeg };
  }
  const nameOf = Object.fromEntries(NAMES.map((x) => [x[0], x[1]]));
  const labelOf = {}; for (const el of labels) labelOf[el.dataset.abbr] ||= el;

  const hlLineMat = new THREE.LineBasicMaterial({ color: 0xffd27a, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
  const hlLines = new THREE.LineSegments(new THREE.BufferGeometry(), hlLineMat);
  hlLines.renderOrder = -8; hlLines.frustumCulled = false; hlLines.visible = false;
  const hlStarMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uPR: sMat.uniforms.uPR },
    vertexShader: /* glsl */`uniform float uPR; void main() { gl_PointSize = 9.0 * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uOpacity; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, r) * 0.6 + smoothstep(0.35, 0.0, r);
      gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a * uOpacity, 1.0); }`,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const hlStars = new THREE.Points(new THREE.BufferGeometry(), hlStarMat);
  hlStars.renderOrder = -8; hlStars.frustumCulled = false; hlStars.visible = false;
  group.add(hlLines, hlStars);

  // info card (own panel, styled like #info-panel)
  const card = document.createElement('div');
  card.id = 'const-card'; card.className = 'panel hidden scrollable'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Constellation info');
  card.innerHTML = `<button class="const-close" title="Close (Esc)" aria-label="Close constellation card">✕</button><h2></h2><div class="subtitle"></div>
    <p class="const-story"></p><table><tbody></tbody></table>`;
  document.body.appendChild(card);
  card.querySelector('.const-close').addEventListener('click', (e) => { e.stopPropagation(); clear(); });
  for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel']) card.addEventListener(ev, (e) => e.stopPropagation());
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function fillCard(abbr) {
    const f = INFO[abbr];
    card.querySelector('h2').textContent = f.name;
    card.querySelector('.subtitle').textContent = `${f.meaning} · ${f.abbr}`;
    card.querySelector('.const-story').textContent = f.story;
    const rows = [['Brightest', f.brightest], ['Deep sky', f.dso], ['Size', `#${f.areaRank} of 88 · ${f.areaSqDeg.toLocaleString('en-US')} sq°`],
      ['Best from Boise', f.best || 'Never visible'], ['From Boise (43.6° N)', f.boise]];
    card.querySelector('tbody').innerHTML = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    card.scrollTop = 0;
  }

  let selected = null;
  function getTarget(abbr) {
    const F = FIG[abbr]; if (!F) return null;
    return { abbr, name: nameOf[abbr], centerDir: F.centre.clone(), radiusDeg: F.radiusDeg };
  }
  function select(abbr) {
    const F = FIG[abbr]; if (!F) return null;
    if (!enabled) { setEnabled(true); const cb = document.getElementById('toggle-constellations'); if (cb) cb.checked = true; }
    if (selected && selected !== abbr) labelOf[selected]?.classList.remove('active');
    selected = abbr;
    const lp = []; for (const [a, b] of F.segs) lp.push(F.dirs[a].x, F.dirs[a].y, F.dirs[a].z, F.dirs[b].x, F.dirs[b].y, F.dirs[b].z);
    hlLines.geometry.dispose(); hlLines.geometry = new THREE.BufferGeometry(); hlLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const sp = []; for (const d of F.dirs) sp.push(d.x, d.y, d.z);
    hlStars.geometry.dispose(); hlStars.geometry = new THREE.BufferGeometry(); hlStars.geometry.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    hlLines.visible = hlStars.visible = true;
    labelOf[abbr]?.classList.add('active');
    fillCard(abbr);
    document.getElementById('info-panel')?.classList.add('hidden');
    card.classList.remove('hidden');
    const t = getTarget(abbr);
    window.dispatchEvent(new CustomEvent('constellation-select', { detail: t }));
    return t;
  }
  function clear() {
    if (!selected) return;
    const abbr = selected; selected = null;
    labelOf[abbr]?.classList.remove('active');
    hlLines.visible = hlStars.visible = false;
    card.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('constellation-clear', { detail: { abbr } }));
  }
  // nearest figure under a screen point (labels first, then any stick-figure segment within slopPx)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cam = new THREE.Vector3();
  function pickAt(clientX, clientY, camera, slopPx = 12) {
    if (!group.visible || !camera) return null;
    for (const el of labels) {
      if (el.classList.contains('overlap') || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width && clientX >= r.left - 4 && clientX <= r.right + 4 && clientY >= r.top - 4 && clientY <= r.bottom + 4) return el.dataset.abbr;
    }
    camera.getWorldDirection(_cam);
    const W = innerWidth, H = innerHeight, proj = (d, o) => { o.copy(d).add(camera.position); o.project(camera); return d.dot(_cam) > 0.05 && Math.abs(o.x) < 3 && Math.abs(o.y) < 3; };
    let best = null, bestD = slopPx;
    for (const abbr in FIG) {
      const F = FIG[abbr];
      for (const [i, j] of F.segs) {
        if (!proj(F.dirs[i], _a) || !proj(F.dirs[j], _b)) continue;
        const ax = (_a.x + 1) / 2 * W, ay = (1 - _a.y) / 2 * H, bx = (_b.x + 1) / 2 * W, by = (1 - _b.y) / 2 * H;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((clientX - ax) * dx + (clientY - ay) * dy) / L));
        const dd = Math.hypot(ax + t * dx - clientX, ay + t * dy - clientY);
        if (dd < bestD) { bestD = dd; best = abbr; }
      }
    }
    return best;
  }
  for (const el of labels) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); select(el.dataset.abbr); });
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) { e.stopImmediatePropagation(); clear(); } }, true);

  const api = { group, points, lines, labels, update, setEnabled, raDecToScene, getTarget, select, clear, pickAt, info: INFO, card,
    get selected() { return selected; }, get starCount() { return n; }, get fade() { return fade; } };
  return api;
}
