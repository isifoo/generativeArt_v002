"""003: Streamline tracing ("connect the dots"). Seeds in dark areas, traces along the flow both ways,
stops where the flow is incoherent or the image turns light, renders tapered brush strokes."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib

P = dict(sigs=(8.0, 24.0), dens_blur=3.0, lic=12, seed_thr=0.22, stop_thr=0.07, cmin=0.08, dsep=6.0, dtest=0.5,
         maxlen=260, minlen=24, maxturn=0.35, wmax=4.5, wmin=1.0, taper=0.3, texture=0.35, save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

STATS = {}
def trace_all(Dk, tx, ty, coh, P, rng, occ0=None):
    h, w = Dk.shape
    gap = P.get('gap', 0)
    occ = np.zeros((h, w), bool) if occ0 is None else occ0.copy()
    Dl = Dk.tolist(); TX = tx.tolist(); TY = ty.tolist(); CO = coh.tolist()
    ys, xs = np.nonzero(Dk > P['seed_thr'])
    # darkest first, with jitter so ties are random
    order = np.argsort(-(Dk[ys, xs] + 0.15 * rng.random(len(ys))))
    ys, xs = ys[order], xs[order]
    rsep = P['dsep'] / 2; rtest = P['dsep'] * P['dtest']
    occ_rad = [(dy, dx) for dy in range(-int(rsep), int(rsep) + 1) for dx in range(-int(rsep), int(rsep) + 1) if dx * dx + dy * dy <= rsep * rsep]
    strokes = []
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if occ[sy, sx]: continue
        halves = []
        for sgn in (1, -1):
            x, y = float(sx), float(sy); dx, dy = sgn * TX[sy][sx], sgn * TY[sy][sx]
            pts = []; weak = 0; why = 'len'
            for _ in range(P['maxlen'] // 2):
                nx, ny = x + dx, y + dy
                xi, yi = int(nx + 0.5), int(ny + 0.5)
                if xi < 1 or yi < 1 or xi >= w - 1 or yi >= h - 1: why = 'edge'; break
                if Dl[yi][xi] < P['stop_thr'] or CO[yi][xi] < P['cmin']:
                    weak += 1  # bridge short light gaps between dots
                    if weak > gap: why = 'light'; break
                else: weak = 0
                # occupancy test a bit ahead (keeps strokes apart)
                ax, ay = int(nx + dx * rtest + 0.5), int(ny + dy * rtest + 0.5)
                if 0 <= ax < w and 0 <= ay < h and occ[ay, ax]: why = 'occ'; break
                ntx, nty = TX[yi][xi], TY[yi][xi]
                if ntx * dx + nty * dy < 0: ntx, nty = -ntx, -nty
                if ntx * dx + nty * dy < math.cos(P['maxturn']): why = 'turn'; break
                # mild inertia: smooth the direction
                dx, dy = 0.5 * dx + 0.5 * ntx, 0.5 * dy + 0.5 * nty
                n = math.hypot(dx, dy); dx /= n; dy /= n
                x, y = nx, ny; pts.append((x, y)); tail = weak
            if why == 'light' or True:
                tail = weak if why != 'light' else weak - 1  # trailing points that sit in a light gap
                if tail > 0: pts = pts[:len(pts) - tail]
            STATS[why] = STATS.get(why, 0) + 1
            halves.append(pts)
        pts = halves[1][::-1] + [(float(sx), float(sy))] + halves[0]
        if len(pts) < P['minlen']:
            continue
        for (x, y) in pts:
            xi, yi = int(x + 0.5), int(y + 0.5)
            for dy_, dx_ in occ_rad:
                yy, xx = yi + dy_, xi + dx_
                if 0 <= yy < h and 0 <= xx < w: occ[yy, xx] = True
        strokes.append(np.array(pts))
    return strokes

def smooth_path(p, k=5):
    if len(p) < k: return p
    ker = np.ones(k) / k
    q = np.stack([np.convolve(np.pad(p[:, i], k // 2, mode='edge'), ker, 'valid') for i in range(2)], 1)
    return q

def render(strokes, Dk, P, rng, tex=None):
    cv = lib.Canvas(2)
    for p in strokes:
        p = smooth_path(p, 7)
        L = len(p); u = np.arange(L) / (L - 1)
        dark = lib.bilinear(Dk, p[:, 0], p[:, 1])
        dark = np.convolve(np.pad(dark, 6, mode='edge'), np.ones(13) / 13, 'valid')
        base = P['wmin'] + (P['wmax'] - P['wmin']) * np.clip((dark - P['stop_thr']) / (1 - P['stop_thr']), 0, 1) ** 0.8
        # brush taper: quick attack, longer release, slight random pressure
        tl = P['taper']
        prof = np.clip(np.minimum(u / (tl * 0.6), (1 - u) / tl), 0, 1) ** 0.7
        jitter = 1 + 0.12 * np.sin(2 * np.pi * (u * rng.uniform(1, 3) + rng.random()))
        wd = np.maximum(base * prof * jitter, 0.35)
        cv.stroke(p, wd)
    ink = cv.ink()
    if tex is not None and P['texture'] > 0:
        ink = ink * (1 - P['texture'] * (1 - tex) * (ink > 0.5))
    return ink

def run(P, extra=None):
    rng = np.random.default_rng(7)
    I = lib.load_input()
    tx, ty, coh, _ = lib.multiscale_etf(I, 2.0, P['sigs'])  # (cached in work/etf.npz for experiments)
    # density of dots measured ALONG the flow: aligned dots reinforce each other, isolated specks fade
    Dk = lib.flow_conv(1 - lib.blur(I, P['dens_blur']), tx, ty, P['lic'], sigma=P['lic'] / 1.5)
    if extra is not None: Dk = np.maximum(Dk, extra)  # optional extra guide (used by 009)
    strokes = trace_all(Dk, tx, ty, coh, P, rng)
    print('strokes', len(strokes), 'mean len', np.mean([len(s) for s in strokes]))
    tex = lib.bristle_texture(tx, ty, L=8, density=0.5) if P['texture'] > 0 else None
    return render(strokes, Dk, P, rng, tex)

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('003', img, 'Traced brush strokes (connect the dots)',
            "Measures the density of dots along the flow, seeds strokes in the densest places first, and traces each one both ways along the flow until the flow gets confused, the image turns light, or it would crowd a stroke already drawn. Each streamline is drawn as a tapered brush stroke (width from darkness, thin ends, a little pressure wobble and a dry-brush streak texture). The beard turns into combed vertical strands, the brows and eye lines connect, and the shirt gets loose hatching. Weaknesses: strokes are still fairly short (about 60 px on average), the eye bags and forehead wrinkle are only partly found, and the stroke texture makes everything a little grey.",
            {'Method': 'multiscale structure-tensor ETF (sigma 8 + 24), LIC density field, greedy evenly-spaced streamlines (darkest seeds first), tapered polygon strokes with flow-aligned bristle texture',
             'Key settings': f"seed density > {P['seed_thr']}, stop < {P['stop_thr']}, min coherence {P['cmin']}, spacing {P['dsep']} px, max turn {P['maxturn']} rad/step, length {P['minlen']}-{P['maxlen']} px, width {P['wmin']}-{P['wmax']} px, texture {P['texture']}"},
            'CPU at half resolution (tracing is sequential), about 2-4 per second in JS; the ETF, density and texture on GPU; strokes drawn as a WebGL triangle strip')
    else:
        img.save(os.path.join(lib.LAB, 'work/003-try.png')); print(lib.score(img))
