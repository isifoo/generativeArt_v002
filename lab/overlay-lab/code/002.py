"""002: Line integral convolution of the overlay's darkness along the ETF, then a soft threshold."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib

P = dict(pre=2.0, etf_sig=8.0, L=14, passes=2, thr=0.36, soft=0.05, minspeck=40, save=0)
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))

def run(P):
    I = lib.load_input()
    tx, ty, coh, _ = lib.etf(I, P['pre'], P['etf_sig'])
    D = 1 - lib.blur(I, 0.7)
    for _ in range(P['passes']):
        D = lib.flow_conv(D, tx, ty, P['L'], sigma=P['L'] / 1.5)
        # re-sharpen across the stroke between passes so strokes stay crisp, not grey
        D = np.clip((D - D.mean()) * 1.6 + D.mean(), 0, 1)
    ink = np.clip((D - P['thr']) / P['soft'] + 0.5, 0, 1)
    m = lib.remove_small(ink > 0.5, P['minspeck'])
    ink = ink * lib.dilate(m, 1)
    return ink

if __name__ == '__main__':
    ink = run(P); img = lib.to_img(ink)
    if P['save']:
        lib.save_version('002', img, 'Smeared along the flow (LIC)',
            "Smears the overlay's own dark dots along the flow direction (line integral convolution, two passes of about 14 px each way), then re-thresholds softly. Specks become short brushy streaks that follow the form, so the beard, shirt and skull get a hatched, combed texture. Weakness: strokes are short and uniform, and the areas still look busy; it reads as a bold woodcut more than a line drawing: the eyes close up and the lower shirt turns into large black fills. Cleaner than the input, but strokes are short and do not yet connect along Gerry's marks.",
            {'Method': 'structure-tensor ETF, 2-pass Gaussian LIC on darkness, contrast boost, soft threshold, specks < 40 px removed',
             'Key settings': f"ETF sigma {P['etf_sig']}, LIC length {P['L']} px each way x {P['passes']} passes, threshold {P['thr']}, softness {P['soft']}"},
            'GPU, 3-4 passes (tensor + blur, then 2 LIC passes of ~24 texture taps each); real time at full res')
    else:
        img.save(os.path.join(lib.LAB, 'work/002-try.png')); print(lib.score(img))
