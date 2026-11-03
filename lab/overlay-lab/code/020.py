"""020: 016, cleaned up. Eddies only where the picture has tone (none in white or empty areas), spirals only
on real features near the face (eyes, nostril, ear, beard tufts; not the photo corners or shirt speckle),
and longer width smoothing + longer minimum ink run so the speckled shirt makes fewer dashes.
021-023 import this file and change only the swirl amounts / add eye rays."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, swirl, zones as Z, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v016', os.path.join(here, '016.py'))
v16 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v16); sys.argv = a
v10 = v16.v10

P = dict(v16.P)
P.update(tone_win=31, minrun=24,                       # 016: 21, 16  (fewer dashes)
         eddy_mask=True, mask_blur=30.0, mask_lo=0.05, mask_hi=0.20,
         feat_only=True, feat_reach=3.2, feat_above=1.3,  # keep centres within 3.2 d of the eyes, not above 1.3 d over them
         eye_rays=0.0, ray_feather=14.0, save=0)
if __name__ == '__main__' and len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def centres(I, P):
    cs = swirl.feature_centres(I, max_n=40)
    le, re = Z.find_eyes(cs, I.shape[0])
    m = ((le[0] + re[0]) / 2, (le[1] + re[1]) / 2); d = math.hypot(re[0] - le[0], re[1] - le[1])
    if P['feat_only']:
        cs = [c for c in cs if math.hypot(c[0] - m[0], c[1] - m[1]) < P['feat_reach'] * d and c[1] > m[1] - P['feat_above'] * d]
    return cs[:P['n_centres']], le, re, d

def field_fn(I, c2, s2, P):
    cs, le, re, d = centres(I, P)
    print('centres', len(cs), [(int(x), int(y)) for x, y, _ in cs])
    mask = None
    if P['eddy_mask']:
        T = 1 - lib.blur(I, P['mask_blur'])
        mask = np.clip((T - P['mask_lo']) / (P['mask_hi'] - P['mask_lo']), 0, 1)
    c2, s2 = swirl.curl_noise(I, c2, s2, P['curl'], P['curl_scale'], mask=mask)
    c2, s2 = swirl.vortex(I, c2, s2, cs, P['strength'], P['radius'], P['pitch'])
    if P['eye_rays'] > 0:   # small sunbursts right around the eye centres, blended into the swirl
        h, w = I.shape; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        for e in (le, re):
            wt = Z.soft_ellipse(xx, yy, e, P['eye_rays'] * d * 1.25, P['eye_rays'] * d, P['ray_feather'])
            ang = Z.pat_radial(xx, yy, e)
            c2 = (1 - wt) * c2 + wt * np.cos(2 * ang); s2 = (1 - wt) * s2 + wt * np.sin(2 * ang)
        n = np.sqrt(c2 * c2 + s2 * s2) + 1e-9; c2, s2 = c2 / n, s2 / n
    return c2, s2

KEYS = ['curl', 'curl_scale', 'strength', 'radius', 'pitch', 'n_centres', 'maxturn', 'tone_win', 'minrun', 'eddy_mask', 'feat_only', 'eye_rays']
NEW = {'eddy_mask': 'eddies only where there is tone: off -> on', 'feat_only': 'spirals only on features near the face: off -> on'}
def changed(P):
    out = []
    for k in KEYS:
        if k in NEW: out.append(NEW[k]) if P[k] else None
        elif k == 'eye_rays': out.append(f"eye rays off -> {P[k]} eye-distances") if P[k] else None
        elif v16.P.get(k) != P[k]: out.append(f"{k} {v16.P.get(k)} -> {P[k]}")
    return ', '.join(out)

def main(vid, P, title=None, notes=None, live=None):
    img = lib.to_img(v10.run(P, field_fn))
    if P['save']:
        lib.save_version(vid, img, title, notes,
            {'Method': '016 (011 engraver streamlines + feature spirals + curl-noise eddies), see changes',
             'Changes from 016': changed(P),
             'Key settings': f"curl {P['curl']} deg, eddy size {P['curl_scale']} px, eddies masked to tone {P['eddy_mask']}, spirals: {P['n_centres']} max, strength {P['strength']}, reach {P['radius']} px, pitch {P['pitch']} deg, eye rays {P['eye_rays']} d; max turn {P['maxturn']}, spacing {P['dsep']} px, width smoothing {P['tone_win']} px, min ink run {P['minrun']} px"},
            live or 'Field on the GPU (noise texture, tone mask, blob detector and spiral sum are per-pixel); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
    else:
        img.save(os.path.join(lib.LAB, f'work/{vid}-try.png')); print(lib.score(img))

if __name__ == '__main__':
    main('020', P, 'Like 016, but swirl only where it belongs',
         "016 with three clean-ups. Eddies only where the picture has tone: the curl-noise rotation is multiplied by a soft mask of darkness blurred over 30 px, so white areas and the empty shirt stay calm. Spirals only on real features: centres must be within 3.2 eye-distances of the eyes and not more than 1.3 eye-distances above them, which drops the photo corners and the shirt speckle and keeps eyes, nostril, ear and beard tufts. Fewer dashes: width smoothing along each line 21 -> 31 px and minimum ink run 16 -> 24 px. All swirl amounts are unchanged from 016. Compared with 016: the photo corners and the lower-left shirt no longer have whirls, the shirt shows longer, calmer lines with fewer dashes, and noise drops from 2% to 1% (Hit 84%). Weakness: the eddies still cover the whole shirt (it all has some tone), and two leftover spirals sit on the background edge at far left and on the right shoulder edge.")
