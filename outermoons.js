// Major moons of Saturn, Uranus and Neptune (same approach as moons.js for Mars' & Jupiter's moons):
//  • Round moons: procedural color + height maps baked ONCE on the GPU (bake() from moons.js), used as map + bumpMap.
//  • Titan: an extra translucent haze shell (orange, lit by the Sun, bluish detached haze at the limb).
//  • Hyperion & Phoebe (Saturn), Proteus & Nereid (Neptune): irregular "potato" meshes (createPotatoMesh from moons.js).
// Orbits (2026-10-19): every moon is at its REAL position for the sim date — direction from the planet, orbit plane and
// direction of travel — from ephemeris/satellites.js (JPL mean elements + a fit to JPL Horizons; see that file for
// sources). Each moon's pivot is turned into its real orbit plane (Laplace-plane precession included), so inclinations come
// out right by themselves: Iapetus ~15° off Saturn's rings, Phoebe (175°) and Triton (157°) go round backwards, and Uranus's
// moons circle its sideways equator in the same (retrograde vs. IAU north) sense as Uranus spins.
// Distances use the real semi-major axes, compressed logarithmically so the order and spacing ratios survive while the
// whole system fits between the planets. Hyperion (e ≈ 0.10), Phoebe (0.16) and Nereid (0.75) follow real precessing Kepler
// ellipses (radius compressed the same way); Hyperion keeps its 4:3 resonance with Titan.
// Motion is slowed 30× (sys.slow) so the moons stay readable while time runs; whenever the date is set (picker, Today,
// Events, page load) each moon's `anchor(days)` snaps it back to the real position for that date (called through
// ephemeris/moons.js anchorMoonPhase, which main.js's anchorGalileanMoons already calls for every `realLon` body).
import * as THREE from 'three';
import { bake, POTATO, createPotatoMesh } from './moons.js';
import { SAT_ELEMENTS, satelliteState } from './ephemeris/satellites.js';

const SPIN_SLOWDOWN = 50;   // same as main.js (only used for the non-locked moons: Hyperion, Phoebe, Nereid)

// ---------------------------------------------------------------------------
// Surfaces (GLSL bodies: `d` = unit direction in the moon's local frame; must set vec3 col and float h)
// Local frame of a tidally locked moon: +x faces the planet, +z is the leading hemisphere (direction of motion),
// -z trailing, ±y poles.
// ---------------------------------------------------------------------------
const SURFACES = {
  Mimas: /* glsl */`
    vec3 col = vec3(0.70, 0.69, 0.67) * (0.88 + 0.24 * fbm(d * 5.0));
    vec2 cr = craters(d * 5.0, 0.75) + craters(d * 11.0, 0.8) * 0.6 + craters(d * 23.0, 0.8) * 0.35;
    float h = cr.x * 0.5;
    col *= 1.0 - 0.12 * clamp(-cr.x, 0.0, 1.0);
    col = mix(col, vec3(0.86, 0.86, 0.85), clamp(cr.y, 0.0, 1.0) * 0.3);
    // Herschel: 130 km wide (a third of Mimas) with a 6 km central peak — the "Death Star" look
    vec3 hc = normalize(vec3(0.35, -0.03, 0.94));
    float t = acos(clamp(dot(d, hc), -1.0, 1.0)) / 0.34;
    h += (t < 1.0 ? (t * t - 1.0) * 0.8 : 0.0) + exp(-pow((t - 1.0) / 0.12, 2.0)) * 0.6 + exp(-pow(t / 0.13, 2.0)) * 0.7;
    col *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 1.0, t));
    col = mix(col, vec3(0.84, 0.84, 0.82), exp(-pow((t - 1.0) / 0.12, 2.0)) * 0.35);
  `,
  Enceladus: /* glsl */`
    vec3 col = vec3(0.95, 0.96, 0.97) * (0.93 + 0.09 * fbm(d * 6.0));
    float south = smoothstep(0.45, 0.65, -d.y);                                       // young, crater-free south polar terrain
    float crMask = (1.0 - south) * (0.35 + 0.65 * smoothstep(0.35, 0.65, fbm(d * 2.0 + 3.0)));
    vec2 cr = craters(d * 6.0, 0.55) + craters(d * 13.0, 0.6) * 0.5;
    float h = cr.x * 0.45 * crMask;
    col *= 1.0 - 0.07 * clamp(-cr.x, 0.0, 1.0) * crMask;
    float fr = abs(fbm(d * 3.5 + 20.0) - 0.5);                                         // fractures across the smooth plains
    float frl = (1.0 - smoothstep(0.0, 0.012, fr)) * (1.0 - crMask * 0.7);
    col = mix(col, vec3(0.78, 0.87, 0.92), frl * 0.55); h -= frl * 0.3;
    col = mix(col, vec3(0.86, 0.93, 0.97), south * 0.4);
    // the four "tiger stripes" (Alexandria, Cairo, Baghdad, Damascus sulci): parallel bluish fissures at the south pole
    float s = dot(d.xz, normalize(vec2(0.8, 0.6))) + (fbm(d * 6.0) - 0.5) * 0.05;
    float sd = abs(fract(s * 5.5 + 0.5) - 0.5);
    float stripeMask = smoothstep(0.80, 0.90, -d.y) * (1.0 - smoothstep(0.32, 0.4, abs(s)));
    float stripe = (1.0 - smoothstep(0.0, 0.06, sd)) * stripeMask;
    col = mix(col, vec3(0.48, 0.66, 0.72), stripe * 0.85);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.06, 0.1, sd)) * smoothstep(0.03, 0.06, sd) * stripeMask * 0.6);  // bright flanks
    h -= stripe * 0.7;
  `,
  Tethys: /* glsl */`
    vec3 col = vec3(0.86, 0.85, 0.83) * (0.9 + 0.18 * fbm(d * 5.0));
    col *= 0.94 + 0.06 * d.z;                                                          // trailing side slightly darker
    vec2 cr = craters(d * 5.0, 0.7) + craters(d * 12.0, 0.75) * 0.5 + craters(d * 25.0, 0.75) * 0.3;
    float h = cr.x * 0.45; col *= 1.0 - 0.1 * clamp(-cr.x, 0.0, 1.0);
    // Odysseus: 445 km basin on the leading hemisphere
    vec3 oc = normalize(vec3(0.25, 0.55, 0.8));
    float t = acos(clamp(dot(d, oc), -1.0, 1.0)) / 0.42;
    h += (t < 1.0 ? (t * t - 1.0) * 0.45 : 0.0) + exp(-pow((t - 1.0) / 0.1, 2.0)) * 0.45 + exp(-pow(t / 0.15, 2.0)) * 0.25;
    col *= 1.0 - 0.06 * (1.0 - smoothstep(0.6, 1.0, t));
    // Ithaca Chasma: 2,000 km canyon running ~3/4 of the way around, roughly concentric with Odysseus
    float gc = abs(dot(d, oc) + (fbm(d * 4.0 + 7.0) - 0.5) * 0.06);
    float along = smoothstep(-0.9, -0.5, dot(d, normalize(vec3(-0.9, 0.2, 0.4))) * -1.0 + 0.2);
    float can = (1.0 - smoothstep(0.03, 0.085, gc)) * along;
    h -= can * 0.7; col *= 1.0 - 0.12 * can;
    col = mix(col, vec3(0.93, 0.93, 0.92), exp(-pow((gc - 0.09) / 0.015, 2.0)) * along * 0.4);  // bright canyon walls
  `,
  Dione: /* glsl */`
    vec3 col = vec3(0.82, 0.81, 0.79) * (0.9 + 0.18 * fbm(d * 5.0));
    float trail = smoothstep(-0.1, 0.6, -d.z);
    col *= 1.0 - 0.22 * trail;                                                         // darker trailing hemisphere
    vec2 cr = craters(d * 5.0, 0.7) + craters(d * 12.0, 0.75) * 0.5 + craters(d * 24.0, 0.7) * 0.3;
    float h = cr.x * 0.5 * (1.0 - 0.5 * trail);
    col = mix(col, vec3(0.95), clamp(cr.y, 0.0, 1.0) * 0.3 * (1.0 - trail));
    // "wispy terrain": bright ice cliffs (chasmata) hundreds of metres high on the trailing side
    for (int k = 0; k < 3; k++) {
      float ln = abs(fbm(d * (2.4 + float(k) * 1.7) + float(k) * 9.1) - 0.5);
      float w = 0.012 - float(k) * 0.003;
      float l = 1.0 - smoothstep(0.0, w, ln);
      col = mix(col, vec3(0.97, 0.97, 0.98), l * trail * (0.85 - float(k) * 0.2));
      h += l * trail * 0.35;
    }
  `,
  Rhea: /* glsl */`
    vec3 col = vec3(0.80, 0.79, 0.77) * (0.88 + 0.2 * fbm(d * 5.0));
    float trail = smoothstep(0.0, 0.7, -d.z);
    col *= 1.0 - 0.15 * trail;
    vec2 cr = craters(d * 5.0, 0.8) + craters(d * 11.0, 0.8) * 0.6 + craters(d * 23.0, 0.8) * 0.35;
    float h = cr.x * 0.55;
    col *= 1.0 - 0.1 * clamp(-cr.x, 0.0, 1.0);
    for (int k = 0; k < 2; k++) {                                                      // fainter wisps than Dione
      float ln = abs(fbm(d * (2.2 + float(k) * 1.9) + float(k) * 4.3) - 0.5);
      float l = 1.0 - smoothstep(0.0, 0.009, ln);
      col = mix(col, vec3(0.95, 0.95, 0.96), l * trail * 0.55); h += l * trail * 0.25;
    }
    // Inktomi: young 48 km crater with a bright butterfly-shaped ray splash on the leading hemisphere
    vec3 ic = normalize(vec3(0.3, -0.25, 0.92));
    float ang = acos(clamp(dot(d, ic), -1.0, 1.0));
    float rays = exp(-ang / 0.12) + smoothstep(0.55, 0.8, fbm(d * 18.0)) * exp(-ang / 0.35) * 0.8;
    col = mix(col, vec3(0.98, 0.98, 0.99), clamp(rays, 0.0, 1.0) * 0.8);
    h += (ang < 0.04 ? -0.5 : 0.0);
  `,
  Titan: /* glsl */`
    // surface as seen dimly through the haze (Cassini near-IR maps): dark equatorial dune seas, bright Xanadu, polar lakes
    vec3 col = vec3(0.62, 0.45, 0.25);
    float dunes = (1.0 - smoothstep(0.35, 0.55, abs(d.y))) * smoothstep(0.42, 0.58, fbm(d * 2.0 + 5.0));
    col = mix(col, vec3(0.30, 0.20, 0.13), dunes * 0.85);
    float xan = smoothstep(0.55, 0.85, dot(d, normalize(vec3(0.2, -0.1, 1.0))) + (fbm(d * 3.0) - 0.5) * 0.4);
    col = mix(col, vec3(0.86, 0.68, 0.42), xan);
    float seas = smoothstep(0.72, 0.82, d.y) * smoothstep(0.5, 0.6, fbm(d * 4.0 + 2.0));
    col = mix(col, vec3(0.12, 0.10, 0.09), seas);
    float h = (fbm(d * 6.0) - 0.5) * 0.3 + xan * 0.25 - seas * 0.3 + dunes * (sin(dot(d, vec3(0.0, 0.0, 1.0)) * 300.0) * 0.05);
    col = mix(col, vec3(0.80, 0.56, 0.26), 0.5);                                       // haze veil (the shell adds the rest)
  `,
  Iapetus: /* glsl */`
    // two-tone: coal-dark Cassini Regio on the leading hemisphere, snow-bright trailing side and poles
    float b = d.z + (fbm(d * 3.0 + 4.0) - 0.5) * 0.5 - abs(d.y) * 0.55;
    float dark = smoothstep(0.02, 0.18, b);
    dark = max(dark, smoothstep(0.62, 0.7, fbm(d * 14.0)) * smoothstep(-0.28, 0.02, b));   // patchy transition zone
    vec3 bright = vec3(0.82, 0.80, 0.74) * (0.9 + 0.15 * fbm(d * 8.0));
    vec3 darkc = vec3(0.14, 0.09, 0.055) * (0.8 + 0.4 * fbm(d * 9.0));
    vec3 col = mix(bright, darkc, dark);
    vec2 cr = craters(d * 5.0, 0.7) + craters(d * 12.0, 0.75) * 0.5;
    float h = cr.x * 0.5;
    // Turgis & Engelier: large old basins
    float tb = acos(clamp(dot(d, normalize(vec3(0.7, 0.3, 0.6))), -1.0, 1.0)) / 0.45;
    h += (tb < 1.0 ? (tb * tb - 1.0) * 0.35 : 0.0) + exp(-pow((tb - 1.0) / 0.1, 2.0)) * 0.3;
    // the equatorial ridge (up to 20 km high) that gives Iapetus its walnut shape
    float ridge = exp(-pow((d.y + (fbm(d * 5.0) - 0.5) * 0.02) / 0.03, 2.0)) * smoothstep(-0.4, 0.3, d.z + 0.2);
    h += ridge * 0.9;
    col *= 1.0 + ridge * 0.25;
  `,
  Miranda: /* glsl */`
    vec3 col = vec3(0.63, 0.63, 0.62) * (0.85 + 0.3 * fbm(d * 6.0));
    vec2 cr = craters(d * 6.0, 0.6) + craters(d * 14.0, 0.65) * 0.5;
    float h = cr.x * 0.4;
    // three coronae (Arden – leading, Elsinore – trailing, Inverness – south pole): grooved, banded "racetracks"
    for (int k = 0; k < 3; k++) {
      vec3 c = k == 0 ? normalize(vec3(0.0, -0.2, 1.0)) : (k == 1 ? normalize(vec3(0.0, -0.2, -1.0)) : normalize(vec3(0.3, -1.0, 0.1)));
      float ang = acos(clamp(dot(d, c), -1.0, 1.0)) + (fbm(d * 3.0 + float(k) * 5.0) - 0.5) * 0.25;
      float R = k == 2 ? 0.6 : 0.75;
      float inside = 1.0 - smoothstep(R - 0.05, R, ang);
      float band = 0.5 + 0.5 * sin(ang * (30.0 + 10.0 * float(k)) + fbm(d * 4.0 + float(k)) * 7.0);
      col = mix(col, mix(vec3(0.40, 0.40, 0.39), vec3(0.82, 0.82, 0.80), band), inside * 0.65 * (0.6 + 0.4 * fbm(d * 7.0 + 2.0)));
      h += inside * ((band - 0.5) * 0.6 - cr.x * 0.3);
      if (k == 2) col = mix(col, vec3(0.92), inside * (1.0 - smoothstep(0.0, 0.05, abs(abs(d.x - 0.1) * 1.6 - (-d.y - 0.6)))) * 0.7); // bright chevron
    }
    // Verona Rupes: a fault scarp thought to be up to ~20 km tall
    float sc = abs(dot(d, normalize(vec3(1.0, 0.3, 0.2))) - 0.15);
    float scarp = (1.0 - smoothstep(0.0, 0.025, sc)) * smoothstep(0.3, 0.6, -d.y);
    col = mix(col, vec3(0.92), scarp * 0.6); h += scarp * 0.8;
  `,
  Ariel: /* glsl */`
    vec3 col = vec3(0.72, 0.71, 0.70) * (0.88 + 0.24 * fbm(d * 6.0));
    vec2 cr = craters(d * 6.0, 0.55) + craters(d * 14.0, 0.6) * 0.5;
    float h = cr.x * 0.4;
    col = mix(col, vec3(0.93), clamp(cr.y, 0.0, 1.0) * 0.4);
    // interconnected rift canyons (chasmata) with smooth, bright floors
    for (int k = 0; k < 3; k++) {
      float ln = abs(fbm(d * (2.0 + float(k) * 1.3) + float(k) * 7.3) - 0.5);
      float w = 0.024 - float(k) * 0.005;
      float can = 1.0 - smoothstep(w * 0.5, w, ln);
      float fl = 1.0 - smoothstep(0.0, w * 0.5, ln);
      h -= can * 0.55; col = mix(col, vec3(0.52, 0.51, 0.50), (can - fl) * 0.5); col = mix(col, vec3(0.80, 0.80, 0.79), fl * 0.5);
    }
  `,
  Umbriel: /* glsl */`
    vec3 col = vec3(0.30, 0.29, 0.28) * (0.85 + 0.3 * fbm(d * 6.0));
    vec2 cr = craters(d * 5.0, 0.75) + craters(d * 11.0, 0.75) * 0.6 + craters(d * 23.0, 0.75) * 0.3;
    float h = cr.x * 0.55;
    col = mix(col, vec3(0.52, 0.51, 0.49), clamp(cr.y, 0.0, 1.0) * 0.25);
    // Wunda: the mysterious bright ring (~131 km) on a crater floor near the equator
    float ang = acos(clamp(dot(d, normalize(vec3(0.1, -0.14, 1.0))), -1.0, 1.0));
    col = mix(col, vec3(0.84, 0.82, 0.78), exp(-pow((ang - 0.085) / 0.028, 2.0)) * 0.95);
    h += exp(-pow((ang - 0.115) / 0.022, 2.0)) * 0.4 - (1.0 - smoothstep(0.09, 0.12, ang)) * 0.3;
  `,
  Titania: /* glsl */`
    vec3 col = vec3(0.60, 0.57, 0.54) * (0.86 + 0.28 * fbm(d * 6.0));
    vec2 cr = craters(d * 5.0, 0.65) + craters(d * 12.0, 0.7) * 0.5 + craters(d * 24.0, 0.7) * 0.3;
    float h = cr.x * 0.5;
    col = mix(col, vec3(0.88, 0.87, 0.85), clamp(cr.y, 0.0, 1.0) * 0.55);              // bright-rayed young craters
    // Messina Chasmata & other huge fault canyons (up to ~1,500 km long)
    for (int k = 0; k < 2; k++) {
      float ln = abs(fbm(d * 1.6 + float(k) * 11.0) - 0.5);
      float can = (1.0 - smoothstep(0.005, 0.016, ln)) * smoothstep(0.3, 0.55, fbm(d * 2.0 + float(k) * 3.0));
      h -= can * 0.7; col *= 1.0 - 0.25 * can;
      col = mix(col, vec3(0.85, 0.84, 0.82), exp(-pow((ln - 0.018) / 0.004, 2.0)) * 0.35);
    }
    // Gertrude: 326 km basin
    float gt = acos(clamp(dot(d, normalize(vec3(-0.3, 0.2, 0.93))), -1.0, 1.0)) / 0.42;
    h += (gt < 1.0 ? (gt * gt - 1.0) * 0.35 : 0.0) + exp(-pow((gt - 1.0) / 0.1, 2.0)) * 0.35;
  `,
  Oberon: /* glsl */`
    vec3 col = vec3(0.48, 0.42, 0.39) * (0.85 + 0.3 * fbm(d * 5.0));                   // old, slightly reddish
    vec2 cr = craters(d * 5.0, 0.75) + craters(d * 11.0, 0.75) * 0.6 + craters(d * 22.0, 0.7) * 0.35;
    float h = cr.x * 0.6;
    col = mix(col, vec3(0.12, 0.10, 0.09), clamp(-cr.x, 0.0, 1.0) * 0.55 * smoothstep(0.45, 0.6, fbm(d * 9.0)));  // dark crater floors
    col = mix(col, vec3(0.84, 0.82, 0.80), clamp(cr.y, 0.0, 1.0) * 0.6);              // bright ray systems
    // Hamlet: 206 km crater with a dark floor
    float hm = acos(clamp(dot(d, normalize(vec3(0.2, 0.3, 0.93))), -1.0, 1.0)) / 0.27;
    h += (hm < 1.0 ? (hm * hm - 1.0) * 0.4 : 0.0) + exp(-pow((hm - 1.0) / 0.12, 2.0)) * 0.35;
    col = mix(col, vec3(0.13, 0.11, 0.10), (1.0 - smoothstep(0.4, 0.8, hm)) * 0.7);
  `,
  Triton: /* glsl */`
    // pinkish nitrogen/methane-frost south polar cap with dark plume streaks; greenish-grey "cantaloupe" terrain to the north
    float cap = smoothstep(-0.05, 0.12, -d.y + 0.1 + (fbm(d * 4.0) - 0.5) * 0.35);
    vec3 capc = vec3(0.93, 0.83, 0.80) * (0.9 + 0.15 * fbm(d * 7.0));
    float cell = abs(fbm(d * 9.0) - 0.5);
    float cant = 1.0 - smoothstep(0.0, 0.06, cell);
    vec3 north = vec3(0.68, 0.70, 0.64) * (0.85 + 0.2 * fbm(d * 5.0));
    north = mix(north, vec3(0.48, 0.50, 0.46), cant * 0.6);
    vec3 col = mix(north, capc, cap);
    col = mix(col, vec3(0.74, 0.80, 0.76), exp(-pow((cap - 0.5) / 0.2, 2.0)) * 0.3);   // bluish fringe at the cap edge
    float streak = smoothstep(0.70, 0.80, noise(vec3(d.x * 7.0 + d.z * 3.0, d.y * 55.0, d.z * 55.0)) * 0.65 + fbm(d * 16.0) * 0.45);
    col = mix(col, vec3(0.26, 0.21, 0.21), streak * cap * 0.8);                       // windblown geyser deposits
    vec2 cr = craters(d * 5.0, 0.15);                                                  // very few craters: young surface
    float h = (1.0 - cap) * cant * 0.35 + (fbm(d * 8.0) - 0.5) * 0.2 + cr.x * 0.3;
  `,
};

// Irregular moons of Saturn & Neptune (shape builder in moons.js)
Object.assign(POTATO, {
  // Hyperion: elongated (360 × 266 × 205 km), very lumpy, crowded with deep sharp craters → "sponge"; Cassini saw dark reddish crater floors
  Hyperion: { axes: [1.0, 0.76, 0.64], lump: 0.18, nCraters: 95, seed: 47, stickney: false, grooves: false,
              basin: { d: [0.35, 0.55, 0.76], r: 0.62, depth: 0.2 }, base: [0.55, 0.48, 0.40], crater: 0.95, floor: [0.24, 0.15, 0.10] },
  // Phoebe: roughly round (219 × 217 × 204 km), coal-dark, battered
  Phoebe:   { axes: [1.0, 0.92, 0.90], lump: 0.08, nCraters: 35, seed: 58, stickney: false, grooves: false,
              basin: { d: [-0.4, 0.2, 0.89], r: 0.5, depth: 0.12 }, base: [0.18, 0.15, 0.13], crater: 0.6 },   // Jason crater (~100 km)

  Proteus: { axes: [1.0, 0.92, 0.93], lump: 0.09, nCraters: 40, seed: 21, stickney: false, grooves: false,
             basin: { d: [0.2, 0.3, 0.93], r: 0.55, depth: 0.12 }, base: [0.24, 0.23, 0.22], crater: 0.6 },   // Pharos crater
  Nereid:  { axes: [1.0, 0.95, 0.92], lump: 0.06, nCraters: 22, seed: 34, stickney: false, grooves: false,
             base: [0.36, 0.35, 0.34], crater: 0.5 },
});

// ---------------------------------------------------------------------------
// Data (real facts). a = semi-major axis (km), period = days, incl = deg to the planet's equator.
// Display: orbit = inner + k · ln(a / a_first), size = 0.0068 · √diameter (min 0.16), motion slowed 30×.
// ---------------------------------------------------------------------------
const lock = 'Tidally locked (= orbital period)';
export const OUTER_MOON_SYSTEMS = {
  // frame: camera framing radius — Iapetus (13.2) + margin, so focusing Saturn doesn't pull back to far-out Phoebe (15.4 – 16.1)
  Saturn: { slow: 30, inner: 7.3, k: 2.0, frame: 14, moons: [
    { name: 'Mimas', diameter: 396, a: 185539, period: 0.942, phase: 0.5, color: '#bdbab4',
      type: 'Moon of Saturn', diameterText: '396 km (0.03× Earth)', distanceText: '185,539 km', periodText: '22 h 37 min (0.94 days)', dayText: lock,
      fact: 'Its giant crater Herschel is 130 km wide — a third of Mimas\'s whole diameter — which makes it look like the Death Star. ' +
            'Mimas\'s gravity also clears the Cassini Division, the big dark gap in Saturn\'s rings.' },
    { name: 'Enceladus', diameter: 504, a: 238042, period: 1.370, phase: 2.0, color: '#f4f8fb',
      type: 'Moon of Saturn', diameterText: '504 km (0.04× Earth)', distanceText: '238,042 km', periodText: '32 h 53 min (1.37 days)', dayText: lock,
      fact: 'The shiniest world in the solar system — fresh snow reflects nearly all sunlight. More than 100 geysers along the "tiger stripes" at ' +
            'its south pole spray water from a hidden ocean into space, feeding Saturn\'s E ring.' },
    { name: 'Tethys', diameter: 1062, a: 294619, period: 1.888, phase: 3.6, color: '#dcdad5',
      type: 'Moon of Saturn', diameterText: '1,062 km (0.08× Earth)', distanceText: '294,619 km', periodText: '45 h 18 min (1.89 days)', dayText: lock,
      fact: 'Made almost entirely of water ice (density 0.98 g/cm³). Its canyon Ithaca Chasma is ~2,000 km long and up to 100 km wide, and its ' +
            'Odysseus crater is 445 km across. Two tiny moons, Telesto and Calypso, share its orbit.' },
    { name: 'Dione', diameter: 1123, a: 377396, period: 2.737, phase: 5.1, color: '#cfcdc8',
      type: 'Moon of Saturn', diameterText: '1,123 km (0.09× Earth)', distanceText: '377,396 km', periodText: '2.74 days', dayText: lock,
      fact: 'The bright "wispy" streaks on its trailing side turned out to be ice cliffs hundreds of metres tall. Dione may hide an ocean ~100 km ' +
            'down, and two little Trojan moons (Helene and Polydeuces) travel in its orbit.' },
    { name: 'Rhea', diameter: 1527, a: 527108, period: 4.518, phase: 1.2, color: '#cbc9c4',
      type: 'Moon of Saturn', diameterText: '1,527 km (0.12× Earth)', distanceText: '527,108 km', periodText: '4.52 days', dayText: lock,
      fact: 'Saturn\'s second-largest moon is a cold, heavily cratered ball of ice and rock. In 2010 Cassini found it has an incredibly thin ' +
            'atmosphere of oxygen and carbon dioxide.' },
    { name: 'Titan', diameter: 5149, a: 1221870, period: 15.945, phase: 4.2, color: '#e3a04f',
      type: 'Largest moon of Saturn', diameterText: '5,149 km (0.40× Earth, bigger than Mercury)', distanceText: '1,221,870 km', periodText: '15.95 days', dayText: lock,
      fact: 'The only moon with a thick atmosphere — mostly nitrogen, 1.5× Earth\'s surface pressure — wrapped in orange smog. It rains methane, ' +
            'and Titan has lakes and seas of liquid methane and ethane. ESA\'s Huygens probe landed there in 2005; NASA\'s Dragonfly drone is next.',
      haze: true },
    { name: 'Hyperion', kind: 'potato', diameter: 270, a: 1481009, e: 0.1236, period: 21.276, phase: 3.5604, peri: 0.5, periRate: -8.894e-4, rotation: 13, color: '#c9b89a',
      type: 'Moon of Saturn', diameterText: '~270 km (irregular, 360 × 266 × 205 km)', distanceText: '1,481,009 km (1.30 – 1.66 million km)', periodText: '21.28 days',
      dayText: 'Chaotic: tumbles unpredictably (not tidally locked)',
      fact: 'Looks like a giant sponge: it is so porous (density ~0.54 g/cm³, ~40% empty space) that impacts punch deep, sharp-edged craters instead of ' +
            'blasting material away. Titan\'s pull (a 4:3 orbital resonance) makes it tumble chaotically, and Cassini found dark reddish material pooled in its crater floors.' },
    { name: 'Iapetus', diameter: 1469, a: 3560820, period: 79.32, phase: 0.2, incl: 15.47, node: 0.6, color: '#a8957a',
      type: 'Moon of Saturn', diameterText: '1,469 km (0.12× Earth)', distanceText: '3,560,820 km', periodText: '79.3 days', dayText: lock,
      fact: 'Two-faced: its leading side is as dark as coal and its trailing side as bright as snow — Cassini (who discovered it in 1671) noticed it ' +
            'vanished on one side of Saturn. A 20 km-high ridge runs around its equator like the seam of a walnut.' },
    { name: 'Phoebe', kind: 'potato', diameter: 213, a: 12947780, e: 0.1635, period: 550.31, phase: 2.4, incl: 173.0, node: 3.0, peri: 2.0, rotation: 0.3863, color: '#4a3f38',
      type: 'Moon of Saturn (irregular)', diameterText: '~213 km (0.02× Earth)', distanceText: '12,947,780 km (10.8 – 15.1 million km)',
      periodText: '550.3 days, retrograde (backwards, tilted 173°)', dayText: '9 h 16 min (not tidally locked)',
      fact: 'A captured outsider: it orbits backwards, far beyond the other big moons, and is probably a Centaur or Kuiper-belt object that strayed too close. ' +
            'Dark as soot (reflects ~6% of light), it sheds dust into the huge, faint Phoebe ring — the dust that drifts inward and paints Iapetus\'s leading side dark.' },
  ] },
  Uranus: { slow: 30, inner: 4.4, k: 2.0, moons: [
    { name: 'Miranda', diameter: 472, a: 129390, period: 1.413, phase: 0.8, incl: 4.3, node: 1.0, color: '#b3b3b1',
      type: 'Moon of Uranus', diameterText: '472 km (0.04× Earth)', distanceText: '129,390 km', periodText: '33 h 55 min (1.41 days)', dayText: lock,
      fact: 'A "Frankenstein" moon stitched together from wildly different terrains, with giant racetrack-shaped grooved regions. Its cliff ' +
            'Verona Rupes may be ~20 km tall — a dropped rock would fall for about 12 minutes.' },
    { name: 'Ariel', diameter: 1158, a: 191020, period: 2.520, phase: 2.9, color: '#cfcecc',
      type: 'Moon of Uranus', diameterText: '1,158 km (0.09× Earth)', distanceText: '191,020 km', periodText: '2.52 days', dayText: lock,
      fact: 'The brightest of Uranus\'s big moons and probably the youngest surface, criss-crossed by long rift canyons. Like all of Uranus\'s moons ' +
            'it is named after a character from Shakespeare or Alexander Pope — Ariel is the spirit in The Tempest.' },
    { name: 'Umbriel', diameter: 1169, a: 266000, period: 4.144, phase: 4.6, color: '#6b6966',
      type: 'Moon of Uranus', diameterText: '1,169 km (0.09× Earth)', distanceText: '266,000 km', periodText: '4.14 days', dayText: lock,
      fact: 'The darkest of the five major moons, an ancient cratered surface. Near its equator sits Wunda, a mysterious bright ring ' +
            'about 131 km across — possibly a frost deposit on a crater floor.' },
    { name: 'Titania', diameter: 1577, a: 435910, period: 8.706, phase: 1.7, color: '#b6aea6',
      type: 'Largest moon of Uranus', diameterText: '1,577 km (0.12× Earth)', distanceText: '435,910 km', periodText: '8.71 days', dayText: lock,
      fact: 'Uranus\'s largest moon (8th-largest in the solar system), discovered by William Herschel in 1787. Huge fault canyons like ' +
            'Messina Chasmata (~1,500 km long) show it once expanded as its interior water froze.' },
    { name: 'Oberon', diameter: 1523, a: 583520, period: 13.463, phase: 5.6, color: '#988a80',
      type: 'Moon of Uranus', diameterText: '1,523 km (0.12× Earth)', distanceText: '583,520 km', periodText: '13.46 days', dayText: lock,
      fact: 'The outermost major moon: old, reddish and heavily cratered, many craters with dark floors like Hamlet (206 km). ' +
            'Part of each orbit it leaves Uranus\'s magnetic bubble.' },
  ] },
  Neptune: { slow: 30, inner: 3.3, k: 2.0, frame: 9, moons: [
    { name: 'Proteus', kind: 'potato', diameter: 420, a: 117647, period: 1.122, phase: 1.3, color: '#6d6a66',
      type: 'Moon of Neptune', diameterText: '~420 km (irregular, 424 × 390 × 396 km)', distanceText: '117,647 km', periodText: '26 h 56 min (1.12 days)', dayText: lock,
      fact: 'One of the largest non-round bodies known — almost massive enough for gravity to pull it into a ball. It is so dark (reflects ~10% of ' +
            'light) and close to Neptune\'s glare that it was missed until Voyager 2 flew by in 1989.' },
    { name: 'Triton', diameter: 2707, a: 354759, period: 5.877, phase: 3.0, incl: 156.9, node: 2.2, color: '#e7c9c2',
      type: 'Largest moon of Neptune (retrograde)', diameterText: '2,707 km (0.21× Earth)', distanceText: '354,759 km',
      periodText: '5.88 days, retrograde (backwards, tilted 157°)', dayText: lock,
      fact: 'The only big moon that orbits backwards, so it is probably a captured Kuiper-belt world like Pluto. Voyager 2 saw nitrogen geysers ' +
            'shooting 8 km high from its pinkish south polar cap at −235 °C. Tides are slowly dragging it inward; in billions of years it will be torn into a ring.' },
    { name: 'Nereid', kind: 'potato', diameter: 357, a: 5513818, e: 0.751, period: 360.13, phase: 0.0, incl: 7.2, node: 4.0, peri: 1.2, rotation: 0.48, color: '#9a9692',
      type: 'Moon of Neptune', diameterText: '~357 km', distanceText: '5.5 million km avg (1.4 – 9.7 million km)', periodText: '360.1 days',
      dayText: '~11.5 hours (not tidally locked)',
      fact: 'Has one of the most stretched-out orbits of any moon (eccentricity 0.75): its distance from Neptune swings between 1.4 and 9.7 million km. ' +
            'Gerard Kuiper discovered it in 1949, a century after Triton.' },
  ] },
};

// ---------------------------------------------------------------------------
// Titan's haze: translucent shell lit by the Sun (at the origin), golden-orange, with a bluish detached haze at the limb
// ---------------------------------------------------------------------------
function titanHaze(radius, isTouch) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(-vW);
        float mu = max(dot(N, V), 0.0), rim = 1.0 - mu;
        float lit = smoothstep(-0.3, 0.45, dot(N, L));
        float fwd = pow(max(dot(-V, L), 0.0), 3.0) * pow(rim, 3.0);                 // backlit ring when Titan is in front of the Sun
        vec3 c = mix(vec3(0.96, 0.66, 0.30), vec3(0.62, 0.76, 1.0), smoothstep(0.7, 0.95, rim) * 0.75);
        // thick over the disc, fading smoothly to nothing at the shell's edge (no hard step at the surface limb)
        float a = (0.5 + 0.35 * smoothstep(0.0, 0.6, rim)) * (1.0 - smoothstep(0.6, 0.99, rim)) * (0.12 + 0.88 * lit) + fwd * 0.8;
        gl_FragColor = vec4(c * (0.25 + 0.95 * lit + fwd), clamp(a, 0.0, 0.92));
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, isTouch ? 40 : 64, isTouch ? 28 : 44), mat);
}

function createSurfaceMesh(renderer, name, radius, diameter, isTouch) {
  const big = diameter > 900;
  const w = isTouch ? (big ? 512 : 256) : (big ? 1024 : 512);   // lighter textures on touch devices / for tiny moons
  const map = bake(renderer, SURFACES[name], 0, w);
  const bumpMap = bake(renderer, SURFACES[name], 1, w);
  const seg = isTouch ? (big ? 48 : 32) : (big ? 72 : 48);
  return new THREE.Mesh(new THREE.SphereGeometry(radius, seg, Math.round(seg * 2 / 3)),
    new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: isTouch ? 2.0 : 3.0, roughness: 0.95, metalness: 0, emissive: 0x0b0b0e }));
}

// ICRF (equatorial J2000) → scene axes, with the same obliquity as constellations/raDecToScene and axes/orientTilt
// (ecliptic = XZ, north = +Y, ecliptic longitude λ: x = cos λ, z = −sin λ).
const OBL = 23.44 * Math.PI / 180, CE = Math.cos(OBL), SE = Math.sin(OBL);
const icrfToScene = (v, out) => out.set(v[0], -v[1] * SE + v[2] * CE, -(v[1] * CE + v[2] * SE));

/**
 * Build one planet's moon system. Returns moon body objects (main.js pushes them into `bodies`).
 * helpers = { renderer, isTouch, tiltGroup, parent, orbitLine, addLabel, addPickSphere }
 */
export function createOuterMoons(planetName, { renderer, isTouch, tiltGroup, parent, orbitLine, addLabel, addPickSphere }) {
  const sys = OUTER_MOON_SYSTEMS[planetName];
  const a0 = sys.moons[0].a;
  const mapDist = (km) => sys.inner + sys.k * Math.log(km / a0);
  const out = [];
  let maxR = 0;
  // real orbit frame → tilt-group local: the tilt group's +Y is the IAU pole (axes/), its parent group is unrotated
  const toLocal = new THREE.Quaternion();
  const _P = new THREE.Vector3(), _Q = new THREE.Vector3(), _W = new THREE.Vector3(), _m = new THREE.Matrix4(), _st = {};
  let anchorDays = null;                                  // sim date of the last date pick (shared, so resonances stay in step)
  const realDays = (days) => {
    if (anchorDays === null) anchorDays = days;
    return anchorDays + (days - anchorDays) / sys.slow;   // slowed clock that equals the sim date right after a date pick
  };
  for (const m of sys.moons) {
    m.distLabel = `Distance from ${planetName}`;
    const el = SAT_ELEMENTS[m.name];
    const e = el ? el.e : (m.e || 0);
    const size = Math.max(0.16, 0.0068 * Math.sqrt(m.diameter));
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = m.node || 0;                       // fallback only (moons without real elements)
    pivot.rotation.x = THREE.MathUtils.degToRad(m.incl || 0);
    tiltGroup.add(pivot);
    const mg = new THREE.Group();
    pivot.add(mg);
    const mesh = m.kind === 'potato' ? createPotatoMesh(m.name, size, isTouch) : createSurfaceMesh(renderer, m.name, size, m.diameter, isTouch);
    mg.add(mesh);
    if (m.haze) mesh.add(titanHaze(size, isTouch));
    const orbitDist = mapDist(m.a);
    const ring = orbitLine(orbitDist, 0xb8c4e6, 0.3);      // faint ring; follows the planet; toggled with "Orbit lines"
    const eccentric = e > 0.05;                           // Hyperion, Phoebe, Nereid: draw the (compressed) ellipse
    if (eccentric) {
      const pts = [];
      for (let i = 0; i <= 256; i++) {                    // periapsis along +x; ring.rotation.y = ω turns it into place
        const nu = i / 256 * Math.PI * 2, rr = (1 - e * e) / (1 + e * Math.cos(nu)), d = mapDist(m.a * rr);
        pts.push(new THREE.Vector3(Math.cos(nu) * d, 0, -Math.sin(nu) * d));
        maxR = Math.max(maxR, d);
      }
      ring.geometry.setFromPoints(pts);
    } else maxR = Math.max(maxR, orbitDist);
    const locked = !m.rotation;
    const update = (days) => {
      const s = el && satelliteState(m.name, realDays(days), _st);
      let u;
      if (s) {
        // orbit plane: pivot x → ascending node (P), pivot +y → orbit normal (W), pivot z → −Q (so angle u runs along the orbit)
        toLocal.copy(tiltGroup.quaternion).invert();
        icrfToScene(s.P, _P).applyQuaternion(toLocal);
        icrfToScene(s.W, _W).applyQuaternion(toLocal);
        icrfToScene(s.Q, _Q).applyQuaternion(toLocal).negate();
        pivot.quaternion.setFromRotationMatrix(_m.makeBasis(_P, _W, _Q));
        u = s.u;
        if (eccentric) ring.rotation.y = s.w;
      } else {
        u = m.phase + (days / (m.period * sys.slow)) * Math.PI * 2;
      }
      const d = eccentric && s ? mapDist(s.r) : orbitDist;
      mg.position.set(Math.cos(u) * d, 0, -Math.sin(u) * d);
      mesh.rotation.y = locked ? u + Math.PI               // tidally locked: local +x faces the planet
        : (days / m.rotation / SPIN_SLOWDOWN) * Math.PI * 2;
    };
    pivot.add(ring);
    const mb = { name: m.name, info: m, group: mg, mesh, radius: size, isMoon: true,
      parent, orbitDist, period: m.period, slow: sys.slow, phase: m.phase, update,
      realLon: !!el,                                      // main.js anchorGalileanMoons → ephemeris/moons.js anchorMoonPhase → anchor()
      anchor: (days) => { anchorDays = days; } };
    m.realPos = !!el;
    mb.labelEl = addLabel(mg, m.name, size + 0.4, true);
    addPickSphere(mg, size, mb);
    out.push(mb);
  }
  parent.systemRadius = sys.frame || maxR;              // camera framing distance (focusOffset uses systemRadius × 3.4)
  return out;
}
