// spacecraft/models.js: small procedural models (built in metres, scaled up by index.js). Parts are merged per material,
// so each craft costs at most a handful of draw calls, and index.js hides a model while it is under ~1 px on screen.
// Axes: +Y is the craft's "front" (dish toward Earth, heat shield or sunshield toward the Sun); see each builder.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let M = null;
function materials() {
  if (M) return M;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, emissive: 0x0d0d0f, ...o });
  M = {
    white: std(0xe8e8e4, { roughness: 0.55 }),
    dish: std(0xeeeeea, { roughness: 0.5, side: THREE.DoubleSide }),
    grey: std(0x8d9097, { roughness: 0.5, metalness: 0.3 }),
    dark: std(0x2f3136, { roughness: 0.7, emissive: 0x08080a }),
    gold: std(0xd6a845, { roughness: 0.38, metalness: 0.5, emissive: 0x1c1405 }),
    panel: std(0x22325e, { roughness: 0.35, metalness: 0.35, emissive: 0x060a16, side: THREE.DoubleSide }),
    array: std(0xb38a3e, { roughness: 0.45, metalness: 0.3, emissive: 0x150e04, side: THREE.DoubleSide }),
    mirror: std(0xffcb52, { roughness: 0.22, metalness: 0.6, emissive: 0x2a1c04 }),
    shield: std(0xcdb9e8, { roughness: 0.45, metalness: 0.35, emissive: 0x120e1a, side: THREE.DoubleSide }),
  };
  return M;
}

class Kit {
  constructor() { this.parts = new Map(); }
  add(mat, geo, p = [0, 0, 0], r = [0, 0, 0]) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
      new THREE.Vector3(1, 1, 1)));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  build(name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      group.add(new THREE.Mesh(mergeGeometries(list, false), mat));
      list.forEach((g) => g.dispose());
    }
    return group;
  }
}

const HALF_PI = Math.PI / 2;
const rod = (r, len, seg = 6) => new THREE.CylinderGeometry(r, r, len, seg, 1);
// shallow paraboloid dish opening toward +Y (rim radius r, depth d)
function dish(r, d, seg = 24) {
  const pts = [];
  for (let i = 0; i <= 6; i++) { const x = (i / 6) * r; pts.push(new THREE.Vector2(x, d * (x / r) ** 2)); }
  return new THREE.LatheGeometry(pts, seg);
}

// Voyager: 3.7 m high-gain dish (+Y, faces Earth), ten-sided bus, 13 m magnetometer boom, RTG boom, science boom
function voyager() {
  const m = materials(), k = new Kit();
  k.add(m.dish, dish(1.83, 0.55), [0, 0, 0]);
  k.add(m.grey, rod(0.05, 1.1), [0, 0.55, 0]);
  k.add(m.gold, new THREE.CylinderGeometry(0.89, 0.89, 0.47, 10), [0, -0.3, 0]);
  k.add(m.grey, rod(0.035, 13, 5), [7.3, -0.35, 0], [0, 0, HALF_PI]);              // magnetometer boom
  const yaw = Math.atan2(0.6, 0.8);   // booms point along (-0.8, 0, ∓0.6)
  k.add(m.grey, rod(0.06, 2.6), [-1.3 * 0.8, -0.4, -1.3 * 0.6], [0, -yaw, HALF_PI]);                 // RTG boom
  for (let i = 0; i < 3; i++) {
    const s = 1.4 + i * 0.55;
    k.add(m.dark, new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10), [-s * 0.8, -0.4, -s * 0.6], [0, -yaw, HALF_PI]);
  }
  k.add(m.grey, rod(0.06, 2.3), [-1.15 * 0.8, -0.4, 1.15 * 0.6], [0, yaw, HALF_PI]);                 // science boom
  k.add(m.dark, new THREE.BoxGeometry(0.6, 0.45, 0.45), [-2.3 * 0.8, -0.4, 2.3 * 0.6]);                  // scan platform
  return { group: k.build('Voyager'), ref: 3.7 };
}

// New Horizons: triangular gold-foil body, 2.1 m dish (+Y), one RTG
function newHorizons() {
  const m = materials(), k = new Kit();
  const tri = new THREE.Shape([new THREE.Vector2(-1.2, -0.75), new THREE.Vector2(1.2, -0.75), new THREE.Vector2(0, 1.35)]);
  k.add(m.gold, new THREE.ExtrudeGeometry(tri, { depth: 0.7, bevelEnabled: false }), [0, -0.05, 0], [HALF_PI, 0, 0]);  // y -0.75..-0.05
  k.add(m.dish, dish(1.05, 0.32), [0, -0.05, 0.1]);
  k.add(m.grey, rod(0.04, 0.6), [0, 0.25, 0.1]);
  k.add(m.dark, new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12), [1.45, -0.4, -0.95], [0, 0.6, HALF_PI]);  // RTG
  return { group: k.build('New Horizons'), ref: 2.7 };
}

// Parker Solar Probe: 2.3 m white heat shield (+Y, faces the Sun), hexagonal body, two small cooled arrays, boom
function parker() {
  const m = materials(), k = new Kit();
  k.add(m.white, new THREE.CylinderGeometry(1.15, 1.15, 0.115, 32), [0, 1.0, 0]);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; k.add(m.grey, rod(0.025, 0.7), [Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45]); }
  k.add(m.gold, new THREE.CylinderGeometry(0.5, 0.5, 1.2, 6), [0, -0.1, 0]);
  k.add(m.panel, new THREE.BoxGeometry(0.04, 0.9, 0.55), [0.78, -0.3, 0], [0, 0, 0.35]);
  k.add(m.panel, new THREE.BoxGeometry(0.04, 0.9, 0.55), [-0.78, -0.3, 0], [0, 0, -0.35]);
  k.add(m.grey, rod(0.03, 2.2), [0, -1.8, 0]);
  return { group: k.build('Parker Solar Probe'), ref: 2.3 };
}

// JWST: five-layer kite-shaped sunshield in the XZ plane (Sun on the -Y side), 18-segment gold mirror above it facing +Z
function jwst() {
  const m = materials(), k = new Kit();
  for (let i = 0; i < 5; i++) {
    const s = 1 - i * 0.035, L = 10.6 * s, W = 7.1 * s, c = 5.2 * s;
    const sh = new THREE.Shape([new THREE.Vector2(-L, 0), new THREE.Vector2(-c, -W), new THREE.Vector2(c, -W),
      new THREE.Vector2(L, 0), new THREE.Vector2(c, W), new THREE.Vector2(-c, W)]);
    k.add(m.shield, new THREE.ShapeGeometry(sh), [0, i * 0.14, 0], [-HALF_PI, 0, 0]);
  }
  k.add(m.dark, new THREE.BoxGeometry(2.2, 1.0, 2.2), [0, -0.7, 0]);                       // spacecraft bus (warm side)
  k.add(m.panel, new THREE.BoxGeometry(1.6, 0.05, 5.9), [0, -1.2, -3.4]);                   // solar array
  k.add(m.grey, rod(0.18, 2.4), [0, 1.6, -0.9]);                                            // tower
  k.add(m.dark, new THREE.BoxGeometry(2.6, 3.0, 1.2), [0, 4.2, -1.0]);                      // instruments behind the mirror
  const R = 0.762, rows = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    const s = -q - r, ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    if (ring === 0 || ring > 2) continue;
    rows.push([R * 1.005 * Math.sqrt(3) * (q + r / 2), R * 1.005 * 1.5 * r, ring]);
  }
  for (const [x, y, ring] of rows) {
    // slight cupping: outer segments tilt toward the axis
    k.add(m.mirror, new THREE.CylinderGeometry(R, R, 0.06, 6), [x, 4.2 + y, ring * 0.06], [HALF_PI - y * 0.025, x * 0.025, 0]);
  }
  for (const a of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {                       // secondary mirror struts
    const x0 = Math.cos(a) * 3.1, y0 = 4.2 + Math.sin(a) * 3.1, x1 = 0, y1 = 4.2, z1 = 7.0;
    const v = new THREE.Vector3(x1 - x0, y1 - y0, z1), len = v.length();
    const g = rod(0.04, len, 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()));
    k.add(m.grey, g, [(x0 + x1) / 2, (y0 + y1) / 2, z1 / 2]);
  }
  k.add(m.mirror, new THREE.CylinderGeometry(0.37, 0.37, 0.06, 6), [0, 4.2, 7.0], [HALF_PI, 0, 0]);
  return { group: k.build('JWST'), ref: 21.2 };
}

// ISS: 109 m truss along X, eight gold solar-array wings, white module stack along Z (+Z = direction of flight), radiators
function iss() {
  const m = materials(), k = new Kit();
  k.add(m.grey, new THREE.BoxGeometry(109, 3.5, 3.5), [0, 3.5, 0]);
  for (const x of [-50, -36, 36, 50]) for (const side of [-1, 1]) {
    k.add(m.array, new THREE.BoxGeometry(11.6, 0.15, 34), [x, 3.5, side * 19.5]);
    k.add(m.grey, rod(0.3, 34, 4), [x, 3.5, side * 19.5], [HALF_PI, 0, 0]);
  }
  for (const x of [-14, 14]) k.add(m.white, new THREE.BoxGeometry(12, 0.2, 9), [x, 3.5, -7], [0.25, 0, 0]);
  k.add(m.white, new THREE.CylinderGeometry(2.1, 2.1, 66, 14), [0, 0, -2], [HALF_PI, 0, 0]);            // US + Russian modules
  k.add(m.white, new THREE.CylinderGeometry(2.2, 2.2, 24, 14), [0, 0, 29], [0, 0, HALF_PI]);           // Columbus–Harmony–Kibo
  k.add(m.panel, new THREE.BoxGeometry(29, 0.15, 3.3), [0, 0, -30]);                                   // Zvezda arrays
  k.add(m.panel, new THREE.BoxGeometry(22, 0.15, 3.0), [0, 0, -18]);                                   // Zarya arrays
  return { group: k.build('ISS'), ref: 109 };
}

export const MODELS = { voyager, newHorizons, parker, jwst, iss };
