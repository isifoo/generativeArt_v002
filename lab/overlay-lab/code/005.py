"""005: Fragment linking. Skeletonize the overlay, cut the skeleton into simple chains, turn tiny dots into
short dashes along the flow, link chain ends whose directions agree across small gaps, smooth, and draw
the long results as tapered brush strokes."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib

P = dict(bin_thr=0.5, min_blob=8, dot_max=30, link=((6, 0.5), (12, 0.5), (20, 0.45), (30, 0.4), (38, 0.35)),
         minlen=18, align=0.6, smooth=9, wmax=6.0, wmin=1.2, sigs=(8.0, 24.0), save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

def chains_from_skeleton(sk):
    h, w = sk.shape
    p = np.pad(sk, 1).astype(np.int32)
    cnt = sum(p[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx] for dy, dx in NB)
    simple = sk & (cnt <= 2)          # drop junctions -> simple chains
    lab, sizes = lib.label(simple)
    ys, xs = np.nonzero(lab)
    order = np.argsort(lab[ys, xs], kind='stable')
    ys, xs, ls = ys[order], xs[order], lab[ys, xs][order]
    bounds = np.searchsorted(ls, np.arange(1, len(sizes) + 1))
    chains = []
    for k in range(1, len(sizes)):
        a, b = bounds[k - 1], bounds[k]
        if b - a < 3: continue
        pix = set(zip(ys[a:b].tolist(), xs[a:b].tolist()))
        # start at an end (pixel with one neighbour in chain), walk
        def nbrs(q): return [(q[0] + dy, q[1] + dx) for dy, dx in NB if (q[0] + dy, q[1] + dx) in pix]
        start = next((q for q in pix if len(nbrs(q)) <= 1), next(iter(pix)))
        path = [start]; seen = {start}; cur = start
        while True:
            nx = [q for q in nbrs(cur) if q not in seen]
            if not nx: break
            cur = nx[0]; seen.add(cur); path.append(cur)
        chains.append(np.array([(x, y) for y, x in path], float))
    return chains

def run(P):
    rng = np.random.default_rng(5)
    I = lib.load_input()
    tx, ty, coh, _ = lib.multiscale_etf(I, 2.0, P['sigs'])
    ink = I < P['bin_thr']
    ink[:4] = ink[-4:] = False; ink[:, :4] = ink[:, -4:] = False   # frame edge artefacts
    lab, sizes = lib.label(ink)
    keep = sizes >= P['min_blob']; keep[0] = False
    ink = keep[lab]
    # dots: small blobs become short dashes along the flow through their centroid
    lab, sizes = lib.label(ink)
    ys, xs = np.nonzero(lab); ls = lab[ys, xs]
    cy = np.bincount(ls, ys, len(sizes)) / np.maximum(sizes, 1); cx = np.bincount(ls, xs, len(sizes)) / np.maximum(sizes, 1)
    dot = (sizes < P['dot_max']); dot[0] = False
    paths = []
    for k in np.nonzero(dot)[0]:
        x, y = cx[k], cy[k]; t = np.array([tx[int(y), int(x)], ty[int(y), int(x)]]); half = max(2.5, math.sqrt(sizes[k]) * 0.9)
        paths.append(np.array([[x - t[0] * half + t[0] * s, y - t[1] * half + t[1] * s] for s in np.linspace(0, 2 * half, 5)]))
    big = ink & ~dot[lab]
    sk = lib.skeletonize(big)
    ch = chains_from_skeleton(sk)
    # drop skeleton chains that cut across the flow (medial-axis spurs in thick blobs)
    good = []
    for c in ch:
        d = np.gradient(c, axis=0); d /= np.hypot(*d.T)[:, None] + 1e-9
        t = np.stack([lib.nearest(tx, c[:, 0], c[:, 1]), lib.nearest(ty, c[:, 0], c[:, 1])], 1)
        if np.abs((d * t).sum(1)).mean() >= P['align']: good.append(c)
    ch = good
    print('dots', len(paths), 'chains', len(ch))
    paths += ch
    for d, a in P['link']:
        paths = lib.link_paths(paths, d, a, iters=3)
        print('link', d, '->', len(paths))
    paths = [p for p in paths if np.hypot(*np.diff(p, axis=0).T).sum() >= P['minlen']]
    Dk = 1 - lib.blur(I, 3.0)
    cv = lib.Canvas(2)
    for p in paths:
        # resample to ~1.5 px spacing and smooth (a cheap smoothing spline)
        seg = np.hypot(*np.diff(p, axis=0).T); s = np.concatenate([[0], np.cumsum(seg)])
        ns = max(int(s[-1] / 1.5), 4); si = np.linspace(0, s[-1], ns)
        q = np.stack([np.interp(si, s, p[:, 0]), np.interp(si, s, p[:, 1])], 1)
        for _ in range(3):
            k = P['smooth']; q = np.stack([np.convolve(np.pad(q[:, i], k // 2, mode='edge'), np.ones(k) / k, 'valid') for i in range(2)], 1)
        L = len(q); u = np.arange(L) / (L - 1)
        dark = np.clip(lib.bilinear(Dk, q[:, 0], q[:, 1]), 0, 1)
        dark = np.convolve(np.pad(dark, 5, mode='edge'), np.ones(11) / 11, 'valid')
        lenf = min(1.0, s[-1] / 120)
        wd = P['wmin'] + (P['wmax'] - P['wmin']) * (0.4 * lenf + 0.6 * dark)
        prof = np.clip(np.minimum(u / 0.15, (1 - u) / 0.3), 0, 1) ** 0.7
        cv.stroke_ribbon(q, np.maximum(wd * prof, 0.4))
    print('strokes', len(paths))
    return cv.ink()

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('005', img, 'Linked fragments (skeleton + gap joining)',
            "Thins the overlay's shapes to one-pixel skeletons, turns small dots into short dashes along the flow, then repeatedly joins ends that face each other across gaps of up to 38 px, smooths the joined chains and drops anything shorter than 18 px. The result is a sparse pen drawing: the head outline, brows, nose crease, neck curve and the shirt's sweeping folds come out as long single lines, and the shirt speckle becomes flowing lines instead of dots. Weaker than 004 overall: it misses the eyes and the woman's face in the photo, lines are thin and wiry, and thick blobs leave a few crossing spurs.",
            {'Method': 'binarize, drop blobs < 8 px, Zhang-Suen skeleton, cut at junctions, drop chains across the flow, dots -> flow dashes, 5 rounds of end linking, smoothing, tapered ribbons',
             'Key settings': f"link rounds {P['link']} (px, max angle rad), flow alignment >= {P['align']}, min length {P['minlen']} px, smoothing {P['smooth']} x3, width {P['wmin']}-{P['wmax']} px"},
            'CPU only (skeleton + graph linking), quarter resolution about 1 per second; not a good fit for live 30 fps')
    else:
        img.save(os.path.join(lib.LAB, 'work/005-try.png')); print(lib.score(img))
