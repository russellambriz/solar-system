// earth/glsl.js — GLSL snippets shared by the Earth surface and cloud shaders.

/**
 * Direction (unit vector in a sphere's object space) → equirectangular UV, matching THREE.SphereGeometry:
 *   x = -cos(phi)·sin(theta),  y = cos(theta),  z = sin(phi)·sin(theta),   uv = (phi / 2π, 1 − theta / π)
 * The u coordinate may fall outside [0,1]; textures use RepeatWrapping in S so that is fine.
 */
export const DIR_TO_UV = /* glsl */ `
vec2 dirToUv(vec3 d) {
  float u = atan(d.z, -d.x) * 0.15915494;           // 1 / (2π)
  float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) * 0.31830989; // 1 / π
  return vec2(u, v);
}
`;

/** Cloud texture value → coverage (0..1): crush the grey haze in the source image, keep soft edges. */
export const CLOUD_CURVE = /* glsl */ `
float cloudCurve(float c) { return smoothstep(0.08, 0.80, c); }
`;

/** Cheap 3-D value noise (0..1), used for ocean roughness variation. */
export const VALUE_NOISE = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;
