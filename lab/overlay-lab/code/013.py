"""013: Swirl (a) - vortices. 011's engraver hatching, with a spiral flow added around detected dark
features (eyes, nostrils, beard tufts, ear, photo corners), so lines curl around them."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, swirl, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a

BASE = dict(field='smooth', sig=30.0, dsep=6.0)          # = 011
SWIRL = dict(n_centres=30, strength=1.5, radius=45.0, pitch=25.0, maxturn=0.35)
P = dict(v10.P); P.update(BASE); P.update(SWIRL); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def field_fn(I, c2, s2, P):
    cs = swirl.feature_centres(I, max_n=P['n_centres'])
    return swirl.vortex(I, c2, s2, cs, P['strength'], P['radius'], P['pitch'])

if __name__ == '__main__':
    img = lib.to_img(v10.run(P, field_fn))
    if P['save']:
        lib.save_version('013', img, 'Swirl (a): small vortices at features',
            "011's engraver hatching (evenly spaced, never crossing, width carries tone), with a spiral flow added around 30 automatically detected dark spots: the eyes, nostrils, beard tufts, ear, the woman's eye and the photo corners (found with a Hessian blob detector, so lines are not picked up as spots). Lines now curl into small whirls at the eyes, under the nose and in the beard, and bend into the ear, while staying parallel to their neighbours; Hit 83%, noise 2%, same as 011. Swirl is controlled by: strength 1.5 (how strongly the spiral overrides the 011 flow), radius 45 px (how far each whirl reaches), pitch 25 deg (0 = closed rings, higher = open spirals), and the number of centres. Weakness: the whirls are small and a few land in odd places (photo corners, lower-left shirt).",
            {'Method': '011 field + Gaussian-weighted spiral around Hessian-detected dark blobs (alternating spin), mixed as line-direction tensors; evenly spaced streamlines; width = tone',
             'Key settings': f"centres {P['n_centres']}, swirl strength {P['strength']}, radius {P['radius']} px, pitch {P['pitch']} deg, max turn {P['maxturn']} rad/px (011: 0.25); spacing {P['dsep']} px, field sigma {P['sig']}"},
            'Centres and field on the GPU (blob detector + vortex sum are per-pixel), tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
    else: img.save(os.path.join(lib.LAB, 'work/013-try.png')); print(lib.score(img))
