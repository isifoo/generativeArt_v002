"""018: Zoned engraving B - the swirling assignment: vertical photo and shirt, 45 deg sweeps on the
shoulders, a spiral on the skull, a curling beard, ripple rings around the eyes."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, zones as Z, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v017', os.path.join(here, '017.py'))
v17 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v17); sys.argv = a
v10 = v17.v10
P = dict(v17.P); P.update(save=0, diag=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
F = lambda: P['feather']

def shoulder(sign):   # 45 deg sweep, bending a little steeper toward the outside
    def pat(x, y, G):
        return np.full(x.shape, math.radians(90 - sign * 45), np.float32) - sign * np.radians(15) * np.clip((x - G['m'][0]) * sign / (2.2 * G['d']), 0, 1)
    return pat

LAYOUT = [
    ('shirt',     lambda x, y, G: Z.pat_const(x, y, 90),                 lambda x, y, G: Z.soft_step(y, G['m'][1] + 1.3 * G['d'], 2 * F())),
    ('left shoulder',  shoulder(-1),                                      lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0] - 2.0 * G['d'], G['m'][1] + 1.6 * G['d']), 1.3 * G['d'], 0.9 * G['d'], 2 * F())),
    ('right shoulder', shoulder(1),                                       lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0] + 1.9 * G['d'], G['m'][1] + 1.6 * G['d']), 1.2 * G['d'], 0.9 * G['d'], 2 * F())),
    ('skull',     lambda x, y, G: Z.pat_spiral(x, y, (G['m'][0] + 0.15 * G['d'], G['m'][1] - 0.9 * G['d']), 30),
                                                                          lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] - 0.8 * G['d']), 1.3 * G['d'], 1.35 * G['d'], F())),
    ('photo',     lambda x, y, G: Z.pat_const(x, y, 90),                 lambda x, y, G: Z.soft_step(-y, -(G['m'][1] - 2.3 * G['d']), F())),
    ('beard',     lambda x, y, G: Z.pat_spiral(x, y, (G['m'][0], G['m'][1] + 1.75 * G['d']), 40),
                                                                          lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] + 1.6 * G['d']), 1.05 * G['d'], 0.8 * G['d'], F())),
    ('face',      'flow',                                                 lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] + 0.4 * G['d']), 0.95 * G['d'], 0.6 * G['d'], F())),
    ('left eye',  lambda x, y, G: Z.pat_rings(x, y, G['le']),            lambda x, y, G: Z.soft_ellipse(x, y, G['le'], 0.42 * G['d'], 0.32 * G['d'], 0.6 * F())),
    ('right eye', lambda x, y, G: Z.pat_rings(x, y, G['re']),            lambda x, y, G: Z.soft_ellipse(x, y, G['re'], 0.42 * G['d'], 0.32 * G['d'], 0.6 * F())),
]
NAMES = {'shirt': 'vertical straight', 'left shoulder': '45 deg curved sweep', 'right shoulder': '45 deg curved sweep', 'skull': 'spiral (pitch 30)',
         'photo': 'vertical straight', 'beard': 'spiral curl (pitch 40)', 'face': 'flow-following (011)', 'left eye': 'concentric rings', 'right eye': 'concentric rings'}

if __name__ == '__main__':
    diag = os.path.join(lib.LAB, 'work/018-zones.png') if P['diag'] else None
    img = lib.to_img(v10.run(P, v17.make_field_fn(LAYOUT, NAMES, diag)))
    if P['save']:
        lib.save_version('018', img, 'Zones B: ripples at the eyes, curling beard', "A second zone assignment on the same automatic layout (eyes, nostril, eye distance d). Zone -> pattern: shirt -> vertical straight; left and right shoulders -> 45 deg curved sweeps (mirrored, steepening 15 deg toward the outside); skull -> open spiral (pitch 30 deg) around the crown; photo -> vertical straight; beard -> spiral curl (pitch 40 deg) around the chin; face band -> flow-following (011); each eye -> concentric rings. The eyes become ripple targets, the beard curls in one big whirl, and the shirt and photo turn into straight vertical engraving, so the picture has clear contrasts of pattern. Hit 83%, noise 2%. Weaknesses: the ring eyes look a little staring and mechanical, the shirt's vertical lines break into dashes over the speckled areas, and there are small seams (short cross-hatches) where the photo meets the skull.",
            {'Method': 'zone masks from detected eyes + nose; per-zone pattern fields composited over the 011 flow; evenly spaced streamlines; width = tone', 'Key settings': f"zone feather {P['feather']} px (eyes/nose 0.6x, shoulders/shirt 2x); sizes in eye distances d = 205 px; spacing {P['dsep']} px, max turn {P['maxturn']} rad/px, base field sigma {P['sig']}"}, 'Zones and field on the GPU (per-pixel masks and patterns); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
        import json
        from PIL import Image
        Image.open(os.path.join(lib.LAB, 'work/018-zones.png')).convert('RGB').save(os.path.join(lib.LAB, 'img/018z.webp'), quality=88)
        vp = os.path.join(lib.LAB, 'versions.json'); vs = [e for e in json.load(open(vp)) if e['id'] != '018z']
        vs.append({'id': '018z', 'file': 'img/018z.webp', 'title': 'Zone map for 018 (diagnostic)',
                   'notes': 'Not a drawing: the zones used by 018 in colour, labelled with their patterns, with ticks showing the final line direction every 24 px and red dots at the detected eyes and nostril. Borders are soft in the real field.',
                   'params': {'Hit': 'n/a', 'Noise': 'n/a', 'Ink': 'n/a', 'Method': 'diagnostic of the 018 field', 'Key settings': 'as 018', 'Live in the app': 'debug view only'}, 'inApp': ''})
        vs.sort(key=lambda e: e['id']); json.dump(vs, open(vp, 'w'), indent=1)
    else: img.save(os.path.join(lib.LAB, 'work/018-try.png')); print(lib.score(img))
