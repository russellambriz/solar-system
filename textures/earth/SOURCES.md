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

## Water mask, clouds, normal map — three.js example textures (unchanged)

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
| `earth_specular_2048.jpg`   | 2048×1024   | `earth_water.jpg` (greyscale water mask; white = ocean)       |
| `earth_clouds_2048.png`     | 2048×1024   | `earth_clouds.jpg` (its **alpha** channel → greyscale coverage)|
| `earth_normal_2048.jpg`     | 2048×1024   | `earth_normal.jpg` (tangent-space normal map, desktop only)   |

The Solar System Scope 4096 maps that also live in that folder (`earth_day_4096.jpg`, `earth_night_4096.jpg`,
`earth_bump_roughness_clouds_4096.jpg`, CC BY 4.0) were deliberately **not** used.

### Processing (sharp / libvips, mozjpeg)

- `desktop/` — 2048×1024: water q85 greyscale, clouds q85 greyscale (alpha extracted), normal q88.
- `mobile/`  — 1024×512 (Lanczos downscale) of the same, no normal map.
- PNG → JPEG conversion keeps the 2048 cloud map at ~0.4 MB instead of 4.4 MB.

(Earlier versions also used three.js's `earth_atmos_2048.jpg` / `earth_lights_2048.png` for day/night; those are
now replaced by the NASA originals above.)
