"""Hope 006: two-scale. Big masses = 003 (k-means on the rolling-guided photo); plus dark feature lines (eyes, nostrils, mouth line)
from a difference of blurs, cleaned and merged into the darkest zone."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import importlib; v3 = importlib.import_module('003')

def features(L, s1=3.0, s2=12.0, t=0.075, minpx=450):
    lo, hi = np.percentile(L, 1), np.percentile(L, 99); Ln = np.clip((L - lo) / (hi - lo), 0, 1)
    D = gauss(Ln, s1) - gauss(Ln, s2)                      # negative = darker than its surroundings
    m = gauss((D < -t).astype(np.float32), 2.0) > 0.5       # rounded, no hairs
    lab, sizes = label(m.astype(np.int32))
    keep = (sizes >= minpx) & (np.bincount(lab.ravel(), m.ravel()) > 0)
    return keep[lab] & m, D

def run(L, N=4, **kw):
    z, S, thr = v3.run(L, N)
    f, D = features(L, **kw)
    z = z.copy(); z[f] = 0
    return z, f

if __name__ == '__main__':
    out = []
    for key in 'AB':
        clip, n = INPUTS[key]; L = lum(frame(clip, n))
        z, f = run(L); print(key, 'feature px %.3f' % f.mean()); stats(key, z, L, 4); out.append(render_soft(z, 4))
    save_pair('006', *out)
