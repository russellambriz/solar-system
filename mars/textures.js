// mars/textures.js — loads the real Mars texture set (see textures/mars/SOURCES.md).
//
// Two sets live in textures/mars/:
//   desktop/  2048×1024 colour (USGS Viking MDIM 2.1 colour mosaic) + normal map (MGS MOLA topography)
//   mobile/   1024×512  the same pair (≈ 0.2 MB total; used on iPad/phones, same detection as earth/)
//
// Paths are resolved relative to this module, so the site keeps working from a subpath
// (e.g. https://user.github.io/solar-system/).
import * as THREE from 'three';

const BASE = new URL('../textures/mars/', import.meta.url);

/**
 * Start loading the Mars textures; `onLoad(key, tex)` fires as each image arrives ('color' | 'normal').
 * @param {object}   opts
 * @param {boolean}  opts.isMobile      use the 1024-wide set
 * @param {number}   [opts.anisotropy]  max anisotropy to apply (renderer.capabilities.getMaxAnisotropy())
 * @param {Function} opts.onLoad
 */
export function loadMarsTextures({ isMobile, anisotropy = 1, onLoad }) {
  const set = isMobile ? 'mobile' : 'desktop';
  const loader = new THREE.TextureLoader();
  const files = {
    color:  { file: 'mars_color.jpg',  srgb: true  },   // colour → sRGB
    normal: { file: 'mars_normal.jpg', srgb: false },   // tangent-space normal (R = east, G = north)
  };
  for (const [key, { file, srgb }] of Object.entries(files)) {
    loader.load(new URL(`${set}/${file}`, BASE).href, (tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = Math.min(anisotropy, isMobile ? 4 : 8);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      onLoad(key, tex);
    }, undefined, (err) => console.warn(`[mars] could not load ${file}`, err));
  }
}

/** 1×1 solid-colour placeholder so shaders can sample before the images arrive. */
export function solidTexture(r, g, b, srgb = false) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
