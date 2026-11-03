"""017: Zoned engraving. The direction field is assembled from zones laid out from the detected eyes,
each with its own line pattern, blended softly (feathered masks, composited in order) so lines bend
from one pattern to the next. Engraver structure as 011: evenly spaced parallel lines, width = tone."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, swirl, zones as Z, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a

P = dict(v10.P); P.update(field='smooth', sig=30.0, dsep=6.0, maxturn=0.4, feather=45.0, save=0, diag=0)
if __name__ == '__main__' and len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
F = lambda: P['feather']

def flow_vortex(xx, yy, G):   # 016-style whirls on the base flow, as an angle field
    c2, s2 = swirl.vortex(None, G['flow'][0], G['flow'][1], G['cs'][:30], 1.5, 65.0, 25.0)
    return 0.5 * np.arctan2(s2, c2)

LAYOUT = [  # (zone, pattern, mask); later entries sit on top
    ('wall',      lambda x, y, G: Z.pat_const(x, y, 90),                          lambda x, y, G: np.clip((0.07 - G['Dbig']) / 0.05, 0, 1)),
    ('shirt',     lambda x, y, G: Z.pat_radial(x, y, (G['m'][0], G['m'][1] + 0.9 * G['d'])) + math.radians(18),
                                                                                    lambda x, y, G: Z.soft_step(y, G['m'][1] + 1.25 * G['d'], 2 * F())),
    ('skull',     lambda x, y, G: Z.pat_rings(x, y, (G['m'][0], G['m'][1] - 0.6 * G['d'])),
                                                                                    lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] - 0.8 * G['d']), 1.3 * G['d'], 1.35 * G['d'], F())),
    ('photo',     flow_vortex,                                                      lambda x, y, G: Z.soft_step(-y, -(G['m'][1] - 2.3 * G['d']), F())),
    ('beard',     lambda x, y, G: Z.pat_const(x, y, 90),                          lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] + 1.6 * G['d']), 1.05 * G['d'], 0.8 * G['d'], F())),
    ('face',      'flow',                                                           lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] + 0.25 * G['d']), 0.95 * G['d'], 0.5 * G['d'], F())),
    ('nose',      lambda x, y, G: Z.pat_radial(x, y, G['nose']),                  lambda x, y, G: Z.soft_ellipse(x, y, G['nose'], 0.28 * G['d'], 0.28 * G['d'], 0.6 * F())),
    ('left eye',  lambda x, y, G: Z.pat_radial(x, y, G['le']),                    lambda x, y, G: Z.soft_ellipse(x, y, G['le'], 0.4 * G['d'], 0.3 * G['d'], 0.6 * F())),
    ('right eye', lambda x, y, G: Z.pat_radial(x, y, G['re']),                    lambda x, y, G: Z.soft_ellipse(x, y, G['re'], 0.4 * G['d'], 0.3 * G['d'], 0.6 * F())),
]
PATTERN_NAMES = {'wall': 'vertical straight', 'shirt': '45 deg curved sweep', 'skull': 'concentric rings', 'photo': 'swirl (016 whirls)',
                 'beard': 'vertical straight', 'face': 'flow-following (011)', 'nose': 'radial rays', 'left eye': 'radial rays', 'right eye': 'radial rays'}

def make_field_fn(layout, names, diag_path=None):
    def fn(I, c2, s2, P):
        C, S, info = Z.build(I, c2, s2, layout)
        if diag_path:
            labels = ['base: flow (011)'] + [f"{n}: {names[n]}" for n in info['names']]
            Z.diagnostic(I, C, S, info, labels, diag_path)
        g = info['G']; print('eyes', g['le'], g['re'], 'nose', g['nose'], 'd', round(g['d']))
        return C, S
    return fn

if __name__ == '__main__':
    diag = os.path.join(lib.LAB, 'work/017-zones.png') if P['diag'] else None
    img = lib.to_img(v10.run(P, make_field_fn(LAYOUT, PATTERN_NAMES, diag)))
    if P['save']:
        lib.save_version('017', img, 'Zones A: rays at the eyes, rings on the skull',
            "The direction field is now assembled from zones laid out automatically from the two eyes and the nostril (found by the blob detector; eye distance d = 205 px sets every zone's size), each with its own pattern, feathered over about 45 px and stacked so lines bend from one pattern into the next. Zone -> pattern: wall (white areas) -> vertical straight; shirt (below 1.25 d under the eyes) -> 45 deg curved sweep (rays from below the nose, turned 18 deg); skull (ellipse above the eyes) -> concentric rings; photo (above the head) -> 016 whirls; beard (ellipse below the nose) -> vertical straight; face band (brows to nose) -> flow-following as 011; nose -> radial rays; each eye -> radial rays. Look at the sunbursts at the eyes and nostril, the straight combed beard and the diagonal shirt sweeps. Hit 84%, noise 3%. Weaknesses: the skull rings hardly show because the skull is white (tone carries ink only where it is dark), the zone ellipses are crude so the beard's straight lines stop short of the jaw, and the eye rays look a little mechanical. The next entry (017z) shows the zone map.",
            {'Method': 'zone masks from detected eyes + nose; per-zone pattern angle fields composited over the 011 flow (doubled-angle mixing); evenly spaced streamlines; width = tone',
             'Key settings': f"zone feather {P['feather']} px (eyes/nose 0.6x), eye zones 0.4 d x 0.3 d, nose 0.28 d, beard ellipse 1.05 d x 0.8 d at 1.6 d below eyes, skull ellipse 1.3 d x 1.35 d, shirt below 1.25 d, sweep twist 18 deg; spacing {P['dsep']} px, max turn {P['maxturn']} rad/px, base field sigma {P['sig']}"},
            'Zones and field on the GPU (eye/nose positions from the blob detector, all masks are per-pixel formulas); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
        import json
        from PIL import Image
        Image.open(os.path.join(lib.LAB, 'work/017-zones.png')).convert('RGB').save(os.path.join(lib.LAB, 'img/017z.webp'), quality=88)
        vp = os.path.join(lib.LAB, 'versions.json'); vs = [v for v in json.load(open(vp)) if v['id'] != '017z']
        vs.append({'id': '017z', 'file': 'img/017z.webp', 'title': 'Zone map for 017 (diagnostic)',
                   'notes': 'Not a drawing: the zones used by 017 in colour, each labelled with its pattern, with short ticks showing the final line direction on a 24 px grid and red dots at the detected eyes and nostril. The colour shows which zone has the largest share at each pixel; borders are actually soft (about 45 px), which is why the ticks turn gradually.',
                   'params': {'Hit': 'n/a', 'Noise': 'n/a', 'Ink': 'n/a', 'Method': 'diagnostic of the 017 field', 'Key settings': 'as 017', 'Live in the app': 'debug view only'}, 'inApp': ''})
        vs.sort(key=lambda v: v['id']); json.dump(vs, open(vp, 'w'), indent=1)
    else: img.save(os.path.join(lib.LAB, 'work/017-try.png')); print(lib.score(img))
