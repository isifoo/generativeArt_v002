"""Swirl modifiers for the 010/011 engraver field (used by 013+). All work on the doubled-angle
representation (cos 2a, sin 2a), so they mix line directions without sign problems."""
import math, numpy as np, lib

def maxfilter(a, r):
    o = a.copy()
    for d in range(1, r + 1):
        o = np.maximum(o, np.maximum(lib.shift(a, 0, d, -1e9), lib.shift(a, 0, -d, -1e9)))
    o2 = o.copy()
    for d in range(1, r + 1):
        o2 = np.maximum(o2, np.maximum(lib.shift(o, d, 0, -1e9), lib.shift(o, -d, 0, -1e9)))
    return o2

def feature_centres(I, s1=8.0, s2=None, nms=55, thr=0.08, max_n=30, margin=12):
    """Centres of dark blobs (eyes, nostrils, ear, beard tufts...): peaks of a blob detector
    (darkness at scale s1 minus its surroundings at scale s2), greedy non-maximum suppression."""
    # determinant of the Hessian of darkness at scale s1: large only for round dark spots, ~0 along lines
    D = 1 - lib.blur(I, s1)
    Dyy = np.gradient(np.gradient(D, axis=0), axis=0); Dxx = np.gradient(np.gradient(D, axis=1), axis=1)
    Dxy = np.gradient(np.gradient(D, axis=0), axis=1)
    B = (Dxx * Dyy - Dxy * Dxy) * (Dxx + Dyy < 0) * s1 ** 4
    thr = thr * B.max()
    B[:, :margin] = 0; B[:, lib.BORDER_X - margin:] = 0; B[:margin] = 0; B[-margin:] = 0
    pk = (B >= maxfilter(B, 3)) & (B > thr)
    ys, xs = np.nonzero(pk); v = B[ys, xs]; o = np.argsort(-v)
    out = []
    for i in o:
        x, y = xs[i], ys[i]
        if all((x - a) ** 2 + (y - b) ** 2 > nms * nms for a, b, _ in out):
            out.append((float(x), float(y), float(v[i])))
            if len(out) >= max_n: break
    vmax = out[0][2] if out else 1
    return [(x, y, v / vmax) for x, y, v in out]

def vortex(I, c2, s2, centres, strength, radius, pitch_deg, alternate=True, falloff='gauss'):
    """Add circular/spiral flow around each centre. pitch 0 = rings, > 0 = spirals.
    Weight = strength * value * exp(-r^2 / 2R^2) (or R/r for 'inv'). Alternating spin per centre."""
    h, w = c2.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    C, S = c2.copy(), s2.copy()
    for k, (cx, cy, v) in enumerate(centres):
        dx, dy = xx - cx, yy - cy; r2 = dx * dx + dy * dy
        sign = -1 if (alternate and k % 2) else 1
        a = np.arctan2(dy, dx) + math.pi / 2 - sign * math.radians(pitch_deg)
        if falloff == 'gauss': wt = strength * v * np.exp(-r2 / (2 * radius * radius))
        else: wt = strength * v * np.minimum(1.0, radius / (np.sqrt(r2) + 1e-6)) ** 1.5
        C += wt * np.cos(2 * a); S += wt * np.sin(2 * a)
    n = np.sqrt(C * C + S * S) + 1e-9
    return C / n, S / n

def twist(I, c2, s2, amount_deg, blur=18.0):
    """Rotate the field by an angle proportional to smoothed darkness: swirling bands."""
    D = 1 - lib.blur(I, blur); D = (D - D.min()) / (D.max() - D.min() + 1e-9)
    a = 0.5 * np.arctan2(s2, c2) + np.radians(amount_deg) * D
    return np.cos(2 * a), np.sin(2 * a)

def curl_noise(I, c2, s2, amount_deg, scale=90.0, seed=3, mask=None):
    """Rotate by a smooth large-scale random angle (curl-noise-like eddies). mask (0..1) limits where."""
    rng = np.random.default_rng(seed)
    n = lib.blur(rng.standard_normal(c2.shape).astype(np.float32), scale)
    n /= (np.abs(n).max() + 1e-9)
    if mask is not None: n = n * mask
    a = 0.5 * np.arctan2(s2, c2) + np.radians(amount_deg) * n
    return np.cos(2 * a), np.sin(2 * a)
