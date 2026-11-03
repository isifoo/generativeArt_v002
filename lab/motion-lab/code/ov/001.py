"""001: Edge tangent flow (structure tensor) + flow-based DoG (Kang, Lee, Chui 2007)."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib

P = dict(pre=1.5, etf_sig=10.0, sc=2.0, rho=0.99, sm=6.0, tau=0.35, minspeck=40)
if __name__ == '__main__' and len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def fdog(I, tx, ty, sc, rho, sm):
    h, w = I.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    gx, gy = -ty, tx  # gradient direction = perpendicular to tangent
    ss = 1.6 * sc; T = int(np.ceil(3 * ss))
    t = np.arange(-T, T + 1, dtype=np.float32)
    f = np.exp(-t * t / (2 * sc * sc)) / (np.sqrt(2 * np.pi) * sc) - rho * np.exp(-t * t / (2 * ss * ss)) / (np.sqrt(2 * np.pi) * ss)
    F = np.zeros_like(I)
    for ti, fi in zip(t, f):
        F += fi * lib.bilinear(I, xs + ti * gx, ys + ti * gy)
    # integrate along flow curves
    S = int(np.ceil(3 * sm)); acc = F.copy(); wsum = np.ones_like(I)
    for sgn in (1, -1):
        x, y = xs.copy(), ys.copy(); dx, dy = sgn * tx, sgn * ty
        for s in range(1, S + 1):
            x = x + dx; y = y + dy
            ntx = lib.bilinear(tx, x, y); nty = lib.bilinear(ty, x, y)
            n = np.sqrt(ntx * ntx + nty * nty) + 1e-9; ntx /= n; nty /= n
            sg = np.sign(ntx * dx + nty * dy); sg[sg == 0] = 1
            dx, dy = sg * ntx, sg * nty
            wgt = np.exp(-s * s / (2 * sm * sm))
            acc += wgt * lib.bilinear(F, x, y); wsum += wgt
    return acc / wsum

def run(P):
    I = lib.load_input()
    tx, ty, coh, _ = lib.etf(I, P['pre'], P['etf_sig'])
    Ib = lib.blur(I, 0.8)
    H = fdog(Ib, tx, ty, P['sc'], P['rho'], P['sm'])
    # Kang threshold: black where H < 0 and 1 + tanh(H) < tau  (scale H to unit-ish range)
    Hn = H / (np.abs(H).std() + 1e-9)
    val = np.where(Hn < 0, 1 + np.tanh(Hn), 1.0)
    ink = np.clip((P['tau'] - val) / 0.08 + 0.5, 0, 1)
    m = lib.remove_small(ink > 0.5, P['minspeck'])
    ink = ink * lib.dilate(m, 1)
    return ink

if __name__ == '__main__':
    ink = run(P)
    img = lib.to_img(ink)
    lib.save_version('001', img, 'Flow lines (ETF + FDoG)',
        "Finds the dominant direction at every point (edge tangent flow from a smoothed structure tensor), then runs a Kang-style flow-based difference of Gaussians along it. The specks are gone and the main forms (head, ear, brows, eye bags, neck curve, shirt folds) become clean continuous lines. Weakness: it is an edge finder, so thick darks turn into double outlines (the neck curve, the head) and the beard and shirt still read as many short dashes rather than long strokes.",
        {'Method': 'structure-tensor ETF, flow-based DoG, tanh threshold, specks < 40 px removed',
         'Key settings': f"ETF sigma {P['etf_sig']}, DoG sigma {P['sc']}, rho {P['rho']}, flow sigma {P['sm']}, tau {P['tau']}"},
        'GPU, 4 passes (tensor, tensor blur x2 separable, FDoG across + along flow); real time at full res')
