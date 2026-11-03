"""016: Swirl (d) - eddies. 013's feature vortices made larger, plus large-scale curl-noise eddies and
more allowed curvature, so the whole picture flows in slow whirls."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, swirl, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a

BASE = dict(field='smooth', sig=30.0, dsep=6.0)          # = 011
SWIRL = dict(n_centres=30, strength=1.5, radius=65.0, pitch=25.0, maxturn=0.5, curl=55.0, curl_scale=90.0)
P = dict(v10.P); P.update(BASE); P.update(SWIRL); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def field_fn(I, c2, s2, P):
    cs = swirl.feature_centres(I, max_n=P['n_centres'])
    c2, s2 = swirl.curl_noise(I, c2, s2, P['curl'], P['curl_scale'])
    return swirl.vortex(I, c2, s2, cs, P['strength'], P['radius'], P['pitch'])

if __name__ == '__main__':
    img = lib.to_img(v10.run(P, field_fn))
    if P['save']:
        lib.save_version('016', img, 'Swirl (d): eddies + feature whirls',
            "013's whirls at the detected features, made bigger (reach 45 -> 65 px), plus a large-scale curl-noise term that slowly rotates the 011 flow by up to 55 degrees in broad eddies, and more allowed curvature (max turn 0.35 -> 0.5 rad/px) so lines can curl tightly. The whole picture now flows: the beard and shoulders sweep in slow S-curves, the eyes, nostril, ear and beard tufts each sit in a whirl, and neighbouring lines stay parallel (Hit 83%, noise 2%). Between 013 (gentle) and 015 (strongest) in swirl amount, and to my eye the most beautiful of the swirl set. Swirl is controlled by: curl (degrees of eddy rotation; 0 = none), curl scale (eddy size, 90 px), and the vortex strength, reach and pitch as in 013. Weakness: the eddies are random, not tied to the face, so a few whirls sit in empty shirt; the photo corners still get little curls.",
            {'Method': '011 field + large-scale curl-noise rotation + spiral around Hessian-detected dark blobs; evenly spaced streamlines; width = tone',
             'Key settings': f"curl {P['curl']} deg, curl scale {P['curl_scale']} px, centres {P['n_centres']}, vortex strength {P['strength']}, reach {P['radius']} px, pitch {P['pitch']} deg, max turn {P['maxturn']} rad/px; spacing {P['dsep']} px, field sigma {P['sig']}"},
            'Field on the GPU (noise texture + blob detector + vortex sum, per pixel); tracing on the CPU at half resolution about once a second; width from the live darkness texture every frame')
    else: img.save(os.path.join(lib.LAB, 'work/016-try.png')); print(lib.score(img))
