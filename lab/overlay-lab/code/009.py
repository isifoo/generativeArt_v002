"""009: 008 (003 + 25% detail) plus the 001 flow-line map as an extra guide, so faint coherent lines
(eye bags, neck curve) also get 003-style brush strokes."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
def load(name):
    spec = importlib.util.spec_from_file_location('v' + name, os.path.join(here, name + '.py'))
    m = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(m); sys.argv = a; return m
v1, v8 = load('001'), load('008')

P = dict(v8.P); P.update(guide_w=0.4, guide_blur=2.5, save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

if __name__ == '__main__':
    cache = os.path.join(lib.LAB, 'work/fdog001.npy')
    if os.path.exists(cache): lines = np.load(cache)
    else: lines = v1.run(v1.P); np.save(cache, lines)
    extra = P['guide_w'] * np.clip(lib.blur(lines, P['guide_blur']) * 2.0, 0, 1)
    ink = v8.v3.run(P, extra=extra); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('009', img, '008 + flow-line guide',
            "Same look and settings as 008 (003 + 25% detail), but the tracer also follows the clean line map from 001 at 40% weight, so faint lines that are coherent but have few dots get strokes too. Compared with 008: the neck curve at lower left is now one long stroke, the right eye bag and beard strands are filled in, and Hit rises from 74% to 77% with noise still 2%. Weakness: the left shirt picks up more short dashes, so it is a little busier than 008.",
            {'Method': '008 with stroke guide = max(dot density along flow, 0.4 x blurred 001 FDoG lines)',
             'Key settings': f"as 008 (seed {P['seed_thr']}, stop {P['stop_thr']}, spacing {P['dsep']} px, min length {P['minlen']} px) + guide weight {P['guide_w']}, guide blur {P['guide_blur']} px"},
            'GPU for ETF, FDoG and density (about 7 passes, full rate); tracing on CPU at half resolution, about 2 per second; strokes as a WebGL triangle strip')
    else:
        img.save(os.path.join(lib.LAB, 'work/009-try.png')); print(lib.score(img))
