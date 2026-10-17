#!/usr/bin/env python3
"""Earth cloud maps (4K / 2K / 1K) from NASA Blue Marble cloud_combined_8192.tif, with the mosaic's swath
artifacts cleaned (see ../SOURCES.md).

usage: python3 clean_clouds.py cloud_combined_8192.tif REF_LEVELS.jpg OUTDIR
  REF_LEVELS.jpg = the pre-2026-10-17 2K cloud map (git show 8e4ba46:textures/earth/desktop/earth_clouds.jpg),
                   whose grey levels the shaders' cloudCurve / uEarthTint are tuned against.
writes OUTDIR/earth_clouds_4k.jpg (4096x2048), OUTDIR/earth_clouds_2k.jpg (2048x1024),
       OUTDIR/earth_clouds_1k.jpg (1024x512)   -> copy to desktop/earth_clouds_4k.jpg, desktop/earth_clouds.jpg,
                                                 mobile/earth_clouds.jpg
Pillow + numpy only (~2 GB RAM).

Steps (all at the source's 8192x4096, plate carree, -180 deg at the left edge, north up):
 1. Dateline seam. The NASA mosaic's left and right edges come from different passes, so at lon +-180 the cloud
    field jumps (2-4x the normal column-to-column difference between 30 N and 50 S). The jump excess
    D(y) = (a[y,0] - a[y,W-1]) - (mean slope of the two neighbouring column pairs) is removed with a harmonic
    (Laplace-like) correction: each vertical frequency ky of D decays away from the seam as exp(-d / L), with
    L = LK/|ky| clamped to [LMIN, LMAX] px (LK = 1 is exactly harmonic; 3 keeps the blend wider than a 1K pixel),
    half on each side. Large-scale offsets spread wide (up to ~LMAX px), fine-scale mismatch only a few px, so no
    smear and no visible band; the edges then wrap continuously.
 2. Vertical-stripe check (no filtering needed for this source). stripe_anisotropy() compares, at equal |k|,
    the 2D power of N-S stripes with the diagonal directions. For cloud_combined_8192 it is 0.6-1.2 at every
    scale (30 N - 50 S), i.e. no periodic swath striping, so no frequency-domain notch is applied (a notch would
    only remove real cloud texture). The finer diagonal swath-gap edges of the mosaic are left as they are.
 3. Lanczos downscale (float, longitude wrap-padded so the seam stays continuous) to 4096 / 2048 / 1024, then a
    256-step quantile map onto REF_LEVELS, so cloud density/brightness is unchanged for the shaders, and the three
    tiers are the same pattern (seamless 2K -> 4K swap).
 4. Greyscale progressive JPEG.
"""
import sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
LMIN, LMAX, LK = 8.0, 256.0, 3.0   # seam correction decay lengths (px at 8192 wide): L = LK/|ky| clamped to [LMIN, LMAX]
OUT = [(4096, 'earth_clouds_4k.jpg', 80), (2048, 'earth_clouds_2k.jpg', 80), (1024, 'earth_clouds_1k.jpg', 80)]


def fix_seam(a):
    H, W = a.shape
    J = a[:, 0] - a[:, -1]
    E = 0.5 * ((a[:, 1] - a[:, 0]) + (a[:, -1] - a[:, -2]))      # natural slope continued across the seam
    D = J - E
    Dm = np.concatenate([D, D[::-1]])                              # even extension: the poles are not periodic
    ky = 2 * np.pi * np.abs(np.fft.fftfreq(2 * H))
    Lk = np.clip(LK / np.maximum(ky, 1e-12), LMIN, LMAX)        # decay length per vertical frequency (px)
    Dh = np.fft.fft(Dm)
    nside = int(6 * LMAX)
    out = a.copy()
    for i in range(nside):
        dist = i + 0.5                                             # px from the seam line
        decay = np.exp(-dist / Lk)
        c = 0.5 * np.real(np.fft.ifft(Dh * decay))[:H]
        out[:, i] -= c                                             # left edge pulled down by D/2 ...
        out[:, W - 1 - i] += c                                     # ... right edge up by D/2 -> continuous
    return out


def stripe_anisotropy(a, lat_band=(30.0, -50.0)):
    """Vertical-stripe check: in square Hann tiles, mean 2D power in the near-horizontal-frequency wedge
    (|angle| < 4 deg, i.e. N-S stripes) over the diagonal wedge (30-60 deg) at the same |k|, per octave ring.
    ~1 or below = no stripe excess (clouds are zonally elongated, so the opposite wedge is the strong one)."""
    H, W = a.shape
    T = H // 8
    win = np.outer(np.hanning(T), np.hanning(T))
    f = np.fft.fftfreq(T) * T
    KX, KY = np.meshgrid(f, f)
    R = np.hypot(KX, KY)
    ang = np.degrees(np.arctan2(np.abs(KY), np.abs(KX)))
    r0, r1 = int((90 - lat_band[0]) / 180 * H), int((90 - lat_band[1]) / 180 * H)
    P, n = 0.0, 0
    for y in range(r0, r1 - T + 1, T // 2):
        for x in range(0, W, T // 2):
            t = np.roll(a, -x, 1)[y:y + T, :T]
            P = P + np.abs(np.fft.fft2((t - t.mean()) * win)) ** 2
            n += 1
    P /= n
    out = []
    lo = 4
    while lo * 2 <= T // 2:
        ring = (R >= lo) & (R < lo * 2)
        out.append(round(float(P[ring & (ang < 4)].mean() / P[ring & (ang > 30) & (ang < 60)].mean()), 2))
        lo *= 2
    return out


def resize(a, w):
    H, W = a.shape
    pad = 64 * W // w if W > w else 0                              # wrap-pad longitude so Lanczos sees across +-180
    p = np.concatenate([a[:, W - pad:], a, a[:, :pad]], axis=1) if pad else a
    r = np.asarray(Image.fromarray(p.astype(np.float32), 'F').resize((w + 128 if pad else w, w // 2), Image.LANCZOS))
    return r[:, 64:64 + w] if pad else r


def level_match(a, ref):
    q = np.linspace(0, 100, 257)
    return np.interp(a, np.percentile(a, q), np.percentile(ref, q))


def seam_ratio(a):
    s = np.abs(a[:, 0] - a[:, -1])
    n = 0.5 * (np.abs(a[:, 1] - a[:, 0]) + np.abs(a[:, -1] - a[:, -2]))
    H = a.shape[0]
    b = slice(int(H * 0.33), int(H * 0.78))       # 30 N .. 50 S, where the jump is
    return float(s.mean() / n.mean()), float(s[b].mean() / n[b].mean())


if __name__ == '__main__':
    src, refp, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    a = np.asarray(Image.open(src).convert('L')).astype(np.float64)
    ref = np.asarray(Image.open(refp).convert('L')).astype(np.float64)
    print('source', a.shape, 'seam/neighbour |diff| (all, 30N-50S): %.2f %.2f' % seam_ratio(a))
    a = fix_seam(a)
    print('after seam fix                 : %.2f %.2f' % seam_ratio(a))
    print('N-S stripe / diagonal power per octave (30N-50S, 4K-equivalent tiles):', stripe_anisotropy(resize(a, 4096)))
    for w, name, q in OUT:
        r = np.clip(np.rint(level_match(resize(a, w), ref)), 0, 255).astype(np.uint8)
        Image.fromarray(r, 'L').save(f'{outdir}/{name}', quality=q, progressive=True, optimize=True)
        print(name, r.shape, 'mean %.2f (ref %.2f)' % (r.mean(), ref.mean()), 'seam/neighbour %.2f %.2f' % seam_ratio(r.astype(float)),
              'stripe/diag', stripe_anisotropy(r.astype(float)))
