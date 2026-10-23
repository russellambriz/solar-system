#!/usr/bin/env python3
"""Sea-floor depth maps for the ocean colour (earth/earthMaterial.js, uOceanColor) from NASA Blue Marble Next
Generation: Bathymetry (GEBCO_08), gebco_08_rev_bath_21600x10800.png (see ../SOURCES.md).

usage: python3 make_depth.py gebco_08_rev_bath_21600x10800.png OUTDIR
writes OUTDIR/earth_depth.jpg (2048x1024 -> desktop/) and OUTDIR/earth_depth_1k.jpg (1024x512 -> mobile/earth_depth.jpg)

Source: 8-bit palette PNG, 255 = land, 0 = 8000 m or deeper, linear in between (~31.4 m per level; checked against
known depths: Wharton Basin ~5.8 km, mid-Pacific ~4.5 km, Ninety East Ridge crest ~1.9 km, shelves 252-254).
Encoding: grey = sqrt(depth / 8000 m), land / lakes = 0, so the shelves (0-200 m -> 0..0.16) keep enough levels
in 8 bits. Depth is area-averaged in metres (box filter, land = 0 m) before the square root, so coastal pixels read
shallow and the map lines up with the water mask (same plate carree, -180 deg at the left edge, north up).
Greyscale progressive JPEG q90. Pillow + numpy only (~2 GB RAM).
"""
import sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
DMAX = 8000.0


def main(src, out):
    im = Image.open(src)
    v = np.asarray(im if im.mode == 'L' else im.convert('L'))   # palette is a grey ramp (index = value)
    depth = ((255.0 - v.astype(np.float32)) * (DMAX / 255.0))   # metres, land (255) -> 0
    del v
    f = Image.fromarray(depth, mode='F')
    del depth
    for w, name in [(2048, 'earth_depth.jpg'), (1024, 'earth_depth_1k.jpg')]:
        d = np.asarray(f.resize((w, w // 2), Image.BOX), dtype=np.float32)
        g = np.sqrt(np.clip(d / DMAX, 0.0, 1.0)) * 255.0
        Image.fromarray(np.round(g).astype(np.uint8), mode='L').save(f'{out}/{name}', quality=90, optimize=True, progressive=True)
        print(name, w, 'mean grey', round(float(g.mean()), 2))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
