"""008: 003 + 25% detail (Gerry's pick). Exactly the 003 tracer and renderer, with seeding and spacing
loosened so about 25% more strokes survive."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v003', os.path.join(here, '003.py'))
v3 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v3); sys.argv = a

CHANGES = dict(seed_thr=0.20, stop_thr=0.06, dsep=5.4)
P = dict(v3.P); P.update(CHANGES); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

if __name__ == '__main__':
    ink = v3.run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('008', img, '003 + 25% detail',
            "Exactly the 003 tracer and brush, with three settings loosened: seed darkness 0.22 -> 0.20 (9% lower), stop darkness 0.07 -> 0.06 (14% lower, strokes run a little further into light areas), stroke spacing 6.0 -> 5.4 px (10% tighter). Minimum length (24 px), widths, taper and texture are unchanged. Result: 1914 strokes instead of 1483 (+29%), ink 14% -> 17% (+22%), noise unchanged at 2%; more of the brows, eye lines, beard strands and photo detail survive and Hit rises from 68% to 74%. Slightly darker and busier in the shirt shadows; a shorter minimum length was tried and rejected because it doubled the specks.",
            {'Method': '003 unchanged (multiscale ETF, LIC density, evenly-spaced streamlines, tapered bristle strokes) with looser seeding and spacing',
             'Key settings': f"seed > {P['seed_thr']} (003: 0.22), stop < {P['stop_thr']} (003: 0.07), spacing {P['dsep']} px (003: 6.0), min length {P['minlen']} px, width {P['wmin']}-{P['wmax']} px, texture {P['texture']} (as 003)"},
            'CPU at half resolution (sequential tracing), about 2-3 per second in JS; ETF, density and texture on GPU; strokes drawn as a WebGL triangle strip')
    else:
        img.save(os.path.join(lib.LAB, 'work/008-try.png')); print(lib.score(img))
