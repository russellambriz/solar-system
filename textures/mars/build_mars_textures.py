# Builds textures/mars/{desktop,mobile}/ from USGS Viking MDIM2.1 colour mosaic + MGS MOLA MEGDR 16 px/deg.
# Run from a folder holding the two source files (see SOURCES.md for download links):
#   clr1km_a.jpg  = Mars_Viking_MDIM21_ClrMosaic_1km.jpg   mola16.img = megt90n000eb.img
# Needs Python 3 + numpy + Pillow.
import numpy as np, os
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
OUT = os.path.dirname(os.path.abspath(__file__)) + '/'
R = 3396190.0

im = Image.open('clr1km_a.jpg'); im.draft('RGB', (im.width // 4, im.height // 4)); im = im.convert('RGB')
def grade(img):
    a = np.asarray(img).astype(np.float32) / 255
    lin = a ** 2.2 * np.array([1.0, 0.80, 0.54], np.float32)
    L = (lin * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1, keepdims=True)
    lin = np.clip((L + (lin - L) * 1.25) * 1.08, 0, 1)
    return Image.fromarray((lin ** (1 / 2.2) * 255).round().astype(np.uint8))

h = np.fromfile('mola16.img', dtype='>i2').reshape(2880, 5760).astype(np.float32)
h = np.roll(h, 2880, axis=1)            # 0..360E  ->  -180..180E (lon 0 at the image centre, like the Viking map)
hi = Image.fromarray(h, mode='F')

def normal(W, H, exag):
    z = np.asarray(hi.resize((W, H), Image.BOX), np.float32)
    lat = (0.5 - (np.arange(H) + 0.5) / H) * np.pi
    dx = 2 * np.pi * R * np.maximum(np.cos(lat), 0.02) / W
    dy = np.pi * R / H
    zp = np.pad(z, ((1, 1), (0, 0)), mode='edge')
    dzdx = (np.roll(z, -1, 1) - np.roll(z, 1, 1)) / (2 * dx[:, None])     # east
    dzdy = (zp[:-2] - zp[2:]) / (2 * dy)                                   # north (row 0 = north)
    n = np.stack([-exag * dzdx, -exag * dzdy, np.ones_like(z)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8))

for name, W, q, ex in (('desktop', 2048, 88, 10.0), ('mobile', 1024, 85, 8.0)):
    grade(im.resize((W, W // 2), Image.LANCZOS)).save(f'{OUT}{name}/mars_color.jpg', quality=q, optimize=True, progressive=True)
    normal(W, W // 2, ex).save(f'{OUT}{name}/mars_normal.jpg', quality=q, optimize=True)
print('ok')
