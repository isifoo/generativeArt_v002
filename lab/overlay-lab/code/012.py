"""012: Engraver hatching that fully follows the local flow (the 003 multiscale field, sigma 8 + 24),
at the tightest spacing (5 px). Same evenly spaced streamlines and width-only tone as 010."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a
CHANGES = dict(field='flow', sigs=(8.0, 24.0), dsep=5.0, maxturn=0.3)
P = dict(v10.P); P.update(CHANGES); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
if __name__ == '__main__':
    img = lib.to_img(v10.run(P))
    if P['save']:
        lib.save_version('012', img, 'Engraver hatching: fully following the flow', "Same evenly spaced streamlines as 010 and 011, but the field is the local multiscale flow used by 003 (sigma 8 + 24) and spacing is the tightest, 5 px (max turn 0.25 -> 0.3 rad/px so lines can follow it). Lines hug every contour, so it reads like a contour engraving: the eyes, the woman's face in the photo and the ear come back, Hit 81%, noise 2%. Weakness: it is the least parallel of the three, since lines wiggle with local detail and bunch into contour bands, so the 'engraver's hatching' order is weaker than in 011.",
            {'Method': 'evenly spaced streamlines (Jobard-Lefer) on the 003 multiscale flow (sigma 8 + 24); width = tone from 009 field', 'Key settings': f"field {P['field']}, sigma {P.get('sig')}, spacing {P['dsep']} px, stop at {P['dtest']} x spacing, max turn {P['maxturn']} rad/px, tone {P['tone_lo']}-{P['tone_hi']}, max width {P['wfill']} x spacing, min run {P['minrun']} px"}, 'Tracing must follow the live flow: CPU at half resolution, about 1-2 per second; width from the live darkness texture on the GPU each frame')
    else: img.save(os.path.join(lib.LAB, 'work/012-try.png')); print(lib.score(img))
