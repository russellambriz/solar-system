// lagrange/: the Lagrange points of the Sun–Earth and Sun–Jupiter systems, Jupiter's Trojan swarms, the Hilda triangle,
// and named Trojans (Lucy's targets) on their real JPL orbits. Facts and elements: lagrange/data.js; notes in the 2026-10-28
// CHANGELOG entry.
//
// Usage (main.js, after search/ exists):
//   import { createLagrange } from './lagrange/index.js';
//   const lagrange = createLagrange({ scene, bodies, spacecraft, search, scaleDistance, flyTo, exitGalaxy, getMode, releaseFocus,
//     getMaxDist, controls, renderer, isTouch });
//   ...each solar-view frame: lagrange.update(days, camera, dt);
//
// What is drawn (one Group):
//   • L1–L5 for Sun–Earth (blue) and Sun–Jupiter (gold): a small ring marker + label each, placed from the planet's real
//     position on the shown date (ephemeris/planets.js). L4/L5 = the planet's position turned ±60° about its orbit normal,
//     L3 = opposite. L1/L2 sit on the Sun–planet line; at the true scale they would be inside the planet's (enlarged) globe,
//     so they are drawn just outside its moons: Earth's at 1.07 Moon-orbit radii (the same spot spacecraft/ draws JWST),
//     Jupiter's at 1.25 Callisto-orbit radii. Markers and labels fade in only when you zoom in from the overview (or near
//     the planet, or while one of these cards is open), so the default view is unchanged.
//   • Jupiter Trojans + Hildas: ONE THREE.Points draw call, positions computed on the GPU every frame from Jupiter's true
//     longitude (uniform). Trojans librate on tadpole paths about L4/L5 (amplitude 3–38°, ~150-year period, radial
//     excursion coupled to the angle so the dots go round the tadpole the right way), with their own eccentricity
//     (epicycles) and inclinations up to ~40°. Hildas obey the 3:2 resonance: mean longitude λ = 1.5·λJ + c and
//     perihelion ϖ = −2c − σ (σ librating), so the resonant angle 3λJ − 2λ − ϖ = σ ≈ 0 and they trace the triangle
//     with corners at L3, L4, L5. The same compressed distance scale as the planets is applied in the shader.
//     (These replace the old fixed-longitude Trojan/Hilda dots that smallbodies.js used to add to the asteroid belt.)
//   • Named objects: two-body Kepler orbits from JPL SBDB elements (asteroids/index.js's asteroidAU), dot + label + card.
//   • Cards in main.js's #info-panel, search entries, Layers → Lagrange & Trojans (remembered as solar.lagrange).
//     The Lucy card from spacecraft/ gets buttons to its targets.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { planetAU } from '../ephemeris/planets.js';
import { asteroidAU } from '../asteroids/index.js';
import { EL, NAMED, CARDS } from './data.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2, AU_KM = 149597870.7;
const MU = { E: 3.0404e-6, J: 9.5459e-4 };          // (Earth+Moon)/Sun and Jupiter/Sun mass ratios
const PLANET = { E: 'Earth', J: 'Jupiter' };
const J_L0 = 34.40, J_PERIOD = 4332.59;               // Jupiter mean longitude at J2000 [deg] and period [d] (main.js PLANETS)
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

const SWARM_VERT = /* glsl */`
  attribute vec4 aA;   // type (0 L4 Trojan, 1 L5 Trojan, 2 Hilda), libration amplitude [rad], libration phase [rad], libration rate [rad/d]
  attribute vec4 aB;   // e, ϖ (Trojans) or c (Hildas) [rad], inclination [rad], node [rad]
  attribute vec3 aC;   // size [world units], a [AU] (Hildas), σ amplitude [rad] (Hildas)
  attribute vec3 color;
  uniform float uDays, uLamJ, uLamJ15, uScale, uMaxPx, uDistA, uDistB, uDistP, uBright;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float e = aB.x, inc = aB.z, node = aB.w, r, lon;
    float psi = aA.z + aA.w * uDays;
    if (aA.x < 1.5) {
      float side = aA.x < 0.5 ? 1.0 : -1.0, D = aA.y, s = sin(psi);
      // tadpole: the angle from Jupiter swings between ~60° − 0.8D and 60° + 1.3D (longer toward L3);
      // the orbit is a bit smaller (faster) while the angle grows
      float lam = uLamJ + side * (1.0471976 + D * (1.05 * s + 0.25 * s * s));
      float da = -side * 0.24 * D * cos(psi);
      float M = lam - aB.y;
      r = (5.2026 + da) * (1.0 - e * cos(M));
      lon = lam + 2.0 * e * sin(M);
    } else {
      float lam = uLamJ15 + aB.y;                                     // 1.5·λJ + c
      float varpi = -2.0 * aB.y - aC.z * sin(psi);                     // resonant angle 3λJ − 2λ − ϖ = σ
      float M = lam - varpi;
      float E = M + e * sin(M); E = M + e * sin(E); E = M + e * sin(E);
      float xo = aC.y * (cos(E) - e), yo = aC.y * sqrt(1.0 - e * e) * sin(E);
      r = length(vec2(xo, yo)); lon = varpi + atan(yo, xo);
    }
    float sb = sin(inc) * sin(lon - node), cb = sqrt(1.0 - sb * sb);
    vec3 p = vec3(r * cb * cos(lon), r * sb, -r * cb * sin(lon));
    p *= (uDistA + uDistB * pow(r, uDistP)) / r;                        // same compressed distance scale as the planets
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float px = aC.x * uScale / -mv.z;
    vAlpha = clamp(px, 0.0, 1.0) * uBright;
    gl_PointSize = clamp(px, 1.2, uMaxPx);
    vColor = color;
    gl_Position = projectionMatrix * mv;
  }`;
const SWARM_FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.25, 0.05, d));
  }`;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r()); }
function ringTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5;
  g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(32, 32, 6, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function dotTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createLagrange({ scene, bodies = [], spacecraft, search, scaleDistance, flyTo, exitGalaxy, getMode, releaseFocus, getMaxDist,
  controls, renderer, isTouch = false }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./lagrange.css', import.meta.url).href;
  document.head.appendChild(css);

  const root = new THREE.Group(); root.name = 'Lagrange';
  scene.add(root);
  const byName = (n) => bodies.find((b) => b.name === n);
  const earthB = byName('Earth'), jupB = byName('Jupiter'), moonB = byName('Moon');

  // ---- Layers toggle (remembered) ------------------------------------------------------------------------------------
  const store = { get: (k) => { try { return localStorage.getItem('solar.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('solar.' + k, v); } catch (e) { /* private mode */ } } };
  const toggle = document.getElementById('toggle-lagrange');
  let on = store.get('lagrange') !== '0';
  if (toggle) toggle.checked = on;
  const setOn = (v) => { on = !!v; if (toggle) toggle.checked = on; store.set('lagrange', on ? '1' : '0'); root.visible = on; if (!on) { release(true); hideAllLabels(); } };
  toggle?.addEventListener('change', () => setOn(toggle.checked));
  root.visible = on;

  // ---- Trojan + Hilda swarm: one Points draw call ---------------------------------------------------------------------
  const nL4 = isTouch ? 1200 : 2600, nL5 = isTouch ? 700 : 1500, nH = isTouch ? 450 : 1100, N = nL4 + nL5 + nH;
  const sizeK = isTouch ? 1.15 : 1;
  const swarm = (() => {
    const r = rng(2810);
    const A = new Float32Array(N * 4), B = new Float32Array(N * 4), C = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const trojanCol = [0.74, 0.52, 0.4], hildaCol = [0.6, 0.6, 0.5];
    for (let k = 0; k < N; k++) {
      const hilda = k >= nL4 + nL5, type = hilda ? 2 : k < nL4 ? 0 : 1;
      if (!hilda) {
        const D = Math.min(38, 3 + Math.abs(gauss(r)) * 13) * D2R;
        const period = 365.25 * (140 + r() * 30) / (1 + 0.15 * D);           // ~150 yr (a little faster for big loops)
        A.set([type, D, r() * TAU, TAU / period], k * 4);
        const e = Math.min(0.2, Math.abs(gauss(r)) * 0.06), inc = Math.min(40, Math.abs(gauss(r)) * 14) * D2R;
        B.set([e, r() * TAU, inc, r() * TAU], k * 4);
        C.set([(0.15 + Math.pow(r(), 6) * 0.3) * sizeK, 0, 0], k * 3);
      } else {
        A.set([2, 0, r() * TAU, TAU / (365.25 * (230 + r() * 80))], k * 4);
        const e = 0.07 + r() * 0.2, inc = Math.min(25, Math.abs(gauss(r)) * 8) * D2R;
        B.set([e, r() * TAU, inc, r() * TAU], k * 4);
        C.set([(0.12 + Math.pow(r(), 6) * 0.22) * sizeK, 3.97 + gauss(r) * 0.05, Math.abs(gauss(r)) * 12 * D2R], k * 3);
      }
      const base = hilda ? hildaCol : trojanCol, s = 0.75 + r() * 0.5;
      col.set(base.map((c) => Math.min(1, c * s)), k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));   // unused (GPU positions), needed by three
    geo.setAttribute('aA', new THREE.BufferAttribute(A, 4));
    geo.setAttribute('aB', new THREE.BufferAttribute(B, 4));
    geo.setAttribute('aC', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    const mat = new THREE.ShaderMaterial({ vertexShader: SWARM_VERT, fragmentShader: SWARM_FRAG, transparent: true, depthWrite: false,
      uniforms: { uDays: { value: 0 }, uLamJ: { value: 0 }, uLamJ15: { value: 0 }, uScale: { value: 800 }, uMaxPx: { value: isTouch ? 3 : 4 },
        uDistA: { value: 6 }, uDistB: { value: 14 }, uDistP: { value: 0.55 }, uBright: { value: 1.0 } } });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'TrojanSwarms'; pts.frustumCulled = false;
    root.add(pts);
    return pts;
  })();

  // ---- Lagrange points --------------------------------------------------------------------------------------------------
  const rTex = ringTex(), dTex = dotTex();
  const labels = [];
  const wrapLabel = (html, cls, card, title, prio) => {
    const wrap = document.createElement('div'); wrap.className = 'lagr-wrap';
    const el = document.createElement('div');
    el.className = `label small solar-label lagr-label ${cls}`;
    el.innerHTML = html; el.title = title;
    el.addEventListener('click', (e) => { e.stopPropagation(); showInfo(card); });
    wrap.appendChild(el);
    const obj = new CSS2DObject(wrap); obj.visible = false;
    root.add(obj);
    const L = { el, obj, card, prio, pos: obj.position, want: false };
    labels.push(L);
    return L;
  };
  const LP = {};
  for (const sys of ['E', 'J']) {
    LP[sys] = [];
    for (let k = 1; k <= 5; k++) {
      const key = `${sys}-L${k}`, c = CARDS[key];
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: rTex, color: c.color, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: false }));
      marker.renderOrder = 3; root.add(marker);
      const camp = sys === 'J' && k === 4 ? ' <span>Greeks</span>' : sys === 'J' && k === 5 ? ' <span>Trojans</span>' : '';
      const L = wrapLabel(`${PLANET[sys]} L${k}${camp}`, `lp ${sys}`, key, `${c.name}: ${c.type} (tap for facts)`, 2);
      LP[sys].push({ key, k, marker, L, au: new THREE.Vector3(), pos: new THREE.Vector3() });
    }
  }

  // ---- named Trojans (+ Donaldjohanson, Hilda) ----------------------------------------------------------------------------
  const named = NAMED.map((n) => {
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: dTex, color: n.color, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: false }));
    marker.renderOrder = 3; root.add(marker);
    const L = wrapLabel(n.short, `named ${n.camp}`, n.key, `${n.name} (tap for facts)`, n.camp === 'L4' || n.camp === 'L5' ? 1 : 0);
    return { ...n, el: EL[n.num], marker, L, au: new THREE.Vector3(), pos: new THREE.Vector3() };
  });
  const namedBy = Object.fromEntries(named.map((n) => [n.key, n]));

  // ---- positions for a date -------------------------------------------------------------------------------------------
  const _r = new THREE.Vector3(), _v = new THREE.Vector3(), _h = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();
  const planetW = { E: new THREE.Vector3(), J: new THREE.Vector3() }, planetTrue = { E: new THREE.Vector3(), J: new THREE.Vector3() };
  const normal = { E: new THREE.Vector3(0, 1, 0), J: new THREE.Vector3(0, 1, 0) };
  const sAU = (p, out) => { const r = p.length(); return out.copy(p).multiplyScalar(r > 0 ? scaleDistance(r) / r : 0); };
  const l12Offset = (sys) => {
    if (sys === 'E') return (moonB?.orbitDist || 3.2) * 1.07;
    return Math.max((jupB?.systemRadius || 9.6) * 1.25, 2 * (jupB?.radius || 3));
  };
  function placePoints(days) {
    for (const sys of ['E', 'J']) {
      const name = PLANET[sys];
      planetAU(name, days, _r);
      planetTrue[sys].copy(_r);
      _v.copy(planetAU(name, days + 0.5, _w)).sub(planetAU(name, days - 0.5, _a));
      _h.crossVectors(_r, _v).normalize(); normal[sys].copy(_h);
      const b = sys === 'E' ? earthB : jupB;
      if (b) b.group.getWorldPosition(planetW[sys]); else sAU(_r, planetW[sys]);
      const rh = (μ) => Math.cbrt(μ / 3);
      const pts = LP[sys], R = _r.length(), u = _w.copy(_r).normalize(), hill = rh(MU[sys]);
      pts[0].au.copy(u).multiplyScalar(R * (1 - hill));
      pts[1].au.copy(u).multiplyScalar(R * (1 + hill));
      pts[2].au.copy(u).multiplyScalar(-R * (1 + 5 * MU[sys] / 12));
      pts[3].au.copy(_r).applyAxisAngle(_h, Math.PI / 3);
      pts[4].au.copy(_r).applyAxisAngle(_h, -Math.PI / 3);
      const off = l12Offset(sys);
      _a.copy(planetW[sys]).normalize();
      pts[0].pos.copy(planetW[sys]).addScaledVector(_a, -off);
      pts[1].pos.copy(planetW[sys]).addScaledVector(_a, off);
      for (let k = 2; k < 5; k++) sAU(pts[k].au, pts[k].pos);
      for (const p of pts) { p.marker.position.copy(p.pos); p.L.pos.copy(p.pos); }
    }
    for (const n of named) { asteroidAU(n.el, days, n.au); sAU(n.au, n.pos); n.marker.position.copy(n.pos); n.L.pos.copy(n.pos); }
  }
  const lonOf = (p) => Math.atan2(-p.z, p.x);
  function jupiterLongitudes(days) {
    const mean = (J_L0 + 360 / J_PERIOD * days) * D2R;
    const unwrapped = mean + wrapPi(lonOf(planetTrue.J) - mean);
    return { lam: ((unwrapped % TAU) + TAU) % TAU, lam15: (((1.5 * unwrapped) % TAU) + TAU) % TAU };
  }

  // ---- info card (fills main.js's #info-panel, like heliosphere/ and meteors/) ------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panel = $('info-panel'), closeBtn = $('close-info');
  const closeTitle = closeBtn?.title, closeAria = closeBtn?.getAttribute('aria-label');
  const extra = document.createElement('div'); extra.id = 'lagr-extra'; extra.className = 'lagr-extra hidden';
  const lucyExtra = document.createElement('div'); lucyExtra.id = 'lagr-lucy'; lucyExtra.className = 'lagr-extra hidden';
  $('info-fact')?.after(extra, lucyExtra);
  let open = null, lastRefresh = 0, nowDays = 0;
  const cardOf = (key) => CARDS[key] || (namedBy[key] && { ...namedBy[key], type: typeLine(namedBy[key]), rows: () => namedBy[key].rows });
  function typeLine(n) {
    return n.camp === 'L4' ? 'Jupiter Trojan · leading swarm (L4, the "Greek camp")' : n.camp === 'L5' ? 'Jupiter Trojan · trailing swarm (L5, the "Trojan camp")'
      : n.camp === 'hilda' ? 'Hilda asteroid · 3:2 resonance with Jupiter' : 'Main-belt asteroid · Lucy flyby target';
  }
  const fmtDist = (au) => (au < 0.1 ? `${(au * AU_KM / 1e6).toFixed(2)} million km` : `${au.toFixed(2)} AU`);
  const deg = (rad) => ((rad / D2R) % 360 + 360) % 360;
  function liveValue(key, what) {
    const earth = planetTrue.E;
    if (what === 'where') {
      const c = CARDS[key], p = LP[c.sys][c.k - 1].au;
      return `Ecliptic longitude ${deg(lonOf(p)).toFixed(0)}° · ${p.length().toFixed(2)} AU from the Sun · ${fmtDist(p.distanceTo(earth))} from Earth (shown date)`;
    }
    const n = namedBy[key];
    if (what === 'sun') return `${n.au.length().toFixed(2)} AU (${Math.round(n.au.length() * AU_KM / 1e6).toLocaleString('en-US')} million km); ${n.au.distanceTo(earth).toFixed(2)} AU from Earth`;
    if (what === 'camp') {
      const d = wrapPi(lonOf(n.au) - lonOf(planetTrue.J)) / D2R;
      const rel = `${Math.abs(d).toFixed(0)}° ${d >= 0 ? 'ahead of' : 'behind'} Jupiter`;
      if (n.camp === 'belt') return `In the main asteroid belt, ${rel} (shown date)`;
      if (n.camp === 'hilda') return `${rel}; Hildas bunch up 60° ahead, 60° behind and opposite Jupiter (shown date)`;
      return `${rel}, ${n.camp === 'L4' ? 'in the leading swarm around L4' : 'in the trailing swarm around L5'} (shown date)`;
    }
    return '';
  }
  function fill(key) {
    const ids = ['info-diameter', 'info-distance', 'info-period', 'info-day'];
    cardOf(key).rows().forEach(([label, value], k) => {
      $(ids[k] + '-label').textContent = label;
      $(ids[k]).textContent = typeof value === 'string' && value.startsWith('live:') ? liveValue(key, value.slice(5)) : value;
    });
  }
  function showInfo(key) {
    const c = cardOf(key);
    if (!panel || !c) return false;
    if (!on) setOn(true);
    $('info-name').textContent = c.name; $('info-name').style.color = c.color;
    $('info-type').textContent = c.type;
    fill(key);
    const n = namedBy[key];
    $('info-fact').textContent = '💡 ' + c.fact + (n?.lucy ? ` 🛰 Lucy flyby: ${n.lucy}.` : '') +
      (c.sys ? ' (Positions are for the shown date. L1 and L2 are drawn much closer to the planet than they really are.)' : '');
    for (const id of ['info-phase-row', 'info-sky-row']) $(id)?.classList.add('hidden');
    panel.classList.remove('hidden'); panel.scrollTop = 0;
    document.body.classList.add('info-open');
    for (const L of labels) L.el.classList.toggle('active', L.card === key);
    if (closeBtn) { closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close'); }
    open = key; lastRefresh = performance.now();
    setExtra(key);
    return true;
  }
  const isOpenHere = () => open && panel && !panel.classList.contains('hidden') && $('info-name').textContent === cardOf(open).name;
  function release(hide) {
    for (const L of labels) L.el.classList.remove('active');
    if (hide && open && isOpenHere()) { panel.classList.add('hidden'); document.body.classList.remove('info-open'); }
    if (open && closeBtn) { closeBtn.title = closeTitle; if (closeAria) closeBtn.setAttribute('aria-label', closeAria); }
    open = null; follow = null;
    extra.replaceChildren(); extra.classList.add('hidden');
  }
  // ✕ on our card just closes it (main.js's own ✕ handler would fly back to the overview)
  panel?.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#close-info') || !isOpenHere()) return;
    e.stopPropagation();
    release(true);
  }, true);
  function button(text, fn, title) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lagr-btn'; b.textContent = text;
    if (title) b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  const lucyBtn = () => button('🛰 Lucy', () => search?.go?.('Lucy'), 'Fly to NASA\'s Lucy spacecraft');
  function setExtra(key) {
    extra.replaceChildren();
    const c = cardOf(key), add = (...b) => extra.append(...b);
    if (c.sys) {
      for (let k = 1; k <= 5; k++) if (k !== c.k) add(button(`L${k}`, () => showInfo(`${c.sys}-L${k}`), CARDS[`${c.sys}-L${k}`].name));
      if (c.craft === 'JWST') add(button('🛰 JWST', () => search?.go?.('James Webb Space Telescope'), 'Fly to the James Webb Space Telescope'));
      if (c.sys === 'J' && (c.k === 4 || c.k === 5)) {
        for (const n of named) if (n.camp === `L${c.k}`) add(button(n.short, () => go(n.key)));
        add(button('Trojans', () => showInfo('trojans')), lucyBtn());
      }
      if (c.sys === 'J' && c.k === 3) add(button('Hildas', () => go('hildas')));
      add(button('What are L-points?', () => showInfo('lagrange')));
    } else if (key === 'lagrange') {
      add(button('Sun–Earth points', () => go('E-L4')), button('Sun–Jupiter points', () => go('J-L4')), button('Trojans', () => go('trojans')), button('Hildas', () => go('hildas')));
    } else if (key === 'trojans') {
      add(button('L4 · Greeks', () => go('J-L4')), button('L5 · Trojans', () => go('J-L5')), button('Hektor', () => go('hektor')), button('Patroclus–Menoetius', () => go('patroclus')), lucyBtn());
    } else if (key === 'hildas') {
      add(button('153 Hilda', () => go('hilda')), button('Jupiter L3', () => showInfo('J-L3')), button('Trojans', () => go('trojans')));
    } else if (namedBy[key]) {
      const n = namedBy[key];
      if (n.camp === 'L4' || n.camp === 'L5') add(button(`Jupiter ${n.camp}`, () => go(`J-${n.camp}`)), button('Trojans', () => showInfo('trojans')));
      if (n.camp === 'hilda') add(button('Hildas', () => go('hildas')));
      if (n.lucy) add(lucyBtn());
    }
    add(button(namedBy[key] ? '🔭 Fly here' : '🔭 View', () => go(key)));
    extra.classList.remove('hidden');
  }
  // Lucy's card (spacecraft/) gets buttons to its targets
  const LUCY_TARGETS = ['donaldjohanson', 'eurybates', 'polymele', 'leucus', 'orus', 'patroclus'];
  function syncLucy() {
    const show = on && !!panel && !panel.classList.contains('hidden') && $('info-name')?.textContent === 'Lucy' && !isOpenHere();
    if (show && lucyExtra.classList.contains('hidden')) {
      lucyExtra.replaceChildren(document.createTextNode('Lucy\'s targets: '),
        ...LUCY_TARGETS.map((k) => button(namedBy[k].short, () => go(k), `${namedBy[k].name}: Lucy flyby ${namedBy[k].lucy}`)),
        button('Trojan swarms', () => go('trojans')));
      lucyExtra.classList.remove('hidden');
    } else if (!show && !lucyExtra.classList.contains('hidden')) { lucyExtra.replaceChildren(); lucyExtra.classList.add('hidden'); }
  }
  if ($('info-name') && typeof MutationObserver !== 'undefined') {
    new MutationObserver(syncLucy).observe($('info-name'), { childList: true, characterData: true, subtree: true });
    new MutationObserver(syncLucy).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  // ---- fly-to (main.js's flyTo; no camera code here) + keep the view turning with the planet afterwards --------------
  const tanHalf = () => {
    const tv = Math.tan(25 * D2R), th = tv * window.innerWidth / window.innerHeight;
    return { tv, th };
  };
  const tangent = (sys, out) => out.crossVectors(normal[sys], planetW[sys]).normalize();
  function view(key) {
    const c = cardOf(key), n = namedBy[key];
    const max = (getMaxDist?.() || 900) * 0.85;
    const { tv, th } = tanHalf();
    if (n) {                                       // a named object: close, a little above, from outside its orbit
      const d = n.camp === 'belt' ? 6 : 10;
      const dir = () => n.pos.clone().normalize().multiplyScalar(0.55).addScaledVector(UP, 0.65).addScaledVector(tangent('J', new THREE.Vector3()), 0.35).normalize();
      return { cam: () => n.pos.clone().addScaledVector(dir(), d), target: () => n.pos.clone(), follow: { kind: 'obj', n } };
    }
    const sys = c.sys || (c.view === 'J' || key === 'trojans' || key === 'hildas' || key === 'lagrange' ? 'J' : 'E');
    if (c.sys && (c.k === 1 || c.k === 2)) {     // L1/L2: side-on to the Sun–planet line, the planet in the middle
      const d = sys === 'E' ? 12 : 36;
      const dir = () => tangent(sys, new THREE.Vector3()).multiplyScalar(0.85).addScaledVector(UP, 0.5).normalize();
      return { cam: () => planetW[sys].clone().addScaledVector(dir(), d), target: () => planetW[sys].clone(), follow: { kind: 'rot', sys } };
    }
    // the whole orbit's worth of points from nearly overhead: the planet to the right of the Sun, L4 (leading) at the top,
    // L5 at the bottom, so the two swarms fill the tall middle of the screen between the side panels
    const R = planetW[sys].length();
    const hDir = () => planetW[sys].clone().setY(0).normalize();
    const tDir = () => new THREE.Vector3().crossVectors(UP, hDir()).normalize();   // direction of motion (leading)
    const target = () => hDir().multiplyScalar(R * 0.45);
    const dir = () => UP.clone().multiplyScalar(0.86).addScaledVector(tDir(), -0.5).normalize();
    const d = Math.min(max, Math.max(R * 1.12 / tv, R * 0.75 / th) * 1.04);
    return { cam: () => target().addScaledVector(dir(), d), target, follow: { kind: 'rot', sys } };
  }
  let follow = null, pending = null;
  const lastTarget = new THREE.Vector3(), lastPos = new THREE.Vector3();
  let lastLon = 0;
  function startFollow(f) {
    if (!controls) return;
    follow = f; lastTarget.copy(controls.target);
    if (f.kind === 'obj') lastPos.copy(f.n.pos); else lastLon = lonOf(planetW[f.sys]);
  }
  function applyFollow(camera) {
    if (!follow || !controls) return;
    if (!open || controls.target.distanceToSquared(lastTarget) > 1e-8 || getMode?.() !== 'solar') { follow = null; return; }
    if (follow.kind === 'obj') {
      _v.subVectors(follow.n.pos, lastPos);
      camera.position.add(_v); controls.target.add(_v); lastPos.copy(follow.n.pos);
    } else {
      const lon = lonOf(planetW[follow.sys]), dl = wrapPi(lon - lastLon);
      lastLon = lon;
      camera.position.applyAxisAngle(UP, dl); controls.target.applyAxisAngle(UP, dl);
    }
    lastTarget.copy(controls.target);
  }
  function go(key = 'trojans') {
    if (!cardOf(key)) return;
    if (!on) setOn(true);
    const run = () => {
      releaseFocus?.(); follow = null;
      const v = view(key);
      pending = key;
      flyTo(v.cam, v.target, 2.2, () => { pending = null; showInfo(key); startFollow(v.follow); });
    };
    const mode = getMode?.();
    if (mode === 'galaxy') { exitGalaxy?.(run); return; }
    if (mode && mode !== 'solar') return;
    run();
  }

  // ---- search -----------------------------------------------------------------------------------------------------------
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9*/+]+/g, ' ').trim();
  const KINDINFO = { icon: '⊹', tag: 'Lagrange point', color: '#9fe0ff' }, KIND_T = { icon: '◇', tag: 'Jupiter Trojan', color: '#ffb98a' };
  if (search?.entries) {
    const add = (name, key, sub, aliases, kindInfo = KINDINFO) => {
      const e = { name, kind: 'lagrange', kindInfo, color: cardOf(key).color, sub, go: () => go(key) };
      e.keys = [norm(name), ...aliases.map(norm)];
      search.entries.push(e);
    };
    add('Lagrange points', 'lagrange', 'L1–L5 · balance points', ['lagrange', 'lagrangian points', 'l points', 'libration points', 'lagrange point']);
    add('Sun–Earth L1', 'E-L1', '1.5 million km sunward · SOHO', ['l1', 'sun earth l1', 'earth l1', 'soho', 'dscovr', 'ace', 'aditya l1', 'imap']);
    add('Sun–Earth L2', 'E-L2', '1.5 million km beyond Earth · JWST', ['l2', 'sun earth l2', 'earth l2', 'gaia', 'euclid', 'planck', 'herschel', 'wmap']);
    add('Sun–Earth L3', 'E-L3', 'Behind the Sun · "Counter-Earth"', ['l3', 'sun earth l3', 'earth l3', 'counter earth']);
    add('Sun–Earth L4', 'E-L4', '60° ahead of Earth · Earth Trojans', ['l4', 'sun earth l4', 'earth l4', 'earth trojans', '2010 tk7', '2020 xl5']);
    add('Sun–Earth L5', 'E-L5', '60° behind Earth · Vigil', ['l5', 'sun earth l5', 'earth l5', 'vigil']);
    for (let k = 1; k <= 5; k++) add(`Sun–Jupiter L${k}`, `J-L${k}`, CARDS[`J-L${k}`].type.replace('Lagrange point · ', ''), [`jupiter l${k}`, `sun jupiter l${k}`]);
    add('Jupiter Trojans', 'trojans', 'Two swarms at Jupiter\'s L4 and L5', ['trojans', 'trojan asteroids', 'jupiter trojans', 'trojan swarms', 'greeks', 'greek camp',
      'trojan camp', 'lucy targets', 'lucy mission targets']);
    add('Hilda asteroids', 'hildas', '3:2 resonance triangle', ['hildas', 'hilda group', 'hilda triangle', 'hilda asteroids'], KIND_T);
    for (const n of named) add(n.name, n.key, n.camp === 'belt' ? 'Lucy flyby 2025 · main belt' : n.camp === 'hilda' ? 'Hilda group' : `Trojan · ${n.camp}${n.lucy ? ' · Lucy target' : ''}`, n.aliases, KIND_T);
  }

  // ---- labels: keep clear of main.js's body labels, spacecraft labels and each other ------------------------------------
  const PX = isTouch ? 8 : 0, PY = isTouch ? 12 : 0, rects = [];
  const overlaps = (r) => rects.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  function hideAllLabels() { for (const L of labels) L.obj.visible = false; }
  function placeLabels(camera, W, H) {
    rects.length = 0;
    for (const b of bodies) {
      const lab = b.labelEl;
      if (!lab || !lab._obj || lab.classList.contains('overlap') || !lab.offsetParent) continue;
      lab._obj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, lw = lab._w || lab.textContent.length * 7 + 18, lh = lab._h || 20;
      rects.push([cx - lw / 2 - PX, cy - lh / 2 - PY, cx + lw / 2 + PX, cy + lh / 2 + PY]);
    }
    for (const it of spacecraft?.items || []) {
      const lab = it.labelEl;
      if (!lab || !it.labelObj?.visible) continue;
      it.labelObj.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H, lw = lab.offsetWidth || 90, lh = lab.offsetHeight || 20;
      rects.push([cx - lw / 2, cy - lh / 2, cx + lw / 2, cy + lh / 2 + 16]);
    }
    const order = labels.filter((L) => L.want).sort((a, b) => ((b.card === open) - (a.card === open)) || (b.prio - a.prio));
    for (const L of labels) if (!L.want) L.obj.visible = false;
    for (const L of order) {
      _v.copy(L.pos).project(camera);
      let vis = !(_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.02 || Math.abs(_v.y) > 1.02);
      if (vis) {
        const el = L.el;
        if (!el._w && el.offsetWidth) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
        const lw = el._w || el.textContent.length * 6.5 + 18, lh = el._h || 20;
        vis = false;
        for (const dy of [-(lh / 2 + 9), lh / 2 + 9]) {          // above the marker, or below it if that spot is taken
          const cx = (_v.x + 1) / 2 * W, cy = (1 - _v.y) / 2 * H + dy;
          const r = [cx - lw / 2 - 2 - PX, cy - lh / 2 - 2 - PY, cx + lw / 2 + 2 + PX, cy + lh / 2 + 2 + PY];
          if (overlaps(r) && L.card !== open) continue;
          rects.push(r); vis = true;
          if (L.dy !== dy) { L.el.style.transform = `translateY(${Math.round(dy)}px)`; L.dy = dy; }
          break;
        }
      }
      L.obj.visible = vis;
    }
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
  const fade = { E: 0, J: 0 };
  let frame = 0, distKey = '';
  function update(days, camera, dt = 1 / 60) {
    nowDays = days;
    if (!on) { root.visible = false; return; }
    root.visible = true;
    placePoints(days);
    // swarm uniforms
    const u = swarm.material.uniforms, lj = jupiterLongitudes(days);
    u.uDays.value = days; u.uLamJ.value = lj.lam; u.uLamJ15.value = lj.lam15;
    const key = `${scaleDistance(0)}|${scaleDistance(1)}|${scaleDistance(2)}`;
    if (key !== distKey) {                 // scaleDistance(r) = a + b·r^p (main.js; scale/ changes a, b, p)
      distKey = key;
      const a = scaleDistance(0), b = scaleDistance(1) - a, p = Math.log2((scaleDistance(2) - a) / b);
      u.uDistA.value = a; u.uDistB.value = b; u.uDistP.value = Number.isFinite(p) ? p : 1;
    }
    const H = window.innerHeight, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), pr = renderer?.getPixelRatio?.() || Math.min(window.devicePixelRatio || 1, 2);
    u.uScale.value = H * pr / (2 * tanH); u.uMaxPx.value = (isTouch ? 3 : 4) * pr;
    applyFollow(camera);
    // markers and labels: hidden in the overview, fade in as you zoom in (or near the planet, or while a card is open)
    const cam = camera.position, camSun = cam.length();
    const openSys = open ? (cardOf(open).sys || (namedBy[open] || ['trojans', 'hildas', 'lagrange'].includes(open) ? 'J' : null)) : null;
    const flySys = pending ? (cardOf(pending).sys || 'J') : null;
    fade.E = Math.max(1 - smooth(camSun, 45, 75), 1 - smooth(cam.distanceTo(planetW.E), 22, 40), openSys === 'E' || flySys === 'E' || open === 'lagrange' ? 1 : 0);
    fade.J = Math.max(1 - smooth(camSun, 110, 140), 1 - smooth(cam.distanceTo(planetW.J), 35, 60), openSys === 'J' || flySys === 'J' ? 1 : 0);
    if (camSun > 600) fade.E = fade.J = 0;
    const k = 2 * tanH / H;
    for (const sys of ['E', 'J']) for (const p of LP[sys]) {
      p.marker.visible = fade[sys] > 0.01;
      p.marker.material.opacity = 0.85 * fade[sys];
      p.marker.scale.setScalar((isTouch ? 13 : 11) * k);
      p.L.want = fade[sys] > 0.4;
    }
    for (const n of named) {
      const near = cam.distanceTo(n.pos);
      let f = n.camp === 'belt' || n.camp === 'hilda' ? Math.max(1 - smooth(near, 12, 25), open === n.key || (n.camp === 'hilda' && open === 'hildas') ? 1 : 0)
        : Math.max(fade.J * (1 - smooth(camSun, 108, 128)), 1 - smooth(near, 15, 30), open === n.key ? 1 : 0, open && (open === 'trojans' || open === `J-${n.camp}`) ? fade.J : 0);
      if (n.camp === 'belt' && open && LUCY_TARGETS.includes(open)) f = Math.max(f, 0.6);
      n.marker.visible = f > 0.01;
      n.marker.material.opacity = 0.95 * f;
      n.marker.scale.setScalar((isTouch ? 9 : 7) * k);
      n.L.want = f > 0.45;
    }
    if ((frame++ % 3) === 0) placeLabels(camera, window.innerWidth, H);
    if (performance.now() - lastRefresh > 500) {
      lastRefresh = performance.now();
      if (open) { if (isOpenHere()) fill(open); else release(false); }
      syncLucy();
    }
  }

  // helpers for tests / the console: true heliocentric AU positions (scene axes) of a named object or an L-point
  const toEcl = (p) => ({ X: +p.x.toFixed(5), Y: +(-p.z).toFixed(5), Z: +p.y.toFixed(5) });
  return {
    group: root, swarm, update, go, showInfo, isOn: () => on, setOn,
    positionAU: (key, days = nowDays) => { const n = namedBy[key]; return n ? toEcl(asteroidAU(n.el, days, new THREE.Vector3())) : null; },
    stats: () => ({ on, open, fade: { E: +fade.E.toFixed(2), J: +fade.J.toFixed(2) }, swarm: { count: N, L4: nL4, L5: nL5, hildas: nH, drawRange: swarm.geometry.drawRange.count },
      following: follow && (follow.kind === 'obj' ? follow.n.key : follow.sys),
      labels: labels.filter((L) => L.obj.visible).map((L) => L.el.textContent),
      jupiterLon: +deg(lonOf(planetTrue.J)).toFixed(2),
      points: Object.fromEntries(['E', 'J'].flatMap((s) => LP[s].map((p) => [p.key, { lon: +deg(lonOf(p.au)).toFixed(2), r: +p.au.length().toFixed(4) }]))),
      named: Object.fromEntries(named.map((n) => [n.key, { lonFromJupiter: +(wrapPi(lonOf(n.au) - lonOf(planetTrue.J)) / D2R).toFixed(1), r: +n.au.length().toFixed(3) }])) }),
  };
}
