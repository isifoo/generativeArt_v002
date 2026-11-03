"""006: Hybrid. Large solid darks (head outline, hair, deep shadows, photo) are kept as smooth ink fills
with brushy flow-smeared edges; everything else is drawn with the 004 calligraphic strokes, which are not
allowed to start inside the fills. Specks are gone because nothing small survives either path."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib
import importlib.util
here = os.path.dirname(os.path.abspath(__file__))
def load(name):
    spec = importlib.util.spec_from_file_location('v' + name, os.path.join(here, name + '.py'))
    m = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(m); sys.argv = a; return m
v4 = load('004')

P = dict(fill_blur=4.0, fill_thr=0.62, open_r=5, min_area=2500, edge_lic=10, save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def fills(I, P):
    D = 1 - lib.blur(I, P['fill_blur'])
    m = D > P['fill_thr']
    m = lib.dilate(lib.erode(m, P['open_r']), P['open_r'])   # opening: drop thin bits and speck clusters
    m = lib.remove_small(m, P['min_area'])
    m = ~lib.remove_small(~m, 400)                            # fill small holes
    return m

def run(P, extra=None, p4=None):
    I = lib.load_input()
    m = fills(I, P)
    field = {}
    occ = lib.dilate(m, 2)
    ink_s = v4.run(p4 or v4.P, fill=occ, field=field, extra=extra)
    # soft, brushy fill edges: smear the mask along the flow, re-threshold softly
    f = lib.blur(m.astype(np.float32), 1.5)
    f = lib.flow_conv(f, field['tx'], field['ty'], P['edge_lic'], sigma=P['edge_lic'] / 1.5)
    f = np.clip((f - 0.5) / 0.12 + 0.5, 0, 1)
    print('fill %', round(100 * m.mean(), 1))
    return np.maximum(f, ink_s)

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('006', img, 'Hybrid: solid darks + calligraphic strokes',
            "Finds the large solid darks (a blurred darkness map, opened with a 5 px disk, areas over 2500 px) and keeps them as ink fills whose edges are smeared along the flow; everything else is drawn with the 004 calligraphic strokes, which may not start inside a fill. This gives the strongest picture so far: weight in the cap of the head, the photo, the background and the shirt shadows, with clean directed strokes in the face and beard and no specks at all. Weaknesses: the woman's hair in the photo becomes one black mass, the bottom-right shirt fill is heavy with ragged white drips, and the fills are outlined by a thin white gap.",
            {'Method': 'fills = open(blur darkness > threshold) with flow-smeared soft edges; strokes = 004 pipeline seeded outside fills',
             'Key settings': f"fill blur {P['fill_blur']} px, fill threshold {P['fill_thr']}, opening radius {P['open_r']} px, min fill area {P['min_area']} px, edge smear {P['edge_lic']} px; strokes as 004"},
            'Fills on GPU (blur + threshold + one LIC pass, 4 passes, full rate); strokes as 004 on CPU at half resolution, 1-2 per second, cached between frames')
    else:
        img.save(os.path.join(lib.LAB, 'work/006-try.png')); print(lib.score(img))
