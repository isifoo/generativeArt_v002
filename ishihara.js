// ISHIHARA: the video drawn with packed circles that never overlap.
// Video brightness -> levels + local contrast = the base tone. Three separate drivers read that tone, each with its own contrast:
// VALUE (how dark the circle is), HUE (figure hue vs ground hue), SIZE (with edge detail). Every number that shapes the look is a slider.
// Every circle eases to its size and colour (smooth damp: slow start, slow end), nothing pops.
// Circles that get squeezed shrink away, gaps get new circles that grow in from zero.
import { $, hold, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, drawCover, noCam } from './ui.js';
import { createWheel, colRGB, colHex, hexToCol } from './colorwheel.js';

const SW = 540, SH = 960, SCALE = 2;          // circle space (sim px), canvas is 2x
const FW = 135, FH = 240;                     // tone field, 4 sim px per cell
const CAP = 30000;

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Contrast (the base tone from the video)' },
  { id: 'ihlo', label: 'Levels clip %', min: 0, max: 20, step: 0.5, val: 1, off: 'no auto levels: raw video' },
  { id: 'ihl', label: 'Local contrast', min: 0, max: 4, step: 0.05, val: 1.6, off: 'global tone only' },
  { id: 'ihth', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0, off: '0' },
  { head: 'Value (dark / light of each circle)' },
  { id: 'ihc', label: 'Value contrast', min: 1, max: 30, step: 0.5, val: 7, off: 'linear, no curve' },
  { id: 'ihvr', label: 'Value range %', min: 0, max: 100, step: 1, val: 20, off: '0: the colours exactly as picked' },
  { id: 'ihv', label: 'Value variety %', min: 0, max: 20, step: 0.5, val: 4, off: 'flat values' },
  { head: 'Hue (figure hue vs ground hue)' },
  { id: 'ihhc', label: 'Hue contrast', min: 1, max: 40, step: 0.5, val: 14, off: 'hue blends with the tone' },
  { id: 'ihhs', label: 'Hue split', min: 0, max: 1, step: 0.01, val: 0.5, off: '0.5' },
  { id: 'ihsat', label: 'Saturation scale %', min: 0, max: 200, step: 1, val: 100, off: '100: as picked' },
  { id: 'ihhj', label: 'Hue variety deg', min: 0, max: 40, step: 1, val: 8, off: 'one hue per side' },
  { head: 'Size' },
  { id: 'ihmax', label: 'Max circle px', min: 4, max: 40, step: 0.5, val: 11, off: 'all circles min size' },
  { id: 'ihmin', label: 'Min circle px', min: 1.5, max: 12, step: 0.25, val: 2.5, off: 'all circles max size' },
  { id: 'ihsz', label: 'Size by darkness', min: 0, max: 1, step: 0.01, val: 0.45, off: 'darkness does not change size' },
  { id: 'ihd', label: 'Size by detail', min: 0, max: 2, step: 0.01, val: 0.7, off: 'edges do not change size' },
  { id: 'ihsc', label: 'Size contrast', min: 1, max: 30, step: 0.5, val: 3, off: 'linear, no curve' },
  { id: 'ihsr', label: 'Size randomness', min: 0, max: 1, step: 0.01, val: 0.28, off: 'no randomness' },
  { head: 'Spacing (distance between circles)' },
  { id: 'ihg', label: 'Gap px', min: 0, max: 20, step: 0.1, val: 0.3, off: 'circles touch' },
  { id: 'ihgd', label: 'Gap by darkness', min: -1, max: 1, step: 0.01, val: 0, off: 'same gap everywhere' },
  { id: 'ihfl', label: 'Fill holes', min: 0, max: 1, step: 0.01, val: 1, off: 'no filler dots, only normal circles' },
  { head: 'Motion (speed of change)' },
  { id: 'ihe', label: 'Colour ease s', min: 0.05, max: 4, step: 0.05, val: 0.35, off: 'instant' },
  { id: 'ihse', label: 'Size ease s', min: 0.05, max: 4, step: 0.05, val: 0.45, off: 'instant' },
  { id: 'ihrp', label: 'Repack speed', min: 0, max: 1, step: 0.01, val: 0.7, off: 'no repacking (sizes only shrink / fill)' },
  { id: 'ihf', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.15, off: 'no smoothing' },
  { id: 'ihw', label: 'Wiggle px', min: 0, max: 4, step: 0.05, val: 0.6, off: 'still' },
  { id: 'ihws', label: 'Wiggle speed', min: 0, max: 3, step: 0.05, val: 0.5, off: 'still' },
  { id: 'ihhy', label: 'Change threshold', min: 0, max: 1, step: 0.01, val: 0.6, off: 'no hold: follows every change' },
];
const P = { pal: 'classic', inv: false, prev: false };
const val = buildSliders(SLIDERS, P);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function eff() {
  let mx = val('ihmax'), mn = val('ihmin');
  if (mx < 0 && mn < 0) { mx = mn = 8; } else if (mx < 0) { mx = mn; } else if (mn < 0) { mn = mx; }
  return {
    lo: val('ihlo'), hi: val('ihlo'), local: Math.max(0, val('ihl')), lrad: 10,   // local contrast radius: 10 cells = 40 px
    th: P.on.ihth ? P.ihth : 0,
    vcon: val('ihc'), levels: 0,
    vrange: Math.max(0, val('ihvr')) / 100, vvar: Math.max(0, val('ihv')) / 100,
    hcon: val('ihhc'), hsplit: P.on.ihhs ? P.ihhs : 0.5, satk: val('ihsat') < 0 ? 1 : P.ihsat / 100, hjit: Math.max(0, val('ihhj')),
    rmax: Math.max(mx, mn), rmin: Math.min(mx, mn), sizeDark: Math.max(0, val('ihsz')), sizeDetail: Math.max(0, val('ihd')),
    dsens: 1, scon: val('ihsc'), srand: Math.max(0, val('ihsr')), gap: Math.max(0, val('ihg')), gdark: P.on.ihgd ? P.ihgd : 0, fill: Math.max(0, val('ihfl')), wig: Math.max(0, val('ihw')), wigs: Math.max(0, val('ihws')),
    cease: val('ihe'), sease: val('ihse'), repack: Math.max(0, val('ihrp')), smooth: Math.max(0, val('ihf')), hy: Math.max(0, val('ihhy')),
  };
}
// contrast curve: steepness c around centre m, stretched so 0 -> 0 and 1 -> 1; c < 0 (off) = linear
function curve(t, c, m) {
  if (c < 0) return clamp01(t);
  const s0 = 1 / (1 + Math.exp(m * c)), s1 = 1 / (1 + Math.exp(-(1 - m) * c));
  return clamp01((1 / (1 + Math.exp(-(t - m) * c)) - s0) / (s1 - s0));
}

// ---------------------------------------------------------------- colours: 2 or 3 picked on the colour wheel (Edit > Colours), plus paper
// colour 1 = dark areas, last colour = light areas, the middle one (3 colours) = the tones between. Presets load into the wheel.
const PRESETS = {
  classic: { cols: ['#c4471f', '#e9953a', '#93b04e'], paper: '#f7f2e8' },
  pastel: { cols: ['#c9608a', '#e3a4bf', '#86a9d6'], paper: '#f8f5f1' },
  blueorange: { cols: ['#e07a2c', '#e8c26a', '#3f7fc4'], paper: '#f6f3ee' },
  bw: { cols: ['#1e1e1e', '#7a7a7a', '#cfcfcf'], paper: '#f7f6f4' },
  red: { cols: ['#a8200f', '#e0573c', '#f3b2a2'], paper: '#fbf8f6' },
};
const COL = { n: 2, rule: 'custom', base: 0, cols: [], paper: '#f7f2e8' };
function loadPreset(name) {
  const pr = PRESETS[name] || PRESETS.classic;
  const [d, m, l] = pr.cols.map(hexToCol);                   // presets list dark, middle, light; 2 colours = dark + light (middle kept as the spare)
  COL.cols = COL.n === 3 ? [d, m, l] : [d, l, m]; COL.paper = pr.paper; COL.rule = 'custom'; COL.base = 0;
}
loadPreset('classic');
let colRGBs = [];                                             // the active colours as [r, g, b]
const syncCols = () => { colRGBs = COL.cols.slice(0, COL.n).map(colRGB); };
syncCols();
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
// hue position 0 = first colour (dark areas) .. 1 = last colour (light areas); value moves the lightness around the picked colour
function colourOf(hpos, vpos, jit, e) {
  const k = colRGBs.length - 1, x = clamp01(hpos) * k, i = Math.min(k - 1, x | 0), f = x - i;
  const a = colRGBs[i], b = colRGBs[i + 1];
  const [h, s, l] = rgb2hsl(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  return hsl2rgb(h + jit * e.hjit, clamp01(s * e.satk), clamp01(l + (vpos - 0.5) * e.vrange + jit * e.vvar));
}
const HQ = 16, VQ = 32, SHADES = 3;           // fill buckets: hue steps x value steps x shade variants
const fillCache = new Map();
let fillKey = '';
function fillOf(qh, qv, s, e) {
  const key = qh * 10000 + qv * 10 + s;
  let f = fillCache.get(key);
  if (!f) { const c = colourOf(qh / HQ, qv / VQ, s - 1, e).map(Math.round); f = `rgb(${c[0]},${c[1]},${c[2]})`; fillCache.set(key, f); }
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
// gap at a tone: + gap by darkness = light areas get more room, dark areas pack tighter (- = the other way)
const gapAt = (t, e) => e.gap * Math.max(0, 1 + e.gdark * ((P.inv ? 1 - t : t) - 0.5) * 2);
const sizeOf = (t, ed, e) => curve(Math.min(1, e.sizeDark * (1 - (P.inv ? 1 - t : t)) + e.sizeDetail * Math.min(1, ed * e.dsens)), e.scon, 0.5);

// ---------------------------------------------------------------- circles (structure of arrays)
const C = {
  n: 0, x: new Float32Array(CAP), y: new Float32Array(CAP), r: new Float32Array(CAP), rv: new Float32Array(CAP),
  m: new Float32Array(CAP), mv: new Float32Array(CAP), h: new Float32Array(CAP), hv: new Float32Array(CAP),
  rnd: new Float32Array(CAP), shade: new Uint8Array(CAP),
  die: new Uint8Array(CAP), press: new Uint8Array(CAP), rt: new Float32Array(CAP), want: new Float32Array(CAP),
  lv: new Float32Array(CAP), lh: new Float32Array(CAP), g: new Float32Array(CAP),   // g: this circle's gap
  ph: new Float32Array(CAP),                                  // wiggle phase     // value / hue this circle is heading to (held, so no flicker)
};
const KEYS = ['x', 'y', 'r', 'rv', 'm', 'mv', 'h', 'hv', 'rnd', 'shade', 'die', 'press', 'rt', 'want', 'lv', 'lh', 'g', 'ph'];
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
function freeAt(x, y, gs, reach) {
  let free = Math.min(x, SW - x, y, SH - y);
  const cx = (x / cell) | 0, cy = (y / cell) | 0, rc = Math.ceil(reach / cell);
  for (let gy = Math.max(0, cy - rc); gy <= Math.min(GY - 1, cy + rc); gy++)
    for (let gx = Math.max(0, cx - rc); gx <= Math.min(GX - 1, cx + rc); gx++)
      for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
        const d = Math.hypot(C.x[j] - x, C.y[j] - y) - Math.max(C.r[j], C.want[j]) - (gs + C.g[j]) * 0.5;   // growing circles reserve the size they want
        if (d < free) { free = d; if (free <= 0) return free; }
      }
  return free;
}
function addCircle(x, y, e) {
  if (C.n >= CAP) return;
  const i = C.n++;
  C.x[i] = x; C.y[i] = y; C.r[i] = 0; C.rv[i] = 0; C.rnd[i] = Math.random(); C.ph[i] = Math.random() * 1000;
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
  const t0 = performance.now(), e = eff(), gap = e.gap * (1 + Math.abs(e.gdark));   // gap: the largest gap anywhere (grid size)
  const vstep = e.levels ? 1 / (e.levels - 1) : 0.15;
  // repack speed: how soon and how often a starved circle makes room (0 = never)
  // a circle held under (1 - needAt) of its wished size waits a few frames, then its smallest touching neighbour fades out
  const rp = e.repack, needAt = 0.6 - 0.45 * rp, waitN = Math.max(1, Math.round((0.08 + 0.9 * (1 - rp)) * (st.fps || 30))), pKill = 0.2 + 0.6 * rp;
  buildGrid(e.rmax, gap);
  const reach = 1;                                            // grid cells around (cell >= 2 * rmax + gap)
  // 1. each circle wants its size, but only grows into half of the free space around it (Pastiche style)
  for (let i = 0; i < C.n; i++) {
    const xi = C.x[i], yi = C.y[i], ri = C.r[i], t = sample(base, xi, yi), gi = C.g[i] = gapAt(t, e);
    const lv = C.lv[i] = held(C.lv[i], valueOf(t, e), e, vstep);
    const lh = C.lh[i] = held(C.lh[i], hueOf(t, e), e, 0.2);
    const want = targetR(i, xi, yi, e);
    let space = Math.min(xi - ri, SW - xi - ri, yi - ri, SH - yi - ri) * 2, nb = -1, nbr = 1e9;
    const cx = (xi / cell) | 0, cy = (yi / cell) | 0;
    for (let gy = Math.max(0, cy - reach); gy <= Math.min(GY - 1, cy + reach); gy++)
      for (let gx = Math.max(0, cx - reach); gx <= Math.min(GX - 1, cx + reach); gx++)
        for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const s = Math.hypot(C.x[j] - xi, C.y[j] - yi) - ri - C.r[j] - (gi + C.g[j]) * 0.5;
          if (s < space) space = s;
          if (s < 1 && !C.die[j] && C.r[j] < nbr) { nbr = C.r[j]; nb = j; }   // smallest touching neighbour
        }
    // fill holes: push a little into the neighbours (the relaxation below moves them apart into the holes, like packing marbles)
    const cap = ri + (space > 0 ? space * 0.5 : space) + (C.die[i] ? 0 : e.fill * (0.08 * ri + 0.15));
    // fill holes: a circle with free room around it grows into it (up to max size), so the paper closes up
    const grow = space > 0 ? Math.min(cap, want + (Math.max(want, e.rmax) - want) * e.fill) : want;
    const rt = C.die[i] ? 0 : Math.max(0, Math.min(grow, cap));
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
              if (Math.hypot(C.x[j] - xi, C.y[j] - yi) < want + C.r[j] * 0.5 + gi) { C.die[j] = 1; st.killed++; }
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
  // 2. relaxation: push overlapping circles apart (two passes), this is what moves them into the holes
  for (let pass = 0; pass < 2; pass++) {
  buildGrid(e.rmax, gap);
  for (let i = 0; i < C.n; i++) {
    const xi = C.x[i], yi = C.y[i], ri = C.r[i], gi = C.g[i], cx = (xi / cell) | 0, cy = (yi / cell) | 0;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(GY - 1, cy + 1); gy++)
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(GX - 1, cx + 1); gx++)
        for (let j = head[gy * GX + gx]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const dx = C.x[j] - xi, dy = C.y[j] - yi, rr = ri + C.r[j] + (gi + C.g[j]) * 0.5, d2 = dx * dx + dy * dy;
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
  }
  // 3. faded out circles leave
  for (let i = C.n - 1; i >= 0; i--) if (C.die[i] && C.r[i] < 0.25) removeAt(i);
  // 4. fill the gaps: new circles grow in from zero
  buildGrid(e.rmax, gap);
  // fill holes: down to tiny filler dots, so hardly any paper shows. Smallest dot = min circle (fill 0) .. 0.6 px (fill 1)
  const fillMin = e.fill > 0 ? e.rmin * 0.9 + (0.6 - e.rmin * 0.9) * e.fill : e.rmin * 0.9;
  const tries = C.n < 200 ? 6000 : 1200;
  for (let k = 0; k < tries; k++) {
    const x = Math.random() * SW, y = Math.random() * SH;
    const gs = gapAt(fieldReady ? sample(base, x, y) : 0.5, e), free = freeAt(x, y, gs, e.rmax * 2 + gap);
    if (free >= fillMin && C.n < CAP) {
      const i = C.n; addCircle(x, y, e); C.g[i] = gs; st.spawned++;
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
  const e = eff();
  const key = [colRGBs.join(), e.vrange, e.vvar, e.satk, e.hjit].join();
  if (key !== fillKey) { fillCache.clear(); fillKey = key; }    // colours changed: rebuild the fill styles
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (P.prev) {                                               // preview: the colour map the circles follow
    for (let i = 0; i < N; i++) {
      const c = colourOf(hueOf(base[i], e), valueOf(base[i], e), 0, e);
      pvImg.data[i * 4] = c[0]; pvImg.data[i * 4 + 1] = c[1]; pvImg.data[i * 4 + 2] = c[2]; pvImg.data[i * 4 + 3] = 255;
    }
    pvx.putImageData(pvImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(pv, 0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.fillStyle = COL.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const buckets = new Map(), wa = e.wig, wt = performance.now() / 1000 * e.wigs * Math.PI * 2;
  for (let i = 0; i < C.n; i++) {
    if (C.r[i] <= 0.15) continue;
    const k = Math.round(C.h[i] * HQ) * 10000 + Math.round(C.m[i] * VQ) * 10 + C.shade[i];
    let L = buckets.get(k); if (!L) { L = []; buckets.set(k, L); } L.push(i);
  }
  for (const [k, L] of buckets) {
    ctx.beginPath();
    for (const i of L) {
      // wiggle: each dot drifts on its own slow, irregular path (two sines per axis), drawn only, the packing stays exact
      let x = C.x[i], y = C.y[i];
      if (wa > 0) { const p = C.ph[i]; x += wa * (0.6 * Math.sin(wt + p) + 0.4 * Math.sin(wt * 1.73 + p * 1.3)); y += wa * (0.6 * Math.sin(wt * 1.21 + p * 0.7) + 0.4 * Math.sin(wt * 0.83 + p * 1.9)); }
      ctx.moveTo(x + C.r[i], y); ctx.arc(x, y, C.r[i], 0, Math.PI * 2);
    }
    ctx.fillStyle = fillOf((k / 10000) | 0, ((k % 10000) / 10) | 0, k % 10, e); ctx.fill();
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
// colour wheel: edits land in COL; the hidden #ihcols field carries them into Set default
const colsField = $('#ihcols');
const saveCols = () => { colsField.value = JSON.stringify({ n: COL.n, rule: COL.rule, base: COL.base, paper: COL.paper, cols: COL.cols.map(colHex) }); };
const wheel = createWheel($('#ihwheel'), COL, () => { syncCols(); saveCols(); });
colsField.addEventListener('input', () => {                   // Set default restores the colours through this field
  try { const o = JSON.parse(colsField.value); Object.assign(COL, { n: o.n, rule: o.rule, base: o.base, paper: o.paper, cols: o.cols.map(hexToCol) }); syncCols(); wheel.refresh(); } catch {}
});
$('#ihpal').onchange = (e) => { loadPreset(e.target.value); syncCols(); saveCols(); wheel.refresh(); };
saveCols();
$('#ihinv').onchange = (e) => { P.inv = e.target.checked; dirty = true; };
$('#ihprev').onchange = (e) => { P.prev = e.target.checked; };
$('#restart').onclick = () => { C.n = 0; };
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r4');                                       // r4: colours moved to the colour wheel in v1.40, older saved defaults are dropped

window.__state = { C, P, eff, base, edge, fieldInfo, st };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
