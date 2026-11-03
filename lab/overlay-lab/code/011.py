"""011: Engraver hatching that follows the forms: same evenly spaced streamlines as 010, but the direction
field is a smooth regional flow (structure tensor sigma 30, no global pull) and the spacing is 6 px."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v010', os.path.join(here, '010.py'))
v10 = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = a[:1]; spec.loader.exec_module(v10); sys.argv = a
CHANGES = dict(field='smooth', sig=30.0, dsep=6.0)
P = dict(v10.P); P.update(CHANGES); P['save'] = 0
if len(sys.argv) > 1: P.update(eval('dict(' + sys.argv[1] + ')'))
if __name__ == '__main__':
    img = lib.to_img(v10.run(P))
    if P['save']:
        lib.save_version('011', img, 'Engraver hatching: smooth regional flow', 'Same evenly spaced, never-crossing streamlines and width-only tone as 010. Two settings changed from 010: the direction field no longer has the global pull (global weight 4 -> 0) and its smoothing drops from sigma 60 to 30, so each region gets its own smooth direction; spacing is 7 -> 6 px. Lines now wrap the skull, run across the brows and eye bags, comb down the beard and sweep along the shoulders, while staying parallel to their neighbours. This is the best of the hatching set (Hit 83%, noise 2%) and the face reads much better than in 010. Weaknesses: a few fans and seams where the field turns (inside the photo, at the bottom of the shirt), and the left shirt is still broken into short dashes.',
            {'Method': 'evenly spaced streamlines (Jobard-Lefer) on a sigma-30 structure-tensor field, no global pull; width = tone from 009 field', 'Key settings': f"field {P['field']}, sigma {P.get('sig')}, spacing {P['dsep']} px, stop at {P['dtest']} x spacing, max turn {P['maxturn']} rad/px, tone {P['tone_lo']}-{P['tone_hi']}, max width {P['wfill']} x spacing, min run {P['minrun']} px"}, 'Field and lines change slowly: re-trace on the CPU at half resolution about once a second, keep the lines as a mesh, and sample width from the live darkness texture on the GPU every frame (30 fps)')
    else: img.save(os.path.join(lib.LAB, 'work/011-try.png')); print(lib.score(img))
