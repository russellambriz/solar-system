// asteroids/shapes.js: small procedural asteroid meshes (CPU-built once, vertex-coloured, one draw call each).
//  • 'potato': a lumpy ellipsoid (Psyche, 2024 YR4, Dimorphos)
//  • 'top':    a "spinning top" with a ridge around the equator (Bennu, Ryugu, Didymos): fast spin flung loose rubble
//              towards the equator, so the profile is close to a double cone with rounded tips
//  • 'peanut': an elongated body pinched at the waist, optionally bent like a banana (Apophis, Eros)
// Plus craters (bowl + raised rim), boulders (small bumps, lighter or darker) and gentle fbm lumpiness.
// Same idea as createPotatoMesh in moons.js (Phobos/Deimos/Vesta), but far fewer vertices: these are small on screen.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function noise(seed) {
  let s = (seed * 9301 + 49297) % 233280;
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
  const fbm = (x, y, z, oct = 4) => { let sum = 0, a = 0.5, f = 1, nrm = 0; for (let o = 0; o < oct; o++) { sum += a * n3(x * f, y * f, z * f); nrm += a; a *= 0.5; f *= 2; } return sum / nrm; };
  return { rand, fbm };
}

/** cfg: { kind, axes:[x,y,z], lump, craters, boulders, base:[r,g,b] (sRGB), seed, ridge?, waist?, bend?, metal? }.
 *  radius: half the longest axis, in scene units. y is the spin axis. */
export function createAsteroidMesh(cfg, radius, isTouch) {
  const N = noise(cfg.seed || 1);
  let geo = new THREE.IcosahedronGeometry(1, isTouch ? 10 : 18);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3(), c = new THREE.Color();
  const randDir = () => { const u = N.rand() * 2 - 1, t = N.rand() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t)); };
  const craters = Array.from({ length: cfg.craters || 0 }, () => { const r = 0.08 + Math.pow(N.rand(), 2) * 0.3; return { d: randDir(), r, depth: r * 0.3 }; });
  const boulders = Array.from({ length: isTouch ? Math.round((cfg.boulders || 0) * 0.6) : cfg.boulders || 0 },
    () => ({ d: randDir(), r: 0.025 + Math.pow(N.rand(), 3) * 0.09, h: 0.4 + N.rand() * 0.6, tone: N.rand() < 0.5 ? 1.25 : 0.72 }));
  const profile = (t) => (t < 1 ? t * t - 1 : 0) + 0.3 * Math.exp(-(((t - 1) / 0.22) ** 2));
  const [ax, ay, az] = cfg.axes || [1, 1, 1];
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    // base body
    let r = 1;
    if (cfg.kind === 'top') {
      // blend of a sphere and a double cone |y|·k + ρ = 1 (ρ = distance from the spin axis): sharp-ish equatorial ridge
      const rho = Math.hypot(n.x, n.z), cone = 1 / (rho + Math.abs(n.y) * 1.08);
      r = THREE.MathUtils.lerp(1, Math.min(cone, 1.15), cfg.ridge ?? 0.6);
    }
    let x = n.x * r * ax, y = n.y * r * ay, z = n.z * r * az;
    if (cfg.kind === 'peanut') {
      const pinch = 1 - (cfg.waist || 0.2) * Math.exp(-((x / 0.32) ** 2));     // narrower in the middle: two lobes
      y *= pinch; z *= pinch;
      if (cfg.bend) y += cfg.bend * (x * x - 0.33);                            // banana bend (Eros's saddle on the inside)
    }
    // lumps, craters, boulders (as a radial factor on the shaped surface)
    let k = 1 + (cfg.lump || 0.08) * (N.fbm(n.x * 1.6 + 4, n.y * 1.6, n.z * 1.6) - 0.5) * 2 + 0.03 * (N.fbm(n.x * 5 + 9, n.y * 5, n.z * 5, 3) - 0.5) * 2;
    let inCrater = 0, tone = 1;
    for (const cr of craters) {
      const t = Math.acos(Math.min(1, Math.max(-1, n.dot(cr.d)))) / cr.r;
      if (t < 1.6) { k += cr.depth * profile(t) * 0.6; if (t < 1) inCrater = Math.max(inCrater, 1 - t); }
    }
    for (const b of boulders) {
      const t = Math.acos(Math.min(1, Math.max(-1, n.dot(b.d)))) / b.r;
      if (t < 1) { const bump = Math.sqrt(1 - t * t); k += b.r * b.h * 0.55 * bump; tone = Math.max(0.6, Math.min(1.35, tone * (1 + (b.tone - 1) * bump))); }
    }
    pos.setXYZ(i, x * k * radius, y * k * radius, z * k * radius);
    const shade = (0.82 + 0.36 * N.fbm(n.x * 6, n.y * 6 + 3, n.z * 6, 3)) * (1 - 0.2 * inCrater) * tone;
    const [br, bg, bb] = cfg.base || [0.5, 0.47, 0.43];
    c.setRGB(Math.min(1, br * shade), Math.min(1, bg * shade), Math.min(1, bb * shade), THREE.SRGBColorSpace);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const metal = cfg.metal || 0;
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 - metal * 0.6, metalness: metal, emissive: 0x0d0c0b }));
}
