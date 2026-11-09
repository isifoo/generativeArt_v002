// CANDIDATE c3_maze: a labyrinth. Canvas 2D.
// A random spanning tree is grown on a grid of cells (a maze: every cell reachable, no loops). The line is the outline that walks all the way round that tree,
// on both sides of every branch, so it is one closed string with right-angled turns, long straight corridors and dead ends.
// DENSITY: the tree itself never changes. The GRID is warped: every row of the grid has its columns spaced by the tone along that row, every column has its rows
// spaced by the tone down that column (Locality blends this with one global spacing, which keeps the lines straighter).
// MOTION: the topology (which cells join) is fixed by the seed, only the positions of the corners slide with the eased tone, so nothing pops.
// Changing Cells, Straightness or Seed builds a new maze (that is a slider change, not a video change).
import { toneAt, clamp, lerp, rng } from './shared.js';

function growTree(Wc, Hc, straight, seed) {            // growing-tree maze: keep going straight with probability "straight", else turn or backtrack
  const R = rng(seed), N = Wc * Hc, seen = new Uint8Array(N), right = new Uint8Array(N), down = new Uint8Array(N);
  const stack = [0], dirOf = [-1]; seen[0] = 1; let last = -1;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  while (stack.length) {
    const c = stack[stack.length - 1], cx = c % Wc, cy = (c / Wc) | 0, opts = [];
    for (let d = 0; d < 4; d++) { const nx = cx + DX[d], ny = cy + DY[d]; if (nx >= 0 && ny >= 0 && nx < Wc && ny < Hc && !seen[ny * Wc + nx]) opts.push(d); }
    if (!opts.length) { stack.pop(); dirOf.pop(); last = dirOf.length ? dirOf[dirOf.length - 1] : -1; continue; }
    let d = (last >= 0 && opts.includes(last) && R() < straight) ? last : opts[(R() * opts.length) | 0];
    const nx = cx + DX[d], ny = cy + DY[d], nc = ny * Wc + nx;
    if (d === 0) right[c] = 1; else if (d === 2) right[nc] = 1; else if (d === 1) down[c] = 1; else down[nc] = 1;
    seen[nc] = 1; stack.push(nc); dirOf.push(d); last = d;
  }
  // the outline of the tree as a closed walk over the 2Wc x 2Hc "quarter cell" points
  const A = 2 * Wc, B = 2 * Hc, M = A * B, lx = new Int32Array(M), ly = new Int32Array(M);
  for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) {
    const i = Math.floor(a / 2), j = Math.floor(b / 2), qx = a & 1, qy = b & 1, c = j * Wc + i, n = b * A + a;
    const hasX = qx ? right[c] : (i > 0 ? right[c - 1] : 0), hasY = qy ? down[c] : (j > 0 ? down[c - Wc] : 0);
    lx[n] = hasX ? b * A + (qx ? a + 1 : a - 1) : (b ^ 1) * A + a;       // sideways: across the branch, or round the end cap
    ly[n] = hasY ? (qy ? b + 1 : b - 1) * A + a : b * A + (a ^ 1);       // up/down: along the branch, or round the end cap
  }
  const ord = new Int32Array(M); let cur = 0, prev = -1, k = 0;
  for (; k < M; k++) {
    ord[k] = cur; const nxt = lx[cur] === prev ? ly[cur] : (ly[cur] === prev ? lx[cur] : lx[cur]);
    prev = cur; cur = nxt; if (cur === 0) { k++; break; }
  }
  return { A, B, ord: ord.subarray(0, k) };
}

export default {
  id: 'c3_maze',
  name: 'Spanning-tree labyrinth',
  principle: 'Grow a random maze (a tree over the cells) and let the line walk round the outside of it, both sides of every wall: one closed string of straight corridors and 90 degree turns; the grid is squeezed so cells are small where the tone is dense.',
  control: 'Run length = Straightness (chance the maze keeps going straight, long corridors vs. busy twisting) and Cells. Density = tone contrast and Density range. Locality: 0 = straight global spacing, 1 = every row and column adapts (lines lean a little).',
  motion: 'The maze never changes while the video plays, only the corner positions slide with the tone. A new maze appears only when Cells, Straightness or Seed is moved.',
  sliders: [
    { id: 'cells', label: 'Cells across', min: 8, max: 36, step: 1, val: 20 },
    { id: 'straight', label: 'Straightness (long corridors)', min: 0, max: 0.97, step: 0.01, val: 0.8 },
    { id: 'seed', label: 'Maze seed', min: 1, max: 99, step: 1, val: 7 },
    { id: 'range', label: 'Density range (widest / closest)', min: 1, max: 9, step: 0.05, val: 6 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 2.2 },
    { id: 'loc', label: 'Locality (0 straight, 1 adaptive)', min: 0, max: 1, step: 0.01, val: 0.55 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.8 },
  ],
  create(env) {
    const { W, H } = env, ctx = env.canvas.getContext('2d');
    let key = '', tree = null, wt = new Float32Array(1), px = new Float32Array(1), py = new Float32Array(1);
    let Xs = new Float32Array(1), Ys = new Float32Array(1);
    return {
      draw(f) {
        const P = f.P, Wc = Math.round(P.cells), Hc = Math.max(4, Math.round(Wc * (H / W) * 0.92)), k = [Wc, Hc, P.straight, P.seed].join();
        if (k !== key) { key = k; tree = growTree(Wc, Hc, P.straight, Math.round(P.seed) * 7919); }
        const { A, B, ord } = tree, M = A * B;
        if (wt.length < M) { wt = new Float32Array(M); px = new Float32Array(M); py = new Float32Array(M); }
        if (Xs.length < A) Xs = new Float32Array(A); if (Ys.length < B) Ys = new Float32Array(B);
        const rg = P.range;
        // spacing weight of every quarter-cell point: big where the tone is sparse, 1 where it is dense
        for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) {
          const t = clamp((toneAt((a + 0.5) / A, (b + 0.5) / B) - 0.5) * P.con + 0.5); wt[b * A + a] = lerp(rg, 1, t);
        }
        // light smoothing so neighbouring rows and columns agree (keeps the corridors calm)
        for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) {
          let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = a + dx, y = b + dy; if (x >= 0 && y >= 0 && x < A && y < B) { const w = dx === 0 && dy === 0 ? 4 : 1; s += wt[y * A + x] * w; c += w; } }
          py[b * A + a] = s / c;
        }
        const w2 = py;                                 // smoothed weights
        // global (separable) spacing
        const colW = new Float32Array(A), rowW = new Float32Array(B);
        for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) { colW[a] += w2[b * A + a] / B; rowW[b] += w2[b * A + a] / A; }
        const cum = (arr, n) => { const o = new Float32Array(n); let s = 0, tot = 0; for (let i = 0; i < n; i++) tot += arr[i]; for (let i = 0; i < n; i++) { o[i] = (s + arr[i] / 2) / tot; s += arr[i]; } return o; };
        const gX = cum(colW, A), gY = cum(rowW, B), loc = P.loc;
        // positions: x from the row, y from the column, each blended with the global one
        const col = new Float32Array(B);
        for (let b = 0; b < B; b++) {
          const rw = new Float32Array(A); for (let a = 0; a < A; a++) rw[a] = w2[b * A + a];
          const cx = cum(rw, A); for (let a = 0; a < A; a++) px[b * A + a] = lerp(gX[a], cx[a], loc) * W;
        }
        for (let a = 0; a < A; a++) {
          for (let b = 0; b < B; b++) col[b] = w2[b * A + a];
          const cy = cum(col, B); for (let b = 0; b < B; b++) wt[b * A + a] = lerp(gY[b], cy[b], loc) * H;   // wt reused as y
        }
        ctx.fillStyle = f.paperCss; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = f.inkCss; ctx.lineWidth = P.w; ctx.lineJoin = 'miter'; ctx.miterLimit = 4; ctx.beginPath();
        for (let i = 0; i < ord.length; i++) { const n = ord[i], x = px[n], y = wt[n]; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); ctx.stroke();
      },
    };
  },
};
