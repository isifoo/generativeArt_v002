"""Motion lab core: test sequence, the app's overlay detector, Overlay 016 at half resolution (540 x 960,
line spacing 3 px = 6 px at 1080), a fast line rasteriser, pyramid Lucas-Kanade flow, metrics, WebP output.
016's code is copied in code/ov (lib, swirl, 010, 016); here all its lengths are scaled by K = 0.5."""
import sys, os, math, json
from collections import deque
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ov'))
import lib, swirl

LAB = os.path.dirname(HERE)
WORK = os.path.join(LAB, 'work')
W, H = 540, 960
N_FRAMES, KEY = 150, 15          # 5 s at 30 fps; a keyframe every 15 frames (2 per second)
K = 0.5                          # 016 was tuned at ~1080 wide; we trace at 540 (the app's half resolution)
lib.BORDER_X = W                 # no camera border here

# ---------------------------------------------------------------- test sequence (known motion)
def cam(t):
    """Camera at frame t: zoom, rotation (rad), pan (px in source). Smooth, slow."""
    s = t / 30.0
    z = 1.35 + 0.10 * (1 - math.cos(math.pi * s / 5)) / 2            # slow push-in 1.35 -> 1.45
    rot = math.radians(2.0) * math.sin(2 * math.pi * s / 5)          # +-2 degrees
    px = -32 + 64 * (1 - math.cos(math.pi * s / 5)) / 2              # pan right 64 px over 5 s
    py = 14 * math.sin(2 * math.pi * s / 4)
    return z, rot, px, py

MOUTH = (300.0, 770.0, 230.0, 150.0)   # centre x, y, radius x, y of the 'jaw' region in the source
def jaw(t):
    """Talking: the lower face moves down by up to 7 px at ~1.6 Hz (not a pure sine)."""
    s = t / 30.0
    return 7.0 * (0.5 - 0.5 * math.cos(2 * math.pi * 1.6 * s)) * (0.6 + 0.4 * math.sin(2 * math.pi * 0.37 * s))

def jaw_mask(x, y):
    cx, cy, rx, ry = MOUTH
    r2 = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    return np.exp(-2.0 * r2 ** 2)

def backmap(t, xs, ys):
    """Frame-t pixel -> source pixel (what is drawn there)."""
    z, rot, px, py = cam(t); c, s = math.cos(rot), math.sin(rot)
    dx, dy = xs - W / 2, ys - H / 2
    u = W / 2 + (c * dx - s * dy) / z + px
    v = H / 2 + (s * dx + c * dy) / z + py
    return u, v - jaw_mask(u, v) * jaw(t)       # content in the jaw region shows up lower

def forward(t, u, v):
    """Source pixel -> frame-t pixel (inverse of backmap; fixed-point for the jaw)."""
    j = jaw(t); uu, vv = u, v.copy()
    for _ in range(6): vv = v + jaw_mask(uu, vv) * j
    z, rot, px, py = cam(t); c, s = math.cos(rot), math.sin(rot)
    a, b = (uu - W / 2 - px) * z, (vv - H / 2 - py) * z
    return W / 2 + c * a + s * b, H / 2 - s * a + c * b

def true_flow(t0, t1):
    """Exact flow from frame t0 to frame t1 at every pixel of t0 (H, W, 2)."""
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float64)
    u, v = backmap(t0, xs, ys); x1, y1 = forward(t1, u, v)
    return np.stack([x1 - xs, y1 - ys], -1).astype(np.float32)

def make_sequence(src_png):
    S = np.asarray(Image.open(src_png).convert('L')).astype(np.float32) / 255.0
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float64)
    fr = np.zeros((N_FRAMES + 1, H, W), np.float32)
    for t in range(N_FRAMES + 1):
        u, v = backmap(t, xs, ys)
        fr[t] = lib.bilinear(S, u, v)
    return fr

# ---------------------------------------------------------------- the app's overlay detector (lines.js overlayRaw)
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def detector(L, size=20.0, contrast=22.0, thr=0.3, soft=0.45, blacks=0.18):
    """L: luma 0..1 of the 540 x 960 camera frame. Returns ink 0..1.
    textureLod(fine = 1), textureLod(coarse = log2(size / 2)): mip level m ~ box of 2^m px; Gaussian sigma ~0.42 * 2^m."""
    f = lib.blur(L, 0.42 * 2 ** 1.0)
    c = lib.blur(L, 0.42 * 2 ** math.log2(size / 2.0))
    ink = smoothstep(thr, thr + soft, (c - f) * contrast)
    if blacks > 0: ink = np.maximum(ink, 1 - smoothstep(blacks - 0.04, blacks + 0.04, f))
    return ink.astype(np.float32)

# ---------------------------------------------------------------- Overlay 016 at half resolution
P016 = dict(sig=30.0, dsep=6.0, dtest=0.6, step=1.0, maxturn=0.5, minlen=20,
            tone_lo=0.06, tone_hi=0.65, gamma=0.8, wfill=0.7, tone_win=21, minrun=16, wmin=0.6, guide_w=0.4,
            n_centres=30, strength=1.5, radius=65.0, pitch=25.0, curl=55.0, curl_scale=90.0)

def field016(I, P=P016, seed=3):
    """016's direction field (doubled angle c2, s2) for overlay I (1 = white), lengths x K."""
    E, F, G = lib.tensor(I, 2.0 * K, P['sig'] * K)
    tx, ty, coh, _ = lib.tangent_from_tensor(E, F, G)
    th = np.arctan2(ty, tx)
    c2, s2 = lib.blur(np.cos(2 * th), 6.0 * K), lib.blur(np.sin(2 * th), 6.0 * K)
    cs = swirl.feature_centres(I, s1=8.0 * K, nms=55 * K, margin=int(12 * K), max_n=P['n_centres'])
    c2, s2 = swirl.curl_noise(I, c2, s2, P['curl'], P['curl_scale'] * K, seed=seed)
    c2, s2 = swirl.vortex(I, c2, s2, cs, P['strength'], P['radius'] * K, P['pitch'])
    return c2.astype(np.float32), s2.astype(np.float32), cs

def fdog_guide(I):
    """001's flow DoG lines (the 'guide' part of 010's tone field), lengths x K."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('v001', os.path.join(HERE, 'ov', '001.py'))
    m = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(m); sys.argv = a
    tx, ty, coh, _ = lib.etf(I, 1.5 * K, 10.0 * K)
    Hh = m.fdog(lib.blur(I, 0.8 * K), tx, ty, 2.0 * K, 0.99, 6.0 * K)
    Hn = Hh / (np.abs(Hh).std() + 1e-9)
    val = np.where(Hn < 0, 1 + np.tanh(Hn), 1.0)
    ink = np.clip((0.35 - val) / 0.08 + 0.5, 0, 1)
    mk = lib.remove_small(ink > 0.5, int(40 * K * K))
    return ink * lib.dilate(mk, 1)

def tone016(I, P=P016):
    """010's darkness map: LIC of darkness along the flow, max'd with 0.4 x FDoG lines, mapped to 0..1."""
    tx, ty, coh, _ = lib.multiscale_etf(I, 2.0 * K, (8.0 * K, 24.0 * K))
    Dk = lib.flow_conv(1 - lib.blur(I, 3.0 * K), tx, ty, 12, sigma=8.0 * K, step=K)
    lines = fdog_guide(I)
    Dk = np.maximum(Dk, P['guide_w'] * np.clip(lib.blur(lines, 2.5 * K) * 2.0, 0, 1))
    return (np.clip((Dk - P['tone_lo']) / (P['tone_hi'] - P['tone_lo']), 0, 1) ** P['gamma']).astype(np.float32)

def streamlines(c2, s2, P=P016, seeds=None, stats=None):
    """010's evenly spaced streamlines (Jobard-Lefer) at half resolution. seeds: optional list of (x, y)
    tried FIRST, in order (used by the coherent re-tracing). Returns list of (N, 2) arrays and, per line,
    the index of the seed it came from (-1 = grown by the front / fallback grid)."""
    h, w = c2.shape
    C2 = c2.tolist(); S2 = s2.tolist()
    dsep = P['dsep'] * K; dtest = P['dtest'] * dsep; cell = dsep; step = P['step'] * K
    grid = {}
    def dirat(x, y):
        x0, y0 = int(x), int(y); fx, fy = x - x0, y - y0
        x1, y1 = min(x0 + 1, w - 1), min(y0 + 1, h - 1)
        c = C2[y0][x0] * (1 - fx) * (1 - fy) + C2[y0][x1] * fx * (1 - fy) + C2[y1][x0] * (1 - fx) * fy + C2[y1][x1] * fx * fy
        s = S2[y0][x0] * (1 - fx) * (1 - fy) + S2[y0][x1] * fx * (1 - fy) + S2[y1][x0] * (1 - fx) * fy + S2[y1][x1] * fx * fy
        a = 0.5 * math.atan2(s, c); return math.cos(a), math.sin(a)
    def near(x, y, r, lid=-1):
        gx, gy = int(x // cell), int(y // cell); r2 = r * r
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                for (px, py, pl) in grid.get((gx + ox, gy + oy), ()):
                    if pl != lid and (px - x) ** 2 + (py - y) ** 2 < r2: return True
        return False
    cmax = math.cos(P['maxturn'])
    def trace(sx, sy, lid, d0=None):
        halves = []
        if d0 is None: d0 = dirat(sx, sy)
        for sgn in (1, -1):
            x, y = sx, sy; dx, dy = sgn * d0[0], sgn * d0[1]; pts = []
            for _ in range(8000):
                tx_, ty_ = dirat(x, y)
                if tx_ * dx + ty_ * dy < 0: tx_, ty_ = -tx_, -ty_
                if tx_ * dx + ty_ * dy < cmax: break
                dx, dy = tx_, ty_
                nx, ny = x + step * dx, y + step * dy
                if nx < 0 or ny < 0 or nx > w - 1.001 or ny > h - 1.001: break
                if near(nx, ny, dtest, lid): break
                x, y = nx, ny; pts.append((x, y))
            halves.append(pts)
        return halves[1][::-1] + [(sx, sy)] + halves[0], len(halves[1])
    lines, origin, seedpos = [], [], []
    def add(pts, org, si):
        lid = len(lines); lines.append(pts); origin.append(org); seedpos.append(si)
        for (x, y) in pts: grid.setdefault((int(x // cell), int(y // cell)), []).append((x, y, lid))
        return lid
    queue = deque()
    if seeds is not None:          # coherent re-tracing: last keyframe's lines (moved by the flow) seed first
        for j, (sx, sy) in enumerate(seeds):
            if sx < 0 or sy < 0 or sx > w - 1.001 or sy > h - 1.001 or near(sx, sy, dsep * 0.95): continue
            pts, si = trace(sx, sy, len(lines))
            if len(pts) >= P['minlen']: queue.append(add(pts, j, si))
    fallback = [(w / 2, h / 2)] + [(x + 0.5, y + 0.5) for y in np.arange(dsep, h - 1, dsep * 6) for x in np.arange(dsep, w - 1, dsep * 6)]
    fi = 0
    while True:
        if not queue:
            while fi < len(fallback) and near(*fallback[fi], dsep): fi += 1
            if fi >= len(fallback): break
            pts, si = trace(*fallback[fi], len(lines)); fi += 1
            if len(pts) >= P['minlen']: queue.append(add(pts, -1, si))
            continue
        lid = queue.popleft(); pts = lines[lid]
        kk = max(1, int(dsep / 2 / step))
        for i in range(0, len(pts), kk):
            x, y = pts[i]
            j0, j1 = max(i - 1, 0), min(i + 1, len(pts) - 1)
            tx_, ty_ = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]; n = math.hypot(tx_, ty_) + 1e-9
            nx_, ny_ = -ty_ / n, tx_ / n
            for sgn in (1, -1):
                sx, sy = x + sgn * dsep * nx_, y + sgn * dsep * ny_
                if sx < 0 or sy < 0 or sx > w - 1.001 or sy > h - 1.001: continue
                if near(sx, sy, dsep * 0.95): continue
                newpts, si = trace(sx, sy, len(lines))
                if len(newpts) >= P['minlen']: queue.append(add(newpts, -1, si))
    if stats is not None: stats.update(seeded=sum(1 for o in origin if o >= 0), total=len(lines))
    return [np.array(p, np.float32) for p in lines], np.array(origin), np.array(seedpos)

# ---------------------------------------------------------------- rendering (what a GPU line mesh would draw)
def stroke_widths(p, tone, P=P016):
    """Per-point full width (px at 540) from the CURRENT darkness map, 010's rule; 0 outside inked runs."""
    t = lib.bilinear(tone, p[:, 0], p[:, 1])
    k = P['tone_win']; t = np.convolve(np.pad(t, k // 2, mode='edge'), np.ones(k) / k, 'valid')
    on = t > 0.03
    d = np.diff(np.concatenate([[0], on.astype(np.int8), [0]]))
    wd = np.zeros(len(p), np.float32)
    wmax = P['wfill'] * P['dsep'] * K; wmin = P['wmin'] * K
    for a, b in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]):
        if b - a < P['minrun']: continue
        wd[a:b] = wmin * np.minimum(1, t[a:b] / 0.15) + (wmax - wmin) * t[a:b]
    return wd

OFFS = [(dx, dy) for dy in range(-2, 3) for dx in range(-2, 3)]
def raster(pts, rad, alpha=None, shape=(H, W)):
    """Union of anti-aliased discs (max-composited) = a variable-width polyline. pts (N,2), rad (N,) half width.
    alpha (N,) optional per-point opacity. Points must be <= ~0.6 px apart."""
    h, w = shape; out = np.zeros(h * w, np.float32)
    m = rad > 0.02
    pts, rad = pts[m], rad[m]
    if alpha is not None: alpha = alpha[m]
    if len(pts) == 0: return out.reshape(h, w)
    cx, cy = np.rint(pts[:, 0]).astype(np.int32), np.rint(pts[:, 1]).astype(np.int32)
    for dx, dy in OFFS:
        X, Y = cx + dx, cy + dy
        d = np.hypot(X - pts[:, 0], Y - pts[:, 1])
        v = np.clip(rad + 0.5 - d, 0, 1)
        if alpha is not None: v = v * alpha
        ok = (v > 0) & (X >= 0) & (X < w) & (Y >= 0) & (Y < h)
        np.maximum.at(out, Y[ok] * w + X[ok], v[ok])
    return out.reshape(h, w)

def densify(p, maxgap=0.6):
    """Insert points so consecutive points are <= maxgap apart (after the flow stretched a line)."""
    d = np.hypot(*np.diff(p, axis=0).T)
    if len(d) == 0 or d.max() <= maxgap: return p, np.arange(len(p), dtype=np.float32)
    n = np.maximum(1, np.ceil(d / maxgap)).astype(int)
    idx = np.concatenate([i + np.arange(k) / k for i, k in enumerate(n)] + [[len(p) - 1]]).astype(np.float32)
    i0 = np.minimum(idx.astype(int), len(p) - 2); f = (idx - i0)[:, None]
    return p[i0] * (1 - f) + p[i0 + 1] * f, idx

def render_lines(lines, tone, alphas=None):
    """lines: list of (N,2); width from tone at the CURRENT positions. alphas: per-line opacity (or None)."""
    P_, R_, A_ = [], [], []
    for i, p in enumerate(lines):
        if len(p) < 2: continue
        wd = stroke_widths(p, tone)
        if wd.max() <= 0: continue
        q, idx = densify(p)
        P_.append(q); R_.append(np.interp(idx, np.arange(len(p)), wd) / 2)
        if alphas is not None: A_.append(np.full(len(q), alphas[i], np.float32))
    if not P_: return np.zeros((H, W), np.float32)
    return raster(np.concatenate(P_), np.concatenate(R_), np.concatenate(A_) if alphas is not None else None)

# ---------------------------------------------------------------- flow: pyramid Lucas-Kanade at 1/4 resolution
def down2(a):
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2; a = a[:h, :w]
    return 0.25 * (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2])

def quarter(L): return down2(down2(L))

def warp(a, fx, fy):
    h, w = a.shape; ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    return lib.bilinear(a, xs + fx, ys + fy)

def lk_flow(A, B, levels=3, iters=4, win=2.0, smooth=2.0, init=None):
    """Dense pyramid Lucas-Kanade from A to B (both 1/4-res luma). Returns flow (fx, fy) at A's pixels,
    in 1/4-res px. win: Gaussian window sigma; smooth: confidence-weighted smoothing of the result."""
    pa, pb = [A], [B]
    for _ in range(levels - 1): pa.append(down2(pa[-1])); pb.append(down2(pb[-1]))
    fx = fy = None
    for lv in range(levels - 1, -1, -1):
        a, b = pa[lv], pb[lv]
        if fx is None:
            fx = np.zeros_like(a); fy = np.zeros_like(a)
            if init is not None:
                s = 2 ** lv; fx = up_to(init[0] / s, a.shape); fy = up_to(init[1] / s, a.shape)
        else:
            fx = up_to(fx * 2, a.shape); fy = up_to(fy * 2, a.shape)
        gx, gy = np.gradient(a, axis=1), np.gradient(a, axis=0)
        Ixx, Ixy, Iyy = lib.blur(gx * gx, win), lib.blur(gx * gy, win), lib.blur(gy * gy, win)
        det = Ixx * Iyy - Ixy * Ixy + 1e-6
        for _ in range(iters):
            bw = warp(b, fx, fy); it = bw - a
            bx_, by_ = lib.blur(gx * it, win), lib.blur(gy * it, win)
            dx = -(Iyy * bx_ - Ixy * by_) / det; dy = -(-Ixy * bx_ + Ixx * by_) / det
            fx = fx + np.clip(dx, -1, 1); fy = fy + np.clip(dy, -1, 1)
        conf = (Ixx + Iyy - np.sqrt((Ixx - Iyy) ** 2 + 4 * Ixy ** 2)) / 2   # min eigenvalue
        cw = conf / (conf.mean() + 1e-9)
        s = smooth * (1 if lv == 0 else 0.7)
        fx = lib.blur(fx * cw, s) / (lib.blur(cw, s) + 1e-6); fy = lib.blur(fy * cw, s) / (lib.blur(cw, s) + 1e-6)
    return fx.astype(np.float32), fy.astype(np.float32)

def up_to(a, shape):
    h, w = shape; ys = (np.arange(h) + 0.5) * a.shape[0] / h - 0.5; xs = (np.arange(w) + 0.5) * a.shape[1] / w - 0.5
    Y, X = np.meshgrid(ys, xs, indexing='ij')
    return lib.bilinear(a, X, Y).astype(np.float32)

def full_flow(fq):
    """1/4-res flow (fx, fy) in 1/4 px -> full-res (H, W, 2) in full px."""
    return np.stack([up_to(fq[0], (H, W)) * 4, up_to(fq[1], (H, W)) * 4], -1)

def sample_q(fq, pts):
    """Sample a 1/4-res flow at full-res points -> full-res displacement (N, 2)."""
    x, y = pts[:, 0] / 4 - 0.375, pts[:, 1] / 4 - 0.375
    return np.stack([lib.bilinear(fq[0], x, y), lib.bilinear(fq[1], x, y)], -1) * 4

# ---------------------------------------------------------------- data cache
def load_seq():
    d = np.load(os.path.join(WORK, 'seq.npz'))
    return d['frames'], d['ink'], d['tone']

def load_keys(kind='016'):
    import pickle
    return pickle.load(open(os.path.join(WORK, f'keys-{kind}.pkl'), 'rb'))

# ---------------------------------------------------------------- metrics
def comp_prev(ink_prev, t):
    """ink of frame t-1 moved by the TRUE motion to frame t (so the diff shows only real changes)."""
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float64)
    u, v = backmap(t, xs, ys); x0, y0 = forward(t - 1, u, v)
    return lib.bilinear(ink_prev, x0, y0)

def metrics(inks, keys_idx, tones=None, refs=None):
    """inks: (T, H, W) rendered ink 0..1 for frames 0..T-1. keys_idx: keyframe frame numbers.
    Ghosting: extra inked area and grey (half-tone) ink in the middle in-between frames vs keyframes.
    Popping: motion-compensated frame-to-frame change (mean |d ink|, % of mean ink), max and median."""
    T = len(inks); M = 8                                   # ignore an 8 px border
    core = (slice(M, H - M), slice(M, W - M))
    area = np.array([(i[core] > 0.15).mean() for i in inks])
    grey = np.array([((i[core] > 0.15) & (i[core] < 0.6)).mean() / max((i[core] > 0.15).mean(), 1e-9) for i in inks])
    meanink = np.array([i[core].mean() for i in inks])
    kset = [k for k in keys_idx if k < T]
    mids = [k + KEY // 2 for k in kset if k + KEY // 2 < T]
    mids = [m for m in mids for m in (m - 1, m, m + 1)]
    ghost_area = area[mids].mean() / area[kset].mean() - 1
    ghost_grey = (grey[mids].mean(), grey[kset].mean())
    ch = np.zeros(T)
    for t in range(1, T):
        ch[t] = np.abs(inks[t] - comp_prev(inks[t - 1], t))[core].mean() / meanink.mean()
    r = dict(area=area.tolist(), grey=grey.tolist(), change=ch.tolist(),
             ghost_area=float(ghost_area), grey_mid=float(ghost_grey[0]), grey_key=float(ghost_grey[1]),
             pop_max=float(ch[1:].max()), pop_med=float(np.median(ch[1:])), pop_at=int(ch.argmax()),
             ink_mean=float(meanink.mean()))
    if refs is not None:   # match to a fresh 016 trace of the same in-between frame (blurred 3 px correlation)
        cc = []
        for t, ref in refs.items():
            a, b = lib.blur(inks[t], 3.0)[core].ravel(), lib.blur(ref, 3.0)[core].ravel()
            cc.append(np.corrcoef(a, b)[0, 1])
        r['ref_corr'] = float(np.mean(cc))
    return r

def fmt_pct(x): return f"{100 * x:.0f}%"

# ---------------------------------------------------------------- output
def save_webp(inks, path, frames=None, scale=1.0, label_keys=None):
    imgs = []
    for t, ink in enumerate(inks):
        im = Image.fromarray((255 * (1 - np.clip(ink, 0, 1))).astype(np.uint8), 'L')
        if scale != 1.0: im = im.resize((int(W * scale), int(H * scale)), Image.LANCZOS)
        if label_keys is not None and label_keys[t]:   # a small black tick in the corner on keyframes
            a = np.asarray(im).copy(); a[6:16, 6:16] = 0; im = Image.fromarray(a)
        imgs.append(im.convert('RGB'))
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=33, loop=0, quality=70, method=4)
    return os.path.getsize(path)

def add_version(vid, title, notes, params):
    vp = os.path.join(LAB, 'versions.json'); vs = json.load(open(vp))
    vs = [v for v in vs if v['id'] != vid]
    vs.append({'id': vid, 'file': f'img/{vid}.webp', 'title': title, 'notes': notes, 'params': params, 'inApp': ''})
    vs.sort(key=lambda v: v['id']); json.dump(vs, open(vp, 'w'), indent=1)
