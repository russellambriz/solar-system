# Planet textures: sources & licences

Used by `planets/index.js`. `desktop/` = 2048×1024 (ring strip 2048×8), `mobile/` (touch devices / iPad) = 1024×512
(ring strip 1024×8). Equirectangular maps, Lanczos-resampled with Pillow, progressive JPEG.
Mars, Earth and the Moon are not here: they belong to the mars/, earth/ and moon/ modules.

All files were fetched through Wikimedia Commons, which mirrors the originals (solarsystemscope.com's own download
page answered with a bot-check, so it was not used directly).

| File | Source | Licence | Processing |
|---|---|---|---|
| `mercury.jpg` | [Mercury global map 2013-05-14 bright.png](https://commons.wikimedia.org/wiki/File:Mercury_global_map_2013-05-14_bright.png), MESSENGER MDIS global mosaic (NASA/JHU APL/Carnegie Institution of Washington), 3840 px rendition | Public domain (NASA) | Greyscale; the unimaged/black rows at the poles (45 rows at the north, 2 at the south of 1920) were filled with the nearest imaged row. q78 |
| `venus.jpg` | [Solarsystemscope texture 2k venus atmosphere.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_venus_atmosphere.jpg) | CC BY 4.0, Solar System Scope | Saturation ×0.55, contrast ×0.7, 25 % blend toward pale cream (238,226,196): visible-light Venus is nearly featureless yellow-white. q85/q82 |
| `jupiter.jpg` | [Jupiter Cylindrical Map - Dec 2000 PIA07782.jpg](https://commons.wikimedia.org/wiki/File:Jupiter_Cylindrical_Map_-_Dec_2000_PIA07782.jpg), Cassini (NASA/JPL/Space Science Institute), 3601×1801 | Public domain (NASA) | Resize only. The polar caps are smeared/low detail in the original. q85/q82 |
| `saturn.jpg` | [Solarsystemscope texture 2k saturn.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_saturn.jpg) | CC BY 4.0, Solar System Scope | Resize only |
| `uranus.jpg` | [Solarsystemscope texture 2k uranus.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_uranus.jpg) | CC BY 4.0, Solar System Scope | Resize only |
| `neptune.jpg` | [Solarsystemscope texture 2k neptune.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_neptune.jpg) | CC BY 4.0, Solar System Scope | Resize only |
| `saturn_ring.png` | [Solarsystemscope texture 2k saturn ring alpha.png](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_saturn_ring_alpha.png) (2048×125 RGBA) | CC BY 4.0, Solar System Scope | Rows 40–84 averaged into one radial profile, stored as an 8 px tall RGBA strip |

Saturn ring strip calibration (used for the ring radii in `planets/index.js`): left edge ≈ 1.17 Rs, right edge ≈ 2.35 Rs,
from matching the strip's B-ring inner edge (px ~630 → 1.53 Rs), Cassini Division (px ~1400 → 1.98 Rs) and
A-ring outer edge (px ~1910 → 2.27 Rs) to their real radii.

| Set | Total |
|---|---|
| desktop | ≈ 1.07 MB (Mercury 563 KB, Jupiter 251 KB, Saturn 110 KB, Venus 68 KB, Neptune 57 KB, Uranus 27 KB, ring 4 KB) |
| mobile | ≈ 0.29 MB (Mercury 139 KB, Jupiter 72 KB, Saturn 28 KB, Venus 20 KB, Neptune 15 KB, Uranus 8 KB, ring 2 KB) |

Uranus' rings keep main.js' procedural strip (no real map needed at this size).
