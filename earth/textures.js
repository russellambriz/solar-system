// earth/textures.js — loads the real Earth texture set (see textures/earth/SOURCES.md).
//
// Two sets live in textures/earth/:
//   desktop/  2048×1024 day, night lights, water mask, clouds + a normal map
//   mobile/   1024×512  day, night lights, water mask, clouds (no normal map; cheaper on iPad/phones)
//
// Paths are resolved relative to this module, so the site keeps working from a subpath
// (e.g. https://user.github.io/solar-system/).
import * as THREE from 'three';

const BASE = new URL('../textures/earth/', import.meta.url);

/**
 * Start loading the Earth textures. Returns placeholder-backed textures immediately; `onLoad(key, tex)`
 * fires as each real image arrives, so the caller can swap uniforms and flip "ready" flags.
 *
 * @param {object}   opts
 * @param {boolean}  opts.isMobile      use the 1024-wide set and skip the normal map
 * @param {number}   [opts.anisotropy]  max anisotropy to apply (renderer.capabilities.getMaxAnisotropy())
 * @param {Function} opts.onLoad        (key: 'day'|'night'|'water'|'clouds'|'normal', texture) => void
 */
export function loadEarthTextures({ isMobile, anisotropy = 1, onLoad }) {
  const set = isMobile ? 'mobile' : 'desktop';
  const loader = new THREE.TextureLoader();
  const files = {
    day:    { file: 'earth_day.jpg',    srgb: true  },   // colour → sRGB
    night:  { file: 'earth_night.jpg',  srgb: true  },   // colour → sRGB
    water:  { file: 'earth_water.jpg',  srgb: false },   // data mask (white = ocean)
    clouds: { file: 'earth_clouds.jpg', srgb: false },   // data mask (white = cloud)
  };
  if (!isMobile) files.normal = { file: 'earth_normal.jpg', srgb: false };

  for (const [key, { file, srgb }] of Object.entries(files)) {
    loader.load(new URL(`${set}/${file}`, BASE).href, (tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = Math.min(anisotropy, isMobile ? 4 : 8);
      tex.wrapS = THREE.RepeatWrapping;           // longitude wraps (needed by the cloud-shadow lookup)
      tex.wrapT = THREE.ClampToEdgeWrapping;
      onLoad(key, tex);
    }, undefined, (err) => console.warn(`[earth] could not load ${file}`, err));
  }
  return { hasNormal: !isMobile };
}

/** 1×1 solid-colour placeholder so shaders can sample before the images arrive. */
export function solidTexture(r, g, b, srgb = false) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
