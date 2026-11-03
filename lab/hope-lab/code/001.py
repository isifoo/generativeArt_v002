"""Hope 001: baseline = the app's current Hope (depth lit by a lamp + 35% photo, auto levels, 5 levels), reproduced at 180x320."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *

def hope_app(rgb, N=5, az=135, el=35, relief=6, pm=0.35):
    TW, TH = 180, 320
    L = lum(rgb); d = depth(rgb)
    tone = resize(L, TW, TH, Image.BOX); dm = resize(d, TW, TH, Image.BOX)
    def bl(a):  # blurInto r=1, 2 passes
        return box(box(a, 1), 1)
    hD, hL = bl(dm), bl(tone)
    az, el = np.radians(az), np.radians(el)
    lx, ly, lz = np.cos(el) * np.cos(az), -np.cos(el) * np.sin(az), np.sin(el)
    gy, gx = np.gradient(hD)
    R = relief * 20
    nx, ny, nz = -gx * R, -gy * R, np.ones_like(gx)
    l = np.sqrt(nx**2 + ny**2 + nz**2)
    lam = np.maximum(0, (nx * lx + ny * ly + nz * lz) / l)
    v = lam * (1 - pm) + hL * pm
    lo, hi = np.percentile(v, 2), np.percentile(v, 98)
    v = np.clip((v - lo) / max(0.02, hi - lo), 0, 1)
    v = resize(v, W, H)
    z = np.clip(np.floor(v * N), 0, N - 1).astype(np.int32)
    return z, v

out, res = [], []
for key in 'AB':
    clip, n = INPUTS[key]; rgb = frame(clip, n); L = lum(rgb)
    z, v = hope_app(rgb)
    res.append(stats(key, z, L, 5))
    out.append(render(None, 5, v * 5, [1, 2, 3, 4]))
save_pair('001', *out)
print(res)
