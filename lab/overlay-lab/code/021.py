"""021: Like 020, with stronger swirl. Imports 020 and changes only: curl=80.0, radius=90.0."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v020', os.path.join(here, '020.py'))
v20 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v20); sys.argv = a
P = dict(v20.P); P.update(curl=80.0, radius=90.0); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
NOTES = '020 with the swirl turned up: spiral reach 65 -> 90 px and eddy rotation 55 -> 80 degrees (everything else as 020, including the clean-ups). The whirls at the eyes, nostril, ear and beard tufts are larger and the beard and shoulders twist harder, while neighbouring lines stay parallel.'
if __name__ == '__main__':
    v20.main('021', P, 'Like 020, with stronger swirl', NOTES + ' ' + P.get('extra_note', ''))
