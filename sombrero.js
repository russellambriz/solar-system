// Sombrero Galaxy (M104) for the galaxy scene of /workspace/solar-system (1 unit = 100 ly, galactic plane = XZ).
// Standalone: only needs `three` and the CSS2DRenderer addon (both already in the repo's import map).
//
//   import { addSombrero, SOMBRERO_INFO } from './sombrero.js';
//   const somb = addSombrero(galaxy, { isTouch, labels: true });   // galaxy = createGalaxy(...)
//   ...each frame: somb.update(camera);
//
// Distance scheme: the repo puts Andromeda at its TRUE distance (2.5 Mly = 25,000 units, no compression),
// so M104 is likewise at its true distance: ~31 Mly = 310,000 units (12.4× Andromeda), direction l = 298.46°, b = +51.15°
// (RA 12h40m, Dec −11.6°), measured from the Sun with exactly the same galactic frame galaxy.js uses for M31.
// Size is to scale too: ~50,000 ly across (R = 250 units).
//
// Rendering: emission (stars, additive) and absorption (dust, normal blending) are interleaved by "depth slabs":
// every cloud is drawn N times with a vertex-shader filter that keeps only particles within one slab of distance along
// the view direction, ordered back-to-front. So the far half of the dust ring hides behind the bulge while the near half
// cuts in front of it — from any viewing angle, without per-frame CPU sorting.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const D2R = Math.PI / 180;
export const M104_DIST_LY = 31e6;                        // ~29–31 Mly in the literature; we use 31 Mly
export const M104_L = 298.46, M104_B = 51.15;            // galactic coords (from J2000 RA 12h39m59s, Dec −11°37′23″)

export const SOMBRERO_INFO = {
  name: 'Sombrero Galaxy (M104)', type: 'Spiral galaxy (type Sa) · seen almost exactly edge-on', color: '#ffe6b0',
  rows: [
    ['Distance', '~29–31 million light-years (about 12× farther than Andromeda)'],
    ['Diameter', '~50,000 light-years (about half the Milky Way)'],
    ['Central black hole', '~1 billion times the mass of the Sun'],
    ['Where in the sky', 'Constellation Virgo · visible in small telescopes'],
  ],
  fact: 'We see the Sombrero only about 6° from edge-on, so its ring of dark dust cuts across the huge glowing bulge like the brim of a hat. ' +
        'The light reaching us tonight left it about 30 million years ago. Its central black hole is about 250 times heavier than the one in the middle of the Milky Way.',
};

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---- shaders ---------------------------------------------------------------------------------------------
const VERT = /* glsl */`
  attribute float size; attribute vec3 aColor;
  uniform float uScale, uBright, uMin, uMax, uMaxPt;
  uniform vec3 uToCam;                      // unit vector center → camera, in the galaxy's local frame
  varying vec3 vColor; varying float vFade;
  void main() {
    float s = dot(position, uToCam);        // signed depth toward the camera (local units)
    if (s < uMin || s >= uMax) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vColor = vec3(0.0); vFade = 0.0; return; }
    vColor = aColor * uBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ps = size * uScale / max(-mv.z, 1e-3);
    vFade = clamp(ps * ps, 0.0, 1.0);       // sub-pixel particles dim by area → smooth faint smudge from far away
    gl_PointSize = clamp(ps, 1.0, uMaxPt);
    gl_Position = projectionMatrix * mv;
  }`;
const STAR_FRAG = /* glsl */`
  varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8);
    gl_FragColor = vec4(vColor * a * vFade, 1.0); }`;
// smooth bulge light: a camera-facing quad that evaluates a projected, flattened Sérsic-like spheroid analytically
// (one pass, no 8-bit banding from thousands of faint additive blobs), with soft saturation toward a white-hot center
const BULGE_VERT = /* glsl */`
  varying vec3 vOff;
  void main() { vOff = mat3(modelMatrix) * position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BULGE_FRAG = /* glsl */`
  uniform vec3 uNormal, uWarm, uHot; uniform float uA, uFlat, uGain, uRmax, uOpacity;
  varying vec3 vOff;
  void main() {
    float h = dot(vOff, uNormal); vec3 p = vOff - h * uNormal;
    float q = sqrt(dot(p, p) + h * h / (uFlat * uFlat)) / uA;
    float I = uGain * exp(-2.6 * pow(q, 0.55));
    vec3 col = mix(uWarm, uHot, smoothstep(0.5, 3.0, I)) * (1.0 - exp(-I));
    float edge = 1.0 - smoothstep(0.7, 1.0, length(vOff) / uRmax);
    gl_FragColor = vec4(col * edge * uOpacity, 1.0);
  }`;
const DUST_FRAG = /* glsl */`
  uniform float uAlpha; varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = 1.0 - d * 2.0;
    gl_FragColor = vec4(vColor, a * a * uAlpha * vFade); }`;
// textured dust-lane plane (lies in the disk plane), sliced the same way per fragment
const PLANE_VERT = /* glsl */`
  varying vec3 vLocal; varying vec2 vUv;
  void main() { vLocal = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PLANE_FRAG = /* glsl */`
  uniform sampler2D uMap; uniform float uMin, uMax, uAlpha; uniform vec3 uToCam;
  varying vec3 vLocal; varying vec2 vUv;
  void main() { float s = dot(vLocal, uToCam); if (s < uMin || s >= uMax) discard;
    float a = texture2D(uMap, vUv).a * uAlpha; if (a < 0.003) discard;
    gl_FragColor = vec4(0.045, 0.03, 0.02, a); }`;

function canvasTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const radialTex = (stops) => canvasTex(128, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, s] of stops) gr.addColorStop(o, s);
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});

/**
 * @param galaxy  object returned by createGalaxy(): needs { scene, SUN_POS }; uses M31_POS/M31_R/R for beacons if present
 * @param opts    { isTouch=false, labels=true, beacons=true, distanceLy=31e6 }
 */
export function addSombrero(galaxy, opts = {}) {
  const { isTouch = false, labels = true, beacons = true } = opts;
  const scene = galaxy.scene;
  const SUN_POS = galaxy.SUN_POS.clone();
  const DIST = (opts.distanceLy ?? M104_DIST_LY) / 100;   // 310,000 units
  const R = 250;                                          // ~50,000 ly across
  const R_DUST = 0.66 * R;                                // the famous dust ring

  // direction: same frame as galaxy.js uses for Andromeda (l = 0 toward galactic center, +y = north galactic pole)
  const gcDir = SUN_POS.clone().negate().normalize();
  const l90Dir = new THREE.Vector3(0, 1, 0).cross(gcDir).normalize();
  const L = M104_L * D2R, B = M104_B * D2R;
  const dir = gcDir.clone().multiplyScalar(Math.cos(B) * Math.cos(L)).addScaledVector(l90Dir, Math.cos(B) * Math.sin(L))
    .addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(B)).normalize();
  const POS = SUN_POS.clone().addScaledVector(dir, DIST);
  const los = dir.clone().negate();                       // M104 → Sun (our line of sight, reversed)

  const group = new THREE.Group();                        // in the non-rotating scene, like Andromeda
  group.name = 'Sombrero (M104)';
  group.position.copy(POS);
  scene.add(group);

  // disk orientation: inclined 84° (6° from edge-on) as seen from the Sun; we look at the north face from slightly above,
  // so the near side of the dust ring passes just below the nucleus, as in the famous photos
  const skyUp = new THREE.Vector3(0, 1, 0).addScaledVector(los, -los.y).normalize();
  const normal = los.clone().multiplyScalar(Math.cos(84 * D2R)).addScaledVector(skyUp, Math.sin(84 * D2R)).normalize();
  const disk = new THREE.Group();
  disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.add(disk);
  const major = new THREE.Vector3().crossVectors(normal, los).normalize();   // on-sky major axis
  const minor = new THREE.Vector3().crossVectors(los, major).normalize();    // on-sky minor axis (≈ "up")

  const c = new THREE.Color();
  // ---- particle data -------------------------------------------------------------------------------------
  const cloud = (n, fill) => {
    const p = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { const o = fill(i); p.set(o.p, i * 3); col.set([o.c.r, o.c.g, o.c.b], i * 3); sz[i] = o.s; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    return geo;
  };
  const BULGE_IN = new THREE.Color(1.0, 0.9, 0.72), BULGE_OUT = new THREE.Color(1.0, 0.78, 0.55);
  const DISK_IN = new THREE.Color(1.0, 0.88, 0.7), DISK_OUT = new THREE.Color(0.8, 0.82, 0.95);

  // (1) bulge: big, bright, slightly flattened spheroid + faint round halo (separate cloud)
  const NB = isTouch ? 16000 : 55000;
  const bulgeGeo = cloud(NB, (i) => {
    let x, y, z, r;
    if (i % 10 < 8) {                                           // Sérsic-like bulge: big, fills most of the dust ring
      r = 34 * Math.pow(-Math.log(1 - Math.random() * 0.9995), 1.45);
      if (r > R * 0.85) r = Math.random() * R * 0.85;
      const ct = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, st = Math.sqrt(1 - ct * ct);
      x = r * st * Math.cos(ph); y = r * ct * 0.64; z = r * st * Math.sin(ph);
      c.copy(BULGE_IN).lerp(BULGE_OUT, Math.min(1, r / 120)).multiplyScalar(0.16 + 0.08 * Math.exp(-r / 30) + Math.random() * 0.1);
      return { p: [x, y, z], c, s: 1.5 + Math.random() * 2.0 };
    }
    r = 30 + Math.pow(Math.random(), 1.6) * R * 0.75;          // faint, nearly round stellar halo
    const ct = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, st = Math.sqrt(1 - ct * ct);
    x = r * st * Math.cos(ph); y = r * ct * 0.8; z = r * st * Math.sin(ph);
    c.copy(BULGE_OUT).multiplyScalar(0.1 + Math.random() * 0.08);
    return { p: [x, y, z], c, s: 0.8 + Math.random() * 0.9 };
  });
  // (2) thin disk: exponential disk + starlit "brim" just outside the dust ring + faint, tightly wound arms (Sa, pitch ~6°)
  const ND = isTouch ? 12000 : 42000;
  const K = 1 / Math.tan(6 * D2R), ARM0 = 0.3 * R;
  const diskGeo = cloud(ND, (i) => {
    let r, th; const u = Math.random();
    if (u < 0.4) { r = R_DUST * 1.03 + Math.abs(gauss()) * 0.07 * R; th = Math.random() * Math.PI * 2; }       // brim
    else if (u < 0.65) {                                                                                         // arms
      const k = i % 2; r = ARM0 + (R - ARM0) * Math.pow(Math.random(), 0.9);
      th = k * Math.PI + K * Math.log(r / ARM0) + gauss() * 0.18;          // log spiral, ~1.8 turns
    } else { r = Math.min(R, -Math.log(1 - Math.random() * 0.99) * 0.28 * R); th = Math.random() * Math.PI * 2; }
    const sp = 2 + 0.02 * r;
    const x = Math.cos(th) * r + gauss() * sp, z = Math.sin(th) * r + gauss() * sp, y = gauss() * (1.3 + 1.6 * (r / R));
    c.copy(DISK_IN).lerp(DISK_OUT, Math.min(1, r / R) * 0.45).multiplyScalar(0.22 + Math.random() * 0.14);
    if (Math.random() < 0.012) c.setRGB(0.6, 0.72, 1.0);                       // a few young blue knots
    return { p: [x, y, z], c, s: 1.4 + Math.random() * 1.8 };
  });

  // (3) dust: dense ring (main lane) + faint lanes along the inner arms, very thin vertically
  const NDU = isTouch ? 7000 : 24000;
  const dustGeo = cloud(NDU, (i) => {
    let r, th;
    if (i % 12 !== 0) { r = R_DUST + gauss() * 0.035 * R; th = Math.random() * Math.PI * 2; r += 3 * Math.sin(th * 7 + 1.3); }
    else { const k = i % 2; r = ARM0 * 1.3 + (R_DUST - ARM0 * 1.3) * Math.random(); th = k * Math.PI + K * Math.log(r / ARM0) - 0.14 + gauss() * 0.16; }
    const x = Math.cos(th) * r + gauss() * 1.5, z = Math.sin(th) * r + gauss() * 1.5, y = gauss() * (0.9 + 0.6 * Math.random());
    c.setRGB(0.04, 0.026, 0.016);
    return { p: [x, y, z], c, s: 3 + Math.random() * 5 };
  });

  // (4) canvas-generated dust-lane texture (clumpy annulus) on a plane in the disk
  const LANE_HALF = R * 0.86;
  const laneTex = canvasTex(isTouch ? 512 : 1024, (g, n) => {
    const cx = n / 2, s = n / 2 / LANE_HALF;
    for (let k = 0; k < (isTouch ? 2500 : 7000); k++) {
      const th = Math.random() * Math.PI * 2, r = (R_DUST + gauss() * 0.045 * R) * s, rad = (1.5 + Math.random() * 5) * s;
      const x = cx + Math.cos(th) * r, y = cx + Math.sin(th) * r;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  const laneGeo = new THREE.PlaneGeometry(LANE_HALF * 2, LANE_HALF * 2).rotateX(-Math.PI / 2);

  // ---- depth-sliced drawables ------------------------------------------------------------------------------
  const NS = isTouch ? 4 : 6;                       // slabs along the view direction
  const EDGE = 1.15 * R_DUST;
  const edges = [-1e9]; for (let k = 1; k < NS; k++) edges.push(-EDGE + (2 * EDGE * k) / NS); edges.push(1e9);
  const shared = { uScale: { value: 800 }, uToCam: { value: new THREE.Vector3(0, 0, 1) }, uMaxPt: { value: 256 } };
  const materials = [], drawables = [];
  const RO = 20;                                   // renderOrder base (after the Milky Way / Andromeda layers)
  const mkPoints = (geo, frag, slab, order, extra) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uMin: { value: edges[slab] }, uMax: { value: edges[slab + 1] }, uBright: { value: extra.bright ?? 1 }, uAlpha: { value: extra.alpha ?? 1 } },
      vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending: extra.blending ?? THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = order;
    materials.push(m); drawables.push(pts); disk.add(pts); return pts;
  };
  const parts = { bulge: [], disk: [], dust: [], lane: [] };
  for (let k = 0; k < NS; k++) {
    const o = RO + k * 5;                          // per slab: bulge stars, disk stars, then absorbing dust + lane
    parts.bulge.push(mkPoints(bulgeGeo, STAR_FRAG, k, o + 1, { bright: isTouch ? 0.5 : 0.36 }));
    parts.disk.push(mkPoints(diskGeo, STAR_FRAG, k, o + 2, { bright: isTouch ? 0.6 : 0.5 }));
    parts.dust.push(mkPoints(dustGeo, DUST_FRAG, k, o + 3, { blending: THREE.NormalBlending, alpha: isTouch ? 0.75 : 0.55 }));
    const lm = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: laneTex }, uToCam: shared.uToCam, uMin: { value: edges[k] }, uMax: { value: edges[k + 1] }, uAlpha: { value: 0.85 } },
      vertexShader: PLANE_VERT, fragmentShader: PLANE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const lane = new THREE.Mesh(laneGeo, lm); lane.renderOrder = o + 4; lane.frustumCulled = false;
    materials.push(lm); disk.add(lane); parts.lane.push(lane);
  }
  // bright nucleus: emissive sprite at the center, drawn between the far and near halves (so the near dust lane can cross it)
  const nucleusTex = radialTex([[0, 'rgba(255,250,235,0.9)'], [0.06, 'rgba(255,240,200,0.5)'], [0.25, 'rgba(255,205,140,0.1)'], [1, 'rgba(255,170,90,0)']]);
  const nucleus = new THREE.Sprite(new THREE.SpriteMaterial({ map: nucleusTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  nucleus.scale.setScalar(R * 0.4); nucleus.renderOrder = RO + (NS / 2) * 5 - 0.5;
  group.add(nucleus);
  // smooth bulge glow (separate mesh, same center slot as the nucleus: far dust behind it, near dust lane in front)
  const bulgeGlow = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.4, R * 2.4), new THREE.ShaderMaterial({
    uniforms: { uNormal: { value: normal.clone() }, uWarm: { value: new THREE.Color(1.0, 0.78, 0.5) }, uHot: { value: new THREE.Color(1.0, 0.96, 0.86) },
      uA: { value: 0.24 * R }, uFlat: { value: 0.6 }, uGain: { value: isTouch ? 12 : 11 }, uRmax: { value: R * 1.2 }, uOpacity: { value: 1 } },
    vertexShader: BULGE_VERT, fragmentShader: BULGE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  bulgeGlow.renderOrder = RO + (NS / 2) * 5 - 0.6; bulgeGlow.frustumCulled = false;
  bulgeGlow.onBeforeRender = (_r, _s, camera) => { bulgeGlow.quaternion.copy(camera.quaternion); bulgeGlow.updateMatrixWorld(); };
  group.add(bulgeGlow); materials.push(bulgeGlow.material);
  // far smudge: a soft glow that takes over when particles shrink below a pixel
  const smudgeTex = radialTex([[0, 'rgba(255,235,200,0.9)'], [0.25, 'rgba(255,215,160,0.3)'], [1, 'rgba(0,0,0,0)']]);
  const smudge = new THREE.Sprite(new THREE.SpriteMaterial({ map: smudgeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  smudge.scale.set(R * 1.8, R * 0.9, 1); smudge.renderOrder = RO - 1;
  group.add(smudge);

  // calibrate point sizes from the actual renderer/camera (no setScale call needed) and update the slab direction
  const _v2 = new THREE.Vector2(), _cam = new THREE.Vector3(), _inv = new THREE.Matrix4();
  let maxPtChecked = false;
  drawables[0].onBeforeRender = (renderer, _scene, camera) => {
    if (!maxPtChecked) { const r = renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE); shared.uMaxPt.value = Math.min(256, r ? r[1] : 64); maxPtChecked = true; }
    renderer.getDrawingBufferSize(_v2);
    const fov = camera.isPerspectiveCamera ? camera.fov : 50;
    shared.uScale.value = _v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    _cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv.copy(disk.matrixWorld).invert());
    if (_cam.lengthSq() > 1e-9) shared.uToCam.value.copy(_cam).normalize();
  };

  // ---- labels, beacons and distance line ---------------------------------------------------------------------
  const labelEls = [];
  const makeLabel = (html, cls) => {
    const wrap = document.createElement('div'); wrap.className = 'galaxy-label-wrap';
    const lab = document.createElement('div'); lab.className = 'label galaxy-label ' + cls; lab.innerHTML = html;
    wrap.appendChild(lab); return { obj: new CSS2DObject(wrap), el: lab };
  };
  let label = null, distLabel = null;
  if (labels) {
    label = makeLabel('Sombrero Galaxy · <b>M104</b>', 'sombrero-label');
    label.obj.position.copy(minor).multiplyScalar(R * 0.42);
    group.add(label.obj); labelEls.push(label.el);
    distLabel = makeLabel('≈ 31 million light-years · 12× farther than Andromeda', 'small dist-label sombrero-dist off');
    distLabel.obj.position.copy(SUN_POS).lerp(POS, 0.5);
    scene.add(distLabel.obj); labelEls.push(distLabel.el);
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints([SUN_POS.clone().addScaledVector(dir, 3000), POS.clone().addScaledVector(dir, -R * 4)]);
  const distLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, dashSize: 6000, gapSize: 4500, depthWrite: false }));
  distLine.computeLineDistances(); distLine.visible = false;
  scene.add(distLine);

  // beacons: minimum-on-screen-size glows so each galaxy can still be found when it is far below a pixel (true scale!)
  const beaconTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const beaconList = [];
  const addBeacon = (pos, radius, color) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, opacity: 0 }));
    s.position.copy(pos); s.renderOrder = 90; s.visible = false; scene.add(s); beaconList.push({ s, pos: pos.clone(), radius });
  };
  addBeacon(POS, R, 0xffe2b0);
  if (beacons) {
    addBeacon(new THREE.Vector3(0, 0, 0), galaxy.R ?? 500, 0xbfd0ff);                 // Milky Way center
    if (galaxy.M31_POS) addBeacon(galaxy.M31_POS, galaxy.M31_R ?? 1100, 0xffd9a0);  // Andromeda
  }

  let visible = true;
  const _p = new THREE.Vector3();
  function update(camera) {
    if (!visible) return;
    const pxPerUnit = shared.uScale.value / (window.devicePixelRatio || 1) * 1;   // CSS px per unit at distance 1 (approx.)
    const camPos = camera.getWorldPosition(_p);
    const dS = camPos.distanceTo(POS), dMW = camPos.length();
    // particles fade by area when tiny; keep a soft smudge so it stays a visible oval when moderately far
    const far = THREE.MathUtils.smoothstep(dS, 4000, 40000);
    smudge.material.opacity = 0.9 * far;
    nucleus.material.opacity = 1 - 0.3 * far;
    for (const b of beaconList) {
      const d = camPos.distanceTo(b.pos), appPx = b.radius / d * pxPerUnit;   // apparent radius in px
      const a = 1 - THREE.MathUtils.smoothstep(appPx, 3, 12);
      b.s.visible = a > 0.01; b.s.material.opacity = 0.85 * a;
      b.s.scale.setScalar(16 / pxPerUnit);                                       // ~16 px wide regardless of distance
    }
    const showLine = dMW > 40000 && dS > 40000;
    distLine.visible = showLine;
    if (distLabel) distLabel.el.classList.toggle('off', !showLine);
    if (label) label.el.classList.toggle('off', dMW < 4500 && dS > 20000);   // hide while exploring the Milky Way up close
  }

  function setVisible(v) {
    visible = !!v;
    group.visible = visible; distLine.visible = visible && distLine.visible;
    for (const b of beaconList) b.s.visible = visible && b.s.visible;
    for (const el of labelEls) el.classList.toggle('off', !visible || el === distLabel?.el);
  }
  function dispose() {
    for (const m of materials) m.dispose();
    for (const g of [bulgeGeo, diskGeo, dustGeo, laneGeo, lineGeo, bulgeGlow.geometry]) g.dispose();
    for (const t of [laneTex, nucleusTex, smudgeTex, beaconTex]) t.dispose();
    for (const s of [nucleus, smudge, ...beaconList.map((b) => b.s)]) s.material.dispose();
    distLine.material.dispose();
    for (const o of [group, distLine, ...beaconList.map((b) => b.s)]) o.removeFromParent();
    if (distLabel) distLabel.obj.removeFromParent();
    for (const el of labelEls) el.parentElement?.remove();
  }

  return {
    group, update, setVisible, dispose, labelEls, parts: { ...parts, bulgeGlow, nucleus, smudge },
    info: { ...SOMBRERO_INFO, position: POS.clone(), direction: dir.clone(), distanceUnits: DIST, radius: R, normal: normal.clone(), major, minor, los: los.clone(),
      counts: { bulge: NB, disk: ND, dust: NDU, slabs: NS } },
    POS, R, dir,
  };
}
