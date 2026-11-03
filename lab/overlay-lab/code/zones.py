"""Zoned direction fields for the engraver hatching (017+). The picture is split into soft zones laid out
from the automatically found eyes (Hessian blob pairs); each zone has its own line pattern, and zones are
composited 'over' each other with soft masks so lines bend smoothly from one pattern to the next."""
import math, numpy as np, lib, swirl
from PIL import Image, ImageDraw, ImageFont

def find_eyes(cs, h):
    """Best pair of blobs side by side (|dy| small, 100-320 px apart) in the middle band of the picture."""
    best = None
    for i, (x1, y1, v1) in enumerate(cs):
        for x2, y2, v2 in cs[i + 1:]:
            dx, dy = abs(x1 - x2), abs(y1 - y2)
            if 100 < dx < 320 and dy < 0.12 * dx and 0.3 * h < (y1 + y2) / 2 < 0.65 * h:
                sc = v1 + v2 - dy / 100
                if best is None or sc > best[0]: best = (sc, (x1, y1), (x2, y2))
    if best is None: raise RuntimeError('no eye pair found')
    a, b = sorted([best[1], best[2]])
    return a, b

def soft_ellipse(xx, yy, c, rx, ry, feather):
    r = np.sqrt(((xx - c[0]) / rx) ** 2 + ((yy - c[1]) / ry) ** 2)       # 1 on the rim
    return np.clip((1 - r) * min(rx, ry) / feather + 0.5, 0, 1)

def soft_step(v, edge, feather):   # 0 below edge, 1 above, ramp of width feather
    return np.clip((v - edge) / feather + 0.5, 0, 1)

# --- pattern angle fields (line direction, radians) ---
def pat_radial(xx, yy, c): return np.arctan2(yy - c[1], xx - c[0])
def pat_rings(xx, yy, c): return pat_radial(xx, yy, c) + math.pi / 2
def pat_spiral(xx, yy, c, pitch_deg): return pat_rings(xx, yy, c) - math.radians(pitch_deg)
def pat_const(xx, yy, deg): return np.full(xx.shape, math.radians(deg), np.float32)

def build(I, flow_c2, flow_s2, layout):
    """layout: list of (name, pattern, mask_fn) applied in order (later = on top).
    pattern(xx, yy, G) -> angle field or 'flow'; mask_fn(xx, yy, G) -> soft weight 0..1.
    Returns c2, s2 and a zone-diagnostic structure."""
    h, w = I.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cs = swirl.feature_centres(I, max_n=40)
    le, re = find_eyes(cs, h)
    m = ((le[0] + re[0]) / 2, (le[1] + re[1]) / 2); d = math.hypot(re[0] - le[0], re[1] - le[1])
    nose_guess = (m[0], m[1] + 0.9 * d)
    nos = min(cs, key=lambda c: (c[0] - nose_guess[0]) ** 2 + (c[1] - nose_guess[1]) ** 2)
    G = dict(le=le, re=re, m=m, d=d, nose=(nos[0], nos[1]), Dbig=1 - lib.blur(I, 25.0), cs=cs, flow=(flow_c2, flow_s2))
    C, S = flow_c2.copy(), flow_s2.copy()
    eff = []; total_above = np.ones_like(C)
    masks = []
    for name, pat, mfn in layout:
        wt = mfn(xx, yy, G).astype(np.float32)
        if isinstance(pat, str) and pat == 'flow': pc, ps = flow_c2, flow_s2
        else:
            a = pat(xx, yy, G); pc, ps = np.cos(2 * a), np.sin(2 * a)
        C = (1 - wt) * C + wt * pc; S = (1 - wt) * S + wt * ps
        masks.append(wt)
    # effective share of each zone in the final field (for the diagnostic map)
    above = np.ones_like(C)
    for wt in reversed(masks):
        eff.insert(0, wt * above); above = above * (1 - wt)
    base_share = above
    n = np.sqrt(C * C + S * S) + 1e-9
    return C / n, S / n, dict(G=G, eff=eff, base=base_share, names=[l[0] for l in layout])

PALETTE = [(120, 170, 230), (240, 170, 90), (150, 210, 140), (230, 120, 150), (180, 140, 220), (250, 220, 90),
           (110, 200, 200), (240, 130, 90), (200, 200, 200), (160, 110, 80), (90, 150, 110), (230, 90, 200)]

def diagnostic(I, c2, s2, info, labels, path):
    """Zones in colour (by largest effective share), field ticks, centres and pattern labels."""
    h, w = I.shape
    stack = np.stack([info['base']] + info['eff'])
    arg = stack.argmax(0)
    cols = np.array([(235, 235, 235)] + PALETTE[:len(info['eff'])], np.uint8)
    rgb = cols[arg].astype(np.float32)
    rgb = rgb * (0.55 + 0.45 * I[..., None])            # faint input underneath
    im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8)); dr = ImageDraw.Draw(im)
    a = 0.5 * np.arctan2(s2, c2)
    for y in range(12, h, 24):
        for x in range(12, w, 24):
            dx, dy = 9 * math.cos(a[y, x]), 9 * math.sin(a[y, x])
            dr.line((x - dx, y - dy, x + dx, y + dy), fill=(30, 30, 30), width=2)
    try: font = ImageFont.load_default(size=26)
    except Exception: font = ImageFont.load_default()
    G = info['G']
    for c in (G['le'], G['re'], G['nose']):
        dr.ellipse((c[0] - 7, c[1] - 7, c[0] + 7, c[1] + 7), fill=(200, 0, 0))
    for k in range(len(info['eff']) + 1):
        sel = arg == k
        if sel.sum() < 500: continue
        ys, xs = np.nonzero(sel); i = len(ys) // 2
        o = np.argsort(ys); y0, x0 = ys[o[len(o) // 2]], int(np.median(xs[ys == ys[o[len(o) // 2]]]))
        text = labels[k]
        dr.text((x0, y0), text, fill=(0, 0, 0), font=font, anchor='mm', stroke_width=4, stroke_fill=(255, 255, 255))
    im.save(path, quality=88)
