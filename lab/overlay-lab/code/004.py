"""004: Calligraphic strokes. Pass 1 traces 003-style streamlines; their centrelines are splatted into a
stroke field and blurred, so parallel close strokes fuse; pass 2 re-traces that field with wider spacing
(the merged strokes) and draws them with a flat-nib brush (width depends on stroke angle)."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib
import importlib.util
spec = importlib.util.spec_from_file_location('v003', os.path.join(os.path.dirname(os.path.abspath(__file__)), '003.py'))
v3 = importlib.util.module_from_spec(spec); sys.argv_backup = sys.argv; sys.argv = sys.argv[:1]; spec.loader.exec_module(v3); sys.argv = sys.argv_backup

P = dict(merge_blur=3.0, seed2=0.30, stop2=0.08, dsep2=9.0, maxlen2=400, minlen2=30, maxturn2=0.30,
         nib_angle=35.0, link_dist=16.0, link_ang=0.5, gap=6, w_thin=0.9, w_broad=6.5, save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def run(P, fill=None, field=None, extra=None):
    rng = np.random.default_rng(11)
    I = lib.load_input()
    tx, ty, coh, _ = lib.multiscale_etf(I, 2.0, v3.P['sigs'])
    if field is not None: field.update(tx=tx, ty=ty, coh=coh)
    Dk = lib.flow_conv(1 - lib.blur(I, v3.P['dens_blur']), tx, ty, v3.P['lic'], sigma=v3.P['lic'] / 1.5)
    if extra is not None: Dk = np.maximum(Dk, extra)   # extra guide (e.g. FDoG line map), used by 007+
    P1 = dict(v3.P); P1.update(P.get('p1', {}))
    s1 = v3.trace_all(Dk, tx, ty, coh, P1, rng, fill)
    # splat centrelines weighted by local darkness, then blur: parallel neighbours fuse into one ridge
    S = np.zeros_like(I)
    for p in s1:
        xi = np.clip(np.rint(p[:, 0]).astype(int), 0, I.shape[1] - 1); yi = np.clip(np.rint(p[:, 1]).astype(int), 0, I.shape[0] - 1)
        np.add.at(S, (yi, xi), 0.5 + Dk[yi, xi])
    S = lib.blur(S, P['merge_blur'])
    S = lib.flow_conv(S, tx, ty, 10, sigma=7)
    S = S / np.percentile(S[S > 1e-4], 95)
    P2 = dict(v3.P); P2.update(gap=P['gap'], seed_thr=P['seed2'], stop_thr=P['stop2'], dsep=P['dsep2'], maxlen=P['maxlen2'], minlen=P['minlen2'], maxturn=P['maxturn2'])
    s2 = v3.trace_all(S, tx, ty, coh, P2, rng, fill)
    n0 = len(s2)
    s2 = lib.link_paths(s2, P['link_dist'], P['link_ang'])
    print('linked', n0, '->', len(s2))
    print('pass1', len(s1), 'pass2', len(s2), 'mean len', np.mean([len(s) for s in s2]))
    cv = lib.Canvas(3)
    phi = math.radians(P['nib_angle'])
    for p in s2:
        p = v3.smooth_path(p, 9)
        L = len(p); u = np.arange(L) / (L - 1)
        d = np.gradient(p, axis=0); th = np.arctan2(d[:, 1], d[:, 0])
        nib = np.abs(np.sin(th - phi))  # broad when moving across the nib
        strength = np.clip(lib.bilinear(S, p[:, 0], p[:, 1]), 0, 1.2)
        strength = np.convolve(np.pad(strength, 8, mode='edge'), np.ones(17) / 17, 'valid')
        wd = P['w_thin'] + (P['w_broad'] - P['w_thin']) * nib * (0.45 + 0.55 * np.minimum(strength, 1))
        prof = np.clip(np.minimum(u / 0.12, (1 - u) / 0.25), 0, 1) ** 0.6
        cv.stroke_ribbon(p, np.maximum(wd * (0.25 + 0.75 * prof), 0.4))
    return cv.ink()

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('004', img, 'Calligraphic flat brush, merged strokes',
            "Traces strokes as in 003, then fuses strokes that run close and parallel (their centre lines are splatted, blurred across and along the flow, and re-traced at wider spacing). The merged strokes are drawn in solid ink with a flat nib held at 35 degrees, so they swell on down-strokes and go hairline on the cross-strokes. Stroke ends that face each other across a small gap are joined, so the neck curve, head outline and shirt folds become long single sweeps (about 100 px average, up to 400). Clearly better than 003: fewer, longer, bolder marks with no specks. Weakness: the nib angle is fixed, so horizontal features like the brows and mouth line come out thin, and fusing loses some fine hair detail.",
            {'Method': '003 streamlines -> centreline splat + blur + LIC (merge) -> second streamline pass with 6-step gap bridging -> end-to-end linking -> flat-nib ribbons',
             'Key settings': f"merge blur {P['merge_blur']} px, pass-2 seed {P['seed2']} / stop {P['stop2']}, spacing {P['dsep2']} px, max length {P['maxlen2']} px, link ends within {P['link_dist']} px / {P['link_ang']} rad, nib {P['nib_angle']} deg, width {P['w_thin']}-{P['w_broad']} px"},
            'CPU at half resolution, 1-2 per second (two tracing passes); field passes on GPU; or keep strokes from frame to frame and re-trace a few per frame')
    else:
        img.save(os.path.join(lib.LAB, 'work/004-try.png')); print(lib.score(img))
