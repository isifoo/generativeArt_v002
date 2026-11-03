"""007: Refined hybrid. Like 006, but the strokes are also guided by the clean 001 flow-DoG line map
(so faint but coherent lines like the eye bags and the neck curve get strokes), and strokes may run longer."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib
import importlib.util
here = os.path.dirname(os.path.abspath(__file__))
def load(name):
    spec = importlib.util.spec_from_file_location('v' + name, os.path.join(here, name + '.py'))
    m = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(m); sys.argv = a; return m
v1, v4, v6 = load('001'), load('004'), load('006')

P = dict(guide_w=0.55, guide_blur=2.0, maxlen2=700, link_dist=22.0, link_ang=0.5, gap=8, seed2=0.28, stop2=0.07,
         p1=dict(seed_thr=0.20, stop_thr=0.06, gap=4), save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def run(P):
    cache = os.path.join(lib.LAB, 'work/fdog001.npy')
    if os.path.exists(cache): lines = np.load(cache)
    else: lines = v1.run(v1.P); np.save(cache, lines)
    extra = P['guide_w'] * np.clip(lib.blur(lines, P['guide_blur']) * 2.0, 0, 1)
    p4 = dict(v4.P); p4.update({k: P[k] for k in ('maxlen2', 'link_dist', 'link_ang', 'gap', 'seed2', 'stop2', 'p1')})
    return v6.run(v6.P, extra=extra, p4=p4)

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('007', img, 'Hybrid, guided by flow lines',
            "Same as 006, but the stroke tracer also follows the clean line map from 001 (blurred and added to the dot density), with slightly lower thresholds and longer allowed strokes (up to 700 px, ends joined across 22 px). Faint but coherent lines now get strokes: the right eye bag, the neck curve at lower left and the beard strands all hit Gerry's marks much better (best score so far). Weakness: it is busier than 006; the flow-line map comes in pairs, so some edges in the face get two or three parallel strokes, and the left shirt is more densely hatched.",
            {'Method': '006 hybrid; stroke guide = max(dot density along flow, 0.55 x blurred 001 FDoG lines)',
             'Key settings': f"guide weight {P['guide_w']}, guide blur {P['guide_blur']} px, pass-1 seed/stop {P['p1']['seed_thr']}/{P['p1']['stop_thr']}, pass-2 seed/stop {P['seed2']}/{P['stop2']}, gap bridging {P['gap']} steps, max length {P['maxlen2']} px, link {P['link_dist']} px; fills as 006"},
            'GPU for ETF, FDoG, density and fills (about 8 passes, full rate); stroke tracing on CPU at half resolution, 1-2 per second, strokes cached and faded between updates')
    else:
        img.save(os.path.join(lib.LAB, 'work/007-try.png')); print(lib.score(img))
