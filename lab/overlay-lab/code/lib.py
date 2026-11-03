"""Shared helpers for the overlay lab. numpy + Pillow only."""
import json, os, sys, math
import numpy as np
from PIL import Image, ImageDraw

LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 954, 1666
BORDER_X = 941  # columns >= this are a black camera border in the input; treated as paper

def load_input():
    a = np.asarray(Image.open(os.path.join(LAB, 'img/000-input.png')).convert('L')).astype(np.float32) / 255.0
    a = a.copy(); a[:, BORDER_X:] = 1.0
    return a  # 1 = white paper, 0 = ink

def load_marks():
    return np.asarray(Image.open(os.path.join(LAB, 'img/000-marks-only.png')).convert('L')) < 128

# ---------- filtering ----------
def gauss_kernel(s):
    r = max(1, int(3 * s + 0.5)); x = np.arange(-r, r + 1, dtype=np.float32)
    k = np.exp(-x * x / (2 * s * s)); return k / k.sum()

def blur(a, s):
    if s <= 0: return a.copy()
    k = gauss_kernel(s); r = len(k) // 2
    p = np.pad(a, ((0, 0), (r, r)), mode='reflect'); o = np.zeros_like(a)
    for i, w in enumerate(k): o += w * p[:, i:i + a.shape[1]]
    p = np.pad(o, ((r, r), (0, 0)), mode='reflect'); o2 = np.zeros_like(a)
    for i, w in enumerate(k): o2 += w * p[i:i + a.shape[0], :]
    return o2

def sobel(a):
    p = np.pad(a, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:] - p[:-2, :-2] - 2 * p[1:-1, :-2] - p[2:, :-2]) / 8
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:] - p[:-2, :-2] - 2 * p[:-2, 1:-1] - p[:-2, 2:]) / 8
    return gx, gy

def etf(img, pre=2.0, sig=8.0):
    """Edge tangent flow from the smoothed structure tensor.
    Returns tx, ty (unit tangent = direction of least change) and coherence in [0,1]."""
    g = blur(img, pre); gx, gy = sobel(g)
    E = blur(gx * gx, sig); F = blur(gx * gy, sig); G = blur(gy * gy, sig)
    d = np.sqrt((E - G) ** 2 + 4 * F * F)
    l1 = (E + G + d) / 2; l2 = (E + G - d) / 2
    # eigenvector of minor eigenvalue (tangent): (l2 - G, F)  or (F, l2 - E)
    tx = F; ty = l2 - E
    alt = np.abs(tx) + np.abs(ty) < 1e-9
    tx = np.where(alt, l2 - G, tx); ty = np.where(alt, F, ty)
    n = np.sqrt(tx * tx + ty * ty) + 1e-12
    tx /= n; ty /= n
    alt2 = n < 1e-9
    tx = np.where(alt2, 1.0, tx); ty = np.where(alt2, 0.0, ty)
    coh = (l1 - l2) / (l1 + l2 + 1e-9)
    return tx.astype(np.float32), ty.astype(np.float32), coh.astype(np.float32), (l1 + l2).astype(np.float32)

def bilinear(a, x, y):
    h, w = a.shape
    x = np.clip(x, 0, w - 1.001); y = np.clip(y, 0, h - 1.001)
    x0 = x.astype(np.int32); y0 = y.astype(np.int32); fx = x - x0; fy = y - y0
    return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy)
            + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy)

def nearest(a, x, y):
    h, w = a.shape
    xi = np.clip(np.rint(x).astype(np.int32), 0, w - 1); yi = np.clip(np.rint(y).astype(np.int32), 0, h - 1)
    return a[yi, xi]

# ---------- morphology ----------
def disk_offsets(r):
    return [(dy, dx) for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dx * dx + dy * dy <= r * r + 0.5]

def shift(a, dy, dx, fill=False):
    o = np.full_like(a, fill); h, w = a.shape
    o[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = a[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return o

def dilate(m, r):
    o = m.copy()
    for dy, dx in disk_offsets(r): o |= shift(m, dy, dx)
    return o

def erode(m, r):
    o = m.copy()
    for dy, dx in disk_offsets(r): o &= shift(m, dy, dx, True)
    return o

def label(m):
    """8-connected component labeling via run-length union-find. Returns labels (0 = bg), sizes array."""
    h, w = m.shape
    mi = m.astype(np.int8)
    d = np.diff(np.pad(mi, ((0, 0), (1, 1))), axis=1)
    rs, cs = np.nonzero(d == 1); re_, ce = np.nonzero(d == -1)
    # runs: row, start, end(exclusive); ordered by row then start
    n = len(rs)
    parent = list(range(n))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    row_starts = np.searchsorted(rs, np.arange(h + 1))
    rsl = rs.tolist(); csl = cs.tolist(); cel = ce.tolist()
    rowst = row_starts.tolist()
    for r in range(1, h):
        a0, a1 = rowst[r - 1], rowst[r]; b0, b1 = rowst[r], rowst[r + 1]
        i, j = a0, b0
        while i < a1 and j < b1:
            # 8-connectivity: overlap if prev.start <= cur.end and cur.start <= prev.end (exclusive ends +1 slack)
            if csl[i] <= cel[j] and csl[j] <= cel[i]:
                ri, rj = find(i), find(j)
                if ri != rj: parent[max(ri, rj)] = min(ri, rj)
            if cel[i] < cel[j]: i += 1
            else: j += 1
    roots = np.array([find(i) for i in range(n)], dtype=np.int64)
    uniq, inv = np.unique(roots, return_inverse=True)
    lab = np.zeros((h, w), np.int32)
    lengths = ce - cs
    run_lab = inv + 1
    # paint runs
    idx_rows = np.repeat(rs, lengths); idx_cols = np.concatenate([np.arange(a, b) for a, b in zip(cs, ce)]) if n else np.array([], int)
    lab[idx_rows, idx_cols] = np.repeat(run_lab, lengths)
    sizes = np.bincount(run_lab, weights=lengths, minlength=len(uniq) + 1).astype(np.int64)
    return lab, sizes

def remove_small(m, minsize):
    lab, sizes = label(m)
    keep = sizes >= minsize; keep[0] = False
    return keep[lab]

# ---------- skeleton (Zhang-Suen) ----------
def skeletonize(m):
    s = np.pad(m.astype(np.uint8), 1)
    while True:
        changed = False
        for step in (0, 1):
            P2 = s[:-2, 1:-1]; P3 = s[:-2, 2:]; P4 = s[1:-1, 2:]; P5 = s[2:, 2:]
            P6 = s[2:, 1:-1]; P7 = s[2:, :-2]; P8 = s[1:-1, :-2]; P9 = s[:-2, :-2]
            nb = [P2, P3, P4, P5, P6, P7, P8, P9]
            B = sum(x.astype(np.int32) for x in nb)
            A = sum(((nb[i] == 0) & (nb[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8))
            if step == 0: c = (P2 * P4 * P6 == 0) & (P4 * P6 * P8 == 0)
            else: c = (P2 * P4 * P8 == 0) & (P2 * P6 * P8 == 0)
            rm = (s[1:-1, 1:-1] == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if rm.any():
                s[1:-1, 1:-1][rm] = 0; changed = True
        if not changed: break
    return s[1:-1, 1:-1].astype(bool)

# ---------- rendering ----------
class Canvas:
    """Supersampled ink canvas. Draw with ink amount 0..255 (255 = black)."""
    def __init__(self, ss=2):
        self.ss = ss; self.im = Image.new('L', (W * ss, H * ss), 0); self.d = ImageDraw.Draw(self.im)
    def stroke(self, pts, widths, ink=255):
        """pts: (N,2) array x,y in image px; widths: (N,) full width in px. Draws a tapered polygon + round joints."""
        ss = self.ss; pts = np.asarray(pts, float) * ss; wd = np.asarray(widths, float) * ss / 2
        if len(pts) < 2: return
        t = np.gradient(pts, axis=0); n = np.sqrt((t ** 2).sum(1)) + 1e-9; t /= n[:, None]
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)
        L = pts + nrm * wd[:, None]; R = pts - nrm * wd[:, None]
        poly = np.concatenate([L, R[::-1]])
        self.d.polygon([tuple(p) for p in poly], fill=ink)
    def stroke_ribbon(self, pts, widths, ink=255):
        """Draw as quads segment by segment (robust to self-overlap)."""
        ss = self.ss; pts = np.asarray(pts, float) * ss; wd = np.asarray(widths, float) * ss / 2
        if len(pts) < 2: return
        t = np.gradient(pts, axis=0); n = np.sqrt((t ** 2).sum(1)) + 1e-9; t /= n[:, None]
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)
        L = pts + nrm * wd[:, None]; R = pts - nrm * wd[:, None]
        for i in range(len(pts) - 1):
            self.d.polygon([tuple(L[i]), tuple(L[i + 1]), tuple(R[i + 1]), tuple(R[i])], fill=ink)
    def ink(self):
        return np.asarray(self.im.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0  # 1 = ink

# ---------- io + scoring ----------
def to_img(ink):
    """ink: float array 1=black. Returns PIL L image black on white."""
    return Image.fromarray((255 * (1 - np.clip(ink, 0, 1))).astype(np.uint8), 'L')

def score(img_L):
    a = np.asarray(img_L.convert('L')) if not isinstance(img_L, np.ndarray) else img_L
    ink = a < 128
    marks = load_marks()
    near = dilate(ink, 6)
    hit = (near & marks).sum() / marks.sum()
    lab, sizes = label(ink)
    small = sizes < 40; small[0] = False
    noise = small[lab].sum() / max(ink.sum(), 1)
    return {'Hit': f'{100*hit:.0f}%', 'Noise': f'{100*noise:.0f}%', 'Ink': f'{100*ink.mean():.0f}%',
            '_hit': float(hit), '_noise': float(noise), '_ink': float(ink.mean())}

def save_version(vid, img, title, notes, params, live):
    img.save(os.path.join(LAB, f'img/{vid}.webp'), quality=88)
    img.save(os.path.join(LAB, f'work/{vid}.png'))
    sc = score(img)
    p = {'Hit': sc['Hit'], 'Noise': sc['Noise'], 'Ink': sc['Ink']}
    p.update(params); p['Live in the app'] = live
    vp = os.path.join(LAB, 'versions.json')
    vs = json.load(open(vp))
    vs = [v for v in vs if v['id'] != vid]
    vs.append({'id': vid, 'file': f'img/{vid}.webp', 'title': title, 'notes': notes, 'params': p, 'inApp': ''})
    vs.sort(key=lambda v: v['id'])
    json.dump(vs, open(vp, 'w'), indent=1)
    print(vid, sc)
    return sc

def flow_conv(V, tx, ty, L, sigma=None, step=1.0):
    """Line integral convolution of V along the (sign-free) tangent field, L steps each way.
    sigma=None -> box kernel, else Gaussian weights along the curve."""
    h, w = V.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    acc = V.copy(); wsum = np.ones_like(V)
    for sgn in (1, -1):
        x, y = xs.copy(), ys.copy(); dx, dy = sgn * tx, sgn * ty
        for s in range(1, L + 1):
            x = x + step * dx; y = y + step * dy
            ntx = bilinear(tx, x, y); nty = bilinear(ty, x, y)
            n = np.sqrt(ntx * ntx + nty * nty) + 1e-9; ntx /= n; nty /= n
            sg = np.sign(ntx * dx + nty * dy); sg[sg == 0] = 1
            dx, dy = sg * ntx, sg * nty
            wgt = 1.0 if sigma is None else np.exp(-(s * step) ** 2 / (2 * sigma * sigma))
            acc += wgt * bilinear(V, x, y); wsum += wgt
    return acc / wsum

def tensor(img, pre=2.0, sig=8.0):
    g = blur(img, pre); gx, gy = sobel(g)
    return blur(gx * gx, sig), blur(gx * gy, sig), blur(gy * gy, sig)

def tangent_from_tensor(E, F, G):
    d = np.sqrt((E - G) ** 2 + 4 * F * F)
    l1 = (E + G + d) / 2; l2 = (E + G - d) / 2
    # tangent = eigenvector of the small eigenvalue; angle = 0.5*atan2(2F, E-G) is the gradient angle
    th = 0.5 * np.arctan2(2 * F, E - G) + np.pi / 2
    coh = (l1 - l2) / (l1 + l2 + 1e-9)
    return np.cos(th).astype(np.float32), np.sin(th).astype(np.float32), coh.astype(np.float32), (l1 + l2).astype(np.float32)

def multiscale_etf(img, pre=2.0, sigs=(8.0, 24.0), weights=(1.0, 1.0)):
    acc = None
    for s, wt in zip(sigs, weights):
        E, F, G = tensor(img, pre, s)
        tr = E + G + 1e-9
        part = (wt * E / tr.mean(), wt * F / tr.mean(), wt * G / tr.mean())
        acc = part if acc is None else tuple(a + b for a, b in zip(acc, part))
    return tangent_from_tensor(*acc)

def bristle_texture(tx, ty, seed=1, L=10, density=0.5):
    """Streaky dry-brush texture aligned with the flow: LIC of white noise. Returns 0..1 (1 = full ink)."""
    rng = np.random.default_rng(seed)
    n = (rng.random(tx.shape) < density).astype(np.float32)
    t = flow_conv(n, tx, ty, L)
    t = (t - t.mean()) / (t.std() + 1e-9)
    return np.clip(0.5 + 0.5 * t, 0, 1)

def end_dir(p, k=8, head=True):
    """Unit outward direction at an end of polyline p (N,2)."""
    k = min(k, len(p) - 1)
    if head: d = p[0] - p[k]
    else: d = p[-1] - p[-1 - k]
    return d / (np.hypot(*d) + 1e-9)

def link_paths(paths, maxdist=14.0, maxang=0.6, iters=4):
    """Greedily join polylines end to end when the gap is short and both ends point at each other.
    Returns new list of polylines (gap filled with a straight bridge, smoothed later)."""
    paths = [np.asarray(p, float) for p in paths if len(p) >= 2]
    ca = math.cos(maxang)
    for _ in range(iters):
        n = len(paths)
        if n < 2: break
        ends = []  # (path idx, is_head, point, outward dir)
        for i, p in enumerate(paths):
            ends.append((i, True, p[0], end_dir(p, head=True)))
            ends.append((i, False, p[-1], end_dir(p, head=False)))
        pts = np.array([e[2] for e in ends]); dirs = np.array([e[3] for e in ends])
        # grid bucket for neighbour search
        cell = maxdist
        from collections import defaultdict
        grid = defaultdict(list)
        for k, (x, y) in enumerate(pts): grid[(int(x // cell), int(y // cell))].append(k)
        cands = []
        for a in range(len(ends)):
            gx, gy = int(pts[a, 0] // cell), int(pts[a, 1] // cell)
            for ox in (-1, 0, 1):
                for oy in (-1, 0, 1):
                    for b in grid.get((gx + ox, gy + oy), ()):
                        if b <= a or ends[a][0] == ends[b][0]: continue
                        v = pts[b] - pts[a]; d = math.hypot(v[0], v[1])
                        if d > maxdist: continue
                        da, db = dirs[a], dirs[b]
                        if da @ db > -ca: continue  # ends must face each other (anti-parallel outward dirs)
                        if d > 1.5:
                            u = v / d
                            if da @ u < ca * 0.9 or db @ (-u) < ca * 0.9: continue
                        cands.append((d * (2 - (-(da @ db))), a, b))
        if not cands: break
        cands.sort()
        used = set(); merged = {}; alive = list(range(n)); newpaths = []
        taken_path = set()
        for _, a, b in cands:
            ia, ib = ends[a][0], ends[b][0]
            if ia in taken_path or ib in taken_path: continue
            taken_path.add(ia); taken_path.add(ib)
            pa = paths[ia] if not ends[a][1] else paths[ia][::-1]   # make a's end the tail
            pb = paths[ib] if ends[b][1] else paths[ib][::-1]       # make b's end the head
            gap = np.hypot(*(pb[0] - pa[-1])); nb = max(int(gap), 0)
            bridge = [pa[-1] + (pb[0] - pa[-1]) * (t / (nb + 1)) for t in range(1, nb + 1)]
            newpaths.append(np.concatenate([pa] + ([np.array(bridge)] if bridge else []) + [pb]))
        for i, p in enumerate(paths):
            if i not in taken_path: newpaths.append(p)
        paths = newpaths
    return paths
