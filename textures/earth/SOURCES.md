# Earth textures — sources & licences

## Day + night maps (all tiers) — directly from NASA (public domain)

| File(s) | Source (exact URL) | Original |
|---|---|---|
| `desktop/earth_day_4k.jpg`, `desktop/earth_day.jpg`, `mobile/earth_day.jpg` | NASA Visible Earth — *Blue Marble Next Generation w/ Topography and Bathymetry*, December 2004: <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg> (record page: <https://visibleearth.nasa.gov/images/73909>) | 5400×2700 JPEG, 2.57 MB |
| `desktop/earth_night_4k.jpg`, `desktop/earth_night.jpg`, `mobile/earth_night.jpg` | NASA Earth Observatory — *Black Marble 2016* (VIIRS Day/Night Band), 3 km colour composite: <https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg> (record page: <https://visibleearth.nasa.gov/images/144898>) | 13500×6750 JPEG, 8.1 MB |
| (reference, not shipped) | NASA *Earth at Night 2012* (Black Marble 2012): <https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.13500x6750.jpg> | 13500×6750 JPEG — downloaded for comparison; 2016 used (newer, cleaner city cores) |

### Seasonal partner: July day map (`earth_day_jul*.jpg`, all tiers)

| File(s) | Source (exact URL) | Original |
|---|---|---|
| `desktop/earth_day_jul_4k.jpg` (1.52 MB), `desktop/earth_day_jul.jpg` (363 KB), `mobile/earth_day_jul.jpg` (99 KB) | NASA Visible Earth — *Blue Marble Next Generation w/ Topography and Bathymetry*, July 2004: <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg> (record page: <https://visibleearth.nasa.gov/images/73751>) | 5400×2700 JPEG, 2.31 MB |

Same product, projection and colour processing as the December map, so the two line up pixel for pixel and need no
level matching. Resampled in linear light (Lanczos, Python/Pillow) to 4096×2048 (q92), 2048×1024 (q88) and
1024×512 (q86), progressive, 4:2:0. The shader (earth/earthMaterial.js) blends December ↔ July by the simulated
date: snow cover and sea ice advance/retreat with latitude, the tropics cross-fade evenly.

**Licence:** NASA imagery is not subject to copyright in the United States and is used here as public domain
(NASA media usage guidelines: <https://www.nasa.gov/nasa-brand-center/images-and-media/>). Credit requested:
*"Blue Marble: NASA Earth Observatory / Reto Stöckli (NASA GSFC); Black Marble: NASA Earth Observatory / Joshua
Stevens, Suomi NPP VIIRS data from Miguel Román (NASA GSFC)."* NASA's logo/insignia are not used.

Both sources use the same plate-carrée layout as `SphereGeometry` UVs (−180° at the left edge, north up) and line up
with the water mask below (checked by overlaying the mask's coastline on the day map).

### Processing (ImageMagick 7, Lanczos, resampled in linear light)

```
# day
convert world.topo.bathy.200412.3x5400x2700.jpg -colorspace RGB -filter Lanczos -resize 4096x2048! -colorspace sRGB -strip day4k.png
# night: resize, then remove Black Marble's moonlit blue land/ice base so only (warm) city lights remain
convert BlackMarble_2016_3km.jpg -colorspace RGB -filter Lanczos -resize 4096x2048! -colorspace sRGB -strip night4k_raw.png
convert night4k_raw.png -fx "u*clamp((max(u.r,u.g)-0.75*u.b)*5)" night4k.png
# encode (progressive, 4:2:0); 2K/1K are Lanczos downscales of the 4K PNGs
convert day4k.png   -sampling-factor 4:2:0 -interlace Plane -quality 92 desktop/earth_day_4k.jpg
convert night4k.png -sampling-factor 4:2:0 -interlace Plane -quality 92 desktop/earth_night_4k.jpg
…-resize 2048x1024 … -quality 88 desktop/earth_day.jpg / earth_night.jpg
…-resize 1024x512  … -quality 86 mobile/earth_day.jpg  / earth_night.jpg
```

| File | Size | Bytes |
|---|---|---|
| `desktop/earth_day_4k.jpg`   | 4096×2048 | 1.68 MB |
| `desktop/earth_night_4k.jpg` | 4096×2048 | 0.38 MB |
| `desktop/earth_day.jpg`      | 2048×1024 | 403 KB |
| `desktop/earth_night.jpg`    | 2048×1024 | 115 KB |
| `mobile/earth_day.jpg`       | 1024×512  | 109 KB |
| `mobile/earth_night.jpg`     | 1024×512  | 35 KB |

Loading: iPad/touch → `mobile/` only. Desktop → 2K set first, then (if `maxTextureSize ≥ 4096`, not touch, not a
low-memory device) the two 4K maps are fetched and swapped in when decoded (`earth/textures.js`; `?earth4k=0|1`
forces it off/on). Mean linear day colour of the new 2K day map (cos-latitude weighted): ≈ (0.096, 0.096, 0.111),
within ~5 % of the old value, so `uEarthTint` was left unchanged (the Moon's earthshine is tuned against it).

## 4K water mask + 4K clouds (desktop), and the 2K/1K water masks — directly from NASA (public domain)

| File(s) | Source (exact URL) | Original |
|---|---|---|
| `desktop/earth_water_4k.jpg`, `desktop/earth_water.jpg`, `mobile/earth_water.jpg` | NASA Visible Earth — *Blue Marble Next Generation: Bathymetry* (GEBCO): <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73963/gebco_08_rev_bath_21600x10800.png> (record page: <https://visibleearth.nasa.gov/images/73963>) | 21600×10800 PNG, 35 MB (land = 255) |
| `desktop/earth_clouds_4k.jpg`, `desktop/earth_clouds.jpg`, `mobile/earth_clouds.jpg` (all three since 2026-10-17) | NASA Visible Earth — *Blue Marble: Clouds*: <https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif> (record page: <https://visibleearth.nasa.gov/images/57747>) | 8192×4096 TIFF, 34 MB |

Processing (Python/Pillow + numpy, ImageMagick 7 encode):

- **Water**: ocean = (bathymetry < 255) at full resolution, area-averaged (box filter) to 4096×2048, so coastlines are
  exact coverage. Inland lakes (Great Lakes, Victoria, Baikal, …) are not in the bathymetry, so they are taken from the
  old three.js mask (bicubic-upsampled), only where they are > 6 px (4K) from GEBCO ocean and between 60° S and 68° N
  (this drops the old mask's false "water" on Antarctic ice shelves and the Siberian Arctic coast). Water area,
  cos-latitude weighted: 69.6 %. Alignment check against `earth_day_4k.jpg`: correlation peaks at 0 px offset.
  2K and 1K masks are box downscales of the 4K mask. Greyscale progressive JPEG q90 (4K), q88 (2K), q86 (1K).
- **Clouds** (2026-10-13 4K only; since 2026-10-17 all three tiers, cleaned) — `tools/clean_clouds.py`
  (Python 3, Pillow + numpy):

  ```
  git show 8e4ba46:textures/earth/desktop/earth_clouds.jpg > ref2k.jpg     # the old three.js 2K map = level reference
  python3 textures/earth/tools/clean_clouds.py cloud_combined_8192.tif ref2k.jpg /tmp/c
  cp /tmp/c/earth_clouds_4k.jpg desktop/earth_clouds_4k.jpg
  cp /tmp/c/earth_clouds_2k.jpg desktop/earth_clouds.jpg
  cp /tmp/c/earth_clouds_1k.jpg mobile/earth_clouds.jpg
  ```

  1. **Dateline seam** (the visible artifact): the mosaic's left and right edges come from different satellite
     passes, so at lon ±180° the clouds were cut off along a straight N–S line (most visible 0–30° S, e.g. east of
     Fiji). Seam |Δ| / mean column |Δ| between 30° N and 50° S was 1.79 (4K), 1.91 (2K), 1.65 (1K), i.e. the
     single worst column of every map. At 8192 px the jump excess D(y) (edge difference minus the slope continued
     from both sides) is removed with a Laplace-like correction: each vertical frequency of D decays away from the
     seam as exp(−d/L), L = 3/|k_y| clamped to 8…256 px, half on each side, so large-scale offsets blend over up to
     ~11° of longitude and fine-scale mismatch over a few px (no smear band). After: 1.13 (4K), 1.28 (2K), 1.29 (1K),
     ~70th–90th percentile of ordinary columns, so the seam is no longer distinguishable.
  2. **Vertical swath stripes**: checked, none to remove. In square Hann tiles the 2D power of N–S stripes over the
     diagonal directions at equal |k| is 0.70–1.09 at every octave (30° N – 50° S) in the source and in every
     output (clouds are zonally elongated, so the E–W direction is the strong one), i.e. no periodic swath gain
     striping, so no frequency-domain notch is applied (it would only remove real cloud texture). The mosaic's
     short diagonal swath-gap edges are left untouched.
  3. Lanczos downscale in float, longitude wrap-padded (so the resampling kernel sees across ±180°), to
     4096 / 2048 / 1024, then a 256-step quantile map onto the old 2K map's levels, so `cloudCurve` and `uEarthTint`
     stay tuned. All three tiers are now the same NASA pattern (the old three.js 2K/1K were a slightly different
     version of it, correlation 0.996), so the 2K → 4K swap no longer shifts any cloud. Mean grey 67.33 for every
     tier (old 2K 67.31, old 4K 66.86); cos-latitude-weighted cover > 100: 20.2 % (old 2K 20.0 %, old 4K 20.6 %).
  4. Greyscale progressive JPEG q80 (Pillow, optimize): 4K 1.62 MB, 2K 452 KB, 1K 126 KB.

| File | Size | Bytes |
|---|---|---|
| `desktop/earth_water_4k.jpg`  | 4096×2048 | 523 KB |
| `desktop/earth_clouds_4k.jpg` | 4096×2048 | 1.62 MB |
| `desktop/earth_clouds.jpg`    | 2048×1024 | 452 KB |
| `mobile/earth_clouds.jpg`     | 1024×512  | 126 KB |
| `desktop/earth_water.jpg`     | 2048×1024 | 187 KB |
| `mobile/earth_water.jpg`      | 1024×512  | 64 KB |

The 2K/1K **cloud** maps used to be the three.js ones below; since 2026-10-17 they come from the same NASA source.

## Normal maps (desktop 4K + 2K) — from NASA GEBCO_08 topography (public domain)

| File(s) | Source (exact URL) | Original |
|---|---|---|
| `desktop/earth_normal_4k.jpg`, `desktop/earth_normal.jpg` | NASA Visible Earth — *Blue Marble Next Generation: Topography* (GEBCO_08 land elevation): <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png> (record page: <https://visibleearth.nasa.gov/images/73934>) | 21600×10800 8-bit greyscale PNG, 18.4 MB (0 = sea level … 255 = 6400 m) |

Licence as for the NASA maps above (public domain). Credit: *"Topography: NASA Earth Observatory, Blue Marble Next
Generation (elevation from the GEBCO_08 Grid)."* Same plate-carrée layout as the day map and water mask (−180° at the left edge, north up).

Processing — `tools/make_normal.py` (Python 3, Pillow + numpy), then ImageMagick 7:

```
python3 textures/earth/tools/make_normal.py gebco_08_rev_elev_21600x10800.png /tmp/n
magick /tmp/n/n4096.png -strip -sampling-factor 4:4:4 -interlace Plane -quality 90 desktop/earth_normal_4k.jpg
magick /tmp/n/n2048.png -strip -sampling-factor 4:4:4 -interlace Plane -quality 90 desktop/earth_normal.jpg
```

- Heights: elevation level × 6400/255 m, area-averaged (box filter) from 21600 to 4096 / 2048 wide in float, so
  the 8-bit 25 m steps average out instead of terracing.
- Anti-pinch: each row is low-passed along longitude (circular FFT, so the ±180° seam wraps) with
  σ ≈ 0.5·(1/cos φ − 1) px, giving roughly isotropic ground resolution up to the poles.
- Slopes: central differences in metres — east spacing 2πR·cos φ / W, north spacing πR / H — with a 20× vertical
  exaggeration baked in (`n = normalize(−20·∂h/∂east, −20·∂h/∂north, 1)`). The 2K map uses the same exaggeration,
  so the 2K → 4K swap only adds detail. Land |xy| percentiles (50/90/99 %): 4K 0.06 / 0.39 / 0.77, 2K 0.05 / 0.27 / 0.60.
- Encoding: **R = east, G = north, B = up** (OpenGL/+Y), matching `earthMaterial.js` (T = east tangent,
  B = cross(N, T) = north). Checked on the data: Himalaya south face mean normal points south (G < 0.5), Andes west
  face points west (R < 0.5), east face east; seam column difference ≈ JPEG noise. Checked on screen with a
  low morning Sun over India: the west-facing Western Ghats escarpment falls into shade. Ocean is ~flat in the map
  (sea level = 0) and the shader masks relief by the water map anyway.
- JPEG 4:4:4 (no chroma subsampling: R/G carry the slopes), q90, progressive.
- `earthMaterial.js` uses `uNormalStrength` = 1.0 (`earth/index.js` DEFAULTS.normalStrength) on top of the baked 20×.

| File | Size | Bytes |
|---|---|---|
| `desktop/earth_normal_4k.jpg` | 4096×2048 | 1.22 MB |
| `desktop/earth_normal.jpg`    | 2048×1024 | 265 KB |

Loading: the 2K normal map is part of the desktop first-paint set; the 4K one is the last map of the progressive 4K
upgrade (`earth/textures.js`, desktop only, `?earth4k=0|1`). iPad/mobile has no normal map.

The previous normal map (three.js `earth_normal_2048.jpg`, below) was replaced on 2026-10-15: it was softer and its
green channel was the opposite (DirectX, +G = south) convention, so north/south-facing slopes were lit backwards.

## Sea-floor depth maps (desktop 2K + mobile 1K, since 2026-10-23) — from NASA GEBCO_08 bathymetry (public domain)

| File(s) | Source (exact URL) | Original |
|---|---|---|
| `desktop/earth_depth.jpg` (2048×1024, 292 KB), `mobile/earth_depth.jpg` (1024×512, 88 KB) | NASA Visible Earth — *Blue Marble Next Generation: Bathymetry* (GEBCO_08), the same file as the water mask: <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73963/gebco_08_rev_bath_21600x10800.png> (record page: <https://visibleearth.nasa.gov/images/73963>) | 21600×10800 8-bit PNG, 35 MB (255 = land, 0 = 8000 m or deeper, linear) |

Used by the true-colour ocean (`earthMaterial.js`, `uOceanColor`): the "topo.bathy" day maps paint the sea-floor
relief into the open ocean, so past the shelf break the shader replaces it with a uniform deep ocean colour.
Built with `tools/make_depth.py` (Python 3, Pillow + numpy):

```
python3 textures/earth/tools/make_depth.py gebco_08_rev_bath_21600x10800.png /tmp/d
cp /tmp/d/earth_depth.jpg    desktop/earth_depth.jpg
cp /tmp/d/earth_depth_1k.jpg mobile/earth_depth.jpg
```

Depth in metres = (255 − value) × 8000 / 255 (checked: Wharton Basin ≈ 5.8 km, mid-Pacific ≈ 4.5 km, Ninety East
Ridge crest ≈ 1.9 km, shelves 252–254), land = 0 m, box-averaged to 2048 / 1024, then stored as
grey = √(depth / 8000 m) so the shelves keep enough 8-bit levels. Greyscale progressive JPEG q90. Land/sea agreement
with `earth_water.jpg` is 99.1 % at 0 px offset (lower at ±1 px; the rest is inland lakes, which the bathymetry lacks).
No 4K version: ocean colour varies slowly and the coastline itself comes from the water mask.

## Old clouds (2K/1K), old normal map, old water mask — three.js example textures (no longer shipped)

These were downloaded from the three.js repository at tag **r160**:
`https://github.com/mrdoob/three.js/tree/r160/examples/textures/planets`
(fetched via `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/<file>`).

The three.js repository is MIT-licensed. These planet maps are the long-standing three.js example textures
derived from NASA Visible Earth imagery (Blue Marble day mosaic, "Earth at Night" city lights). NASA imagery is
generally not subject to copyright in the US (public domain; credit "NASA" requested). The three.js repo
does not document the exact processing chain, so attribute both: *"Earth imagery: NASA Visible Earth, via the
three.js example textures (MIT)."*

| Original file (r160)        | Size        | Used as                                                       |
|-----------------------------|-------------|---------------------------------------------------------------|
| `earth_specular_2048.jpg`   | 2048×1024   | former `earth_water.jpg`; now only the inland-lake source for the NASA mask above |
| `earth_clouds_2048.png`     | 2048×1024   | former `earth_clouds.jpg` (its **alpha** channel → greyscale coverage); replaced 2026-10-17 by the cleaned NASA map above, still the grey-level reference |
| `earth_normal_2048.jpg`     | 2048×1024   | former `earth_normal.jpg` (replaced 2026-10-15 by the GEBCO normal map above) |

The Solar System Scope 4096 maps that also live in that folder (`earth_day_4096.jpg`, `earth_night_4096.jpg`,
`earth_bump_roughness_clouds_4096.jpg`, CC BY 4.0) were deliberately **not** used.

### Processing (sharp / libvips, mozjpeg)

- `desktop/` — 2048×1024: water q85 greyscale, clouds q85 greyscale (alpha extracted), (former) normal q88.
- `mobile/`  — 1024×512 (Lanczos downscale) of the same, no normal map.
- PNG → JPEG conversion keeps the 2048 cloud map at ~0.4 MB instead of 4.4 MB.

(Earlier versions also used three.js's `earth_atmos_2048.jpg` / `earth_lights_2048.png` for day/night; those are
now replaced by the NASA originals above.)
