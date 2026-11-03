"""Hope 002: edge-preserving posterize of the photo itself (rolling guided filter), fixed even thresholds, small regions merged, contours smoothed."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *

def smooth_lum(L, pre=3.0, r=14, eps=0.004, it=4):
    s = gauss(L, pre)                 # kills the engraving hatch (period ~5-8 px)
    g = s
    for _ in range(it):               # rolling guidance: each pass guided by the previous result
        g = guided(g, s, r, eps)
    return g

def posterize(S, thr):
    return np.digitize(S, thr).astype(np.int32)

def run(L, N=4):
    S = smooth_lum(L)
    lo, hi = np.percentile(S, 1), np.percentile(S, 99)
    S = np.clip((S - lo) / (hi - lo), 0, 1)
    thr = [(k + 1) / N for k in range(N - 1)]
    z = posterize(S, thr)
    z = merge_small(z)
    z = smooth_zones(z, 4)
    z = merge_small(z)
    return z, S

if __name__ == '__main__':
    out, res = [], []
    for key in 'AB':
        clip, n = INPUTS[key]; L = lum(frame(clip, n))
        z, S = run(L)
        res.append(stats(key, z, L, 4)); out.append(render_soft(z, 4))
    save_pair('002', *out)
