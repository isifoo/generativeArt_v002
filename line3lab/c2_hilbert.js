// CANDIDATE c2_hilbert: an adaptive space-filling curve. Canvas 2D.
// Two stacked Hilbert curves (one line from the top to the bottom of the picture). Every square can split into four, and the amount it has split
// (0..1, not yes/no) comes from the mean tone inside it. A square that has split 0% is one point, so the line runs straight through it; at 100% it is four points that
// moved out to their own sub-squares. The points are joined with right-angled steps, so every corner is exactly 90 degrees.
// MOTION: the tree of squares is always the same (full depth); only how far each square has split changes, continuously with the tone. No square appears or disappears.
import { boxMean, clamp, lerp } from './shared.js';

export default {
  id: 'c2_hilbert',
  name: 'Adaptive Hilbert curve',
  principle: 'A Hilbert space-filling curve whose squares split further where the tone is dense; the line visits every square once, joined by right-angled steps, so it is one closed-looking string with only 90 degree corners.',
  control: 'Run length = the coarsest square (Coarsest level): the line goes straight across a sparse square. Detail depth sets the finest square. The tone-to-detail curve decides how fast the line gets dense with tone.',
  motion: 'Each square has a continuous split amount, so points glide out of (or back into) their parent; the corner order is fixed by the structure, so nothing pops.',
  sliders: [
    { id: 'dmax', label: 'Finest level (detail depth)', min: 4, max: 7, step: 1, val: 6 },
    { id: 'dmin', label: 'Coarsest level (long straight runs)', min: 0, max: 5, step: 1, val: 3 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 1.5 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.6 },
  ],
  curves: [
    { id: 'detail', label: 'Tone to detail (how dense the line gets)', xl: 'tone 0 dark ... 1 bright', yl: 'detail 0 coarse ... 1 finest', pts: [[0, 0], [0.5, 0.45], [1, 1]] },
  ],
  create(env) {
    const { W, H } = env, ctx = env.canvas.getContext('2d');
    let xs = new Float32Array(1), ys = new Float32Array(1), n = 0, P, curve, dmax, dmin, con;
    const tone = (x0, y0, x1, y1) => boxMean(x0 / W, y0 / H, x1 / W, y1 / H);
    function rec(ox, oy, ix, iy, jx, jy, level, ax, ay) {
      if (level >= dmax) { xs[n] = ax; ys[n] = ay; n++; return; }
      const cx = [ox, ox + ix, ox + jx, ox + ix + jx], cy = [oy, oy + iy, oy + jy, oy + iy + jy];
      const m = tone(Math.min(...cx), Math.min(...cy), Math.max(...cx), Math.max(...cy));
      const d = clamp(curve(clamp((m - 0.5) * con + 0.5)));
      const s = clamp(dmin + (dmax - dmin) * d - level);           // how far this square has split
      const hix = ix / 2, hiy = iy / 2, hjx = jx / 2, hjy = jy / 2;
      // the four children (classic Hilbert order): origin, I vector, J vector
      const kids = [
        [ox, oy, hjx, hjy, hix, hiy],
        [ox + hix, oy + hiy, hix, hiy, hjx, hjy],
        [ox + hix + hjx, oy + hiy + hjy, hix, hiy, hjx, hjy],
        [ox + hix + jx, oy + hiy + jy, -hjx, -hjy, -hix, -hiy],
      ];
      for (const k of kids) {
        const kx = k[0] + (k[2] + k[4]) / 2, ky = k[1] + (k[3] + k[5]) / 2;   // the child's own centre
        rec(k[0], k[1], k[2], k[3], k[4], k[5], level + 1, lerp(ax, kx, s), lerp(ay, ky, s));
      }
    }
    return {
      draw(f) {
        P = f.P; curve = f.curve.detail; dmax = Math.round(P.dmax); dmin = Math.min(Math.round(P.dmin), dmax - 1); con = P.con;
        const total = 2 * Math.pow(4, dmax); if (xs.length < total) { xs = new Float32Array(total); ys = new Float32Array(total); }
        n = 0; const hh = H / 2;
        // top square: starts top-left, ends bottom-left. bottom square: starts top-left, ends top-right.
        rec(0, 0, 0, hh, W, 0, 0, W / 2, hh / 2);
        rec(0, hh, W, 0, 0, hh, 0, W / 2, hh + hh / 2);
        ctx.fillStyle = f.paperCss; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = f.inkCss; ctx.lineWidth = P.w; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.miterLimit = 4;
        ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < n; i++) {
          const ax = xs[i - 1], ay = ys[i - 1], bx = xs[i], by = ys[i];
          if (i & 1) ctx.lineTo(bx, ay); else ctx.lineTo(ax, by);   // the corner of the right-angled step alternates with the index (a structural rule)
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      },
    };
  },
};
