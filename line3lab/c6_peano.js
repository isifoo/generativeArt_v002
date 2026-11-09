// CANDIDATE c6_peano: an adaptive PEANO curve. Canvas 2D.
// Like c2 but with the Peano rule: every square splits into 3 x 3 and is visited column by column, so the line is made of LONG STRAIGHT RUNS (a serpentine inside a serpentine)
// with rectangular U-turns, much closer to the reference of long runs than Hilbert. How far each square has split (0..1) comes from its mean tone through a spline;
// a square that has not split is one point (the line runs straight through its middle), a split one pushes its 9 points out to its 9 sub-squares.
// MOTION: the tree of squares never changes, only the continuous split amounts, so points glide and nothing pops.
import { boxMean, clamp, lerp } from './shared.js';
import { peanoKids } from './peano.js';

export default {
  id: 'c6_peano',
  name: 'Adaptive Peano serpentine',
  principle: 'A Peano space-filling curve: the picture is split into 3 x 3 squares that are visited column by column, so the single line is a serpentine of long straight runs and rectangular U-turns; squares split finer where the tone is dense.',
  control: 'Run length = Coarsest level (the straight run across a sparse square, low = very long runs). Finest level sets the densest spacing. The tone-to-detail spline decides how fast it gets dense.',
  motion: 'Every square has a continuous split amount; points glide out of or back into their parent, the structure is fixed, no pop.',
  sliders: [
    { id: 'dmax', label: 'Finest level (detail depth)', min: 3, max: 4, step: 1, val: 4 },
    { id: 'dmin', label: 'Coarsest level (long straight runs)', min: 0, max: 3, step: 1, val: 1 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 1.8 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.6 },
  ],
  curves: [
    { id: 'detail', label: 'Tone to detail (how dense the line gets)', xl: 'tone 0 dark ... 1 bright', yl: 'detail 0 coarse ... 1 finest', pts: [[0, 0], [0.5, 0.5], [1, 1]] },
  ],
  create(env) {
    const { W, H } = env, ctx = env.canvas.getContext('2d');
    let xs = new Float32Array(1), ys = new Float32Array(1), n = 0, curve, dmax, dmin, con;
    function rec(o, level, ax, ay) {
      if (level >= dmax) { xs[n] = ax; ys[n] = ay; n++; return; }
      const [ox, oy, ix, iy, jx, jy] = o;
      const x0 = Math.min(ox, ox + ix, ox + jx, ox + ix + jx), x1 = Math.max(ox, ox + ix, ox + jx, ox + ix + jx), y0 = Math.min(oy, oy + iy, oy + jy, oy + iy + jy), y1 = Math.max(oy, oy + iy, oy + jy, oy + iy + jy);
      const m = boxMean(x0 / W, y0 / H, x1 / W, y1 / H), d = clamp(curve(clamp((m - 0.5) * con + 0.5)));
      const s = clamp(dmin + (dmax - dmin) * d - level);
      for (const k of peanoKids(ox, oy, ix, iy, jx, jy)) {
        const kx = k[0] + (k[2] + k[4]) / 2, ky = k[1] + (k[3] + k[5]) / 2;
        rec(k, level + 1, lerp(ax, kx, s), lerp(ay, ky, s));
      }
    }
    return {
      draw(f) {
        const P = f.P; curve = f.curve.detail; dmax = Math.round(P.dmax); dmin = Math.min(Math.round(P.dmin), dmax - 1); con = P.con;
        const total = 2 * Math.pow(9, dmax); if (xs.length < total) { xs = new Float32Array(total); ys = new Float32Array(total); }
        n = 0; const hh = H / 2;
        rec([0, 0, W, 0, 0, hh], 0, W / 2, hh / 2);          // top square: top-left to bottom-right
        rec([W, hh, -W, 0, 0, hh], 0, W / 2, hh + hh / 2);   // bottom square: top-right to bottom-left
        ctx.fillStyle = f.paperCss; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = f.inkCss; ctx.lineWidth = P.w; ctx.lineJoin = 'miter'; ctx.miterLimit = 4;
        ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < n; i++) {
          const ax = xs[i - 1], ay = ys[i - 1], bx = xs[i], by = ys[i];
          if (i & 1) ctx.lineTo(bx, ay); else ctx.lineTo(ax, by);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      },
    };
  },
};
