"""Prepare the test sequence: frames (known motion), the app detector's overlay per frame, 016's darkness map
per frame, 016 traces on keyframes (every 15 frames) and on the middle in-between frames (reference only),
and the flows (per-frame and keyframe-to-keyframe pyramid LK at 1/4 resolution)."""
import sys, os, time, pickle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, core
from multiprocessing import Pool
DET = dict(size=30.0, contrast=40.0, thr=0.3, soft=0.45, blacks=0.18)

def one(args):
    t, L = args
    ink = core.detector(L, **DET); I = 1 - ink
    return t, ink, core.tone016(I)

def trace(args):
    t, ink = args
    c2, s2, cs = core.field016(1 - ink)
    t0 = time.time(); lines, org, sp = core.streamlines(c2, s2)
    return t, dict(lines=lines, c2=c2, s2=s2, centres=cs, secs=time.time() - t0)

if __name__ == '__main__':
    fr = core.make_sequence(os.path.join(core.WORK, 'fr0.png'))
    T = len(fr)
    with Pool(4) as pool:
        res = pool.map(one, [(t, fr[t]) for t in range(T)])
        ink = np.stack([r[1] for r in sorted(res, key=lambda r: r[0])]); tone = np.stack([r[2] for r in sorted(res, key=lambda r: r[0])])
        np.savez_compressed(os.path.join(core.WORK, 'seq.npz'), frames=fr, ink=ink, tone=tone)
        print('seq done')
        keys = list(range(0, T, core.KEY)); mids = [k + core.KEY // 2 for k in keys[:-1]]
        tr = dict(pool.map(trace, [(t, ink[t]) for t in keys + mids]))
    pickle.dump({t: tr[t] for t in keys}, open(os.path.join(core.WORK, 'keys-016.pkl'), 'wb'))
    pickle.dump({t: tr[t] for t in mids}, open(os.path.join(core.WORK, 'refs-016.pkl'), 'wb'))
    print('trace secs', np.mean([tr[t]['secs'] for t in keys]))
    # flows at 1/4 res
    q = [core.quarter(f) for f in fr]
    t0 = time.time()
    step = [core.lk_flow(q[t], q[t + 1]) for t in range(T - 1)]            # t -> t+1
    print('lk per frame secs', (time.time() - t0) / (T - 1))
    pair = {}
    for k in keys[:-1]:
        pair[(k, k + core.KEY)] = core.lk_flow(q[k], q[k + core.KEY], levels=4)
        pair[(k + core.KEY, k)] = core.lk_flow(q[k + core.KEY], q[k], levels=4)
    pickle.dump(dict(step=step, pair=pair), open(os.path.join(core.WORK, 'flows.pkl'), 'wb'))
    # flow error vs the true motion (end-point error, full-res px), inside a 24 px border
    m = (slice(24, -24), slice(24, -24))
    e1 = [np.hypot(*(core.full_flow(step[t]) - core.true_flow(t, t + 1))[m].transpose(2, 0, 1)).mean() for t in range(0, T - 1, 10)]
    e2 = [np.hypot(*(core.full_flow(pair[(k, k + 15)]) - core.true_flow(k, k + 15))[m].transpose(2, 0, 1)).mean() for k in keys[:-1]]
    mag = [np.hypot(*core.true_flow(k, k + 15)[m].transpose(2, 0, 1)).mean() for k in keys[:-1]]
    print('EPE per-frame', np.mean(e1), 'EPE keypair', np.mean(e2), 'true keypair motion', np.mean(mag))
