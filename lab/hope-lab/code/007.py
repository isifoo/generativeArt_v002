"""Hope 007: temporal stability of 006. Raw (each frame alone) vs stabilised: EMA of the smoothed luminance, EMA of the k-means cuts,
hysteresis on the zone cuts and on the feature mask."""
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import importlib; v2 = importlib.import_module('002'); v3 = importlib.import_module('003'); v6 = importlib.import_module('006')

def post(z):
    z = merge_small(z); z = smooth_zones(z, 4); return merge_small(z)

def feat_mask(D, prev, t=0.075, h=0.02, minpx=450):
    m = D < -t
    if prev is not None: m |= prev & (D < -t + h)           # hysteresis: once on, stays on until clearly gone
    raw = m
    m = gauss(m.astype(np.float32), 2.0) > 0.5
    lab, sizes = label(m.astype(np.int32))
    keep = (sizes >= minpx) & (np.bincount(lab.ravel(), m.ravel()) > 0)
    return keep[lab] & m, raw

def dog(L):
    lo, hi = np.percentile(L, 1), np.percentile(L, 99); Ln = np.clip((L - lo) / (hi - lo), 0, 1)
    return gauss(Ln, 3.0) - gauss(Ln, 12.0)

class Stab:
    def __init__(s, N=4, a=0.35, ta=0.15, h=0.025):
        s.N, s.a, s.ta, s.h = N, a, ta, h; s.S = s.D = s.thr = s.zp = s.fp = None
    def step(s, L):
        S, D = v2.smooth_lum(L), dog(L)
        s.S = S if s.S is None else s.S + (S - s.S) * s.a
        s.D = D if s.D is None else s.D + (D - s.D) * s.a
        thr, _ = v3.kmeans_thr(s.S, s.N)
        s.thr = thr if s.thr is None else s.thr + (thr - s.thr) * s.ta
        z = np.digitize(s.S, s.thr).astype(np.int32)
        if s.zp is not None:
            t = np.concatenate(([-9], s.thr, [9]))
            keep = (s.S >= t[s.zp] - s.h) & (s.S < t[s.zp + 1] + s.h)
            z[keep] = s.zp[keep]
        s.zp = z
        f, s.fp = feat_mask(s.D, s.fp)
        out = post(z); out[f] = 0
        return out

def raw(L):
    return v6.run(L)[0]

if __name__ == '__main__':
    R = {}; keep = {}
    for clip, nf, pin in [('franklin', 30, 6), ('portrait', 30, 16), ('scene', 20, None)]:
        st = Stab(); zr, zs = [], []
        for i in range(1, nf + 1):
            L = lum(frame(clip, i)); zr.append(raw(L)); zs.append(st.step(L))
            if i == pin: keep[clip] = (zs[-1], L)
        R[clip] = (flicker(zr), flicker(zs)); print(clip, 'flicker raw %.4f stab %.4f' % R[clip])
    out = []
    for clip in ['franklin', 'portrait']:
        z, L = keep[clip]; stats(clip, z, L, 4); out.append(render_soft(z, 4))
    save_pair('007', *out)
    json.dump(R, open(os.path.join(LAB, 'code', '007_flicker.json'), 'w'))
