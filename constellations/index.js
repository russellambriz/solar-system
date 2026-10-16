// constellations/: real bright stars (V <= 5) at their true RA/Dec plus faint stick figures and names for the 88 IAU
// constellations, on a sky sphere that is re-centred on the camera every frame (so it sits "at infinity").
// Drawn first in the opaque pass with depthTest/depthWrite off (like the Milky Way sky band), so planets, rings and
// Earth's/Moon's night sides always cover it. One Points draw + one LineSegments draw.
// Data: d3-celestial (Olaf Frohn, BSD-3-Clause), stars from HYG/Hipparcos. See data.js.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { STARS, LINES, NAMES } from './data.js';

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
  function setEnabled(on) { enabled = on; group.visible = on && fade > 0.001; }

  function hideOverlaps() {
    const layer = labels[0]?.parentElement;  // CSS2DRenderer root
    if (!layer) return;
    const rects = [];
    for (const el of layer.querySelectorAll('.label')) {
      if (own.has(el) || el.classList.contains('overlap') || el.classList.contains('off') || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect(); if (r.width) rects.push(r);
    }
    for (const el of labels) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const hit = rects.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 4 && r.bottom > p.top - 4);
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
    group.position.copy(camera.position);                       // at infinity
    group.scale.setScalar(camera.far * 0.45);
    sMat.uniforms.uOpacity.value = fade;
    lMat.color.copy(baseLineColor).multiplyScalar(fade);
    const op = String(0.55 * fade);
    if ((frame++ % 6) === 0) { for (const el of labels) el.style.opacity = op; hideOverlaps(); }
  }

  return { group, points, lines, labels, update, setEnabled, raDecToScene, get starCount() { return n; }, get fade() { return fade; } };
}
