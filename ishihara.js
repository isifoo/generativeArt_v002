// ISHIHARA: the video drawn with packed circles that never overlap.
// Video brightness -> local + global contrast -> tone levels on a dark-to-light colour ramp; detail and darkness -> smaller circles.
// Every circle eases to its size and colour (smooth damp: slow start, slow end), nothing pops.
// Circles that get squeezed shrink away, gaps get new circles that grow in from zero.
import { $, hex, hold, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, drawCover, noCam } from './ui.js';

const SW = 540, SH = 960, SCALE = 2;          // circle space (sim px), canvas is 2x
const FW = 135, FH = 240;                     // tone field, 4 sim px per cell
const CAP = 30000;

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { id: 'ihc', label: 'Contrast', min: 1, max: 30, step: 0.5, val: 7, off: 'no contrast curve, raw tone' },
  { id: 'ihl', label: 'Local contrast', min: 0, max: 4, step: 0.05, val: 1.6, off: 'global tone only' },
  { id: 'ihth', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0, off: 'auto (0)' },
  { id: 'ihk', label: 'Tone levels', min: 2, max: 8, step: 1, val: 4, off: 'continuous tone' },
  { id: 'ihmax', label: 'Max circle px', min: 4, max: 40, step: 0.5, val: 11, off: 'all circles min size' },
  { id: 'ihmin', label: 'Min circle px', min: 1.5, max: 12, step: 0.25, val: 2.5, off: 'all circles max size' },
  { id: 'ihsz', label: 'Size by darkness', min: 0, max: 1, step: 0.01, val: 0.45, off: 'darkness does not change size' },
  { id: 'ihd', label: 'Size by detail', min: 0, max: 1, step: 0.01, val: 0.7, off: 'edges do not change size' },
  { id: 'ihg', label: 'Gap px', min: 0, max: 4, step: 0.1, val: 0.6, off: 'circles touch' },
  { id: 'ihe', label: 'Ease time s', min: 0.1, max: 4, step: 0.05, val: 1.2, off: 'instant, no ease' },
  { id: 'ihv', label: 'Shade variety', min: 0, max: 1, step: 0.01, val: 0.3, off: 'flat colours' },
  { id: 'ihf', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.3, off: 'no smoothing' },
];
const P = { pal: 'classic', inv: false, prev: false };
const val = buildSliders(SLIDERS, P);
function eff() {
  let mx = val('ihmax'), mn = val('ihmin');
  if (mx < 0 && mn < 0) { mx = mn = 8; } else if (mx < 0) { mx = mn; } else if (mn < 0) { mn = mx; }
  return {
    con: val('ihc'), local: Math.max(0, val('ihl')), th: P.on.ihth ? P.ihth : 0, levels: val('ihk') < 0 ? 0 : Math.round(P.ihk),
    rmax: Math.max(mx, mn), rmin: Math.min(mx, mn), sizeDark: Math.max(0, val('ihsz')), sizeDetail: Math.max(0, val('ihd')),
    gap: Math.max(0, val('ihg')), ease: val('ihe'), variety: Math.max(0, val('ihv')), smooth: Math.max(0, val('ihf')),
  };
}

// ---------------------------------------------------------------- palettes: a ramp from the darkest to the lightest circle, plus paper
const PALETTES = {                            // the lightest circle stays clearly darker than the paper, so light areas still read as circles
  classic: { ramp: ['#7c2410', '#c4471f', '#e9863a', '#8fa84a', '#adc26a', '#c9d896'], paper: '#f7f2e8' },
  pastel: { ramp: ['#4e3866', '#9c5a8a', '#e08fa8', '#7fa3cf', '#a3bfe0', '#c2d4ea'], paper: '#f8f5f1' },
  bw: { ramp: ['#111111', '#3d3d3d', '#6e6e6e', '#9c9c9c', '#c2c2c2', '#dcdcdc'], paper: '#f7f6f4' },
  red: { ramp: ['#6e160a', '#d23219', '#e8674a', '#f09a80', '#f4b6a3', '#f7cebf'], paper: '#fbf8f6' },
};
const MQ = 48, SHADES = 3;                    // colour steps along the ramp, shade variants per step
let fills = [];                               // fills[shade * (MQ + 1) + q]
function rampAt(ramp, t) {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1), i = Math.min(ramp.length - 2, x | 0), f = x - i;
  const a = hex(ramp[i]), b = hex(ramp[i + 1]);
  return a.map((v, k) => v + (b[k] - v) * f);
}
function buildFills() {
  const pal = PALETTES[P.pal] || PALETTES.classic, v = eff().variety;
  fills = [];
  for (let s = 0; s < SHADES; s++) {
    const k = (s - 1) * 0.12 * v;                             // shade variants: a bit darker / same / a bit lighter
    for (let q = 0; q <= MQ; q++) {
      const c = rampAt(pal.ramp, q / MQ).map((x) => Math.round(Math.min(255, Math.max(0, k > 0 ? x + (255 - x) * k : x * (1 + k)))));
      fills.push(`rgb(${c[0]},${c[1]},${c[2]})`);
    }
  }
}

// ---------------------------------------------------------------- tone field (the contrast is the whole game)
// tone: 0 = darkest circle colour, 1 = lightest. edge: 0..1 local detail.
const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
const fctx = fc.getContext('2d', { willReadFrequently: true });
const N = FW * FH;
const tone = new Float32Array(N).fill(0.5), edge = new Float32Array(N);
const gray = new Float32Array(N), mean = new Float32Array(N), tmpA = new Float32Array(N), toneNow = new Float32Array(N), edgeNow = new Float32Array(N);
const fieldInfo = { lo: 0, hi: 1, th: 0.5, ms: 0 };
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
  // auto levels: 1% / 99% percentiles -> 0..1
  let cum = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { cum += hist[i]; if (cum > N * 0.01) { lo = i; break; } }
  cum = 0; for (let i = 255; i >= 0; i--) { cum += hist[i]; if (cum > N * 0.01) { hi = i; break; } }
  if (hi - lo < 16) { const c = (hi + lo) / 2; lo = c - 8; hi = c + 8; }
  for (let i = 0; i < N; i++) gray[i] = Math.min(1, Math.max(0, (gray[i] - lo) / (hi - lo)));
  // local contrast: push each pixel away from its neighbourhood mean (radius 10 cells = 40 px)
  boxBlur(gray, mean, 10);
  for (let i = 0; i < N; i++) toneNow[i] = Math.min(1, Math.max(0, gray[i] + e.local * (gray[i] - mean[i])));
  // contrast curve around the median tone (+ brightness shift): steep = poster, soft = photo
  const h2 = new Uint32Array(64); for (let i = 0; i < N; i++) h2[Math.min(63, (toneNow[i] * 64) | 0)]++;
  let c2 = 0, med = 0.5; for (let i = 0; i < 64; i++) { c2 += h2[i]; if (c2 >= N / 2) { med = (i + 0.5) / 64; break; } }
  const th = med - e.th, s0 = 1 / (1 + Math.exp(th * e.con)), s1 = 1 / (1 + Math.exp(-(1 - th) * e.con));
  for (let i = 0; i < N; i++) {
    let t = toneNow[i];
    if (e.con > 0) t = (1 / (1 + Math.exp(-(t - th) * e.con)) - s0) / (s1 - s0);
    toneNow[i] = P.inv ? 1 - t : t;
  }
  // detail: gradient magnitude of the stretched video, normalised by its 95th percentile
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x, xl = x > 0 ? -1 : 0, xr = x < FW - 1 ? 1 : 0, yu = y > 0 ? -FW : 0, yd = y < FH - 1 ? FW : 0;
    edgeNow[i] = Math.hypot(gray[i + xr] - gray[i + xl], gray[i + yd] - gray[i + yu]);
  }
  boxBlur(edgeNow, mean, 2);                                  // mean is free now: reuse it
  const sample = []; for (let i = 0; i < N; i += 7) sample.push(mean[i]); sample.sort((a, b) => a - b);
  const p95 = Math.max(0.02, sample[(sample.length * 0.95) | 0]);
  // smooth in time
  const k = fieldReady && !dirty ? 1 - e.smooth : 1;          // a settings change lands at once; the circles' own easing makes the fade
  for (let i = 0; i < N; i++) {
    tone[i] += (toneNow[i] - tone[i]) * k;
    edge[i] += (Math.min(1, mean[i] / p95) - edge[i]) * k;
  }
  fieldReady = true; dirty = false;
  fieldInfo.lo = lo; fieldInfo.hi = hi; fieldInfo.th = th; fieldInfo.ms = performance.now() - t0;
}
function sample(a, x, y) {
  const fx = Math.min(FW - 1.001, Math.max(0, x / 4 - 0.5)), fy = Math.min(FH - 1.001, Math.max(0, y / 4 - 0.5));
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * FW + x0;
  return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + FW] * (1 - tx) + a[i + FW + 1] * tx) * ty;
}

// ---------------------------------------------------------------- circles (structure of arrays)
const C = {
  n: 0, x: new Float32Array(CAP), y: new Float32Array(CAP), r: new Float32Array(CAP), rv: new Float32Array(CAP),
  m: new Float32Array(CAP), mv: new Float32Array(CAP), rnd: new Float32Array(CAP), shade: new Uint8Array(CAP),
  die: new Uint8Array(CAP), press: new Uint8Array(CAP), rt: new Float32Array(CAP), want: new Float32Array(CAP),
  lv: new Float32Array(CAP),                                  // the tone level this circle is heading to (held, so no flicker)
};
const KEYS = ['x', 'y', 'r', 'rv', 'm', 'mv', 'rnd', 'shade', 'die', 'press', 'rt', 'want', 'lv'];
// size: dark and detailed spots get small circles (more resolution), light and flat spots get big ones
function targetR(i, x, y, e) {
  if (C.die[i]) return 0;
  const k = Math.min(1, e.sizeDark * (1 - sample(tone, x, y)) + e.sizeDetail * sample(edge, x, y));
  return (e.rmax + (e.rmin - e.rmax) * k) * (0.72 + 0.28 * C.rnd[i]);
}
// colour level with hysteresis: a circle only changes level when the video moved clearly past the next step
function targetLevel(i, t, e) {
  if (!e.levels) return t;
  const L = e.levels - 1, cur = C.lv[i] * L;
  if (Math.abs(t * L - cur) > 0.65) C.lv[i] = Math.round(t * L) / L;
  return C.lv[i];
}
// smooth damp (critically damped spring): starts and ends slowly, never overshoots
function damp(cur, vel, target, T, dt, out) {
  const o = 2 / T, x = o * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel + o * ch) * dt;
  out[1] = (vel - o * tmp) * ex; out[0] = target + (ch + tmp) * ex;
}
const tmp2 = [0, 0];

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
function addCircle(x, y) {
  if (C.n >= CAP) return;
  const i = C.n++;
  C.x[i] = x; C.y[i] = y; C.r[i] = 0; C.rv[i] = 0; C.rnd[i] = Math.random();
  C.shade[i] = (Math.random() * SHADES) | 0; C.die[i] = 0; C.press[i] = 0;
  const t = fieldReady ? sample(tone, x, y) : 0.5, e = eff();
  C.lv[i] = e.levels ? Math.round(t * (e.levels - 1)) / (e.levels - 1) : t;
  C.m[i] = C.lv[i]; C.mv[i] = 0; C.rt[i] = 0; C.want[i] = 0;    // new circles start in their colour and grow in from zero
}
function removeAt(i) {
  const l = --C.n; if (i === l) return;
  for (const k of KEYS) C[k][i] = C[k][l];
}

// ---------------------------------------------------------------- one step
const st = { spawned: 0, killed: 0, ms: 0, fps: 0 };
function step(dt) {
  const t0 = performance.now(), e = eff(), T = e.ease < 0 ? -1 : e.ease / 2.5, gap = e.gap;   // smooth damp settles in about 2.5 T: the slider is the whole fade time
  buildGrid(e.rmax, gap);
  const reach = 1;                                            // grid cells around (cell >= 2 * rmax + gap)
  // 1. each circle wants its tone size, but only grows into half of the free space around it (Pastiche style)
  for (let i = 0; i < C.n; i++) {
    const xi = C.x[i], yi = C.y[i], ri = C.r[i];
    const lv = targetLevel(i, sample(tone, xi, yi), e), want = targetR(i, xi, yi, e);
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
    // starved: held well under its wished size by the neighbours -> the smallest touching neighbour fades out.
    // The harder it is starved, the sooner it acts (a big size change clears room in a second or two, small ones stay calm).
    const need = 1 - cap / Math.max(want, 1e-3), wait = need > 0.7 ? 5 : need > 0.55 ? 20 : 0;
    // a starved circle reserves its whole wished size, so new circles don't spawn into the room it is waiting for
    C.want[i] = C.die[i] ? 0 : wait ? want : Math.min(want, ri + Math.max(space, 0));
    if (!C.die[i] && wait && ri > 0.5) {
      if (++C.press[i] > wait && nb >= 0 && nbr <= ri && Math.random() < 0.4) { C.die[nb] = 1; C.press[i] = 0; st.killed++; }
    } else if (C.press[i] > 0) C.press[i]--;
    if (T < 0) { C.r[i] = rt; C.m[i] = lv; continue; }
    damp(ri, C.rv[i], rt, T, dt, tmp2); C.r[i] = Math.max(0, Math.min(tmp2[0], Math.max(cap, 0))); C.rv[i] = tmp2[1];
    damp(C.m[i], C.mv[i], lv, T, dt, tmp2); C.m[i] = Math.min(1, Math.max(0, tmp2[0])); C.mv[i] = tmp2[1];
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
      const i = C.n; addCircle(x, y); st.spawned++;
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
  const pal = PALETTES[P.pal] || PALETTES.classic;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (P.prev) {                                               // preview: the tone map the circles follow, in the palette
    const e = eff();
    for (let i = 0; i < N; i++) {
      let t = tone[i]; if (e.levels) t = Math.round(t * (e.levels - 1)) / (e.levels - 1);
      const c = rampAt(pal.ramp, t);
      pvImg.data[i * 4] = c[0]; pvImg.data[i * 4 + 1] = c[1]; pvImg.data[i * 4 + 2] = c[2]; pvImg.data[i * 4 + 3] = 255;
    }
    pvx.putImageData(pvImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(pv, 0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const B = SHADES * (MQ + 1), buckets = Array.from({ length: B }, () => []);
  for (let i = 0; i < C.n; i++) if (C.r[i] > 0.15) buckets[C.shade[i] * (MQ + 1) + Math.round(C.m[i] * MQ)].push(i);
  for (let b = 0; b < B; b++) {
    const L = buckets[b]; if (!L.length) continue;
    ctx.beginPath();
    for (const i of L) { ctx.moveTo(C.x[i] + C.r[i], C.y[i]); ctx.arc(C.x[i], C.y[i], C.r[i], 0, Math.PI * 2); }
    ctx.fillStyle = fills[b]; ctx.fill();
  }
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML =
    row('circles', C.n.toLocaleString()) +
    row('CPU step (pack + ease)', st.ms.toFixed(2) + ' ms') +
    row('CPU tone field', fieldInfo.ms.toFixed(2) + ' ms') +
    row('video levels lo / hi', fieldInfo.lo + ' / ' + fieldInfo.hi) +
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
$('#ihpal').onchange = (e) => { P.pal = e.target.value; buildFills(); dirty = true; };
$('#ihinv').onchange = (e) => { P.inv = e.target.checked; dirty = true; };
$('#ihprev').onchange = (e) => { P.prev = e.target.checked; };
$('#ihv').addEventListener('input', buildFills);
$('#ihv').parentElement.querySelector('.onoff input').addEventListener('change', buildFills);
$('#restart').onclick = () => { C.n = 0; };
cam.onStart = () => { lastMedia = -1; };
initDefaults();
buildFills();

window.__state = { C, P, eff, tone, edge, fieldInfo, st };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
