# Moon textures

- `moon_color_2k.jpg`, `moon_color_1k.jpg`: LROC WAC color mosaic (`lroc_color_poles_*`) from NASA's
  [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (NASA Scientific Visualization Studio, Ernie Wright; LRO/LROC data). Public domain (NASA).
- `moon_normal_2k.jpg`, `moon_normal_1k.jpg`: tangent-space normal maps generated from the kit's LOLA elevation map
  (`ldem_4.tif`, 4 px/deg, km) with slopes exaggerated 3x. Red = east, green = north (three.js / OpenGL convention).

Equirectangular, longitude 0 at the image center (that point faces Earth when the Moon is tidally locked).

Desktop close-up set (streamed in when the camera gets near the Moon):
- `moon_color_4k.jpg`: `lroc_color_poles_4k.tif` from the same kit.
- `moon_normal_4k.jpg`: generated from `ldem_16.tif` (16 px/deg LOLA elevation, resampled to 4096x2048), slopes exaggerated 2.5x.

2026-10-16: the normal maps' first and last columns (longitude 180°, the far side) were rebuilt by interpolating
across the wrap. They had been made with one-sided slopes, so they didn't match each other across the seam.
Nothing else in the maps changed. The maps are sampled with repeat wrapping in longitude.
