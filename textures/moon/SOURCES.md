# Moon textures

- `moon_color_2k.jpg`, `moon_color_1k.jpg`: LROC WAC color mosaic (`lroc_color_poles_*`) from NASA's
  [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (NASA Scientific Visualization Studio, Ernie Wright; LRO/LROC data). Public domain (NASA).
- `moon_normal_2k.jpg`, `moon_normal_1k.jpg`: tangent-space normal maps generated from the kit's LOLA elevation map
  (`ldem_4.tif`, 4 px/deg, km) with slopes exaggerated 3x. Red = east, green = north (three.js / OpenGL convention).

Equirectangular, longitude 0 at the image center (that point faces Earth when the Moon is tidally locked).
