// CANDIDATE c5_meander: a square-wave scanline string. Canvas 2D.
// One line sweeps left to right along row 1, runs back along row 2, and so on (a boustrophedon), so it is one string. Along every row the line is a SQUARE WAVE:
// straight runs joined by vertical steps. How long a straight run lasts (the half period) is read from the tone through an editable spline: short runs and tall
// steps where the picture is dense (ink piles up, that is the contrast), one long straight line where it is sparse. The wave height fades to zero as the runs get long,
// so a sparse row becomes a plain straight line.
// MOTION: the phase of the wave is the running integral of 1 / run length, so when the tone changes the steps slide sideways continuously; a step can only enter or leave
// at the left/right border of the picture, never in the middle.
import { toneAt, clamp, lerp } from './shared.js';

export default {
  id: 'c5_meander',
  name: 'Square-wave scanline string',
  principle: 'The line sweeps back and forth row by row, and along each row it is a square wave whose straight run length comes from the tone through a spline: many short runs and tall steps where dense, a plain straight line where sparse.',
  control: 'Run length is directly the spline (tone to run length) between Shortest and Longest run; Rows sets the row pitch; Wave height sets how tall the steps are; Angle turns every row (the whole string) around the middle of the picture. All corners are 90 degrees.',
  motion: 'Phase = integral of 1 / run length, so steps slide continuously and can only appear or vanish at the border.',
  sliders: [
    { id: 'rows', label: 'Rows', min: 12, max: 110, step: 1, val: 98 },
    { id: 'lmin', label: 'Shortest run px (dense)', min: 2, max: 60, step: 0.5, val: 2 },
    { id: 'lmax', label: 'Longest run px (sparse)', min: 40, max: 2000, step: 1, val: 1032 },
    { id: 'amp', label: 'Wave height (share of the row)', min: 0.2, max: 1.1, step: 0.01, val: 0.9 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 0.76 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.5 },
    { id: 'ang', label: 'Angle deg (turns all the rows, like Scribble Angle)', min: -180, max: 180, step: 0.5, val: 0 },
  ],
  curves: [
    { id: 'run', label: 'Tone to run length (spline)', xl: 'tone 0 dark ... 1 bright', yl: 'run 0 short ... 1 long', pts: [[0, 0.94], [0.25, 0.72], [0.54, 0.18], [1, 0.05]] },
  ],
  create(env) {
    const { W, H } = env, ctx = env.canvas.getContext('2d'), DX = 2, LL = Math.hypot(W, H), NX = Math.ceil(LL / DX);   // rows are as long as the diagonal, so any angle fills the picture
    const th = new Float32Array(NX + 1), am = new Float32Array(NX + 1);
    return {
      draw(f) {
        const P = f.P, pitch = H / Math.round(P.rows), R = Math.ceil(LL / pitch), ang = (P.ang || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang), A0 = P.amp * pitch / 2, curve = f.curve.run, lr = Math.log(P.lmax / P.lmin);
        ctx.fillStyle = f.paperCss; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(ang);                         // draw in the turned frame: s along the rows, t across them (both from the middle)
        ctx.strokeStyle = f.inkCss; ctx.lineWidth = P.w; ctx.lineJoin = 'miter'; ctx.miterLimit = 4; ctx.beginPath();
        let started = false;
        const put = (x, y) => { if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); };
        for (let j = 0; j < R; j++) {
          const yc = (j + 0.5) * pitch - LL / 2; th[0] = 0; am[0] = 0;
          for (let i = 0; i <= NX; i++) {
            const x = Math.min(LL, i * DX), sx = x - LL / 2, u = (W / 2 + sx * ca - yc * sa) / W, v = (H / 2 + sx * sa + yc * ca) / H;
            const du = -0.5 * pitch * sa / W, dv = 0.5 * pitch * ca / H;                  // the tone is averaged across the row (up and down in the turned frame)
            const t = clamp(((toneAt(u - du, v - dv) + 2 * toneAt(u, v) + toneAt(u + du, v + dv)) / 4 - 0.5) * P.con + 0.5);
            const c = clamp(curve(t)), L = P.lmin * Math.exp(lr * c);
            am[i] = A0 * Math.sqrt(1 - c);
            if (i) th[i] = th[i - 1] + DX / L;
          }
          const pts = [];                                  // the row as a list of points, left to right
          const lev = (q) => ((Math.floor(q) & 1) ? 1 : -1);
          let curA = am[0];                                  // a run keeps the height it had where it started, so runs are exactly horizontal
          pts.push([0, yc + lev(th[0]) * curA]);
          for (let i = 1; i <= NX; i++) {
            const x0 = (i - 1) * DX, x1 = Math.min(LL, i * DX), a = th[i - 1], b = th[i];
            for (let q = Math.floor(a) + 1; q <= Math.floor(b); q++) {   // a step happens where the phase crosses a whole number
              const fr = (q - a) / Math.max(1e-9, b - a), xe = lerp(x0, x1, fr);
              pts.push([xe, yc + lev(q - 1) * curA]); curA = lerp(am[i - 1], am[i], fr); pts.push([xe, yc + lev(q) * curA]);
            }
          }
          pts.push([LL, yc + lev(th[NX]) * curA]);
          if (j & 1) pts.reverse();
          for (const p of pts) put(p[0] - LL / 2, p[1]);
        }
        ctx.stroke(); ctx.restore();
      },
    };
  },
};
