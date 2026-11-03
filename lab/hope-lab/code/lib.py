"""Shared helpers for the Hope lab (numpy + Pillow only)."""
import json, os, numpy as np
from PIL import Image

LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(LAB, 'frames')
INPUTS = {'A': ('franklin', 6), 'B': ('portrait', 16)}   # frames matching the pinned inputs
W, H = 540, 960


def frame(clip, n):
    return np.asarray(Image.open(os.path.join(FR, '%s_%03d.png' % (clip, n))).convert('RGB'), np.float32) / 255.0


def lum(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def box(a, r):
    """Box blur, radius r, edge clamped (separable, cumsum)."""
    if r < 1:
        return a.copy()
    r = int(r)
    p = np.pad(a, ((r + 1, r), (0, 0)), mode='edge')
    c = np.cumsum(p, 0, dtype=np.float64)
    a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
    p = np.pad(a, ((0, 0), (r + 1, r)), mode='edge')
    c = np.cumsum(p, 1, dtype=np.float64)
    return ((c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)).astype(np.float32)


def gauss(a, s):
    """~Gaussian blur with sigma s via 3 box passes."""
    if s <= 0.3:
        return a.copy()
    r = max(1, int(round((np.sqrt(4 * s * s + 1) - 1) / 2)))
    for _ in range(3):
        a = box(a, r)
    return a


def guided(I, p, r, eps):
    """He et al. guided filter (grey guide)."""
    mI, mp = box(I, r), box(p, r)
    cov = box(I * p, r) - mI * mp
    var = box(I * I, r) - mI * mI
    a = cov / (var + eps)
    b = mp - a * mI
    return box(a, r) * I + box(b, r)


def resize(a, w, h, res=Image.BILINEAR):
    return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((w, h), res), np.float32)


def label(z):
    """4-connected labelling of equal values. Returns (labels, sizes)."""
    h, w = z.shape
    parent = []

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    runs_prev = []
    lab = np.zeros((h, w), np.int32)
    allruns = []
    for y in range(h):
        row = z[y]
        cut = np.flatnonzero(np.diff(row)) + 1
        st = np.concatenate(([0], cut)); en = np.concatenate((cut, [w]))
        runs = []
        j = 0
        for s, e in zip(st.tolist(), en.tolist()):
            v = row[s]
            idx = len(parent); parent.append(idx)
            # overlap with previous runs of same value
            while j < len(runs_prev) and runs_prev[j][1] <= s:
                j += 1
            k = j
            while k < len(runs_prev) and runs_prev[k][0] < e:
                if runs_prev[k][2] == v:
                    a, b = find(runs_prev[k][3]), find(idx)
                    if a != b:
                        parent[max(a, b)] = min(a, b)
                k += 1
            runs.append((s, e, v, idx))
        allruns.append(runs)
        runs_prev = runs
    roots = np.array([find(i) for i in range(len(parent))])
    _, comp = np.unique(roots, return_inverse=True)
    for y, runs in enumerate(allruns):
        for s, e, v, idx in runs:
            lab[y, s:e] = comp[idx]
    sizes = np.bincount(lab.ravel())
    return lab, sizes


def noise_score(z, frac=0.002):
    lab, sizes = label(z)
    small = sizes < frac * z.size
    return float(small[lab].mean())


def merge_small(z, frac=0.002, it=30):
    """Merge regions smaller than frac of the image into neighbours (fill with the majority neighbour zone)."""
    z = z.copy()
    n = int(z.max()) + 1
    for _ in range(it):
        lab, sizes = label(z)
        bad = (sizes < frac * z.size)[lab]
        if not bad.any():
            break
        # vote: for each pixel, the most common zone among non-bad pixels in a 9x9 window
        best, bestc = z.copy(), np.full(z.shape, -1.0, np.float32)
        for k in range(n):
            c = box(((z == k) & ~bad).astype(np.float32), 4)
            m = c > bestc
            best[m] = k; bestc[m] = c[m]
        upd = bad & (bestc > 0)
        if not upd.any():
            break
        z[upd] = best[upd]
    return z


def smooth_zones(z, s):
    """Smooth contours: blur each zone's indicator and take the argmax."""
    n = int(z.max()) + 1
    acc = np.stack([gauss((z == k).astype(np.float32), s) for k in range(n)])
    return acc.argmax(0).astype(z.dtype)


REF_SIGMA = 10.0


def fidelity(z, L, n):
    ref = gauss(L, REF_SIGMA)
    return float(np.corrcoef(z.ravel().astype(np.float64) / max(1, n - 1), ref.ravel())[0, 1])


def flicker(zs):
    return float(np.mean([np.mean(a != b) for a, b in zip(zs[:-1], zs[1:])]))


def render(z, n, aa_field=None, thr=None, w=0.7):
    """Flat greys (0 = black ... n-1 = white). With a continuous field and thresholds: anti-aliased edges."""
    if aa_field is None:
        v = z.astype(np.float32) / max(1, n - 1)
    else:
        g = np.gradient(aa_field)
        fw = np.abs(g[0]) + np.abs(g[1]) + 1e-6
        v = np.zeros_like(aa_field)
        for t in thr:
            v += np.clip((aa_field - t) / (fw * 2 * w) + 0.5, 0, 1)
        v /= len(thr)
    return (np.clip(v, 0, 1) * 255 + 0.5).astype(np.uint8)


def render_soft(z, n, s=1.2):
    """Anti-aliased flat greys from a hard zone map: blur each indicator slightly (edges only)."""
    g = np.linspace(0, 1, n)
    v = sum(g[k] * gauss((z == k).astype(np.float32), s) for k in range(n))
    return (np.clip(v, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_pair(nnn, a, b):
    im = Image.new('L', (2 * W, H))
    im.paste(Image.fromarray(a), (0, 0)); im.paste(Image.fromarray(b), (W, 0))
    p = os.path.join(LAB, 'img', '%s.webp' % nnn)
    im.save(p, quality=88)
    return p


def add_version(entry):
    p = os.path.join(LAB, 'versions.json')
    vs = json.load(open(p))
    vs = [v for v in vs if v['id'] != entry['id']] + [entry]
    json.dump(vs, open(p, 'w'), indent=1)


_sess = None


def depth(rgb):
    """Depth Anything v2 small: relative inverse depth (near = high), normalised 0..1, at the frame size."""
    global _sess
    import onnxruntime as ort
    if _sess is None:
        _sess = ort.InferenceSession('/home/user/generativeart_v002/vendor/depth_anything_v2_small_fp16.onnx', providers=['CPUExecutionProvider'])
    w, h = 308, 546
    x = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    inp = _sess.get_inputs()[0]
    x = x.transpose(2, 0, 1)[None]
    x = x.astype(np.float16 if 'float16' in inp.type else np.float32)
    d = _sess.run(None, {inp.name: x})[0].astype(np.float32).squeeze()
    d = resize(d, rgb.shape[1], rgb.shape[0])
    return (d - d.min()) / (d.max() - d.min() + 1e-6)


def stats(name, z, L, n):
    ns, fi = noise_score(z), fidelity(z, L, n)
    print('%s tones=%d noise=%.4f fidelity=%.3f' % (name, n, ns, fi))
    return ns, fi
