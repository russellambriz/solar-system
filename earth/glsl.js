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
