"""Hope 003: as 002, but the 3 thresholds come from the image: 1D k-means (Lloyd) on the smoothed luminance histogram."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import importlib; v2 = importlib.import_module('002')

def kmeans_thr(S, N, it=50):
    h, e = np.histogram(S, 256, (0, 1)); c = (e[:-1] + e[1:]) / 2
    m = np.quantile(S, (np.arange(N) + 0.5) / N)
    for _ in range(it):
        t = (m[:-1] + m[1:]) / 2
        k = np.digitize(c, t)
        m = np.array([np.average(c[k == j], weights=h[k == j] + 1e-9) if h[k == j].sum() > 0 else m[j] for j in range(N)])
    return (m[:-1] + m[1:]) / 2, m

def run(L, N=4):
    S = v2.smooth_lum(L)
    thr, m = kmeans_thr(S, N)
    z = np.digitize(S, thr).astype(np.int32)
    z = merge_small(z); z = smooth_zones(z, 4); z = merge_small(z)
    return z, S, thr

if __name__ == '__main__':
    out = []
    for key in 'AB':
        clip, n = INPUTS[key]; L = lum(frame(clip, n))
        z, S, thr = run(L)
        print(key, np.round(thr, 3)); stats(key, z, L, 4); out.append(render_soft(z, 4))
    save_pair('003', *out)
