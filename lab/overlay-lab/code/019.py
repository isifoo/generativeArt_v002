"""019: Zoned engraving C - the halo: everything outside the man radiates from the face like rays,
eyes and nostril radiate too, the beard falls straight, the shoulders sweep at 45 deg, the skull follows the flow."""
import sys, os, math; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, zones as Z, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v018', os.path.join(here, '018.py'))
v18 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v18); sys.argv = a
v17 = v18.v17; v10 = v17.v10
P = dict(v17.P); P.update(save=0, diag=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
F = lambda: P['feather']
FC = lambda G: (G['m'][0], G['m'][1] + 0.3 * G['d'])   # face centre

LAYOUT = [
    ('halo',      lambda x, y, G: Z.pat_radial(x, y, FC(G)),              lambda x, y, G: np.ones(x.shape, np.float32)),
    ('left shoulder',  v18.shoulder(-1),                                   lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0] - 2.0 * G['d'], G['m'][1] + 1.7 * G['d']), 1.4 * G['d'], 1.1 * G['d'], 2 * F())),
    ('right shoulder', v18.shoulder(1),                                    lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0] + 1.9 * G['d'], G['m'][1] + 1.7 * G['d']), 1.3 * G['d'], 1.1 * G['d'], 2 * F())),
    ('skull',     'flow',                                                  lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] - 0.8 * G['d']), 1.3 * G['d'], 1.35 * G['d'], F())),
    ('beard',     lambda x, y, G: Z.pat_const(x, y, 90),                  lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] + 1.6 * G['d']), 1.05 * G['d'], 0.85 * G['d'], F())),
    ('face',      'flow',                                                  lambda x, y, G: Z.soft_ellipse(x, y, (G['m'][0], G['m'][1] + 0.3 * G['d']), 0.95 * G['d'], 0.55 * G['d'], F())),
    ('nose',      lambda x, y, G: Z.pat_radial(x, y, G['nose']),          lambda x, y, G: Z.soft_ellipse(x, y, G['nose'], 0.28 * G['d'], 0.28 * G['d'], 0.6 * F())),
    ('left eye',  lambda x, y, G: Z.pat_radial(x, y, G['le']),            lambda x, y, G: Z.soft_ellipse(x, y, G['le'], 0.45 * G['d'], 0.35 * G['d'], 0.6 * F())),
    ('right eye', lambda x, y, G: Z.pat_radial(x, y, G['re']),            lambda x, y, G: Z.soft_ellipse(x, y, G['re'], 0.45 * G['d'], 0.35 * G['d'], 0.6 * F())),
]
NAMES = {'halo': 'radial rays from the face', 'left shoulder': '45 deg curved sweep', 'right shoulder': '45 deg curved sweep', 'skull': 'flow-following (011)',
         'beard': 'vertical straight', 'face': 'flow-following (011)', 'nose': 'radial rays', 'left eye': 'radial rays', 'right eye': 'radial rays'}

if __name__ == '__main__':
    diag = os.path.join(lib.LAB, 'work/019-zones.png') if P['diag'] else None
    img = lib.to_img(v10.run(P, v17.make_field_fn(LAYOUT, NAMES, diag)))
    if P['save']:
        lib.save_version('019', img, 'Zones C: halo of rays, sunburst eyes', "A third assignment: everything outside the man (wall, photo, lower shirt) radiates from the centre of the face like a halo; left and right shoulders -> 45 deg curved sweeps; skull and face band -> flow-following (011); beard -> vertical straight; nostril and each eye -> radial rays (sunbursts). It has the best Hit of all versions (85%, noise 3%), and the eyes and nose read as small starbursts in a straight-combed beard. Weaknesses: the halo only shows where there is tone, so on the white wall it is invisible and in the photo it reads as fanned diagonal lines; the zone borders leave visible seams on the left of the head and at the photo's lower edge.",
            {'Method': 'zone masks from detected eyes + nose; per-zone pattern fields composited over the 011 flow; evenly spaced streamlines; width = tone', 'Key settings': f"zone feather {P['feather']} px (eyes/nose 0.6x, shoulders/shirt 2x); sizes in eye distances d = 205 px; spacing {P['dsep']} px, max turn {P['maxturn']} rad/px, base field sigma {P['sig']}"}, 'Zones and field on the GPU (per-pixel masks and patterns); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
        import json
        from PIL import Image
        Image.open(os.path.join(lib.LAB, 'work/019-zones.png')).convert('RGB').save(os.path.join(lib.LAB, 'img/019z.webp'), quality=88)
        vp = os.path.join(lib.LAB, 'versions.json'); vs = [e for e in json.load(open(vp)) if e['id'] != '019z']
        vs.append({'id': '019z', 'file': 'img/019z.webp', 'title': 'Zone map for 019 (diagnostic)',
                   'notes': 'Not a drawing: the zones used by 019 in colour, labelled with their patterns, with ticks showing the final line direction every 24 px and red dots at the detected eyes and nostril. Borders are soft in the real field.',
                   'params': {'Hit': 'n/a', 'Noise': 'n/a', 'Ink': 'n/a', 'Method': 'diagnostic of the 019 field', 'Key settings': 'as 019', 'Live in the app': 'debug view only'}, 'inApp': ''})
        vs.sort(key=lambda e: e['id']); json.dump(vs, open(vp, 'w'), indent=1)
    else: img.save(os.path.join(lib.LAB, 'work/019-try.png')); print(lib.score(img))
