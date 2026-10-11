// localgroup/index.js: the Large and Small Magellanic Clouds and the Triangulum Galaxy (M33) for the galaxy scene
// (1 unit = 100 ly, galactic plane = XZ, same frame galaxy.js uses for Andromeda). Standalone like sombrero.js:
//
//   import { addLocalGroup } from './localgroup/index.js';
//   const localGroup = addLocalGroup(galaxy, { isTouch, labels: true });   // galaxy = createGalaxy(...)
//   ...each galaxy-view frame: localGroup.update(camera);
//
// True distances from the Sun along their real galactic directions:
//   LMC  ~160,000 ly → 1,600 units at l = 280.5°, b = −32.9°  (~14,000 ly across)
//   SMC  ~200,000 ly → 2,000 units at l = 302.8°, b = −44.3°  (~7,000 ly across), ~75,000 ly from the LMC
//   M33  ~2.7 million ly → 27,000 units at l = 133.6°, b = −31.3° (~60,000 ly across), ~700,000 ly from Andromeda
// The two Clouds are Milky Way satellites, so they hang off galaxy.group and ride along with the disk (their direction
// from the Sun stays right as it turns, like the nebulae). M33 belongs with Andromeda, so it sits in the non-rotating
// galaxy.scene: in galaxy.group, 27,000 units out, the disk's sped-up spin would sweep it hundreds of units per second.
// Labels carry the `galaxy-label` + `small` classes, so galaxy.js's overlap pass nudges or hides them before Andromeda's.
// Point sizes calibrate themselves from the renderer (no setScale call needed), like sombrero.js.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const D2R = Math.PI / 180;

export const LOCAL_GROUP_INFO = {
  lmc: {
    name: 'Large Magellanic Cloud (LMC)', type: 'Dwarf galaxy (Magellanic barred spiral) · satellite of the Milky Way', color: '#d6e4ff',
    rows: [
      ['Distance', '~160,000 light-years'],
      ['Diameter', '~14,000 light-years (about 1/7 of the Milky Way)'],
      ['Stars', '~20–30 billion; about a tenth of the Milky Way\'s mass'],
      ['Where in the sky', 'Dorado and Mensa, far southern sky: a hazy patch visible to the naked eye'],
    ],
    fact: 'Home of the Tarantula Nebula, the brightest star-forming region in the Local Group, which holds R136a1, one of the most ' +
          'massive stars known (about 200 Suns). Supernova 1987A exploded here: the closest supernova seen since the telescope was ' +
          'invented. The Persian astronomer al-Sufi described it in 964 AD; Europeans named it after Magellan\'s 1519–22 voyage. ' +
          'It is falling toward the Milky Way and should merge with it in about 2.5 billion years.',
  },
  smc: {
    name: 'Small Magellanic Cloud (SMC)', type: 'Dwarf irregular galaxy · satellite of the Milky Way', color: '#cfe0ff',
    rows: [
      ['Distance', '~200,000 light-years (~75,000 ly beyond the LMC)'],
      ['Diameter', '~7,000 light-years'],
      ['Stars', 'A few hundred million to a few billion'],
      ['Where in the sky', 'Tucana, far southern sky, next to the globular cluster 47 Tucanae (which is in our galaxy)'],
    ],
    fact: 'The LMC\'s pull has stretched it out along our line of sight, and the two are joined by the Magellanic Bridge, a ' +
          'stream of gas and young stars. In 1912 Henrietta Leavitt studied blinking Cepheid stars in the SMC and found that their ' +
          'brightness follows their pulse rate: the key that first measured the distance to Andromeda and the size of the universe.',
  },
  m33: {
    name: 'Triangulum Galaxy (M33)', type: 'Spiral galaxy (type SA(s)cd) · third-largest in the Local Group', color: '#cfe6ff',
    rows: [
      ['Distance', '~2.7 million light-years (~700,000 ly from Andromeda)'],
      ['Diameter', '~60,000 light-years (about 60% of the Milky Way)'],
      ['Stars', '~40 billion'],
      ['Where in the sky', 'Triangulum: one of the most distant things visible to the naked eye, under very dark skies'],
    ],
    fact: 'A loose, patchy ("flocculent") spiral with almost no central bulge, just a small bright nucleus. It contains NGC 604, ' +
          'one of the largest star-forming nebulae known: about 1,500 light-years across, some 40 times the size of the Orion ' +
          'Nebula. It is probably a satellite of Andromeda and may be swept up when Andromeda and the Milky Way merge.',
  },
};

// same particle look as galaxy.js: sub-pixel stars dim by their true area, so far galaxies fade into a smooth smudge
const VERT = /* glsl */`
  attribute float size; attribute vec3 aColor;
  uniform float uScale, uBright;
  varying vec3 vColor; varying float vFade;
  void main() {
    vColor = aColor * uBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ps = size * uScale / -mv.z;
    vFade = clamp(ps * ps, 0.0, 1.0);
    gl_PointSize = clamp(ps, 1.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor; varying float vFade;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8);
    gl_FragColor = vec4(vColor * a * vFade, 1.0); }`;

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const radialTex = (stops) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, s] of stops) gr.addColorStop(o, s);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
};

/**
 * @param galaxy  object returned by createGalaxy(): uses { scene, group, SUN_POS, sunWorldPos, spinning }
 * @param opts    { isTouch = false, labels = true }
 */
export function addLocalGroup(galaxy, opts = {}) {
  const { isTouch = false, labels = true } = opts;
  const UP = new THREE.Vector3(0, 1, 0);
  const SUN = galaxy.SUN_POS.clone();               // galaxy.group frame (= scene frame before the disk starts turning)
  const gcDir = SUN.clone().negate().normalize();   // l = 0
  const l90 = UP.clone().cross(gcDir).normalize();  // l = 90°
  const galDir = (l, b) => gcDir.clone().multiplyScalar(Math.cos(b * D2R) * Math.cos(l * D2R))
    .addScaledVector(l90, Math.cos(b * D2R) * Math.sin(l * D2R)).addScaledVector(UP, Math.sin(b * D2R)).normalize();
  // disk normal tilted `incl` from face-on as seen from the Sun, position angle `pa` (cosmetic) about our line of sight
  const diskNormal = (dir, incl, pa) => {
    const los = dir.clone().negate();
    const perp = UP.clone().addScaledVector(los, -los.y).normalize().applyAxisAngle(los, pa * D2R);
    return los.multiplyScalar(Math.cos(incl * D2R)).addScaledVector(perp, Math.sin(incl * D2R)).normalize();
  };
  const skyUp = (dir) => { const los = dir.clone().negate(); return UP.clone().addScaledVector(los, -los.y).normalize(); };

  const shared = { uScale: { value: 800 } };
  const materials = [], geometries = [], textures = [];
  const _v2 = new THREE.Vector2();
  const calibrate = (renderer, _s, camera) => {
    renderer.getDrawingBufferSize(_v2);
    shared.uScale.value = _v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 50) / 2));
  };
  const c = new THREE.Color();
  function points(n, fill, bright) {
    const p = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { const o = fill(i); p.set(o.p, i * 3); col.set([o.c.r, o.c.g, o.c.b], i * 3); sz[i] = o.s; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: shared.uScale, uBright: { value: bright } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 1;
    pts.onBeforeRender = calibrate;
    materials.push(mat); geometries.push(geo);
    return pts;
  }
  function glow(stops, scale, order = 0) {
    const tex = radialTex(stops); textures.push(tex);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(scale); s.renderOrder = order; materials.push(s.material);
    return s;
  }
  function diskGlow(stops, size) {
    const tex = radialTex(stops); textures.push(tex);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    materials.push(m.material); geometries.push(m.geometry);
    return m;
  }
  const bright = (desktop, touch) => (isTouch ? touch : desktop);

  // one galaxy: outer group at the true position (+ label), inner disk group tilted to its real inclination, spin group
  const objects = {};
  function makeObject(key, parent, l, b, distUnits, R, incl, pa) {
    const dir = galDir(l, b);
    const pos = SUN.clone().addScaledVector(dir, distUnits);
    const group = new THREE.Group(); group.name = LOCAL_GROUP_INFO[key].name; group.position.copy(pos);
    parent.add(group);
    const disk = new THREE.Group();
    disk.quaternion.setFromUnitVectors(UP, diskNormal(dir, incl, pa));
    group.add(disk);
    const spin = new THREE.Group(); disk.add(spin);
    return (objects[key] = { key, group, disk, spin, pos, dir, R, info: LOCAL_GROUP_INFO[key] });
  }

  // ---- Large Magellanic Cloud: off-centre bar, one main arm, the Tarantula Nebula -----------------------------------
  const lmc = makeObject('lmc', galaxy.group, 280.47, -32.89, 1600, 70, 35, 150);
  {
    const R = lmc.R, K = 1 / Math.tan(25 * D2R), barAng = 0.35, ca = Math.cos(barAng), sa = Math.sin(barAng);
    const TARANTULA = [17, 0, -15];
    const knots = Array.from({ length: 14 }, () => { const r = 15 + Math.random() * 40, t = Math.random() * Math.PI * 2; return [Math.cos(t) * r + 5, 0, Math.sin(t) * r]; });
    const OLD = new THREE.Color(1.0, 0.88, 0.7), YOUNG = new THREE.Color(0.68, 0.8, 1.0), PINK = new THREE.Color(1.0, 0.42, 0.62);
    const N = isTouch ? 5500 : 15000;
    lmc.spin.add(points(N, (i) => {
      const u = Math.random();
      let x, y, z, s;
      if (u < 0.3) {                                   // bar: old yellowish stars, off the disk centre
        const bx = gauss() * 21, bz = gauss() * 5.5;
        x = bx * ca - bz * sa - 6; z = bx * sa + bz * ca + 3; y = gauss() * 3;
        c.copy(OLD).multiplyScalar(0.32 + Math.random() * 0.22); s = 1.0 + Math.random() * 1.0;
      } else if (u < 0.52) {                           // the main (northern) arm curling from the bar's end
        const r = 18 + 44 * Math.pow(Math.random(), 0.9), th = 2.4 + K * Math.log(r / 18) * 0.55, sp = 3 + 0.07 * r;
        x = Math.cos(th) * r + gauss() * sp; z = Math.sin(th) * r + gauss() * sp; y = gauss() * 2;
        c.copy(YOUNG).lerp(OLD, Math.random() * 0.3).multiplyScalar(0.3 + Math.random() * 0.25); s = 0.9 + Math.random() * 1.1;
      } else if (u < 0.97) {                           // lopsided exponential disk
        const r = Math.min(R, -Math.log(1 - Math.random() * 0.99) * 16), th = Math.random() * Math.PI * 2;
        x = Math.cos(th) * r + 5; z = Math.sin(th) * r; y = gauss() * 2.5;
        c.copy(OLD).lerp(YOUNG, Math.min(1, r / R)).multiplyScalar(0.2 + Math.random() * 0.18); s = 0.8 + Math.random() * 0.9;
      } else {                                         // star-forming knots, the brightest one the Tarantula (30 Doradus)
        const k = Math.random() < 0.5 ? TARANTULA : knots[i % knots.length], sp = k === TARANTULA ? 2.5 : 1.2;
        x = k[0] + gauss() * sp; z = k[2] + gauss() * sp; y = gauss() * 1.2;
        c.copy(PINK).lerp(new THREE.Color(1, 0.85, 0.9), Math.random() * 0.3).multiplyScalar(0.75); s = 1.4 + Math.random() * 1.6;
      }
      return { p: [x, y, z], c, s };
    }, bright(0.42, 0.55)));
    const tar = glow([[0, 'rgba(255,170,200,0.7)'], [0.25, 'rgba(255,110,160,0.22)'], [1, 'rgba(255,80,140,0)']], 12, 2);
    tar.position.set(...TARANTULA);
    lmc.spin.add(tar);
    lmc.spin.add(diskGlow([[0, 'rgba(240,230,215,0.35)'], [0.3, 'rgba(190,200,240,0.14)'], [1, 'rgba(0,0,0,0)']], R * 2.4));
    lmc.glows = [lmc.spin.children[lmc.spin.children.length - 1]];
  }

  // ---- Small Magellanic Cloud: elongated body + the "Wing" pointing to the LMC ------------------------------------
  const smc = makeObject('smc', galaxy.group, 302.81, -44.33, 2000, 35, 65, 40);
  const toLMC = lmc.pos.clone().sub(smc.pos);                          // group frame
  {
    const R = smc.R, wingDir = toLMC.clone().normalize().applyQuaternion(smc.disk.quaternion.clone().invert());
    const PALE = new THREE.Color(0.82, 0.88, 1.0), WARM = new THREE.Color(1.0, 0.9, 0.76), PINK = new THREE.Color(1.0, 0.45, 0.66);
    const N = isTouch ? 2600 : 7000;
    smc.spin.add(points(N, () => {
      const u = Math.random();
      let x, y, z, s;
      if (u < 0.7) {                                    // main body: a lumpy bar, deep along our line of sight
        x = gauss() * 13; z = gauss() * 5; y = gauss() * 6;
        c.copy(WARM).lerp(PALE, Math.random()).multiplyScalar(0.22 + Math.random() * 0.18); s = 0.8 + Math.random() * 0.9;
      } else if (u < 0.97) {                            // the Wing, reaching toward the LMC
        const t = Math.pow(Math.random(), 0.8) * R * 0.9;
        x = wingDir.x * t + gauss() * 5; y = wingDir.y * t + gauss() * 4; z = wingDir.z * t + gauss() * 5;
        c.copy(PALE).multiplyScalar(0.22 + Math.random() * 0.18); s = 0.8 + Math.random() * 0.9;
      } else {                                          // NGC 346, the SMC's brightest star-forming region
        x = -8 + gauss() * 1.5; z = 3 + gauss() * 1.5; y = gauss() * 1.2;
        c.copy(PINK).multiplyScalar(0.75); s = 1.3 + Math.random() * 1.4;
      }
      return { p: [x, y, z], c, s };
    }, bright(0.42, 0.55)));
    const g = glow([[0, 'rgba(230,235,255,0.45)'], [0.3, 'rgba(190,205,255,0.14)'], [1, 'rgba(0,0,0,0)']], R * 2.2);
    smc.group.add(g); smc.glows = [g];
  }
  // Magellanic Bridge: thin stream of gas and young stars between the Clouds (denser near the SMC's Wing)
  let bridge;
  {
    const n = isTouch ? 700 : 1800, side = new THREE.Vector3().crossVectors(toLMC, UP).normalize();
    bridge = points(n, () => {
      const t = Math.pow(Math.random(), 0.7), bow = Math.sin(Math.PI * t) * 40;
      const p = smc.pos.clone().addScaledVector(toLMC, t).addScaledVector(side, bow + gauss() * (8 + 10 * Math.sin(Math.PI * t)))
        .addScaledVector(UP, gauss() * 8);
      c.setRGB(0.5, 0.62, 0.95).multiplyScalar(0.18 + Math.random() * 0.2);
      return { p: [p.x, p.y, p.z], c, s: 1.6 + Math.random() * 1.4 };
    }, bright(0.5, 0.65));
    galaxy.group.add(bridge);
  }

  // ---- Triangulum Galaxy (M33): flocculent two-arm spiral, tiny nucleus, NGC 604 -----------------------------------
  const m33 = makeObject('m33', galaxy.scene, 133.61, -31.33, 27000, 300, 54, 23);
  {
    const R = m33.R, K = 1 / Math.tan(24 * D2R), ARM0 = 25;
    const IN = new THREE.Color(1.0, 0.9, 0.74), OUT = new THREE.Color(0.6, 0.74, 1.0), PINK = new THREE.Color(1.0, 0.42, 0.64);
    const NGC604 = (() => { const r = 125, th = K * Math.log(r / ARM0); return [Math.cos(th) * r, 0, Math.sin(th) * r]; })();
    const N = isTouch ? 14000 : 38000;
    m33.spin.add(points(N, (i) => {
      const u = Math.random();
      let x, y, z, s;
      if (u < 0.05) {                                    // small nucleus (no real bulge)
        const r = 10 * Math.pow(-Math.log(1 - Math.random() * 0.99), 1.2), ct = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, st = Math.sqrt(1 - ct * ct);
        x = r * st * Math.cos(ph); y = r * ct * 0.6; z = r * st * Math.sin(ph);
        c.copy(IN).multiplyScalar(0.45 + Math.random() * 0.3); s = 1.8 + Math.random() * 2;
      } else if (u < 0.45) {                             // two main arms, broken into clumps
        const k = i % 2, r = ARM0 + (R * 0.92 - ARM0) * Math.pow(Math.random(), 1.1);
        const th = k * Math.PI + K * Math.log(r / ARM0) + 0.22 * Math.sin(r * 0.07 + k * 2.1) + gauss() * 0.12, sp = 5 + 0.05 * r;
        x = Math.cos(th) * r + gauss() * sp; z = Math.sin(th) * r + gauss() * sp; y = gauss() * (4 + 3 * (1 - r / R));
        c.copy(IN).lerp(OUT, Math.min(1, Math.pow(r / R, 0.6))).multiplyScalar(0.32 + Math.random() * 0.26); s = 1.6 + Math.random() * 2.2;
      } else if (u < 0.6) {                              // flocculent fragments: short spiral segments all over the disk
        const r0 = 40 + Math.random() * 220, th0 = Math.random() * Math.PI * 2, t = gauss() * 18;
        const r = Math.max(15, r0 + t), th = th0 + K * Math.log(r / r0);
        x = Math.cos(th) * r + gauss() * 5; z = Math.sin(th) * r + gauss() * 5; y = gauss() * 4;
        c.copy(OUT).lerp(IN, Math.random() * 0.4).multiplyScalar(0.25 + Math.random() * 0.2); s = 1.4 + Math.random() * 1.8;
      } else if (u < 0.96) {                             // exponential disk
        const r = Math.min(R, -Math.log(1 - Math.random() * 0.995) * 70), th = Math.random() * Math.PI * 2;
        x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * 5;
        c.copy(IN).lerp(OUT, Math.min(1, r / R * 1.2)).multiplyScalar(0.2 + Math.random() * 0.14); s = 1.2 + Math.random() * 1.4;
      } else {                                           // HII regions along the arms, NGC 604 the biggest
        if (Math.random() < 0.3) { x = NGC604[0] + gauss() * 6; z = NGC604[2] + gauss() * 6; y = gauss() * 2; }
        else { const k = i % 2, r = 40 + Math.random() * 220, th = k * Math.PI + K * Math.log(r / ARM0) + gauss() * 0.1; x = Math.cos(th) * r + gauss() * 4; z = Math.sin(th) * r + gauss() * 4; y = gauss() * 2; }
        c.copy(PINK).lerp(new THREE.Color(1, 0.85, 0.9), Math.random() * 0.3); s = 3 + Math.random() * 4;
      }
      return { p: [x, y, z], c, s };
    }, bright(0.48, 0.62)));
    const ngc = glow([[0, 'rgba(255,175,205,0.8)'], [0.25, 'rgba(255,110,160,0.28)'], [1, 'rgba(255,80,140,0)']], 40, 2);
    ngc.position.set(...NGC604);
    m33.spin.add(ngc);
    const dg = diskGlow([[0, 'rgba(235,230,225,0.4)'], [0.15, 'rgba(200,205,240,0.16)'], [0.5, 'rgba(130,155,255,0.05)'], [1, 'rgba(0,0,0,0)']], R * 2.2);
    m33.disk.add(dg);
    const core = glow([[0, 'rgba(255,240,210,0.8)'], [0.2, 'rgba(255,215,160,0.25)'], [1, 'rgba(255,170,90,0)']], 60, 3);
    m33.group.add(core);
    m33.glows = [dg, core];
  }

  // beacon: a constant-size glow so M33 can still be found when it shrinks below a pixel (true scale, like sombrero.js)
  const beaconTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  textures.push(beaconTex);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, color: 0xcfe0ff, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: false, opacity: 0 }));
  beacon.renderOrder = 90; beacon.visible = false; m33.group.add(beacon); materials.push(beacon.material);

  // ---- labels (galaxy-label + small: galaxy.js's overlap pass keeps them clear of Andromeda's and the Sun marker) ---
  const labelEls = [];
  if (labels) {
    for (const o of Object.values(objects)) {
      const wrap = document.createElement('div'); wrap.className = 'galaxy-label-wrap';
      const el = document.createElement('div');
      el.className = `label galaxy-label small lg-dwarf lg-${o.key}`;
      el.innerHTML = { lmc: 'Large Magellanic Cloud', smc: 'Small Magellanic Cloud', m33: 'Triangulum Galaxy · <b>M33</b>' }[o.key];
      wrap.appendChild(el);
      const obj = new CSS2DObject(wrap);
      obj.position.copy(skyUp(o.dir)).multiplyScalar(o.R * (o.key === 'm33' ? 0.75 : 0.9));
      o.group.add(obj);
      o.labelEl = el; labelEls.push(el);
    }
  }

  // ---- per frame ---------------------------------------------------------------------------------------------------
  const _p = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
  let lastT = performance.now(), visible = true;
  const SPIN = { lmc: (2 * Math.PI) / 1200, m33: (2 * Math.PI) / 900 };   // cosmetic, like M31/M104; paused with them
  function update(camera) {
    const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.1); lastT = now;
    if (!visible) return;
    if (galaxy.spinning ?? true) {
      lmc.spin.rotation.y -= dt * SPIN.lmc;
      m33.spin.rotation.y -= dt * SPIN.m33;
    }
    const cam = camera.getWorldPosition(_p), dMW = cam.length();
    const pxPerUnit = shared.uScale.value / (window.devicePixelRatio || 1);
    for (const o of Object.values(objects)) {
      const d = cam.distanceTo(o.group.getWorldPosition(_w));
      // far away the particles fade below a pixel; strengthen the soft glows so the galaxy stays a visible smudge
      const far = THREE.MathUtils.smoothstep(d, o.R * 12, o.R * 120);
      for (const g of o.glows) g.material.opacity = 1 + 2.5 * far;
      if (o.labelEl) {
        const hide = o.key === 'm33' ? (dMW < 4500 && d > 20000) || dMW > 150000 : dMW > 9000 || d > 9000;
        o.labelEl.classList.toggle('off', hide);
      }
    }
    const dM = cam.distanceTo(m33.group.getWorldPosition(_w)), app = m33.R / dM * pxPerUnit;
    const a = 1 - THREE.MathUtils.smoothstep(app, 3, 12);
    beacon.visible = a > 0.01; beacon.material.opacity = 0.75 * a;
    beacon.scale.setScalar(14 / pxPerUnit);
  }

  // ---- picking, fly-to framing and the info card ---------------------------------------------------------------------
  const center = (key, out = new THREE.Vector3()) => objects[key].group.getWorldPosition(out);
  function pick(clientX, clientY, camera, el, slopPx) {
    if (!visible) return null;
    const r = el.getBoundingClientRect(), fovScale = r.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let best = null, bestScore = Infinity;
    for (const o of Object.values(objects)) {
      if (o.labelEl?.classList.contains('off') && o.key !== 'm33') continue;     // Clouds: only when they're labelled
      center(o.key, _w);
      const dist = camera.position.distanceTo(_w);
      _w.project(camera);
      if (_w.z > 1) continue;
      const sx = (_w.x + 1) / 2 * r.width + r.left, sy = (1 - _w.y) / 2 * r.height + r.top;
      const rpx = o.R * 0.85 / dist * fovScale, d = Math.hypot(sx - clientX, sy - clientY);
      if (d < rpx + slopPx && d / (rpx + slopPx) < bestScore) { bestScore = d / (rpx + slopPx); best = o.key; }
    }
    return best;
  }
  // end view: from our side (roughly along our line of sight, nudged for depth), framed to fit the screen
  function focusView(key, camera) {
    const o = objects[key], target = center(key);
    const los = galaxy.sunWorldPos(new THREE.Vector3()).sub(target).normalize();
    const side = UP.clone().cross(los).normalize();
    const dir = los.addScaledVector(side, 0.22).addScaledVector(UP, 0.18).normalize();
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dist = o.R * (key === 'smc' ? 1.6 : 1.25) / tanH / Math.min(1, camera.aspect);
    return { position: target.clone().addScaledVector(dir, dist), target, minDistance: o.R * 0.45 };
  }
  // middle stage for the Clouds: the Milky Way and the Cloud side by side (shows the real gap), seen from the current side
  function farPair(key, camera) {
    const c0 = center(key), mid = c0.clone().multiplyScalar(0.5);
    let v = camera.position.clone().sub(mid);
    v.addScaledVector(c0.clone().normalize(), -v.dot(c0.clone().normalize()));      // perpendicular to the MW–Cloud line
    if (v.lengthSq() < 1) v.set(0, 1, 0);
    v.normalize().addScaledVector(UP, 0.35).normalize();
    const half = c0.length() / 2 + 600, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return [mid.clone().addScaledVector(v, half / tanH / Math.min(1, camera.aspect) * 1.05), mid];
  }
  function showInfo(key) {
    const $ = (id) => document.getElementById(id);
    if (!$('info-panel') || !objects[key]) return false;
    const g = objects[key].info;
    $('info-name').textContent = g.name; $('info-name').style.color = g.color; $('info-type').textContent = g.type;
    ['info-diameter', 'info-distance', 'info-period', 'info-day'].forEach((id, k) => {
      $(id + '-label').textContent = g.rows[k][0]; $(id).textContent = g.rows[k][1];
    });
    $('info-fact').textContent = '💡 ' + g.fact;
    $('info-panel').classList.remove('hidden'); $('info-panel').scrollTop = 0;
    document.body.classList.add('info-open');
    return true;
  }

  function setVisible(v) {
    visible = !!v;
    bridge.visible = visible;
    for (const o of Object.values(objects)) { o.group.visible = visible; o.labelEl?.classList.toggle('off', !visible); }
  }
  // Layers checkbox (index.html #toggle-localgroup)
  const toggle = document.getElementById('toggle-localgroup');
  toggle?.addEventListener('change', () => setVisible(toggle.checked));
  function dispose() {
    for (const m of materials) m.dispose();
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const o of Object.values(objects)) o.group.removeFromParent();
    for (const el of labelEls) el.parentElement?.remove();
  }

  return {
    objects, labelEls, update, pick, focusView, farPair, showInfo, setVisible, dispose, center,
    keys: Object.keys(objects),
    isNear: (key) => key === 'lmc' || key === 'smc',     // Milky Way satellites (ride along with galaxy.group)
    owns: (key) => !!objects[key],
    info: LOCAL_GROUP_INFO,
  };
}
