// High-detail procedural moons:
//  • Galilean moons (Io, Europa, Ganymede, Callisto): color + height maps baked ONCE on the GPU into
//    equirectangular render targets (fast even at 1024×512), used as map + bumpMap on a sphere.
//  • Phobos & Deimos: irregular "potato" meshes — a finely subdivided icosphere displaced by noise, craters
//    (incl. Phobos's huge Stickney crater) and Phobos's parallel grooves, with per-vertex colors.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// GLSL helpers: value-noise fbm + a cellular crater field
// ---------------------------------------------------------------------------
const GLSL_COMMON = /* glsl */`
  precision highp float;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  // Craters: sum over nearby random feature points. Returns (height, fresh-ejecta brightness).
  vec2 craters(vec3 p, float keep) {
    vec3 i = floor(p), f = fract(p); vec2 acc = vec2(0.0);
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = hash33(i + g);
      if (o.z > keep) continue;                         // thin out craters
      float rad = 0.18 + 0.32 * hash33(i + g + 17.0).x;
      float t = length(g + o - f) / rad;
      if (t > 2.2) continue;
      float bowl = t < 1.0 ? (t * t - 1.0) : 0.0;
      float rim = exp(-pow((t - 1.0) / 0.2, 2.0)) * 0.35;
      acc.x += bowl * 0.7 + rim;
      float fresh = step(0.75, hash33(i + g + 31.0).y);  // some craters are young → bright ejecta
      acc.y += fresh * exp(-t * t * 0.6);
    }
    return acc;
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }        // design colors are sRGB → store linear
`;

const SURFACES = {
  Io: /* glsl */`
    vec3 col = mix(vec3(0.96, 0.89, 0.47), vec3(0.86, 0.62, 0.26), fbm(d * 3.0));
    col = mix(col, vec3(0.98, 0.96, 0.82), smoothstep(0.55, 0.75, fbm(d * 5.0 + 11.0)) * 0.65);   // SO2 frost
    col = mix(col, vec3(0.62, 0.58, 0.32), smoothstep(0.6, 0.8, fbm(d * 7.0 + 3.0)) * 0.45);      // greenish plains
    float pole = smoothstep(0.55, 0.95, abs(d.y));
    col = mix(col, vec3(0.55, 0.33, 0.18), pole * 0.75);                                         // reddish-brown poles
    float h = (fbm(d * 8.0) - 0.5) * 0.3;
    // volcanoes: dark calderas (paterae), red/orange plume-deposit rings, bright sulfur halos
    vec3 q = d * 5.0; vec3 qi = floor(q), qf = fract(q);
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z)); vec3 o = hash33(qi + g + 5.0);
      if (o.z > 0.7) continue;
      float r = 0.05 + 0.08 * o.y;
      float t = length(g + o - qf) / r;
      float kind = hash33(qi + g + 9.0).x;
      col = mix(col, vec3(0.13, 0.07, 0.05), (1.0 - smoothstep(0.7, 1.0, t)));                     // caldera
      if (kind > 0.6) col = mix(col, vec3(0.86, 0.36, 0.13), exp(-pow((t - 3.2) / 1.1, 2.0)) * 0.7); // Pele-like red ring
      else col = mix(col, vec3(1.0, 0.95, 0.7), exp(-pow((t - 1.8) / 0.8, 2.0)) * 0.35);           // bright halo
      h -= (1.0 - smoothstep(0.6, 1.0, t)) * 0.8;
    }
  `,
  Europa: /* glsl */`
    vec3 col = mix(vec3(0.94, 0.92, 0.88), vec3(0.82, 0.76, 0.67), fbm(d * 3.0) * 0.9);
    float trailing = smoothstep(-0.2, 0.9, -d.x);                                                 // darker trailing hemisphere
    col = mix(col, vec3(0.74, 0.60, 0.47), trailing * 0.45 * fbm(d * 4.0 + 2.0) * 1.6);
    float h = 0.0;
    // lineae: curving cracks at several scales, reddish-brown with bright double-ridge centers
    for (int k = 0; k < 4; k++) {
      float fk = 2.2 + float(k) * 1.9;
      float ln = abs(fbm(d * fk + float(k) * 13.7) - 0.5);
      float w = 0.010 - float(k) * 0.0015;
      float line = 1.0 - smoothstep(0.0, w, ln);
      float strength = 0.85 - float(k) * 0.15;
      col = mix(col, vec3(0.56, 0.30, 0.17), line * strength);
      col = mix(col, vec3(0.96, 0.93, 0.88), (1.0 - smoothstep(0.0, w * 0.28, ln)) * 0.6 * strength);
      h += line * strength * 0.6;
    }
    float chaos = smoothstep(0.66, 0.74, fbm(d * 5.0 + 40.0));                                     // chaos terrain
    col = mix(col, vec3(0.62, 0.44, 0.31) * (0.8 + 0.4 * fbm(d * 30.0)), chaos * 0.8);
    h += chaos * (fbm(d * 30.0) - 0.5) * 0.8;
    vec2 cr = craters(d * 3.0, 0.08);                                                              // very few craters (young surface)
    col = mix(col, vec3(1.0), clamp(cr.y, 0.0, 1.0) * 0.5); h += cr.x * 0.4;
  `,
  Ganymede: /* glsl */`
    float m = smoothstep(0.44, 0.56, fbm(d * 2.2 + 7.0));
    vec3 dark = vec3(0.34, 0.31, 0.27) * (0.85 + 0.3 * fbm(d * 12.0));
    vec3 light = vec3(0.68, 0.66, 0.62) * (0.9 + 0.2 * fbm(d * 9.0));
    vec3 gdir = normalize(vec3(fbm(d * 1.6 + 5.0) - 0.5, fbm(d * 1.6 + 9.0) - 0.5, fbm(d * 1.6 + 13.0) - 0.5) + 1e-4);
    float g = sin(dot(d, gdir) * 140.0 + fbm(d * 8.0) * 6.0);
    float grooves = smoothstep(0.4, 1.0, g);
    light *= 0.86 + 0.24 * grooves;                                                               // grooved bright terrain
    vec3 col = mix(dark, light, m);
    float h = m * grooves * 0.5 + (1.0 - m) * (fbm(d * 10.0) - 0.5) * 0.4;
    vec2 cr = craters(d * 6.0, 0.35) + craters(d * 14.0, 0.25) * 0.5;
    col = mix(col, vec3(0.92, 0.92, 0.94), clamp(cr.y, 0.0, 1.0) * 0.7);                          // bright ray craters
    h += cr.x * 0.5;
    col = mix(col, vec3(0.86, 0.87, 0.9), smoothstep(0.72, 0.9, abs(d.y)) * 0.55);                // polar frost
  `,
  Callisto: /* glsl */`
    vec3 col = vec3(0.28, 0.25, 0.22) * (0.75 + 0.5 * fbm(d * 6.0));
    vec2 cr = craters(d * 5.0, 0.6) + craters(d * 11.0, 0.6) * 0.6 + craters(d * 24.0, 0.7) * 0.35;
    col = mix(col, vec3(0.78, 0.76, 0.72), clamp(cr.y * 0.9, 0.0, 1.0));                         // bright icy crater spots
    float h = cr.x * 0.6;
    // Valhalla: multi-ring impact basin (bright center + concentric ridges), ~18°N, 56°W
    vec3 c = normalize(vec3(-cos(0.314) * cos(-0.977), sin(0.314), cos(0.314) * sin(-0.977)));
    float ang = acos(clamp(dot(d, c), -1.0, 1.0));
    col = mix(col, vec3(0.64, 0.60, 0.54), exp(-pow(ang / 0.17, 2.0)) * 0.85);
    float ring = pow(0.5 + 0.5 * cos(ang * 55.0 + fbm(d * 10.0) * 2.5), 6.0) * smoothstep(0.8, 0.2, ang) * step(0.12, ang);
    col += vec3(0.16, 0.15, 0.13) * ring; h += ring * 0.5;
  `,
};

function bake(renderer, body, mode, w) {
  const rt = new THREE.WebGLRenderTarget(w, w / 2, {
    depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMode: { value: mode } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform float uMode; varying vec2 vUv;
      void main() {
        float phi = vUv.x * 6.28318530718, theta = (1.0 - vUv.y) * 3.14159265359;   // same mapping as SphereGeometry
        vec3 d = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
        ${body}
        if (uMode > 0.5) gl_FragColor = vec4(vec3(clamp(h * 0.5 + 0.5, 0.0, 1.0)), 1.0);
        else gl_FragColor = vec4(lin(clamp(col, 0.0, 1.0)), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(prev);
  quad.geometry.dispose(); mat.dispose();
  rt.texture.anisotropy = 4;
  return rt.texture;
}

export function createGalileanMesh(renderer, name, radius, isTouch) {
  const w = isTouch ? 512 : 1024;
  const map = bake(renderer, SURFACES[name], 0, w);
  const bumpMap = bake(renderer, SURFACES[name], 1, w);
  return new THREE.Mesh(new THREE.SphereGeometry(radius, isTouch ? 48 : 72, isTouch ? 32 : 48),
    new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: isTouch ? 2.0 : 3.0, roughness: 0.95, metalness: 0 }));
}

// ---------------------------------------------------------------------------
// Phobos & Deimos (CPU-built irregular meshes)
// ---------------------------------------------------------------------------
function jsNoise(seed) {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const perm = new Uint8Array(512), p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256).map(() => rand());
  const fade = (t) => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const n3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), xf), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
             L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  };
  return { rand, fbm: (x, y, z, oct = 5) => { let sum = 0, a = 0.5, f = 1, nrm = 0; for (let o = 0; o < oct; o++) { sum += a * n3(x * f, y * f, z * f); nrm += a; a *= 0.5; f *= 2; } return sum / nrm; } };
}

const POTATO = {
  //           axes (long axis = x, points at the planet)  lumpiness  craters  seed
  Phobos: { axes: [1.0, 0.81, 0.67], lump: 0.13, nCraters: 55, seed: 3, stickney: true, grooves: true,
            base: [0.37, 0.33, 0.30], crater: 0.9 },
  Deimos: { axes: [1.0, 0.80, 0.73], lump: 0.10, nCraters: 30, seed: 8, stickney: false, grooves: false,
            base: [0.47, 0.42, 0.37], crater: 0.45 },  // Deimos: smoother — craters filled by dust
};

export function createPotatoMesh(name, radius, isTouch) {
  const cfg = POTATO[name];
  const N = jsNoise(cfg.seed);
  let geo = new THREE.IcosahedronGeometry(1, isTouch ? 30 : 56);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);                         // shared vertices → smooth normals
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3(), c = new THREE.Color();
  const randDir = () => { const u = N.rand() * 2 - 1, t = N.rand() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t)); };
  const craters = [];
  for (let i = 0; i < cfg.nCraters; i++) { const r = 0.06 + Math.pow(N.rand(), 2.2) * 0.28; craters.push({ d: randDir(), r, depth: r * 0.35 * cfg.crater }); }
  const stickney = cfg.stickney ? { d: new THREE.Vector3(0.82, 0.12, 0.56).normalize(), r: 0.6, depth: 0.17 } : null;
  if (stickney) craters.push(stickney);
  const grooveDirs = [new THREE.Vector3(0.15, 1, 0.2).normalize(), new THREE.Vector3(-0.3, 0.9, 0.5).normalize(), new THREE.Vector3(0.1, 0.8, -0.6).normalize()];
  const profile = (t) => (t < 1 ? t * t - 1 : 0) + 0.3 * Math.exp(-(((t - 1) / 0.22) ** 2));

  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    let r = 1 + cfg.lump * (N.fbm(n.x * 1.3 + 4, n.y * 1.3, n.z * 1.3, 4) - 0.5) * 2 + 0.04 * (N.fbm(n.x * 4 + 9, n.y * 4, n.z * 4, 4) - 0.5) * 2;
    let shade = 0.85 + 0.3 * N.fbm(n.x * 7, n.y * 7 + 3, n.z * 7, 4), inCrater = 0, inStickney = 0, groove = 0;
    for (const cr of craters) {
      const ang = Math.acos(Math.min(1, Math.max(-1, n.dot(cr.d))));
      const t = ang / cr.r;
      if (t < 1.6) { r += cr.depth * profile(t); if (t < 1) inCrater = Math.max(inCrater, 1 - t); if (cr === stickney && t < 1) inStickney = 1 - t; }
    }
    if (cfg.grooves) {                              // families of parallel grooves, absent inside Stickney
      const mask = Math.max(0, Math.min(1, (0.85 - n.dot(stickney.d)) / 0.5));
      for (let k = 0; k < grooveDirs.length; k++) {
        const v = n.dot(grooveDirs[k]) * (16 + k * 5) + N.fbm(n.x * 3 + k, n.y * 3, n.z * 3, 3) * 0.6;
        const g = Math.abs(v - Math.round(v));      // 0 at groove center
        if (g < 0.09) { const gd = (1 - g / 0.09) * mask * (0.6 + 0.4 * N.fbm(n.x * 5, n.y * 5 + k, n.z * 5, 3)); r -= 0.016 * gd; groove = Math.max(groove, gd); }
      }
    }
    pos.setXYZ(i, n.x * r * cfg.axes[0] * radius, n.y * r * cfg.axes[1] * radius, n.z * r * cfg.axes[2] * radius);
    // colors: dusty gray-brown, darker crater floors & grooves, brighter bluish-gray streaks inside Stickney
    let [cr, cg, cb] = cfg.base;
    cr *= shade; cg *= shade; cb *= shade;
    const dark = 1 - 0.18 * inCrater - 0.25 * groove;
    cr *= dark; cg *= dark; cb *= dark;
    if (inStickney > 0) { const s = Math.min(1, inStickney * 1.6) * (0.5 + 0.5 * N.fbm(n.x * 12, n.y * 12, n.z * 12, 3)); cr += (0.46 - cr) * s; cg += (0.46 - cg) * s; cb += (0.5 - cb) * s; }
    c.setRGB(cr, cg, cb, THREE.SRGBColorSpace);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
}
