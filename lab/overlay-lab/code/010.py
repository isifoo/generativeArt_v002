"""010: Engraver's hatching. Evenly spaced streamlines (Jobard & Lefer 1997) over a heavily smoothed
direction field: every new line is seeded exactly one spacing from an existing line and stops when it comes
closer than `dtest` x spacing to another, so neighbours stay parallel. Tone comes only from line WIDTH
(from the 009 darkness/detail field); where the image is white the line simply vanishes.
011 and 012 import this file and change only the direction field and spacing."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, importlib.util
from collections import deque
here = os.path.dirname(os.path.abspath(__file__))

P = dict(field='global', sig=60.0, global_w=4.0, dsep=7.0, dtest=0.6, step=1.0, maxturn=0.25, minlen=20,
         tone_lo=0.06, tone_hi=0.65, gamma=0.8, wfill=0.7, tone_win=21, minrun=16, wmin=0.6, guide_w=0.4, save=0)
if __name__ == '__main__' and len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def load(name):
    spec = importlib.util.spec_from_file_location('v' + name, os.path.join(here, name + '.py'))
    m = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(m); sys.argv = a; return m

def direction_field(I, P):
    """Returns doubled-angle field (c2, s2) = (cos 2theta, sin 2theta) of the line direction, smoothed."""
    if P['field'] == 'flow':     # fully follow the local flow (as 003)
        tx, ty, coh, _ = lib.multiscale_etf(I, 2.0, P.get('sigs', (8.0, 24.0)))
        th = np.arctan2(ty, tx)
        return np.cos(2 * th), np.sin(2 * th)
    E, F, G = lib.tensor(I, 2.0, P['sig'])
    tr = (E + G).mean() + 1e-9
    E, F, G = E / tr, F / tr, G / tr
    if P['field'] == 'global':   # one dominant direction for the whole picture, bent gently by the face
        Eg, Fg, Gg = E.mean(), F.mean(), G.mean()
        E, F, G = E + P['global_w'] * Eg, F + P['global_w'] * Fg, G + P['global_w'] * Gg
    tx, ty, coh, _ = lib.tangent_from_tensor(E, F, G)
    th = np.arctan2(ty, tx)
    c2, s2 = lib.blur(np.cos(2 * th), 6.0), lib.blur(np.sin(2 * th), 6.0)
    return c2, s2

def tone_field(I, P):
    v8 = load('008'); v3 = v8.v3
    tx, ty, coh, _ = lib.multiscale_etf(I, 2.0, v3.P['sigs'])
    Dk = lib.flow_conv(1 - lib.blur(I, v3.P['dens_blur']), tx, ty, v3.P['lic'], sigma=v3.P['lic'] / 1.5)
    lines = np.load(os.path.join(lib.LAB, 'work/fdog001.npy'))
    Dk = np.maximum(Dk, P['guide_w'] * np.clip(lib.blur(lines, 2.5) * 2.0, 0, 1))
    Dk[:, :4] = 0; Dk[:, lib.BORDER_X - 2:] = 0   # camera border artefacts
    return np.clip((Dk - P['tone_lo']) / (P['tone_hi'] - P['tone_lo']), 0, 1) ** P['gamma']

def even_streamlines(c2, s2, P):
    h, w = c2.shape
    C2 = c2.tolist(); S2 = s2.tolist()
    dsep = P['dsep']; dtest = P['dtest'] * dsep; cell = dsep
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
    def trace(sx, sy, lid):
        halves = []
        d0 = dirat(sx, sy); cmax = math.cos(P['maxturn'])
        for sgn in (1, -1):
            x, y = sx, sy; dx, dy = sgn * d0[0], sgn * d0[1]; pts = []
            for _ in range(4000):
                tx_, ty_ = dirat(x, y)
                if tx_ * dx + ty_ * dy < 0: tx_, ty_ = -tx_, -ty_
                if tx_ * dx + ty_ * dy < cmax: break          # singularity / sharp bend
                dx, dy = tx_, ty_
                nx, ny = x + P['step'] * dx, y + P['step'] * dy
                if nx < 0 or ny < 0 or nx > w - 1.001 or ny > h - 1.001: break
                if near(nx, ny, dtest, lid): break               # too close to another line
                x, y = nx, ny; pts.append((x, y))
            halves.append(pts)
        return halves[1][::-1] + [(sx, sy)] + halves[0]
    lines = []
    def add(pts):
        lid = len(lines); lines.append(pts)
        for (x, y) in pts: grid.setdefault((int(x // cell), int(y // cell)), []).append((x, y, lid))
        return lid
    queue = deque()
    # start from the centre, then fall back to a coarse grid of seeds for regions the front never reaches
    fallback = [(w / 2, h / 2)] + [(x + 0.5, y + 0.5) for y in np.arange(dsep, h - 1, dsep * 6) for x in np.arange(dsep, w - 1, dsep * 6)]
    fi = 0
    while True:
        if not queue:
            while fi < len(fallback) and near(*fallback[fi], dsep): fi += 1
            if fi >= len(fallback): break
            pts = trace(*fallback[fi], len(lines)); fi += 1
            if len(pts) >= P['minlen']: queue.append(add(pts))
            continue
        lid = queue.popleft(); pts = lines[lid]
        k = max(1, int(dsep / 2))
        for i in range(0, len(pts), k):
            x, y = pts[i]
            j0, j1 = max(i - 1, 0), min(i + 1, len(pts) - 1)
            tx_, ty_ = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]; n = math.hypot(tx_, ty_) + 1e-9
            nx_, ny_ = -ty_ / n, tx_ / n
            for sgn in (1, -1):
                sx, sy = x + sgn * dsep * nx_, y + sgn * dsep * ny_
                if sx < 0 or sy < 0 or sx > w - 1.001 or sy > h - 1.001: continue
                if near(sx, sy, dsep * 0.95): continue
                newpts = trace(sx, sy, len(lines))
                if len(newpts) >= P['minlen']: queue.append(add(newpts))
    return [np.array(p) for p in lines]

def render(lines, tone, P):
    cv = lib.Canvas(2); wmax = P['wfill'] * P['dsep']; nseg = 0
    for p in lines:
        t = lib.bilinear(tone, p[:, 0], p[:, 1])
        k = P['tone_win']; t = np.convolve(np.pad(t, k // 2, mode='edge'), np.ones(k) / k, 'valid')
        on = t > 0.03
        # draw each inked run separately; width tapers to nothing where tone fades
        d = np.diff(np.concatenate([[0], on.astype(np.int8), [0]]))
        for a, b in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]):
            if b - a < P['minrun']: continue   # no specks: short inked runs are dropped
            wd = P['wmin'] * np.minimum(1, t[a:b] / 0.15) + (wmax - P['wmin']) * t[a:b]
            cv.stroke_ribbon(p[a:b], wd); nseg += 1
    print('lines', len(lines), 'inked runs', nseg)
    return cv.ink()

def run(P, field_fn=None):
    I = lib.load_input()
    c2, s2 = direction_field(I, P)
    if field_fn is not None: c2, s2 = field_fn(I, c2, s2, P)   # swirl hooks (013+)
    lines = even_streamlines(c2, s2, P)
    return render(lines, tone_field(I, P), P)

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('010', img, 'Engraver hatching: one global direction',
            "Replaces 008/009's free tracing with evenly spaced streamlines (Jobard and Lefer): each line is seeded exactly 7 px from an existing one and stops when it comes within 0.6 x 7 px of another, so neighbours stay parallel and never cross. The direction is one dominant direction for the whole picture (near vertical), bent only gently by a very smooth field (sigma 60), so this is the strictest version. Tone comes only from line width, taken from 009's darkness-and-detail map; a line vanishes where the image is white. Look at the beard, neck curve and shoulders: they read well and Hit is 82% with 1% noise. Weakness: horizontal features (brows, eyes, mouth) are drawn with near-vertical lines, so the face reads less clearly than in 008; the left shirt breaks into short dashes; a few lines fan out where the field turns at the top of the head.",
            {'Method': 'evenly spaced streamlines (Jobard-Lefer) on a global + sigma-60 structure-tensor field; width = tone from 009 field (LIC dot density + 0.4 x FDoG lines); runs < 16 px dropped',
             'Key settings': f"field {P['field']} (global weight {P['global_w']}, sigma {P['sig']}), spacing {P['dsep']} px, stop at {P['dtest']} x spacing, max turn {P['maxturn']} rad/px, tone {P['tone_lo']}-{P['tone_hi']} gamma {P['gamma']}, max width {P['wfill']} x spacing, tone smoothing {P['tone_win']} px, min run {P['minrun']} px"},
            'Lines are fixed (the field barely changes), so trace them once on the CPU and keep them as a mesh; per frame only the width is sampled from the live darkness texture in a vertex/fragment shader: GPU, 30 fps')
    else:
        img.save(os.path.join(lib.LAB, 'work/010-try.png')); print(lib.score(img))
