// CANDIDATE c4_spiral: ONE spiral that winds from the middle to the edge of the picture. Canvas 2D.
// Rays leave the centre towards the edge of a rounded rectangle. Along every ray the tone is added up (a running total of "how many lines fit here"),
// and the spiral is the place on each ray where that running total equals the turn number plus the ray's share of one turn (angle / 360). Because the
// total grows fast where the tone is dense, the turns crowd together there. Every ray is scaled to end on exactly the last turn, so the spiral always fills the picture.
// SHAPE: the rings are superellipses: Corner sharpness 2 = ellipse, high = a rectangle with sharp 90 degree corners and long straight sides.
// MOTION: everything is a smooth function of the eased tone (running totals and an inverse), so the turns slide, nothing is created or removed except at the centre.
import { toneAt, clamp, lerp } from './shared.js';

export default {
  id: 'c4_spiral',
  name: 'Rectangular spiral (one contour)',
  principle: 'A single spiral is one iso-contour of a field that adds up the tone along rays from the centre, so the single line winds round and round, squeezing its turns together where the picture is dense.',
  control: 'Corner sharpness (ellipse to rectangle, 90 degree corners) and Turns (spacing of the line); centre x/y moves where the spiral starts. The tone-to-density curve shapes the contrast.',
  motion: 'Pure running totals of the eased tone: turns glide in and out smoothly; the end of the line is pinned to the border.',
  sliders: [
    { id: 'turns', label: 'Turns (fewer = sparser lines)', min: 6, max: 70, step: 1, val: 30 },
    { id: 'p', label: 'Corner sharpness (2 ellipse ... 24 rectangle)', min: 2, max: 24, step: 0.1, val: 14 },
    { id: 'cx', label: 'Centre x', min: 0.2, max: 0.8, step: 0.005, val: 0.5 },
    { id: 'cy', label: 'Centre y', min: 0.2, max: 0.8, step: 0.005, val: 0.5 },
    { id: 'range', label: 'Density range (widest / closest)', min: 1, max: 10, step: 0.05, val: 5 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 1.6 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.6 },
  ],
  curves: [
    { id: 'dens', label: 'Tone to density (lines per px)', xl: 'tone 0 dark ... 1 bright', yl: 'density', pts: [[0, 0], [0.5, 0.5], [1, 1]] },
  ],
  create(env) {
    const { W, H } = env, ctx = env.canvas.getContext('2d');
    const KS = 360, NS = 140;                           // rays, steps along a ray
    let baseKey = -1, baseCache = null;
    const cum = new Float32Array(KS * (NS + 1));
    function baseShape(p, cxp, cyp) {                   // points of the superellipse, evenly spread along its length, plus the four corners, as offsets from the centre
      const a = W / 2, b = H / 2, M = 1600, tx = [], ty = [], len = [0];
      for (let i = 0; i <= M; i++) { const t = i / M * 6.283185307, c = Math.cos(t), s = Math.sin(t); tx.push(a * Math.sign(c) * Math.pow(Math.abs(c), 2 / p)); ty.push(b * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)); if (i) len.push(len[i - 1] + Math.hypot(tx[i] - tx[i - 1], ty[i] - ty[i - 1])); }
      const tot = len[M], out = [];
      let j = 0; for (let k = 0; k < KS; k++) { const L = tot * k / KS; while (len[j + 1] < L) j++; const f = (L - len[j]) / Math.max(1e-9, len[j + 1] - len[j]); out.push([lerp(tx[j], tx[j + 1], f), lerp(ty[j], ty[j + 1], f)]); }
      return out;
    }
    return {
      draw(f) {
        const P = f.P, N = P.turns, dens = f.curve.dens;
        if (P.p !== baseKey) { baseKey = P.p; baseCache = baseShape(P.p); }
        const base = baseCache, ox = P.cx * W, oy = P.cy * H, rg = P.range;
        // the rays run from the centre to the edge of the picture: scale the base shape so that it reaches the border on every side from the chosen centre
        const rx = Math.max(ox, W - ox) / (W / 2), ry = Math.max(oy, H - oy) / (H / 2);
        const X = new Float32Array(KS), Y = new Float32Array(KS);
        for (let k = 0; k < KS; k++) { X[k] = ox + base[k][0] * rx; Y[k] = oy + base[k][1] * ry; }
        // running total along each ray
        for (let k = 0; k < KS; k++) {
          const dx = (X[k] - ox) / NS, dy = (Y[k] - oy) / NS, ds = Math.hypot(dx, dy); let s = 0; cum[k * (NS + 1)] = 0;
          for (let i = 0; i < NS; i++) {
            const x = ox + dx * (i + 0.5), y = oy + dy * (i + 0.5);
            const t = clamp(dens(clamp((toneAt(x / W, y / H) - 0.5) * P.con + 0.5)));
            s += ds * lerp(1 / rg, 1, t);                // lines per px: dense = 1, sparse = 1/range
            cum[k * (NS + 1) + i + 1] = s;
          }
        }
        ctx.fillStyle = f.paperCss; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = f.inkCss; ctx.lineWidth = P.w; ctx.lineJoin = 'miter'; ctx.miterLimit = 3; ctx.beginPath();
        const find = (k, target) => {                    // position on ray k (0..1) where the running total, rescaled to N turns, equals "target" turns
          const o = k * (NS + 1), tot = cum[o + NS], want = target / N * tot;
          let lo_ = 0, hi_ = NS; while (hi_ - lo_ > 1) { const m = (lo_ + hi_) >> 1; if (cum[o + m] <= want) lo_ = m; else hi_ = m; }
          const fr = (want - cum[o + lo_]) / Math.max(1e-9, cum[o + hi_] - cum[o + lo_]); return (lo_ + fr) / NS;
        };
        let first = true;
        for (let m = 0; m < N; m++) for (let k = 0; k < KS; k++) {
          const s = find(k, m + k / KS), x = ox + (X[k] - ox) * s, y = oy + (Y[k] - oy) * s;
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        { const s = find(0, N), x = ox + (X[0] - ox) * s, y = oy + (Y[0] - oy) * s; ctx.lineTo(x, y); }
        ctx.stroke();
      },
    };
  },
};
