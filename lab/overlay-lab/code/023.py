"""023: Like 020, with small sunbursts at the eyes. Imports 020 and changes only: eye_rays=0.2."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v020', os.path.join(here, '020.py'))
v20 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v20); sys.argv = a
P = dict(v20.P); P.update(eye_rays=0.2); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
NOTES = "020 plus the best idea from the zoned versions: short radial rays right around each eye centre (an ellipse of 0.25 x 0.2 eye-distances, about 50 x 40 px, feathered 14 px) that blend outward into 016's swirl; everything else as 020."
if __name__ == '__main__':
    v20.main('023', P, 'Like 020, with small sunbursts at the eyes', NOTES + ' ' + P.get('extra_note', ''))
