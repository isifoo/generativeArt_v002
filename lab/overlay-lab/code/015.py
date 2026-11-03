"""015: Swirl (c) - guilloche. Large ring/spiral systems around the 6 strongest features, with a slow
1/r falloff, blended with 011's field: lines wind in big spirals like a fingerprint. Strongest swirl."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, swirl, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a

BASE = dict(field='smooth', sig=30.0, dsep=6.0)          # = 011
SWIRL = dict(n_centres=6, strength=2.0, radius=110.0, pitch=12.0, maxturn=0.4)
P = dict(v10.P); P.update(BASE); P.update(SWIRL); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def field_fn(I, c2, s2, P):
    cs = swirl.feature_centres(I, max_n=P['n_centres'])
    return swirl.vortex(I, c2, s2, cs, P['strength'], P['radius'], P['pitch'], falloff='inv')

if __name__ == '__main__':
    img = lib.to_img(v10.run(P, field_fn))
    if P['save']:
        lib.save_version('015', img, 'Swirl (c): big guilloche spirals', "011's hatching blended with large ring-and-spiral systems around the 6 strongest dark spots, with a slow 1/r falloff so each spiral reaches far: lines wind like a fingerprint or banknote guilloche around the right eye, under the nose, in the photo and on the shirt. This is the strongest swirl (Hit 81%, noise 2%). Swirl is controlled by: number of centres (6), strength 2.0, reach 110 px, pitch 12 deg (lower = tighter rings) and the 1/r falloff. Weakness: the spirals go wherever the strongest spots are, not where a person would put them; one lands on a speckle in the lower-left shirt and the left eye gets none, so it can look arbitrary. The 013 detector with hand-picked centres (or a face landmark model) would fix that.",
            {'Method': '011 field + spiral systems around the 6 strongest Hessian blobs with 1/r falloff (alternating spin); evenly spaced streamlines; width = tone', 'Key settings': f"centres {P['n_centres']}, strength {P['strength']}, reach {P['radius']} px (1/r falloff), pitch {P['pitch']} deg, max turn {P['maxturn']} rad/px (011: 0.25); spacing {P['dsep']} px"}, 'Field on the GPU (6 spiral terms per pixel); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
    else: img.save(os.path.join(lib.LAB, 'work/015-try.png')); print(lib.score(img))
