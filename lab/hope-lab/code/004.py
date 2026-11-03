"""Hope 004: relighting done better. Depth -> photo-guided smoothing -> normals; light direction and relief fitted to the smoothed photo
(least squares S ~ c0 + c.n); shading blended with the 003 photo map, weighted by how well the lamp explains the photo (R^2)."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import importlib; v2 = importlib.import_module('002'); v3 = importlib.import_module('003')

def normals(D, R):
    gy, gx = np.gradient(D)
    n = np.stack([-gx * R, -gy * R, np.ones_like(gx)])
    return n / np.sqrt((n ** 2).sum(0))

def fit_light(D, S):
    best = None
    t = gauss(S, 6).ravel()
    for R in [50, 100, 200, 400, 800, 1600]:
        n = normals(D, R)
        A = np.stack([np.ones(t.size), *[c.ravel() for c in n]], 1)[::7]
        c, *_ = np.linalg.lstsq(A, t[::7], rcond=None)
        pred = A @ c; r2 = 1 - np.var(t[::7] - pred) / np.var(t[::7])
        if best is None or r2 > best[0]: best = (r2, R, c)
    r2, R, c = best
    l = c[1:] / np.linalg.norm(c[1:])
    return r2, R, l

def run(rgb, N=4):
    L = lum(rgb); S = v2.smooth_lum(L)
    D = depth(rgb)
    D = gauss(D, 2)
    for _ in range(3): D = guided(S, D, 16, 1e-3)        # depth edges snapped to the photo edges
    r2, R, l = fit_light(D, S)
    sh = np.clip((normals(D, R) * l[:, None, None]).sum(0), 0, 1)
    sh = gauss(sh, 3)
    nz = lambda a: (a - np.percentile(a, 1)) / (np.percentile(a, 99) - np.percentile(a, 1))
    w = float(np.clip(r2, 0, 0.6))                        # lamp weight = how much of the photo it explains
    v = np.clip((1 - w) * nz(S) + w * nz(sh), 0, 1)
    thr, _ = v3.kmeans_thr(v, N)
    z = np.digitize(v, thr).astype(np.int32)
    z = merge_small(z); z = smooth_zones(z, 4); z = merge_small(z)
    return z, (r2, R, l, w)

if __name__ == '__main__':
    out = []
    for key in 'AB':
        clip, n = INPUTS[key]; rgb = frame(clip, n)
        z, info = run(rgb)
        az = np.degrees(np.arctan2(-info[2][1], info[2][0])); el = np.degrees(np.arcsin(np.clip(info[2][2], -1, 1)))
        print(key, 'r2=%.2f R=%d az=%.0f el=%.0f w=%.2f' % (info[0], info[1], az, el, info[3]))
        stats(key, z, lum(rgb), 4); out.append(render_soft(z, 4))
    save_pair('004', *out)
