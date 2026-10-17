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

Terrain shadows (2026-10-17):
- `moon_height_1k.png` (1024x512, all devices): the kit's LOLA elevation map `ldem_4_uint.tif` (4 px/deg), box-resampled.
- `moon_height_2k.png` (2048x1024, desktop close-up set): `ldem_16_uint.tif` (16 px/deg), box-resampled.
- Encoding: height above the 1737.4 km reference sphere, mapped linearly from -9.5 km .. +11.0 km to a 10-bit value
  v (0..1023), stored as the 16-bit number v * 64 split across red (high byte) and green (low byte); blue is 0.
  Decode: km = -9.5 + 20.5 * (R * 256 + G) / 65472. Lossless PNG, so the shader reads it exactly (about 20 m steps).
  Load with no mipmaps and no colour conversion.
