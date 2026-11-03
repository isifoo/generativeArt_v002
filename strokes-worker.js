// Live strokes (v2.41): the Overlay as long brush strokes (Overlay 016 / Motion 007), traced from the camera off the main thread.
// Per frame: detector (difference of blurs) -> direction field (structure tensor + eddies + whirls at the features) ->
// evenly spaced streamlines, seeded from the previous frame's strokes carried by optical flow -> stroke widths from the darkness
// -> triangle strips (x, y, signed distance, half width) for the GPU. Picture units: 540 x 960; the field lives at half of that.
'use strict';
const W = 540, H = 960, FW = 270, FH = 480;
const DET = { size: 30, contrast: 40, thr: 0.3, soft: 0.45, blacks: 0.18 };           // the detector settings Motion 007 was made with
const PAR = { dsep: 3, dtest: 1.8, step: 0.5, cosTurn: Math.cos(0.5), minLen: 20, tLo: 0.06, tHi: 0.65, gamma: 0.8, wMax: 2.1, wMin: 0.3, win: 21, minRun: 16, sub: 2,
  nCentres: 30, vStrength: 1.5, vRadius: 16.25, pitch: 25 * Math.PI / 180, curlDeg: 55 * Math.PI / 180 };

// ---------------------------------------------------------------- blurs (true kernel when small, three box passes when large)
function boxPass(a, w, h, r, horiz) {
  const o = new Float32Array(a.length), n = 2 * r + 1;
  if (horiz) {
    for (let y = 0; y < h; y++) {
      const row = y * w; let s = 0;
      for (let i = -r; i <= r; i++) s += a[row + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        o[row + x] = s / n;
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        o[y * w + x] = s / n;
        s += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r - 0) * w + x];
      }
    }
  }
  return o;
}
function kernelPass(a, w, h, k, horiz) {
  const r = (k.length - 1) >> 1, o = new Float32Array(a.length);
  if (horiz) {
    for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * a[row + Math.min(w - 1, Math.max(0, x + i))]; o[row + x] = s; } }
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * a[Math.min(h - 1, Math.max(0, y + i)) * w + x]; o[y * w + x] = s; }
  }
  return o;
}
function gblur(a, w, h, s) {
  if (s <= 0.05) return Float32Array.from(a);
  if (s <= 3) {
    const r = Math.max(1, Math.ceil(3 * s)), k = new Float32Array(2 * r + 1); let t = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * s * s)); t += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= t;
    return kernelPass(kernelPass(a, w, h, k, true), w, h, k, false);
  }
  const r = Math.max(1, Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2));
  let o = a; for (let p = 0; p < 3; p++) o = boxPass(boxPass(o, w, h, r, true), w, h, r, false);
  return o;
}
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function down2(a, w, h) {
  const w2 = w >> 1, h2 = h >> 1, o = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) o[y * w2 + x] = 0.25 * (a[2 * y * w + 2 * x] + a[2 * y * w + 2 * x + 1] + a[(2 * y + 1) * w + 2 * x] + a[(2 * y + 1) * w + 2 * x + 1]);
  return o;
}
function bil(a, w, h, x, y) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return a[i] * (1 - fx) * (1 - fy) + a[i + 1] * fx * (1 - fy) + a[i + w] * (1 - fx) * fy + a[i + w + 1] * fx * fy;
}

// ---------------------------------------------------------------- flow: pyramid Lucas-Kanade at quarter resolution (as in the lab)
function upTo(a, w, h, W2, H2) {
  const o = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) { const sy = (y + 0.5) * h / H2 - 0.5; for (let x = 0; x < W2; x++) o[y * W2 + x] = bil(a, w, h, (x + 0.5) * w / W2 - 0.5, sy); }
  return o;
}
function lkFlow(A, B, w, h, levels = 3, iters = 4, win = 2.0, smooth = 2.0) {
  const pa = [{ d: A, w, h }], pb = [{ d: B, w, h }];
  for (let l = 1; l < levels; l++) { const a = pa[l - 1], b = pb[l - 1]; pa.push({ d: down2(a.d, a.w, a.h), w: a.w >> 1, h: a.h >> 1 }); pb.push({ d: down2(b.d, b.w, b.h), w: b.w >> 1, h: b.h >> 1 }); }
  let fx = null, fy = null;
  for (let lv = levels - 1; lv >= 0; lv--) {
    const a = pa[lv], b = pb[lv], n = a.w * a.h;
    if (fx === null) { fx = new Float32Array(n); fy = new Float32Array(n); }
    else { const p = pa[lv + 1]; fx = upTo(fx.map((v) => v * 2), p.w, p.h, a.w, a.h); fy = upTo(fy.map((v) => v * 2), p.w, p.h, a.w, a.h); }
    const gx = new Float32Array(n), gy = new Float32Array(n);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x, xm = Math.max(0, x - 1), xp = Math.min(a.w - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(a.h - 1, y + 1);
      gx[i] = (a.d[y * a.w + xp] - a.d[y * a.w + xm]) / (xp - xm || 1); gy[i] = (a.d[yp * a.w + x] - a.d[ym * a.w + x]) / (yp - ym || 1);
    }
    const mul = (p, q) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = p[i] * q[i]; return o; };
    const Ixx = gblur(mul(gx, gx), a.w, a.h, win), Ixy = gblur(mul(gx, gy), a.w, a.h, win), Iyy = gblur(mul(gy, gy), a.w, a.h, win);
    const det = new Float32Array(n); for (let i = 0; i < n; i++) det[i] = Ixx[i] * Iyy[i] - Ixy[i] * Ixy[i] + 1e-6;
    for (let it = 0; it < iters; it++) {
      const diff = new Float32Array(n);
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x; diff[i] = bil(b.d, b.w, b.h, x + fx[i], y + fy[i]) - a.d[i]; }
      const bx = gblur(mul(gx, diff), a.w, a.h, win), by = gblur(mul(gy, diff), a.w, a.h, win);
      for (let i = 0; i < n; i++) {
        const dx = -(Iyy[i] * bx[i] - Ixy[i] * by[i]) / det[i], dy = -(-Ixy[i] * bx[i] + Ixx[i] * by[i]) / det[i];
        fx[i] += Math.min(1, Math.max(-1, dx)); fy[i] += Math.min(1, Math.max(-1, dy));
      }
    }
    const cw = new Float32Array(n); let mean = 0;
    for (let i = 0; i < n; i++) { cw[i] = (Ixx[i] + Iyy[i] - Math.sqrt((Ixx[i] - Iyy[i]) ** 2 + 4 * Ixy[i] * Ixy[i])) / 2; mean += cw[i]; } mean /= n;
    for (let i = 0; i < n; i++) cw[i] /= mean + 1e-9;
    const s = smooth * (lv === 0 ? 1 : 0.7), fxw = new Float32Array(n), fyw = new Float32Array(n);
    for (let i = 0; i < n; i++) { fxw[i] = fx[i] * cw[i]; fyw[i] = fy[i] * cw[i]; }
    const bc = gblur(cw, a.w, a.h, s), bxx = gblur(fxw, a.w, a.h, s), byy = gblur(fyw, a.w, a.h, s);
    for (let i = 0; i < n; i++) { fx[i] = bxx[i] / (bc[i] + 1e-6); fy[i] = byy[i] / (bc[i] + 1e-6); }
  }
  return { fx, fy, w: pa[0].w, h: pa[0].h };
}

// ---------------------------------------------------------------- the direction field (doubled angle: cos 2a, sin 2a), at half resolution
const GW = 135, GH = 240;                                  // the direction field is smooth, so it lives at a quarter of the picture
let noise = null;                                          // the large slow eddies: fixed, made once
function makeNoise() {
  let s = 3 >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = new Float32Array(GW * GH); for (let i = 0; i < a.length; i++) a[i] = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.2831853 * rnd());
  const b = gblur(a, GW, GH, 11.25); let m = 0; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i])); for (let i = 0; i < b.length; i++) b[i] /= m + 1e-9;
  return b;
}
function featureCentres(I) {                               // peaks of a blob detector (dark round spots: eyes, nostrils, tufts)
  const D = gblur(I.map((v) => 1 - v), GW, GH, 1.0), B = new Float32Array(GW * GH);
  const at = (y, x) => D[Math.min(GH - 1, Math.max(0, y)) * GW + Math.min(GW - 1, Math.max(0, x))];
  let mx = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dxx = at(y, x + 1) - 2 * at(y, x) + at(y, x - 1), dyy = at(y + 1, x) - 2 * at(y, x) + at(y - 1, x);
    const dxy = (at(y + 1, x + 1) - at(y + 1, x - 1) - at(y - 1, x + 1) + at(y - 1, x - 1)) / 4;
    const v = dxx + dyy < 0 ? dxx * dyy - dxy * dxy : 0; B[y * GW + x] = v; if (v > mx) mx = v;
  }
  const thr = 0.08 * mx, m = 2; const cand = [];
  for (let y = m; y < GH - m; y++) for (let x = m; x < GW - m; x++) {
    const v = B[y * GW + x]; if (v <= thr) continue;
    let ok = true; for (let j = -2; j <= 2 && ok; j++) for (let i = -2; i <= 2; i++) if (B[(y + j) * GW + x + i] > v) { ok = false; break; }
    if (ok) cand.push([x, y, v]);
  }
  cand.sort((p, q) => q[2] - p[2]); const out = [];
  for (const c of cand) { if (out.every((o) => (c[0] - o[0]) ** 2 + (c[1] - o[1]) ** 2 > 6.9 * 6.9)) { out.push(c); if (out.length >= PAR.nCentres) break; } }
  const v0 = out.length ? out[0][2] : 1; return out.map((c) => [c[0], c[1], c[2] / v0]);
}
function makeField(I2 /* ink-free picture at half resolution, 1 = paper */) {
  const I = down2(I2, FW, FH), n = GW * GH, g = gblur(I, GW, GH, 0.25), gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const xm = Math.max(0, x - 1), xp = Math.min(GW - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(GH - 1, y + 1), i = y * GW + x;
    gx[i] = (g[y * GW + xp] - g[y * GW + xm]) / 2; gy[i] = (g[yp * GW + x] - g[ym * GW + x]) / 2;
  }
  const e = new Float32Array(n), f = new Float32Array(n), gg = new Float32Array(n);
  for (let i = 0; i < n; i++) { e[i] = gx[i] * gx[i]; f[i] = gx[i] * gy[i]; gg[i] = gy[i] * gy[i]; }
  const E = gblur(e, GW, GH, 3.75), F = gblur(f, GW, GH, 3.75), G = gblur(gg, GW, GH, 3.75);
  const c0 = new Float32Array(n), s0 = new Float32Array(n);
  for (let i = 0; i < n; i++) { const th = 0.5 * Math.atan2(2 * F[i], E[i] - G[i]) + Math.PI / 2; c0[i] = Math.cos(2 * th); s0[i] = Math.sin(2 * th); }
  const c1 = gblur(c0, GW, GH, 0.75), s1 = gblur(s0, GW, GH, 0.75);
  if (!noise) noise = makeNoise();
  const C = new Float32Array(n), S = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = 0.5 * Math.atan2(s1[i], c1[i]) + PAR.curlDeg * noise[i]; C[i] = Math.cos(2 * a); S[i] = Math.sin(2 * a); }
  const cs = featureCentres(I), R = PAR.vRadius / 2, R3 = Math.ceil(3 * R);
  cs.forEach(([cx, cy, v], k) => {
    const sign = k % 2 ? -1 : 1, y0 = Math.max(0, cy - R3), y1 = Math.min(GH - 1, cy + R3), x0 = Math.max(0, cx - R3), x1 = Math.min(GW - 1, cx + R3);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy, r2 = dx * dx + dy * dy, wt = PAR.vStrength * v * Math.exp(-r2 / (2 * R * R)), a = Math.atan2(dy, dx) + Math.PI / 2 - sign * PAR.pitch, i = y * GW + x;
      C[i] += wt * Math.cos(2 * a); S[i] += wt * Math.sin(2 * a);
    }
  });
  for (let i = 0; i < n; i++) { const m = Math.hypot(C[i], S[i]) + 1e-9; C[i] /= m; S[i] /= m; }
  return { C, S };
}

// ---------------------------------------------------------------- evenly spaced streamlines (Jobard-Lefer), seeds tried first
function streamlines(C, S, seeds) {
  const cell = PAR.dsep, gw = Math.ceil(W / cell) + 3, gh = Math.ceil(H / cell) + 3;
  const head = new Int32Array(gw * gh).fill(-1); let cap = 1 << 20, nxt = new Int32Array(cap), px = new Float32Array(cap), py = new Float32Array(cap), pl = new Int32Array(cap), np = 0;
  const grow = () => { cap *= 2; const g = (A, T) => { const o = new T(cap); o.set(A); return o; }; nxt = g(nxt, Int32Array); px = g(px, Float32Array); py = g(py, Float32Array); pl = g(pl, Int32Array); };
  const dirat = (x, y) => {
    const c = bil(C, GW, GH, x * 0.25 - 0.375, y * 0.25 - 0.375), s = bil(S, GW, GH, x * 0.25 - 0.375, y * 0.25 - 0.375), a = 0.5 * Math.atan2(s, c); return [Math.cos(a), Math.sin(a)];
  };
  const near = (x, y, r, lid) => {
    const gx = Math.floor(x / cell) + 1, gy = Math.floor(y / cell) + 1, r2 = r * r;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy; if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
      for (let i = head[cy * gw + cx]; i >= 0; i = nxt[i]) if (pl[i] !== lid) { const dx = px[i] - x, dy = py[i] - y; if (dx * dx + dy * dy < r2) return true; }
    }
    return false;
  };
  const trace = (sx, sy, lid) => {
    const halves = [], d0 = dirat(sx, sy);
    for (const sgn of [1, -1]) {
      let x = sx, y = sy, dx = sgn * d0[0], dy = sgn * d0[1]; const pts = [];
      for (let k = 0; k < 8000; k++) {
        let [tx, ty] = dirat(x, y); if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }
        if (tx * dx + ty * dy < PAR.cosTurn) break;
        dx = tx; dy = ty; const nx = x + PAR.step * dx, ny = y + PAR.step * dy;
        if (nx < 0 || ny < 0 || nx > W - 1.001 || ny > H - 1.001) break;
        if (near(nx, ny, PAR.dtest, lid)) break;
        x = nx; y = ny; pts.push(x, y);
      }
      halves.push(pts);
    }
    const a = halves[1], b = halves[0], out = [];
    for (let i = a.length - 2; i >= 0; i -= 2) out.push(a[i], a[i + 1]);
    out.push(sx, sy); for (let i = 0; i < b.length; i++) out.push(b[i]);
    return out;
  };
  const lines = [], queue = []; let qh = 0;
  const add = (pts) => {
    const lid = lines.length; lines.push(pts);
    for (let i = 0; i < pts.length; i += 2) {
      if (np >= cap) grow();
      const g = (Math.floor(pts[i + 1] / cell) + 1) * gw + Math.floor(pts[i] / cell) + 1; px[np] = pts[i]; py[np] = pts[i + 1]; pl[np] = lid; nxt[np] = head[g]; head[g] = np; np++;
    }
    return lid;
  };
  let seeded = 0;
  if (seeds) for (const [sx, sy] of seeds) {
    if (!(sx >= 0 && sy >= 0 && sx <= W - 1.001 && sy <= H - 1.001) || near(sx, sy, PAR.dsep * 0.95, -1)) continue;
    const pts = trace(sx, sy, lines.length); if (pts.length / 2 >= PAR.minLen) { queue.push(add(pts)); seeded++; }
  }
  const fallback = [[W / 2, H / 2]]; for (let y = PAR.dsep; y < H - 1; y += PAR.dsep * 6) for (let x = PAR.dsep; x < W - 1; x += PAR.dsep * 6) fallback.push([x + 0.5, y + 0.5]);
  let fi = 0;
  for (;;) {
    if (qh >= queue.length) {
      while (fi < fallback.length && near(fallback[fi][0], fallback[fi][1], PAR.dsep, -1)) fi++;
      if (fi >= fallback.length) break;
      const pts = trace(fallback[fi][0], fallback[fi][1], lines.length); fi++;
      if (pts.length / 2 >= PAR.minLen) queue.push(add(pts));
      continue;
    }
    const pts = lines[queue[qh++]], kk = Math.max(1, Math.floor(PAR.dsep / 2 / PAR.step)), n = pts.length / 2;
    for (let i = 0; i < n; i += kk) {
      const x = pts[2 * i], y = pts[2 * i + 1], j0 = Math.max(i - 1, 0), j1 = Math.min(i + 1, n - 1);
      const tx = pts[2 * j1] - pts[2 * j0], ty = pts[2 * j1 + 1] - pts[2 * j0 + 1], m = Math.hypot(tx, ty) + 1e-9, nx = -ty / m, ny = tx / m;
      for (const sgn of [1, -1]) {
        const sx = x + sgn * PAR.dsep * nx, sy = y + sgn * PAR.dsep * ny;
        if (sx < 0 || sy < 0 || sx > W - 1.001 || sy > H - 1.001 || near(sx, sy, PAR.dsep * 0.95, -1)) continue;
        const np2 = trace(sx, sy, lines.length); if (np2.length / 2 >= PAR.minLen) queue.push(add(np2));
      }
    }
  }
  return { lines, seeded };
}

// ---------------------------------------------------------------- widths from the darkness along each stroke, then triangle strips
function buildStrips(lines, D) {                           // D: darkness 0..1 at half resolution (1 - blurred overlay ink)
  const runs = []; let nv = 0;
  for (const p of lines) {
    const n = p.length / 2; if (n < 2) continue;
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) { const d = bil(D, FW, FH, p[2 * i] * 0.5, p[2 * i + 1] * 0.5); t[i] = Math.pow(Math.min(1, Math.max(0, (d - PAR.tLo) / (PAR.tHi - PAR.tLo))), PAR.gamma); }
    const k = PAR.win, hk = k >> 1, ts = new Float32Array(n);                // moving average along the stroke, edges padded
    let s = 0; for (let i = -hk; i <= hk; i++) s += t[Math.min(n - 1, Math.max(0, i))];
    for (let i = 0; i < n; i++) { ts[i] = s / k; s += t[Math.min(n - 1, i + hk + 1)] - t[Math.max(0, i - hk)]; }
    let a = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && ts[i] > 0.03;
      if (on && a < 0) a = i;
      if (!on && a >= 0) { if (i - a >= PAR.minRun) { runs.push([p, ts, a, i]); nv += Math.ceil((i - a) / PAR.sub) + 1; } a = -1; }
    }
  }
  const V = new Float32Array(nv * 2 * 4), IX = new Uint32Array(nv * 2 + runs.length); let vi = 0, ii = 0, base = 0;
  for (const [p, ts, a, b] of runs) {
    const idx = []; for (let i = a; i < b; i += PAR.sub) idx.push(i); if (idx[idx.length - 1] !== b - 1) idx.push(b - 1);
    for (let q = 0; q < idx.length; q++) {
      const i = idx[q], j0 = idx[Math.max(0, q - 1)], j1 = idx[Math.min(idx.length - 1, q + 1)];
      let tx = p[2 * j1] - p[2 * j0], ty = p[2 * j1 + 1] - p[2 * j0 + 1]; const m = Math.hypot(tx, ty) + 1e-9; tx /= m; ty /= m;
      const t = ts[i], r = 0.5 * (PAR.wMin * Math.min(1, t / 0.15) + (PAR.wMax - PAR.wMin) * t), off = r + 0.75, x = p[2 * i], y = p[2 * i + 1], nx = -ty, ny = tx;
      V.set([x + nx * off, y + ny * off, off, r, x - nx * off, y - ny * off, -off, r], vi); vi += 8;
      IX[ii++] = base + 2 * q; IX[ii++] = base + 2 * q + 1;
    }
    base += 2 * idx.length; IX[ii++] = 0xFFFFFFFF;
  }
  return { V: V.subarray(0, vi), IX: IX.subarray(0, ii) };
}

// ---------------------------------------------------------------- one frame
const state = { prevQ: null, prevMids: null };
function runFrame(luma /* Uint8Array 540 x 960 */) {
  const t0 = Date.now(), L = new Float32Array(W * H); for (let i = 0; i < L.length; i++) L[i] = luma[i] / 255;
  const L2 = down2(L, W, H), f = gblur(L2, FW, FH, 0.42), c = gblur(L2, FW, FH, 0.105 * DET.size);
  const I = new Float32Array(FW * FH), D = new Float32Array(FW * FH);
  for (let i = 0; i < I.length; i++) {
    let ink = smooth01(DET.thr, DET.thr + DET.soft, (c[i] - f[i]) * DET.contrast);
    ink = Math.max(ink, 1 - smooth01(DET.blacks - 0.04, DET.blacks + 0.04, f[i])); I[i] = 1 - ink; D[i] = ink;
  }
  const Dk = gblur(D, FW, FH, 0.75);
  const { C, S } = makeField(I), tF = Date.now();
  const Q = down2(down2(down2(L, W, H), W >> 1, H >> 1), W >> 2, H >> 2); let seeds = null;
  if (state.prevQ && state.prevMids) {
    const qw = W >> 3, qh = H >> 3, fl = lkFlow(state.prevQ, Q, qw, qh);
    seeds = state.prevMids.map(([x, y]) => { const qx = x / 8 - 0.4375, qy = y / 8 - 0.4375; return [x + 8 * bil(fl.fx, qw, qh, qx, qy), y + 8 * bil(fl.fy, qw, qh, qx, qy)]; });
  }
  const tL = Date.now(), { lines, seeded } = streamlines(C, S, seeds), tS = Date.now();
  state.prevQ = Q; state.prevMids = lines.map((p) => { const n = p.length / 2 >> 1; return [p[2 * n], p[2 * n + 1]]; });
  const out = buildStrips(lines, Dk);
  return { V: out.V, IX: out.IX, stats: { lines: lines.length, seeded, verts: out.V.length / 4, field: tF - t0, flow: tL - tF, trace: tS - tL, strips: Date.now() - tS, total: Date.now() - t0 } };
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e) => { const r = runFrame(e.data.L); self.postMessage(r, [r.V.buffer, r.IX.buffer]); };
}
if (typeof module !== 'undefined') module.exports = { runFrame, state };
