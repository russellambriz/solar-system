# Earth textures — sources & licences

## Day + night maps (all tiers) — directly from NASA (public domain)

| File(s) | Source (exact URL) | Original |
|---|---|---|
| `desktop/earth_day_4k.jpg`, `desktop/earth_day.jpg`, `mobile/earth_day.jpg` | NASA Visible Earth — *Blue Marble Next Generation w/ Topography and Bathymetry*, December 2004: <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg> (record page: <https://visibleearth.nasa.gov/images/73909>) | 5400×2700 JPEG, 2.57 MB |
| `desktop/earth_night_4k.jpg`, `desktop/earth_night.jpg`, `mobile/earth_night.jpg` | NASA Earth Observatory — *Black Marble 2016* (VIIRS Day/Night Band), 3 km colour composite: <https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg> (record page: <https://visibleearth.nasa.gov/images/144898>) | 13500×6750 JPEG, 8.1 MB |
| (reference, not shipped) | NASA *Earth at Night 2012* (Black Marble 2012): <https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.13500x6750.jpg> | 13500×6750 JPEG — downloaded for comparison; 2016 used (newer, cleaner city cores) |

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
| `desktop/earth_clouds_4k.jpg` | NASA Visible Earth — *Blue Marble: Clouds*: <https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif> (record page: <https://visibleearth.nasa.gov/images/57747>) | 8192×4096 TIFF, 34 MB |

Processing (Python/Pillow + numpy, ImageMagick 7 encode):

- **Water**: ocean = (bathymetry < 255) at full resolution, area-averaged (box filter) to 4096×2048, so coastlines are
  exact coverage. Inland lakes (Great Lakes, Victoria, Baikal, …) are not in the bathymetry, so they are taken from the
  old three.js mask (bicubic-upsampled), only where they are > 6 px (4K) from GEBCO ocean and between 60° S and 68° N
  (this drops the old mask's false "water" on Antarctic ice shelves and the Siberian Arctic coast). Water area,
  cos-latitude weighted: 69.6 %. Alignment check against `earth_day_4k.jpg`: correlation peaks at 0 px offset.
  2K and 1K masks are box downscales of the 4K mask. Greyscale progressive JPEG q90 (4K), q88 (2K), q86 (1K).
- **Clouds**: greyscale, Lanczos 8192→4096, then a 256-step quantile map onto the old 2K cloud map's levels
  (the 2K map is the same NASA pattern, correlation 0.991 before / 0.996 after, mean 66.8 vs 67.3), so the
  shaders' `cloudCurve` and `uEarthTint` stay tuned. Greyscale progressive JPEG q80.

| File | Size | Bytes |
|---|---|---|
| `desktop/earth_water_4k.jpg`  | 4096×2048 | 523 KB |
| `desktop/earth_clouds_4k.jpg` | 4096×2048 | 1.67 MB |
| `desktop/earth_water.jpg`     | 2048×1024 | 187 KB |
| `mobile/earth_water.jpg`      | 1024×512  | 64 KB |

The 2K/1K **cloud** maps below are unchanged.

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

## Clouds (2K/1K), old normal map, old water mask — three.js example textures

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
| `earth_clouds_2048.png`     | 2048×1024   | `earth_clouds.jpg` (its **alpha** channel → greyscale coverage)|
| `earth_normal_2048.jpg`     | 2048×1024   | former `earth_normal.jpg` (replaced 2026-10-15 by the GEBCO normal map above) |

The Solar System Scope 4096 maps that also live in that folder (`earth_day_4096.jpg`, `earth_night_4096.jpg`,
`earth_bump_roughness_clouds_4096.jpg`, CC BY 4.0) were deliberately **not** used.

### Processing (sharp / libvips, mozjpeg)

- `desktop/` — 2048×1024: water q85 greyscale, clouds q85 greyscale (alpha extracted), (former) normal q88.
- `mobile/`  — 1024×512 (Lanczos downscale) of the same, no normal map.
- PNG → JPEG conversion keeps the 2048 cloud map at ~0.4 MB instead of 4.4 MB.

(Earlier versions also used three.js's `earth_atmos_2048.jpg` / `earth_lights_2048.png` for day/night; those are
now replaced by the NASA originals above.)
