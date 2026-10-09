# Earth textures — sources & licences

All maps were downloaded from the three.js repository at tag **r160**:
`https://github.com/mrdoob/three.js/tree/r160/examples/textures/planets`
(fetched via `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/<file>`).

The three.js repository is MIT-licensed. These planet maps are the long-standing three.js example textures
derived from NASA Visible Earth imagery (Blue Marble day mosaic, "Earth at Night" city lights). NASA imagery is
generally not subject to copyright in the US (public domain; credit "NASA" requested). The three.js repo
does not document the exact processing chain, so attribute both: *"Earth imagery: NASA Visible Earth, via the
three.js example textures (MIT)."*

| Original file (r160)        | Size        | Used as                                                       |
|-----------------------------|-------------|---------------------------------------------------------------|
| `earth_atmos_2048.jpg`      | 2048×1024   | `earth_day.jpg` (day colour, sRGB)                            |
| `earth_lights_2048.png`     | 2048×1024   | `earth_night.jpg` (city lights, sRGB)                         |
| `earth_specular_2048.jpg`   | 2048×1024   | `earth_water.jpg` (greyscale water mask; white = ocean)       |
| `earth_clouds_2048.png`     | 2048×1024   | `earth_clouds.jpg` (its **alpha** channel → greyscale coverage)|
| `earth_normal_2048.jpg`     | 2048×1024   | `earth_normal.jpg` (tangent-space normal map, desktop only)   |

The Solar System Scope 4096 maps that also live in that folder (`earth_day_4096.jpg`, `earth_night_4096.jpg`,
`earth_bump_roughness_clouds_4096.jpg`, CC BY 4.0) were deliberately **not** used.

## Processing (sharp / libvips, mozjpeg)

- `desktop/` — 2048×1024: day q88, night q85, water q85 greyscale, clouds q85 greyscale (alpha extracted), normal q88.
- `mobile/`  — 1024×512 (Lanczos downscale) of the same, no normal map.
- PNG → JPEG conversion keeps the 2048 cloud map at ~0.4 MB instead of 4.4 MB.

| Set      | Files                                               | Total   |
|----------|-----------------------------------------------------|---------|
| desktop  | day 288 KB, night 138 KB, water 161 KB, clouds 418 KB, normal 218 KB | ≈ 1.2 MB |
| mobile   | day 74 KB, night 35 KB, water 53 KB, clouds 120 KB  | ≈ 0.28 MB |

Mean linear day colour (cos-latitude weighted, 64×32 downsample of `earth_atmos_2048.jpg`):
`(0.1014, 0.1014, 0.1165)` — used for `uEarthTint` in `earth/index.js`.
