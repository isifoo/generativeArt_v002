// CANDIDATE c7_rubber: a fixed Peano curve on a RUBBER GRID. Canvas 2D.
// The line is one fixed Peano serpentine over an 81 x 162 grid of cells (it never changes, so it can never pop). The grid itself is squeezed like rubber:
// every row has its columns spaced by the tone along that row, every column has its rows spaced by the tone down that column, so the same line crowds
// together where the tone is dense and spreads out where it is sparse. Locality blends the squeeze with one global spacing (keeps the runs straighter).
// MOTION: only the positions slide with the eased tone; the route is constant.
import { toneAt, clamp, lerp } from './shared.js';
import { peanoKids } from './peano.js';

const D = 4, N = 81;                                     // 3^4 cells per square side
let ORDER = null;                                        // cells (a across 0..80, b down 0..161) in curve order
function order() {
  if (ORDER) return ORDER;
  const out = [];
  const rec = (o, d) => { if (d === 0) { out.push([Math.floor(o[0] + (o[2] + o[4]) / 2), Math.floor(o[1] + (o[3] + o[5]) / 2)]); return; } for (const k of peanoKids(...o)) rec(k, d - 1); };
  rec([0, 0, N, 0, 0, N], D); rec([N, N, -N, 0, 0, N], D);
  return (ORDER = out);
}

export default {
  id: 'c7_rubber',
  name: 'Peano on a rubber grid',
  principle: 'One fixed Peano serpentine over a fine grid; the grid is stretched like rubber so every row and column is squeezed together where the tone is dense, so the very same line gets denser without ever changing its route.',
  control: 'Density range (widest / closest spacing) and tone contrast. Locality: 0 = global spacing (lines stay perfectly straight, only bands change), 1 = every row and column adapts (lines lean). Run length is fixed by the Peano rule (long straight columns).',
  motion: 'The route never changes; only positions slide with the eased tone, so it cannot pop.',
  sliders: [
    { id: 'range', label: 'Density range (widest / closest)', min: 1, max: 12, step: 0.05, val: 9 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 2.6 },
    { id: 'loc', label: 'Locality (0 straight, 1 adaptive)', min: 0, max: 1, step: 0.01, val: 0.7 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.4 },
  ],
  create(env) {
    const { W, H } = env, ctx = env.canvas.getContext('2d'), A = N, B = 2 * N, M = A * B;
    const wt = new Float32Array(M), sm = new Float32Array(M), px = new Float32Array(M), py = new Float32Array(M);
    const cum = (arr, n, out) => { let tot = 0, s = 0; for (let i = 0; i < n; i++) tot += arr[i]; for (let i = 0; i < n; i++) { out[i] = (s + arr[i] / 2) / tot; s += arr[i]; } };
    const rw = new Float32Array(A), cx = new Float32Array(A), col = new Float32Array(B), cy = new Float32Array(B), gX = new Float32Array(A), gY = new Float32Array(B), colW = new Float32Array(A), rowW = new Float32Array(B);
    return {
      draw(f) {
        const P = f.P, rg = P.range, loc = P.loc, ord = order();
        for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) wt[b * A + a] = lerp(rg, 1, clamp((toneAt((a + 0.5) / A, (b + 0.5) / B) - 0.5) * P.con + 0.5));
        for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) {
          let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = a + dx, y = b + dy; if (x >= 0 && y >= 0 && x < A && y < B) { const w = dx === 0 && dy === 0 ? 4 : 1; s += wt[y * A + x] * w; c += w; } }
          sm[b * A + a] = s / c;
        }
        colW.fill(0); rowW.fill(0);
        for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) { colW[a] += sm[b * A + a] / B; rowW[b] += sm[b * A + a] / A; }
        cum(colW, A, gX); cum(rowW, B, gY);
        for (let b = 0; b < B; b++) { for (let a = 0; a < A; a++) rw[a] = sm[b * A + a]; cum(rw, A, cx); for (let a = 0; a < A; a++) px[b * A + a] = lerp(gX[a], cx[a], loc) * W; }
        for (let a = 0; a < A; a++) { for (let b = 0; b < B; b++) col[b] = sm[b * A + a]; cum(col, B, cy); for (let b = 0; b < B; b++) py[b * A + a] = lerp(gY[b], cy[b], loc) * H; }
        ctx.fillStyle = f.paperCss; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = f.inkCss; ctx.lineWidth = P.w; ctx.lineJoin = 'miter'; ctx.miterLimit = 4; ctx.beginPath();
        for (let i = 0; i < ord.length; i++) { const k = ord[i][1] * A + ord[i][0], x = px[k], y = py[k]; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      },
    };
  },
};
