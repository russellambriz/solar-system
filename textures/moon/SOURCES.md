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
- `moon_height_2k.png` (2048x1024, the desktop close-up set until 2026-10-21; now only the before/after baseline in `moon-shots/heights4k.js`): `ldem_16_uint.tif` (16 px/deg), box-resampled.
- Encoding: height above the 1737.4 km reference sphere, mapped linearly from -9.5 km .. +11.0 km to a 10-bit value
  v (0..1023), stored as the 16-bit number v * 64 split across red (high byte) and green (low byte); blue is 0.
  Decode: km = -9.5 + 20.5 * (R * 256 + G) / 65472. Lossless PNG, so the shader reads it exactly (about 20 m steps).
  Load with no mipmaps and no colour conversion.

Limb profile (2026-10-19): no new files. `moon_height_1k.png` / `moon_height_2k.png` also displace the Moon's geometry
(heights x2) in the vertex shader, and the 1K map is read once on the CPU (same decode) so surface markers sit on that ground.

Sharper terrain shadows (2026-10-21):
- `moon_height_4k.png` (4096x2048, desktop close-up set, streamed with the 4K colour and normal maps): the kit's
  `ldem_16_uint.tif` (16 px/deg, stored as half-metres above -10 km) box-resampled to 4096x2048, same 10-bit R/G encoding
  as the other height maps. About 2.7 km per texel at the equator, half the old 2K map's step. Never loaded on iPad.
