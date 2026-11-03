"""022: Like 020, with fewer, bigger, slower eddies. Imports 020 and changes only: curl=60.0, curl_scale=140.0, strength=1.1, n_centres=14."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v020', os.path.join(here, '020.py'))
v20 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v20); sys.argv = a
P = dict(v20.P); P.update(curl=60.0, curl_scale=140.0, strength=1.1, n_centres=14); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
NOTES = 'A gentler 020: eddy size 90 -> 140 px (fewer, bigger, slower eddies), eddy rotation 55 -> 60 degrees, and only the 14 strongest feature spirals (was up to 30) at strength 1.1 (was 1.5); clean-ups as 020. The aim is for the whole picture to read as long flowing S-curves with a few calm whirls.'
if __name__ == '__main__':
    v20.main('022', P, 'Like 020, with fewer, bigger, slower eddies', NOTES + ' ' + P.get('extra_note', ''))
