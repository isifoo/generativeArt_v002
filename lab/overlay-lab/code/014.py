"""014: Swirl (b) - twist. 011 hatching with the field rotated by an angle proportional to smoothed
darkness, so lines bend into swirling bands across tone changes. Medium-strong swirl."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, swirl, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a

BASE = dict(field='smooth', sig=30.0, dsep=6.0)          # = 011
SWIRL = dict(twist=110.0, twist_blur=18.0, maxturn=0.35)
P = dict(v10.P); P.update(BASE); P.update(SWIRL); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def field_fn(I, c2, s2, P):
    return swirl.twist(I, c2, s2, P['twist'], P['twist_blur'])

if __name__ == '__main__':
    img = lib.to_img(v10.run(P, field_fn))
    if P['save']:
        lib.save_version('014', img, 'Swirl (b): twist by darkness', "011's engraver hatching with the whole direction field rotated by an angle that grows with the local darkness (smoothed over 18 px): up to 110 degrees in the darkest areas, none on white. The lines turn into marbled, wave-like bands that ripple across every change of tone: the most even, all-over swirl of this set, and it keeps lines parallel with Hit 83% and noise 2%. Swirl is controlled by: twist (degrees of rotation at full darkness; 0 = 011) and twist blur (bigger = broader, calmer bands). Weakness: the swirl ignores the forms, so the neck curve and head outline dissolve into waves and the face reads less clearly than in 011 or 013.",
            {'Method': '011 field rotated by twist x smoothed darkness; evenly spaced streamlines; width = tone', 'Key settings': f"twist {P['twist']} deg at full darkness, twist blur {P['twist_blur']} px, max turn {P['maxturn']} rad/px (011: 0.25); spacing {P['dsep']} px, field sigma {P['sig']}"}, 'Field on the GPU (one extra rotation per pixel); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
    else: img.save(os.path.join(lib.LAB, 'work/014-try.png')); print(lib.score(img))
