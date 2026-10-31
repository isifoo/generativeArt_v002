// ISHIHARA: the video drawn with packed circles that never overlap.
// Video brightness -> levels + local contrast = the base tone. Three separate drivers read that tone, each with its own contrast:
// VALUE (how dark the circle is), HUE (figure hue vs ground hue), SIZE (with edge detail). Every number that shapes the look is a slider.
// Every circle eases to its size and colour (smooth damp: slow start, slow end), nothing pops.
// Circles that get squeezed shrink away, gaps get new circles that grow in from zero.
import { $, hold, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, drawCover, noCam } from './ui.js';

const SW = 540, SH = 960, SCALE = 2;          // circle space (sim px), canvas is 2x
const FW = 135, FH = 240;                     // tone field, 4 sim px per cell
const CAP = 30000;

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Contrast (the base tone from the video)' },
  { id: 'ihlo', label: 'Black point %', min: 0, max: 20, step: 0.5, val: 1, off: 'no auto levels: raw video black' },
  { id: 'ihhi', label: 'White point %', min: 0, max: 20, step: 0.5, val: 1, off: 'no auto levels: raw video white' },
  { id: 'ihl', label: 'Local contrast', min: 0, max: 4, step: 0.05, val: 1.6, off: 'global tone only' },
  { id: 'ihlr', label: 'Local radius px', min: 8, max: 240, step: 4, val: 40, off: 'local contrast off' },
  { id: 'ihth', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0, off: '0' },
  { head: 'Value (dark / light of each circle)' },
  { id: 'ihc', label: 'Value contrast', min: 1, max: 30, step: 0.5, val: 7, off: 'linear, no curve' },
  { id: 'ihk', label: 'Value levels', min: 2, max: 10, step: 1, val: 4, off: 'continuous value' },
  { id: 'ihvd', label: 'Darkest value %', min: 0, max: 100, step: 1, val: 40, off: '0 (black)' },
  { id: 'ihvl', label: 'Lightest value %', min: 0, max: 100, step: 1, val: 70, off: '100 (white)' },
  { id: 'ihv', label: 'Value variety %', min: 0, max: 20, step: 0.5, val: 4, off: 'flat values' },
  { head: 'Hue (figure hue vs ground hue)' },
  { id: 'ihhc', label: 'Hue contrast', min: 1, max: 40, step: 0.5, val: 14, off: 'hue blends with the tone' },
  { id: 'ihhs', label: 'Hue split', min: 0, max: 1, step: 0.01, val: 0.5, off: '0.5' },
  { id: 'ihsat', label: 'Saturation %', min: 0, max: 100, step: 1, val: 68, off: '0 (grey)' },
  { id: 'ihhj', label: 'Hue variety deg', min: 0, max: 40, step: 1, val: 8, off: 'one hue per side' },
  { head: 'Size' },
  { id: 'ihmax', label: 'Max circle px', min: 4, max: 40, step: 0.5, val: 11, off: 'all circles min size' },
  { id: 'ihmin', label: 'Min circle px', min: 1.5, max: 12, step: 0.25, val: 2.5, off: 'all circles max size' },
  { id: 'ihsz', label: 'Size by darkness', min: 0, max: 1, step: 0.01, val: 0.45, off: 'darkness does not change size' },
  { id: 'ihd', label: 'Size by detail', min: 0, max: 1, step: 0.01, val: 0.7, off: 'edges do not change size' },
  { id: 'ihds', label: 'Detail sensitivity', min: 0.2, max: 4, step: 0.05, val: 1, off: '1' },
  { id: 'ihsc', label: 'Size contrast', min: 1, max: 30, step: 0.5, val: 3, off: 'linear, no curve' },
  { id: 'ihsr', label: 'Size randomness', min: 0, max: 1, step: 0.01, val: 0.28, off: 'no randomness' },
  { id: 'ihg', label: 'Gap px', min: 0, max: 4, step: 0.1, val: 0.6, off: 'circles touch' },
  { head: 'Motion (speed of change)' },
  { id: 'ihe', label: 'Colour ease s', min: 0.05, max: 4, step: 0.05, val: 0.35, off: 'instant' },
  { id: 'ihse', label: 'Size ease s', min: 0.05, max: 4, step: 0.05, val: 0.45, off: 'instant' },
  { id: 'ihrp', label: 'Repack speed', min: 0, max: 1, step: 0.01, val: 0.7, off: 'no repacking (sizes only shrink / fill)' },
  { id: 'ihf', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.15, off: 'no smoothing' },
  { id: 'ihhy', label: 'Change threshold', min: 0, max: 1, step: 0.01, val: 0.6, off: 'no hold: follows every change' },
];
const P = { pal: 'classic', inv: false, prev: false };
const val = buildSliders(SLIDERS, P);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function eff() {
  let mx = val('ihmax'), mn = val('ihmin');
  if (mx < 0 && mn < 0) { mx = mn = 8; } else if (mx < 0) { mx = mn; } else if (mn < 0) { mn = mx; }
  return {
    lo: val('ihlo'), hi: val('ihhi'), local: val('ihlr') < 0 ? 0 : Math.max(0, val('ihl')), lrad: Math.max(1, Math.round(Math.max(8, P.ihlr) / 4)),
    th: P.on.ihth ? P.ihth : 0,
    vcon: val('ihc'), levels: val('ihk') < 0 ? 0 : Math.round(P.ihk),
    vd: val('ihvd') < 0 ? 0 : P.ihvd / 100, vl: val('ihvl') < 0 ? 1 : P.ihvl / 100, vvar: Math.max(0, val('ihv')) / 100,
    hcon: val('ihhc'), hsplit: P.on.ihhs ? P.ihhs : 0.5, sat: Math.max(0, val('ihsat')) / 100, hjit: Math.max(0, val('ihhj')),
    rmax: Math.max(mx, mn), rmin: Math.min(mx, mn), sizeDark: Math.max(0, val('ihsz')), sizeDetail: Math.max(0, val('ihd')),
    dsens: P.on.ihds ? P.ihds : 1, scon: val('ihsc'), srand: Math.max(0, val('ihsr')), gap: Math.max(0, val('ihg')),
    cease: val('ihe'), sease: val('ihse'), repack: Math.max(0, val('ihrp')), smooth: Math.max(0, val('ihf')), hy: Math.max(0, val('ihhy')),
  };
}
// contrast curve: steepness c around centre m, stretched so 0 -> 0 and 1 -> 1; c < 0 (off) = linear
function curve(t, c, m) {
  if (c < 0) return clamp01(t);
  const s0 = 1 / (1 + Math.exp(m * c)), s1 = 1 / (1 + Math.exp(-(1 - m) * c));
  return clamp01((1 / (1 + Math.exp(-(t - m) * c)) - s0) / (s1 - s0));
}

// ---------------------------------------------------------------- palettes: figure hue (dark side), ground hue (light side), paper
const PALETTES = {
  classic: { hf: 14, hg: 88, paper: '#f7f2e8' },        // red-orange on green
  pastel: { hf: 335, hg: 212, paper: '#f8f5f1' },       // pink on blue
  blueorange: { hf: 24, hg: 205, paper: '#f6f3ee' },    // orange on blue
  bw: { hf: 0, hg: 0, paper: '#f7f6f4', grey: true },   // no hue
  red: { hf: 6, hg: 6, paper: '#fbf8f6' },              // one hue, value only
};
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
// hue position 0 = figure hue, 1 = ground hue (shortest way round); value 0 = darkest, 1 = lightest
function colourOf(hpos, vpos, jit, e, pal) {
  let d = pal.hg - pal.hf; d = ((d + 540) % 360) - 180;
  const h = pal.hf + d * hpos + jit * e.hjit, l = e.vd + (e.vl - e.vd) * vpos;
  return hsl2rgb(h, pal.grey ? 0 : e.sat, clamp01(l + jit * e.vvar));
}
const HQ = 16, VQ = 32, SHADES = 3;           // fill buckets: hue steps x value steps x shade variants
const fillCache = new Map();
let fillKey = '';
function fillOf(qh, qv, s, e, pal) {
  const key = qh * 10000 + qv * 10 + s;
  let f = fillCache.get(key);
  if (!f) { const c = colourOf(qh / HQ, qv / VQ, s - 1, e, pal).map(Math.round); f = `rgb(${c[0]},${c[1]},${c[2]})`; fillCache.set(key, f); }
  return f;
}

// ---------------------------------------------------------------- base tone field (the contrast is the whole game)
// base: 0 = dark video, 1 = light video (after levels + local contrast, before the value / hue / size curves). edge: 0..1 detail.
const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
const fctx = fc.getContext('2d', { willReadFrequently: true });
const N = FW * FH;
const base = new Float32Array(N).fill(0.5), edge = new Float32Array(N);
const gray = new Float32Array(N), mean = new Float32Array(N), tmpA = new Float32Array(N), baseNow = new Float32Array(N), edgeNow = new Float32Array(N);
const fieldInfo = { lo: 0, hi: 255, med: 0.5, ms: 0 };
let fieldReady = false, dirty = true;
function boxBlur(src, dst, r) {                               // separable box blur, clamped edges
  for (let y = 0; y < FH; y++) {
    let acc = 0; const row = y * FW;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(FW - 1, Math.max(0, x))];
    for (let x = 0; x < FW; x++) {
      tmpA[row + x] = acc / (2 * r + 1);
      acc += src[row + Math.min(FW - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < FW; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmpA[Math.min(FH - 1, Math.max(0, y)) * FW + x];
    for (let y = 0; y < FH; y++) {
      dst[y * FW + x] = acc / (2 * r + 1);
      acc += tmpA[Math.min(FH - 1, y + r + 1) * FW + x] - tmpA[Math.max(0, y - r) * FW + x];
    }
  }
}
function updateField() {
  const t0 = performance.now(), e = eff();
  drawCover(fctx, FW, FH);
  const d = fctx.getImageData(0, 0, FW, FH).data, hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) { const g = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); gray[i] = g; hist[g]++; }
  // levels: black / white point percentiles -> 0..1 (off = raw 0..255)
  let cum = 0, lo = 0, hi = 255;
  if (e.lo >= 0) for (let i = 0; i < 256; i++) { cum += hist[i]; if (cum > N * e.lo / 100) { lo = i; break; } }
  cum = 0; if (e.hi >= 0) for (let i = 255; i >= 0; i--) { cum += hist[i]; if (cum > N * e.hi / 100) { hi = i; break; } }
  if (hi - lo < 16) { const c = (hi + lo) / 2; lo = c - 8; hi = c + 8; }
  for (let i = 0; i < N; i++) gray[i] = clamp01((gray[i] - lo) / (hi - lo));
  // local contrast: push each pixel away from its neighbourhood mean
  if (e.local > 0) { boxBlur(gray, mean, e.lrad); for (let i = 0; i < N; i++) baseNow[i] = clamp01(gray[i] + e.local * (gray[i] - mean[i]) + e.th); }
  else for (let i = 0; i < N; i++) baseNow[i] = clamp01(gray[i] + e.th);
  // detail: gradient magnitude, normalised by its 95th percentile
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x, xl = x > 0 ? -1 : 0, xr = x < FW - 1 ? 1 : 0, yu = y > 0 ? -FW : 0, yd = y < FH - 1 ? FW : 0;
    edgeNow[i] = Math.hypot(gray[i + xr] - gray[i + xl], gray[i + yd] - gray[i + yu]);
  }
  boxBlur(edgeNow, mean, 2);                                  // mean is free now: reuse it
  const smp = []; for (let i = 0; i < N; i += 7) smp.push(mean[i]); smp.sort((a, b) => a - b);
  const p95 = Math.max(0.02, smp[(smp.length * 0.95) | 0]);
  // smooth in time (a settings change lands at once; the circles' own easing makes the fade)
  const k = fieldReady && !dirty ? 1 - e.smooth : 1;
  const h2 = new Uint32Array(64);
  for (let i = 0; i < N; i++) {
    base[i] += (baseNow[i] - base[i]) * k;
    edge[i] += (mean[i] / p95 - edge[i]) * k;
    h2[Math.min(63, (base[i] * 64) | 0)]++;
  }
  let c2 = 0, med = 0.5; for (let i = 0; i < 64; i++) { c2 += h2[i]; if (c2 >= N / 2) { med = (i + 0.5) / 64; break; } }
  fieldReady = true; dirty = false;
  fieldInfo.lo = lo; fieldInfo.hi = hi; fieldInfo.med = med; fieldInfo.ms = performance.now() - t0;
}
function sample(a, x, y) {
  const fx = Math.min(FW - 1.001, Math.max(0, x / 4 - 0.5)), fy = Math.min(FH - 1.001, Math.max(0, y / 4 - 0.5));
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * FW + x0;
  return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + FW] * (1 - tx) + a[i + FW + 1] * tx) * ty;
}
// the three drivers, from the base tone t (and edge for size)
const valueOf = (t, e) => { let v = curve(t, e.vcon, fieldInfo.med); if (e.levels) v = Math.round(v * (e.levels - 1)) / (e.levels - 1); return P.inv ? 1 - v : v; };
const hueOf = (t, e) => { const h = curve(t, e.hcon, e.hsplit); return P.inv ? 1 - h : h; };
const sizeOf = (t, ed, e) => curve(Math.min(1, e.sizeDark * (1 - (P.inv ? 1 - t : t)) + e.sizeDetail * Math.min(1, ed * e.dsens)), e.scon, 0.5);

// ---------------------------------------------------------------- circles (structure of arrays)
const C = {
  n: 0, x: new Float32Array(CAP), y: new Float32Array(CAP), r: new Float32Array(CAP), rv: new Float32Array(CAP),
  m: new Float32Array(CAP), mv: new Float32Array(CAP), h: new Float32Array(CAP), hv: new Float32Array(CAP),
  rnd: new Float32Array(CAP), shade: new Uint8Array(CAP),
  die: new Uint8Array(CAP), press: new Uint8Array(CAP), rt: new Float32Array(CAP), want: new Float32Array(CAP),
  lv: new Float32Array(CAP), lh: new Float32Array(CAP),     // value / hue this circle is heading to (held, so no flicker)
};
const KEYS = ['x', 'y', 'r', 'rv', 'm', 'mv', 'h', 'hv', 'rnd', 'shade', 'die', 'press', 'rt', 'want', 'lv', 'lh'];
// size: small where dark and detailed (more resolution), big where light and flat
function targetR(i, x, y, e) {
  if (C.die[i]) return 0;
  const k = sizeOf(sample(base, x, y), sample(edge, x, y), e);
  return (e.rmax + (e.rmin - e.rmax) * k) * (1 - e.srand + e.srand * C.rnd[i]);
}
// hold: a circle only changes its target when the video moved clearly past it (Change threshold)
function held(cur, next, e, step) { return Math.abs(next - cur) > e.hy * step ? next : cur; }
// smooth damp (critically damped spring): starts and ends slowly, never overshoots. T = the whole fade time.
const tmp2 = [0, 0];
function damp(cur, vel, target, T, dt) {
  const o = 2 / (T / 2.5), x = o * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);   // settles in about T seconds
  const ch = cur - target, tmp = (vel + o * ch) * dt;
  tmp2[1] = (vel - o * tmp) * ex; tmp2[0] = target + (ch + tmp) * ex;
}

// spatial grid
let cell = 32, GX = 0, GY = 0, head = new Int32Array(1), next = new Int32Array(CAP);
function buildGrid(rmax, gap) {
  cell = Math.max(6, rmax * 2 + gap);
  GX = Math.ceil(SW / cell) + 1; GY = Math.ceil(SH / cell) + 1;
  if (head.length < GX * GY) head = new Int32Array(GX * GY);
  head.fill(-1, 0, GX * GY);
  for (let i = 0; i < C.n; i++) {
    const c = Math.min(GX - 1, Math.max(0, (C.x[i] / cell) | 0)) + Math.min(GY - 1, Math.max(0, (C.y[i] / cell) | 0)) * GX;
    next[i] = head[c]; head[c] = i;
  }
}
// free radius at (x, y): distance to the nearest circle edge (minus gap) or the frame
function freeAt(x, y, gap, reach) {
  let free = Math.min(x, SW - x, y, SH - y);
  const cx = (x / cell) | 0, cy = (y / cell) | 0, rc = Math.ceil(reach / cell);
  for (let gy = Math.max(0, cy - rc); gy <= Math.min(GY - 1, cy + rc); gy++)
    for (let gx = Math.max(0, cx - rc); gx <= Math.min(GX - 1, cx + rc); gx++)
      for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
        const d = Math.hypot(C.x[j] - x, C.y[j] - y) - Math.max(C.r[j], C.want[j]) - gap;   // growing circles reserve the size they want
        if (d < free) { free = d; if (free <= 0) return free; }
      }
  return free;
}
function addCircle(x, y, e) {
  if (C.n >= CAP) return;
  const i = C.n++;
  C.x[i] = x; C.y[i] = y; C.r[i] = 0; C.rv[i] = 0; C.rnd[i] = Math.random();
  C.shade[i] = (Math.random() * SHADES) | 0; C.die[i] = 0; C.press[i] = 0;
  const t = fieldReady ? sample(base, x, y) : 0.5;
  C.lv[i] = C.m[i] = valueOf(t, e); C.lh[i] = C.h[i] = hueOf(t, e);   // new circles start in their colour and grow in from zero
  C.mv[i] = 0; C.hv[i] = 0; C.rt[i] = 0; C.want[i] = 0;
}
function removeAt(i) {
  const l = --C.n; if (i === l) return;
  for (const k of KEYS) C[k][i] = C[k][l];
}

// ---------------------------------------------------------------- one step
const st = { spawned: 0, killed: 0, ms: 0, fps: 0 };
function step(dt) {
  const t0 = performance.now(), e = eff(), gap = e.gap;
  const vstep = e.levels ? 1 / (e.levels - 1) : 0.15;
  // repack speed: how soon and how often a starved circle makes room (0 = never)
  // a circle held under (1 - needAt) of its wished size waits a few frames, then its smallest touching neighbour fades out
  const rp = e.repack, needAt = 0.6 - 0.45 * rp, waitN = Math.max(1, Math.round((0.08 + 0.9 * (1 - rp)) * (st.fps || 30))), pKill = 0.2 + 0.6 * rp;
  buildGrid(e.rmax, gap);
  const reach = 1;                                            // grid cells around (cell >= 2 * rmax + gap)
  // 1. each circle wants its size, but only grows into half of the free space around it (Pastiche style)
  for (let i = 0; i < C.n; i++) {
    const xi = C.x[i], yi = C.y[i], ri = C.r[i], t = sample(base, xi, yi);
    const lv = C.lv[i] = held(C.lv[i], valueOf(t, e), e, vstep);
    const lh = C.lh[i] = held(C.lh[i], hueOf(t, e), e, 0.2);
    const want = targetR(i, xi, yi, e);
    let space = Math.min(xi - ri, SW - xi - ri, yi - ri, SH - yi - ri) * 2, nb = -1, nbr = 1e9;
    const cx = (xi / cell) | 0, cy = (yi / cell) | 0;
    for (let gy = Math.max(0, cy - reach); gy <= Math.min(GY - 1, cy + reach); gy++)
      for (let gx = Math.max(0, cx - reach); gx <= Math.min(GX - 1, cx + reach); gx++)
        for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const s = Math.hypot(C.x[j] - xi, C.y[j] - yi) - ri - C.r[j] - gap;
          if (s < space) space = s;
          if (s < 1 && !C.die[j] && C.r[j] < nbr) { nbr = C.r[j]; nb = j; }   // smallest touching neighbour
        }
    const cap = ri + (space > 0 ? space * 0.5 : space);
    const rt = C.die[i] ? 0 : Math.max(0, Math.min(want, cap));
    C.rt[i] = rt;
    // starved: held well under its wished size by the neighbours -> the smallest touching neighbour fades out
    const need = 1 - cap / Math.max(want, 1e-3), wait = rp > 0 && need > needAt ? waitN : 0;
    // a starved circle reserves its whole wished size, so new circles don't spawn into the room it is waiting for
    C.want[i] = C.die[i] ? 0 : wait ? want : Math.min(want, ri + Math.max(space, 0));
    if (!C.die[i] && wait && ri > 0.5) {
      if (++C.press[i] > wait && nb >= 0 && nbr <= ri && Math.random() < pKill) {
        // make room in one go: every smaller neighbour inside the wished size fades out together
        for (let gy = Math.max(0, cy - reach); gy <= Math.min(GY - 1, cy + reach); gy++)
          for (let gx = Math.max(0, cx - reach); gx <= Math.min(GX - 1, cx + reach); gx++)
            for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
              if (j === i || C.die[j] || C.r[j] > ri) continue;
              if (Math.hypot(C.x[j] - xi, C.y[j] - yi) < want + C.r[j] * 0.5 + gap) { C.die[j] = 1; st.killed++; }
            }
        C.press[i] = 0;
      }
    } else if (C.press[i] > 0) C.press[i]--;
    if (e.sease < 0) C.r[i] = rt;
    else { damp(ri, C.rv[i], rt, e.sease, dt); C.r[i] = Math.max(0, Math.min(tmp2[0], Math.max(cap, 0))); C.rv[i] = tmp2[1]; }
    if (e.cease < 0) { C.m[i] = lv; C.h[i] = lh; continue; }
    damp(C.m[i], C.mv[i], lv, e.cease, dt); C.m[i] = clamp01(tmp2[0]); C.mv[i] = tmp2[1];
    damp(C.h[i], C.hv[i], lh, e.cease, dt); C.h[i] = clamp01(tmp2[0]); C.hv[i] = tmp2[1];
  }
  // 2. one light pass to clear any leftover overlap
  buildGrid(e.rmax, gap);
  for (let i = 0; i < C.n; i++) {
    const xi = C.x[i], yi = C.y[i], ri = C.r[i], cx = (xi / cell) | 0, cy = (yi / cell) | 0;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(GY - 1, cy + 1); gy++)
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(GX - 1, cx + 1); gx++)
        for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const dx = C.x[j] - xi, dy = C.y[j] - yi, rr = ri + C.r[j] + gap, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) + 1e-6, o = (rr - d) * 0.5, ux = dx / d, uy = dy / d;
          const ai = ri * ri + 0.01, aj = C.r[j] * C.r[j] + 0.01, wi = aj / (ai + aj), wj = ai / (ai + aj);
          C.x[i] -= ux * o * wi; C.y[i] -= uy * o * wi; C.x[j] += ux * o * wj; C.y[j] += uy * o * wj;
        }
  }
  for (let i = 0; i < C.n; i++) {
    const r = C.r[i];
    C.x[i] = Math.min(SW - r, Math.max(r, C.x[i])); C.y[i] = Math.min(SH - r, Math.max(r, C.y[i]));
  }
  // 3. faded out circles leave
  for (let i = C.n - 1; i >= 0; i--) if (C.die[i] && C.r[i] < 0.25) removeAt(i);
  // 4. fill the gaps: new circles grow in from zero
  buildGrid(e.rmax, gap);
  const tries = C.n < 200 ? 6000 : 900;
  for (let k = 0; k < tries; k++) {
    const x = Math.random() * SW, y = Math.random() * SH;
    const free = freeAt(x, y, gap, e.rmax * 2 + gap);
    if (free >= e.rmin * 0.9 && C.n < CAP) {
      const i = C.n; addCircle(x, y, e); st.spawned++;
      C.want[i] = Math.min(free, targetR(i, x, y, e));   // reserve its room so the next spawn keeps away
      const c = Math.min(GX - 1, (x / cell) | 0) + Math.min(GY - 1, (y / cell) | 0) * GX; next[i] = head[c]; head[c] = i;
    }
  }
  st.ms = performance.now() - t0;
}

// ---------------------------------------------------------------- draw
const canvas = $('#cv'), ctx = canvas.getContext('2d');
const pv = document.createElement('canvas'); pv.width = FW; pv.height = FH;
const pvx = pv.getContext('2d'), pvImg = pvx.createImageData(FW, FH);
function draw() {
  const pal = PALETTES[P.pal] || PALETTES.classic, e = eff();
  const key = [P.pal, e.vd, e.vl, e.vvar, e.sat, e.hjit].join();
  if (key !== fillKey) { fillCache.clear(); fillKey = key; }    // colours changed: rebuild the fill styles
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (P.prev) {                                               // preview: the colour map the circles follow
    for (let i = 0; i < N; i++) {
      const c = colourOf(hueOf(base[i], e), valueOf(base[i], e), 0, e, pal);
      pvImg.data[i * 4] = c[0]; pvImg.data[i * 4 + 1] = c[1]; pvImg.data[i * 4 + 2] = c[2]; pvImg.data[i * 4 + 3] = 255;
    }
    pvx.putImageData(pvImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(pv, 0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const buckets = new Map();
  for (let i = 0; i < C.n; i++) {
    if (C.r[i] <= 0.15) continue;
    const k = Math.round(C.h[i] * HQ) * 10000 + Math.round(C.m[i] * VQ) * 10 + C.shade[i];
    let L = buckets.get(k); if (!L) { L = []; buckets.set(k, L); } L.push(i);
  }
  for (const [k, L] of buckets) {
    ctx.beginPath();
    for (const i of L) { ctx.moveTo(C.x[i] + C.r[i], C.y[i]); ctx.arc(C.x[i], C.y[i], C.r[i], 0, Math.PI * 2); }
    ctx.fillStyle = fillOf((k / 10000) | 0, ((k % 10000) / 10) | 0, k % 10, e, pal); ctx.fill();
  }
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML =
    row('circles', C.n.toLocaleString()) +
    row('CPU step (pack + ease)', st.ms.toFixed(2) + ' ms') +
    row('CPU tone field', fieldInfo.ms.toFixed(2) + ' ms') +
    row('video black / white point', Math.round(fieldInfo.lo) + ' / ' + Math.round(fieldInfo.hi)) +
    row('median tone (value curve centre)', fieldInfo.med.toFixed(2)) +
    row('frames per second', st.fps.toFixed(1));
  $('#budget').style.width = Math.min(100, (st.ms + fieldInfo.ms) / 33.3 * 100) + '%';
}
setInterval(renderStats, 250);

// ---------------------------------------------------------------- loop
let lastMedia = -1, lastT = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (dt > 0) st.fps = st.fps ? st.fps * 0.9 + 0.1 / dt : 1 / dt;
  if (vid.readyState >= 2 && (vid.currentTime !== lastMedia || dirty)) { lastMedia = vid.currentTime; updateField(); }
  if (!fieldReady) return;
  step(dt);
  draw();
}

// ---------------------------------------------------------------- UI
canvas.width = SW * SCALE; canvas.height = SH * SCALE;
$('#settings').addEventListener('input', () => { dirty = true; }, true);   // a paused video still follows every control
$('#settings').addEventListener('change', () => { dirty = true; }, true);
$('#ihpal').onchange = (e) => { P.pal = e.target.value; dirty = true; };
$('#ihinv').onchange = (e) => { P.inv = e.target.checked; dirty = true; };
$('#ihprev').onchange = (e) => { P.prev = e.target.checked; };
$('#restart').onclick = () => { C.n = 0; };
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r2');                                       // r2: slider set changed in v1.30, older saved defaults are dropped

window.__state = { C, P, eff, base, edge, fieldInfo, st };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
