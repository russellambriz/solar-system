# Mars textures — sources & licences

Both source datasets are US government (NASA / USGS) products in the **public domain**. Credit requested:
*"Mars imagery: NASA/JPL/USGS Viking MDIM 2.1 colour mosaic; topography: NASA/GSFC MGS MOLA."*

| Source | What | Licence |
|---|---|---|
| [USGS Astrogeology: Mars Viking Colorized Global Mosaic 232m](https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m), ancillary file `Mars_Viking_MDIM21_ClrMosaic_1km.jpg` (21339×10670) | colour map | Public domain ("Access Constraints: Public domain; Use Constraints: None") |
| [PDS Geosciences: MGS MOLA MEGDR, 16 px/deg topography](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/) `megt90n000eb.img` (5760×2880, 16-bit MSB, metres) | normal map | Public domain (NASA PDS) |

## Processing (`build_mars_textures.py`, numpy + Pillow)

- **Colour** (`mars_color.jpg`): downscaled with Lanczos to 2048×1024 (desktop) / 1024×512 (mobile), then
  warm-graded in linear light (×1.00 / 0.80 / 0.54 RGB, +25% saturation, +8% exposure) because the Viking
  colorization reads purple-grey next to how Mars looks to the eye. Equirectangular, planetocentric, longitude
  −180…+180 °E, so **0° longitude is at the image centre** (same convention as the Moon maps).
- **Normal map** (`mars_normal.jpg`): MOLA topography rolled by 180° to the same longitude convention,
  box-filtered to the target size, slopes from central differences on the real ellipsoid spacing
  (R = 3396.19 km), exaggerated 10× (desktop) / 8× (mobile). Tangent space: red = east, green = north.
- Polar caps are **not** baked in: they are drawn by the shader (seasonal extent) on top of this map.
- The Viking mosaic shows seasonal frost in Hellas basin (bright patch, ~45°S 70°E); it is real data and was kept.

| Set      | Files                                  | Total    |
|----------|----------------------------------------|----------|
| desktop  | colour 558 KB (q88), normal 480 KB (q88) | ≈ 1.0 MB |
| mobile   | colour 119 KB (q85), normal 72 KB (q85)  | ≈ 0.19 MB |
