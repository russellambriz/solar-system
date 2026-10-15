#!/usr/bin/env python3
"""Earth land-relief normal maps from NASA GEBCO_08 topography (see ../SOURCES.md).

usage: python3 make_normal.py gebco_08_rev_elev_21600x10800.png OUTDIR   (Pillow + numpy; ~3 GB RAM)
writes OUTDIR/n4096.png and OUTDIR/n2048.png (encode with ImageMagick, see SOURCES.md)

Tangent space matches earth/earthMaterial.js: R = east (T), G = north (B = cross(N, T)), B = up (OpenGL / +Y).
"""
import sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
R_EARTH = 6371000.0
METRES_PER_LEVEL = 6400.0 / 255.0     # GEBCO_08 elevation PNG: 0 = sea level, 255 = 6400 m (Everest clips)
EXAGGERATION = 20.0                   # vertical exaggeration baked in (shader uNormalStrength multiplies on top)


def normals(h, k=EXAGGERATION):
    H, W = h.shape
    lat = np.radians(90.0 - (np.arange(H) + 0.5) * 180.0 / H)      # row centres, north pole at row 0
    c = np.cos(lat)
    # Anti-pinch: towards the poles a pixel spans only cos(lat) of its equatorial width in longitude, so low-pass
    # each row (circular FFT: the +-180 deg seam wraps) with sigma ~ 0.5 (1/cos - 1) px -> isotropic ground resolution.
    sig = 0.5 * (1.0 / np.maximum(c, 1e-4) - 1.0)
    f = np.fft.rfftfreq(W)
    tf = np.exp(-2.0 * np.pi ** 2 * sig[:, None] ** 2 * f[None, :] ** 2)
    hs = np.fft.irfft(np.fft.rfft(h.astype(np.float64), axis=1) * tf, n=W, axis=1)
    dx = 2 * np.pi * R_EARTH / W                                    # metres per px along the equator
    dy = np.pi * R_EARTH / H
    gx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) / (2 * dx * np.maximum(c, 0.02)[:, None])  # dh/d(east), wraps
    up = np.vstack([hs[:1], hs[:-1]])
    dn = np.vstack([hs[1:], hs[-1:]])
    gy = (up - dn) / (2 * dy)                                        # dh/d(north)
    n = np.dstack([-k * gx, -k * gy, np.ones_like(hs)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


if __name__ == '__main__':
    src, outdir = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('F')
    for W in (4096, 2048):
        h = np.asarray(im.resize((W, W // 2), Image.BOX), dtype=np.float32) * METRES_PER_LEVEL   # area average
        n = normals(h)
        rgb = np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
        Image.fromarray(rgb, 'RGB').save(f'{outdir}/n{W}.png')
        print(W, 'done')
