// Milky Way: (1) procedural sky band for the solar-system view, (2) a separate galaxy scene for the zoomed-out view.
// Everything is generated in code — no image files.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Galactic coordinate frame expressed in our scene's ecliptic frame.
// Scene convention: ecliptic plane = XZ, ecliptic north = +Y, longitude λ: x = cos λ, z = −sin λ.
// Galactic north pole: λ = 180.02°, β = +29.81°  → galactic plane is tilted ~60.2° to the ecliptic.
// Galactic center (Sgr A*): λ = 266.84°, β = −5.54° (toward Sagittarius).
// ---------------------------------------------------------------------------
const D2R = Math.PI / 180;
const ecl = (lamDeg, betDeg) => {
  const l = lamDeg * D2R, b = betDeg * D2R;
  return new THREE.Vector3(Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l));
};
export const NGP = ecl(180.02, 29.81).normalize();
export const GC = (() => { const g = ecl(266.84, -5.54); return g.sub(NGP.clone().multiplyScalar(g.dot(NGP))).normalize(); })();
export const L90 = new THREE.Vector3().crossVectors(NGP, GC).normalize(); // galactic longitude 90° (toward Cygnus)

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// GLSL value noise shared by shaders
const NOISE_GLSL = /* glsl */`
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------------------
// 1) Sky band (inside of a large sphere that follows the camera, so it sits "at infinity")
// ---------------------------------------------------------------------------
export function createSkyBand({ isTouch = false, renderer } = {}) {
  const group = new THREE.Group();
  group.name = 'MilkyWaySky';

  // The band is expensive to compute (several noise lookups per pixel), so it is rendered ONCE on the GPU into an
  // equirectangular texture at startup; each frame then just samples that texture (cheap on iPad).
  const W = isTouch ? 1536 : 2048;
  const rt = new THREE.WebGLRenderTarget(W, W / 2, { depthBuffer: false });
  {
    const bakeMat = new THREE.ShaderMaterial({
      uniforms: { uNGP: { value: NGP }, uGC: { value: GC }, uL90: { value: L90 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 uNGP, uGC, uL90;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          // same (u,v) → direction mapping as THREE.SphereGeometry
          float phi = vUv.x * 6.28318530718, theta = (1.0 - vUv.y) * 3.14159265359;
          vec3 d = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
          float b = asin(clamp(dot(d, uNGP), -1.0, 1.0));       // galactic latitude
          float l = atan(dot(d, uL90), dot(d, uGC));             // galactic longitude, 0 = galactic center
          float core = exp(-l * l / 0.55);                       // brighter toward Sagittarius
          float width = 0.08 + 0.06 * core;
          float n = fbm(d * 5.0), n2 = fbm(d * 13.0 + 3.0);
          float bw = b + (n - 0.5) * 0.07;
          float band = exp(-bw * bw / (width * width));
          float bulge = exp(-(l * l / 0.08 + b * b / 0.02));
          float bright = band * (0.35 + 0.45 * core) * (0.45 + 1.0 * n2) + bulge * 0.3;
          // the Great Rift: a dark dust lane running along the plane from Cygnus to Centaurus
          float riftC = 0.012 + 0.025 * sin(l * 2.3);
          float rw = 0.018 + 0.015 * core;
          float rift = exp(-pow((b - riftC) / rw, 2.0)) * smoothstep(1.7, 0.2, abs(l - 0.25)) * smoothstep(0.32, 0.6, fbm(d * 9.0 + 7.0));
          bright *= 1.0 - 0.8 * rift;
          bright *= 0.85 + 0.3 * fbm(d * 30.0);                  // fine mottling
          vec3 col = mix(vec3(0.60, 0.68, 1.0), vec3(1.0, 0.85, 0.64), core);
          gl_FragColor = vec4(col * bright, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
    const bakeScene = new THREE.Scene(); bakeScene.add(quad);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(bakeScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    renderer.setRenderTarget(prev);
    quad.geometry.dispose(); bakeMat.dispose();
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: { tBand: { value: rt.texture }, uOpacity: { value: 0.34 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tBand; uniform float uOpacity; varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(tBand, vUv).rgb * uOpacity, 1.0); }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const band = new THREE.Mesh(new THREE.SphereGeometry(3200, 96, 48), mat);
  band.renderOrder = -10;
  band.frustumCulled = false;
  group.add(band);

  // Extra faint stars concentrated along the galactic plane
  const N = isTouch ? 4000 : 9000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color(), d = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const l = Math.random() < 0.55 ? gauss() * 0.9 : (Math.random() * 2 - 1) * Math.PI;
    const core = Math.exp(-l * l / 0.55);
    const b = gauss() * (0.05 + 0.07 * core);
    d.copy(GC).multiplyScalar(Math.cos(b) * Math.cos(l)).addScaledVector(L90, Math.cos(b) * Math.sin(l)).addScaledVector(NGP, Math.sin(b));
    d.multiplyScalar(2100 + Math.random() * 700);
    pos.set([d.x, d.y, d.z], i * 3);
    c.setHSL(core > 0.5 ? 0.1 : 0.6, 0.35, 0.55 + Math.random() * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 4.5, vertexColors: true, map: dotTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(stars);

  return {
    group,
    update(camera) { band.position.copy(camera.position); },
  };
}

// ---------------------------------------------------------------------------
// 2) Galaxy scene — a barred spiral built from particles.
// Scale: 1 unit = 100 light-years (galaxy radius 500 units ≈ 50,000 ly).
// ---------------------------------------------------------------------------
export const GALAXY_INFO = {
  name: 'Milky Way', type: 'Barred spiral galaxy (type SBbc)', color: '#b9c6ff',
  rows: [
    ['Diameter', '~100,000 light-years'],
    ['Stars', '~100–400 billion'],
    ['Sun’s distance from center', '~26,000 light-years (Orion Arm)'],
    ['Sun’s galactic orbit', '~230 million years per lap (~230 km/s)'],
  ],
  fact: 'The last time the Sun was at this spot in its orbit around the galaxy, the first dinosaurs were just appearing on Earth. ' +
        'At the center sits Sagittarius A*, a black hole about 4 million times the mass of the Sun.',
};

const particleVert = /* glsl */`
  attribute float size; attribute vec3 aColor;
  uniform float uScale, uBright;
  varying vec3 vColor;
  void main() {
    vColor = aColor * uBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }`;
const starFrag = /* glsl */`
  varying vec3 vColor;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8); gl_FragColor = vec4(vColor * a, 1.0); }`;
const dustFrag = /* glsl */`
  uniform float uAlpha; varying vec3 vColor;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = (1.0 - d * 2.0); gl_FragColor = vec4(vColor, a * a * uAlpha); }`;

function pointCloud(positions, colors, sizes, frag, opts) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 }, uBright: { value: opts.bright ?? 1 }, uAlpha: { value: opts.alpha ?? 1 } },
    vertexShader: particleVert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: opts.blending ?? THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function createGalaxy({ isTouch = false } = {}) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();     // rotates slowly
  scene.add(group);

  const R = 500, BAR = 55, K = 1 / Math.tan(13 * D2R);           // radius, bar half-length, log-spiral pitch 13°
  const ARMS = [                                                   // [angle offset, start radius, weight]
    [0, BAR, 1.0], [Math.PI, BAR, 1.0],                            // two major arms from the bar ends (Scutum–Centaurus, Perseus)
    [Math.PI / 2, BAR * 1.6, 0.65], [Math.PI * 1.5, BAR * 1.6, 0.65], // two minor arms (Norma, Sagittarius)
  ];
  const armTheta = (arm, r) => arm[0] + K * Math.log(r / BAR);
  // Sun: ~26,000 ly = 260 units, in the Orion Spur between two arms
  const SUN_R = 260;
  const sunTheta = armTheta(ARMS[1], SUN_R) + Math.PI / 4.2;
  const SUN_POS = new THREE.Vector3(Math.cos(sunTheta) * SUN_R, 0, Math.sin(sunTheta) * SUN_R);

  const N = isTouch ? 26000 : 65000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const c = new THREE.Color();
  const coreCol = new THREE.Color(1.0, 0.82, 0.55), armIn = new THREE.Color(1.0, 0.9, 0.75), armOut = new THREE.Color(0.55, 0.7, 1.0);
  const pink = new THREE.Color(1.0, 0.45, 0.65), blue = new THREE.Color(0.7, 0.82, 1.0);
  const weights = ARMS.map((a) => a[2]), wSum = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N; i++) {
    let x, y, z, s;
    const u = Math.random();
    if (u < 0.16) {                       // central bulge + bar (ellipsoid elongated along x)
      const r = Math.abs(gauss());
      x = gauss() * BAR * 0.55; z = gauss() * BAR * 0.2; y = gauss() * 9 * Math.exp(-r * 0.3);
      if (Math.random() < 0.45) { x *= 0.45; z = gauss() * 22; y = gauss() * 14; } // round bulge part
      c.copy(coreCol).multiplyScalar(0.45 + Math.random() * 0.25); s = 2 + Math.random() * 2.5;
    } else if (u < 0.80 || u >= 0.95) {   // spiral arms (+ Orion Spur below)
      let theta, r;
      if (u >= 0.95) {                    // Orion Spur: short partial arm through the Sun's position
        r = SUN_R + gauss() * 45;
        theta = sunTheta + K * Math.log(r / SUN_R) * 0.8;
      } else {
        let pickW = Math.random() * wSum, k = 0;
        while (pickW > weights[k]) { pickW -= weights[k]; k++; }
        const arm = ARMS[k];
        r = arm[1] + (R - arm[1]) * Math.pow(Math.random(), 1.25);
        theta = armTheta(arm, r);
      }
      const spread = 4 + 0.045 * r;
      const ox = gauss() * spread, oz = gauss() * spread;
      x = Math.cos(theta) * r + ox; z = Math.sin(theta) * r + oz; y = gauss() * (3 + 4 * (1 - r / R));
      const t = Math.min(1, r / R);
      c.copy(armIn).lerp(armOut, Math.pow(t, 0.7));
      s = 1.6 + Math.random() * 2.6;
      const roll = Math.random();
      if (roll < 0.025) { c.copy(pink); s = 4 + Math.random() * 4; }          // glowing star-forming (HII) regions
      else if (roll < 0.07) { c.copy(blue); s = 3.5 + Math.random() * 3; }    // young hot blue stars
    } else {                              // diffuse exponential disk between the arms
      const r = Math.min(R * 1.05, -Math.log(1 - Math.random() * 0.995) * 140);
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * 5;
      c.setRGB(0.75, 0.75, 0.85); s = 1.3 + Math.random() * 1.6;
    }
    pos.set([x, y, z], i * 3); col.set([c.r, c.g, c.b], i * 3); size[i] = s;
  }
  const stars = pointCloud(pos, col, size, starFrag, { bright: isTouch ? 0.6 : 0.45 });
  stars.renderOrder = 1;
  group.add(stars);

  // Dust lanes: dark, normally-blended particles along the inner edge of each arm
  const ND = isTouch ? 3500 : 9000;
  const dpos = new Float32Array(ND * 3), dcol = new Float32Array(ND * 3), dsize = new Float32Array(ND);
  for (let i = 0; i < ND; i++) {
    const arm = ARMS[i % 4];
    const r = arm[1] * 1.1 + (R * 0.9 - arm[1]) * Math.pow(Math.random(), 1.1);
    const theta = armTheta(arm, r) - 0.16;
    const spread = 3 + 0.03 * r;
    dpos.set([Math.cos(theta) * r + gauss() * spread, gauss() * 1.5, Math.sin(theta) * r + gauss() * spread], i * 3);
    dcol.set([0.04, 0.025, 0.02], i * 3);
    dsize[i] = 9 + Math.random() * 10;
  }
  const dust = pointCloud(dpos, dcol, dsize, dustFrag, { blending: THREE.NormalBlending, alpha: 0.35 });
  dust.renderOrder = 2;
  group.add(dust);

  // Soft glows: flat disk glow (lies in the plane) + spherical core glow
  const glowTex = (stops) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, s] of stops) gr.addColorStop(o, s);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const disk = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.3, R * 2.3), new THREE.MeshBasicMaterial({
    map: glowTex([[0, 'rgba(255,220,170,0.55)'], [0.25, 'rgba(200,190,220,0.18)'], [0.6, 'rgba(120,150,255,0.07)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  disk.rotation.x = -Math.PI / 2; disk.renderOrder = 0;
  group.add(disk);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex([[0, 'rgba(255,235,190,0.6)'], [0.3, 'rgba(255,200,120,0.18)'], [1, 'rgba(255,160,60,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  coreGlow.scale.set(220, 220, 1); coreGlow.renderOrder = 3;
  group.add(coreGlow);

  // Distant background stars / galaxies
  let bg;
  {
    const NB = isTouch ? 800 : 1800, bp = new Float32Array(NB * 3), bc = new Float32Array(NB * 3), bs = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      const r = 6000 + Math.random() * 3000, u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      bp.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      const v = 0.4 + Math.random() * 0.6; bc.set([v, v, v * 1.05], i * 3); bs[i] = 10 + Math.random() * 20;
    }
    bg = pointCloud(bp, bc, bs, starFrag, { bright: 0.7 });
    bg.renderOrder = -1;
    scene.add(bg);
  }

  // "You are here" marker (pulsing ring + dot) and labels
  const marker = new THREE.Group();
  marker.position.copy(SUN_POS);
  group.add(marker);
  const ringTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'); g.strokeStyle = 'rgba(255,215,120,1)'; g.lineWidth = 8;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffe08a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false }));
  const ring2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 }));
  for (const s of [dot, ring, ring2]) { s.renderOrder = 5; marker.add(s); }

  const makeLabel = (html, cls) => {
    const wrap = document.createElement('div');
    wrap.className = 'galaxy-label-wrap';
    const lab = document.createElement('div');
    lab.className = 'label galaxy-label ' + cls;
    lab.innerHTML = html;
    wrap.appendChild(lab);
    return { obj: new CSS2DObject(wrap), el: lab };
  };
  const sunLabel = makeLabel('☀ You are here: <b>Sun</b>', 'sun-here');
  marker.add(sunLabel.obj);
  const centerLabel = makeLabel('Galactic center · Sgr A*', 'small');
  group.add(centerLabel.obj);

  const tmp = new THREE.Vector3();
  let t = 0;
  return {
    scene, group, R, SUN_POS, marker,
    labelEls: [sunLabel.el, centerLabel.el],
    sunWorldPos(out = new THREE.Vector3()) { return marker.getWorldPosition(out); },
    setScale(pxPerUnitAtDist1) { stars.material.uniforms.uScale.value = pxPerUnitAtDist1; dust.material.uniforms.uScale.value = pxPerUnitAtDist1; bg.material.uniforms.uScale.value = pxPerUnitAtDist1; },
    update(dt, camera, spin) {
      t += dt;
      if (spin) group.rotation.y -= dt * 0.025;           // cosmetic rotation (hugely sped up)
      // marker keeps a constant on-screen size
      const dist = camera.position.distanceTo(marker.getWorldPosition(tmp));
      const s = dist * 0.04;
      dot.scale.setScalar(s * 0.45);
      const ph = (t * 0.6) % 1, ph2 = (t * 0.6 + 0.5) % 1;
      ring.scale.setScalar(s * (0.4 + 1.4 * ph)); ring.material.opacity = 1 - ph;
      ring2.scale.setScalar(s * (0.4 + 1.4 * ph2)); ring2.material.opacity = 1 - ph2;
    },
  };
}
