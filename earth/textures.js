// earth/textures.js — loads the real Earth texture set (see textures/earth/SOURCES.md).
//
// Three tiers live in textures/earth/:
//   mobile/   1024×512  day (December + July), night lights, water mask, clouds, sea-floor depth (no normal map; iPad/phones)
//   desktop/  2048×1024 day, night lights, water mask, clouds, sea-floor depth + a normal map (first paint / fallback;
//             the depth map has no 4K version: ocean colour varies slowly and coastlines come from the water mask)
//   desktop/  4096×2048 earth_{day,night,water,clouds,normal}_4k.jpg          (progressive upgrade)
//
// Desktop loads the 2K set first; once its day + night maps are on screen and the GPU can take 4096² textures
// (and the device is not touch-first), the 4K day/night maps are fetched, decoded off the main thread where
// createImageBitmap exists, pre-uploaded with renderer.initTexture(), and only then swapped in. The 4K water mask
// and cloud map follow right after (same path), so the ocean glint, coastlines and cloud shadows stay as sharp as
// the 4K surface. The 4K cloud map is level-matched to the 2K one, so the swap does not change cloud density.
// The 4K normal map (GEBCO_08 relief, same exaggeration as the 2K one) comes last.
//
// Touch devices (mobile tier) keep the 1K surface maps, but the cloud map is the texture that is most visibly soft
// up close (it is white-on-dark, so every bilinear texel step shows). Once the 1K day + night maps are showing, a
// sharper cloud map alone is fetched the same way: 4096×2048 on tablet-class devices (short side ≥ 744 CSS px, e.g.
// any iPad; maxTextureSize ≥ 4096 and not a low-memory device), 2048×1024 on phones. One extra texture, ~45 MB of
// GPU memory for the 4K one with mips. `?earthclouds=1k|2k|4k` in the page URL forces the size (testing).
//
// Paths are resolved relative to this module, so the site keeps working from a subpath
// (e.g. https://user.github.io/solar-system/).
import * as THREE from 'three';

const BASE = new URL('../textures/earth/', import.meta.url);
// order = fetch priority (colour first; the data masks are sharper but less noticeable)
const HI_RES = {
  day:    { file: 'earth_day_4k.jpg',    srgb: true  },
  night:  { file: 'earth_night_4k.jpg',  srgb: true  },
  dayJul: { file: 'earth_day_jul_4k.jpg', srgb: true },   // July 2004 Blue Marble (seasonal blend, earthMaterial.js)
  water:  { file: 'earth_water_4k.jpg',  srgb: false },
  clouds: { file: 'earth_clouds_4k.jpg', srgb: false },
  normal: { file: 'earth_normal_4k.jpg', srgb: false },   // land relief (tangent space: R east, G north)
};

/**
 * Can this renderer/device take the 4096×2048 maps? Desktop (not touch), maxTextureSize ≥ 4096, and not a
 * low-memory device. `?earth4k=0|1` in the page URL forces it off/on (testing).
 */
export function canUseHiRes(renderer, isMobile) {
  const force = new URLSearchParams(globalThis.location?.search || '').get('earth4k');
  if (force === '0') return false;
  if (!renderer) return false;
  const bigEnough = renderer.capabilities.maxTextureSize >= 4096;
  if (force === '1') return bigEnough;
  const touch = isMobile || (globalThis.matchMedia?.('(pointer: coarse)').matches ?? false) ||
                (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  const mem = globalThis.navigator?.deviceMemory;          // Chromium only; undefined elsewhere
  return bigEnough && !touch && !(mem && mem < 4);
}

/**
 * Cloud-map size for the mobile tier: '1k' (keep the base map), '2k' or '4k' (progressive upgrade, see header).
 */
export function mobileCloudTier(renderer) {
  const force = new URLSearchParams(globalThis.location?.search || '').get('earthclouds');
  const max = renderer?.capabilities.maxTextureSize ?? 0;
  if (force === '1k' || !renderer) return '1k';
  if (force === '4k') return max >= 4096 ? '4k' : (max >= 2048 ? '2k' : '1k');
  if (force === '2k') return max >= 2048 ? '2k' : '1k';
  const mem = globalThis.navigator?.deviceMemory;
  if (mem && mem < 2) return '1k';
  const sw = globalThis.screen?.width ?? 0, sh = globalThis.screen?.height ?? 0;
  const tablet = Math.min(sw, sh) >= 744 && !(mem && mem < 4);
  if (tablet && max >= 4096) return '4k';
  return max >= 2048 ? '2k' : '1k';
}

/**
 * Start loading the Earth textures. `onLoad(key, tex, tier)` fires as each real image arrives (tier is
 * '1k' | '2k' | '4k'), so the caller can swap uniforms and flip "ready" flags.
 *
 * @param {object}   opts
 * @param {boolean}  opts.isMobile      use the 1024-wide set and skip the normal map
 * @param {THREE.WebGLRenderer} [opts.renderer]  anisotropy, 4K capability check and pre-upload
 * @param {Function} opts.onLoad        (key: 'day'|'dayJul'|'night'|'water'|'clouds'|'depth'|'normal', texture, tier) => void
 * @returns {{hasNormal: boolean, info: object}}  info is live: { set, hiResCapable, tier: {day, night, ...},
 *          hiResState: 'off'|'pending'|'loading'|'done'|'failed', hiResMs }
 */
export function loadEarthTextures({ isMobile, renderer = null, onLoad }) {
  const set = isMobile ? 'mobile' : 'desktop';
  const baseTier = isMobile ? '1k' : '2k';
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  const anisotropy = Math.min(maxAniso, isMobile ? 4 : 16);
  const hiResCapable = !isMobile && canUseHiRes(renderer, isMobile);
  const cloudUp = isMobile ? mobileCloudTier(renderer) : '1k';   // mobile-tier cloud upgrade ('1k' = none)
  const info = { set, hiResCapable, cloudUp, cloudUpState: cloudUp === '1k' ? 'off' : 'pending', anisotropy, maxTextureSize: renderer?.capabilities.maxTextureSize, tier: {}, hiResState: hiResCapable ? 'pending' : 'off', hiResMs: 0 };

  const loader = new THREE.TextureLoader();
  const files = {
    day:    { file: 'earth_day.jpg',    srgb: true  },   // colour → sRGB
    night:  { file: 'earth_night.jpg',  srgb: true  },   // colour → sRGB
    dayJul: { file: 'earth_day_jul.jpg', srgb: true },   // July day map: the seasonal partner of the December one
    water:  { file: 'earth_water.jpg',  srgb: false },   // data mask (white = ocean)
    clouds: { file: 'earth_clouds.jpg', srgb: false },   // data mask (white = cloud)
    depth:  { file: 'earth_depth.jpg',  srgb: false },   // sea-floor depth, sqrt(depth / 8 km) (ocean colour; 2K/1K only)
  };
  if (!isMobile) files.normal = { file: 'earth_normal.jpg', srgb: false };

  const setup = (tex, srgb) => {
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = anisotropy;
    tex.wrapS = THREE.RepeatWrapping;           // longitude wraps (needed by the cloud-shadow lookup)
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  let pendingBase = 2;                          // day + night must be showing before the 4K fetch starts
  for (const [key, { file, srgb }] of Object.entries(files)) {
    loader.load(new URL(`${set}/${file}`, BASE).href, (tex) => {
      if (info.tier[key] && info.tier[key] !== baseTier) { tex.dispose(); return; }   // a sharper map won the race
      info.tier[key] = baseTier;
      onLoad(key, setup(tex, srgb), baseTier);
      if ((key === 'day' || key === 'night') && --pendingBase === 0) {
        if (hiResCapable) scheduleHiRes();
        else if (cloudUp !== '1k') scheduleIdle(loadMobileClouds);
      }
    }, undefined, (err) => console.warn(`[earth] could not load ${file}`, err));
  }

  function scheduleIdle(go) {
    // let the first frames with the base maps go out before spending bandwidth/decode time on bigger ones
    if (globalThis.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }
  function scheduleHiRes() { scheduleIdle(loadHiRes); }

  // decode off the main thread where possible, pre-upload, then hand over
  const useBitmap = typeof createImageBitmap === 'function';
  let bmLoader = null;
  function loadBig(url, srgb, done, fail) {
    const finish = (tex) => {
      setup(tex, srgb);
      if (renderer?.initTexture) renderer.initTexture(tex);   // upload (and build mips) now, not mid-frame later
      done(tex);
    };
    if (useBitmap) {
      bmLoader ||= new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' });
      bmLoader.load(url, (bitmap) => {
        const tex = new THREE.Texture(bitmap);
        tex.flipY = false;                        // already flipped by createImageBitmap
        tex.needsUpdate = true;
        tex.userData.bitmap = true;
        finish(tex);
      }, undefined, fail);
    } else {
      loader.load(url, finish, undefined, fail);
    }
  }

  function loadHiRes() {
    info.hiResState = 'loading';
    const t0 = performance.now();
    let remaining = Object.keys(HI_RES).length;
    for (const [key, { file, srgb }] of Object.entries(HI_RES)) {
      loadBig(new URL(`desktop/${file}`, BASE).href, srgb, (tex) => {
        info.tier[key] = '4k';
        onLoad(key, tex, '4k');
        if (--remaining === 0) { info.hiResState = 'done'; info.hiResMs = Math.round(performance.now() - t0); }
      }, (err) => { info.hiResState = 'failed'; console.warn(`[earth] 4K ${file} unavailable, keeping 2K`, err); });
    }
  }

  // mobile tier: sharper cloud map only (see header); the level-matched 2K/4K desktop files are reused
  function loadMobileClouds() {
    info.cloudUpState = 'loading';
    const file = cloudUp === '4k' ? HI_RES.clouds.file : files.clouds.file;
    loadBig(new URL(`desktop/${file}`, BASE).href, false, (tex) => {
      info.tier.clouds = cloudUp;
      onLoad('clouds', tex, cloudUp);
      info.cloudUpState = 'done';
    }, (err) => { info.cloudUpState = 'failed'; console.warn(`[earth] ${cloudUp} cloud map unavailable, keeping 1K`, err); });
  }

  return { hasNormal: !isMobile, info };
}

/** 1×1 solid-colour placeholder so shaders can sample before the images arrive. */
export function solidTexture(r, g, b, srgb = false) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
