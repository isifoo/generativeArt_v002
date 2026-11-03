"""Hope 005: region-based. SLIC superpixels on the smoothed luminance (numpy), each region filled with its mean, then k-means cut into 4 tones."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import importlib; v2 = importlib.import_module('002'); v3 = importlib.import_module('003')

def slic(I, S=20, m=0.08, it=8):
    h, w = I.shape
    gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
    cy, cx = np.mgrid[S // 2:h:S, S // 2:w:S].astype(np.float32)
    nyc, nxc = cy.shape
    cy, cx = cy.ravel(), cx.ravel(); cv = I[cy.astype(int), cx.astype(int)]
    iy, ix = (gy // S).astype(int).clip(0, nyc - 1), (gx // S).astype(int).clip(0, nxc - 1)
    for _ in range(it):
        best = np.full((h, w), np.inf, np.float32); lab = np.zeros((h, w), np.int32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                k = (iy + dy).clip(0, nyc - 1) * nxc + (ix + dx).clip(0, nxc - 1)
                d = ((I - cv[k]) / m) ** 2 + ((gy - cy[k]) ** 2 + (gx - cx[k]) ** 2) / S ** 2
                upd = d < best; best[upd] = d[upd]; lab[upd] = k[upd]
        cnt = np.bincount(lab.ravel(), minlength=cy.size) + 1e-6
        cy = np.bincount(lab.ravel(), gy.ravel(), cy.size) / cnt
        cx = np.bincount(lab.ravel(), gx.ravel(), cx.size) / cnt
        cv = np.bincount(lab.ravel(), I.ravel(), cv.size) / cnt
    return lab, cv

def run(L, N=4):
    S = v2.smooth_lum(L, pre=2.0, it=2)              # lighter smoothing: the superpixels do the flattening
    Sd = resize(S, 270, 480, Image.BOX)
    lab, cv = slic(Sd)
    flat = resize(cv[lab].astype(np.float32), W, H)
    thr, _ = v3.kmeans_thr(flat, N)
    z = np.digitize(flat, thr).astype(np.int32)
    z = merge_small(z); z = smooth_zones(z, 5); z = merge_small(z)
    return z, cv[lab]

if __name__ == '__main__':
    out = []
    for key in 'AB':
        clip, n = INPUTS[key]; L = lum(frame(clip, n))
        z, f = run(L); stats(key, z, L, 4); out.append(render_soft(z, 4))
    save_pair('005', *out)
