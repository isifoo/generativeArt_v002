// ISHIHARA: video -> contrast split (figure / ground) -> packed circles that never overlap.
// Every circle eases to its size and colour (smooth damp: slow start, slow end), nothing pops.
// Circles that get squeezed shrink away, gaps get new circles that grow in from zero.
import { $, msg, hex, hold, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, drawCover, noCam } from './ui.js';

const SW = 540, SH = 960, SCALE = 2;          // circle space (sim px), canvas is 2x
const FW = 135, FH = 240;                     // tone field, 4 sim px per cell
const CAP = 30000;

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { id: 'ihc', label: 'Contrast', min: 1, max: 30, step: 0.5, val: 10, off: 'no contrast curve, raw tone' },
  { id: 'ihth', label: 'Threshold shift', min: -0.5, max: 0.5, step: 0.01, val: 0, off: 'auto threshold only' },
  { id: 'ihmax', label: 'Max circle px', min: 4, max: 40, step: 0.5, val: 14, off: 'all circles min size' },
  { id: 'ihmin', label: 'Min circle px', min: 1.5, max: 12, step: 0.25, val: 3, off: 'all circles max size' },
  { id: 'ihsz', label: 'Size by tone', min: 0, max: 1, step: 0.01, val: 0.7, off: 'random sizes only' },
  { id: 'ihg', label: 'Gap px', min: 0, max: 4, step: 0.1, val: 0.8, off: 'circles touch' },
  { id: 'ihe', label: 'Ease time s', min: 0.1, max: 3, step: 0.05, val: 0.9, off: 'instant, no ease' },
  { id: 'ihv', label: 'Shade variety', min: 0, max: 1, step: 0.01, val: 0.6, off: 'flat colours' },
  { id: 'ihf', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.5, off: 'no smoothing' },
];
const P = { pal: 'classic', inv: false };
const val = buildSliders(SLIDERS, P);
function eff() {
  let mx = val('ihmax'), mn = val('ihmin');
  if (mx < 0 && mn < 0) { mx = mn = 8; } else if (mx < 0) { mx = mn; } else if (mn < 0) { mn = mx; }
  return {
    con: val('ihc'), th: P.on.ihth ? P.ihth : 0,              // threshold shift is a signed value, off = 0
    rmax: Math.max(mx, mn), rmin: Math.min(mx, mn), size: Math.max(0, val('ihsz')),
    gap: Math.max(0, val('ihg')), ease: val('ihe'), variety: Math.max(0, val('ihv')), smooth: Math.max(0, val('ihf')),
  };
}

// ---------------------------------------------------------------- palettes: 3 ground shades, 3 figure shades, paper
const PALETTES = {
  classic: { ground: ['#8fae5a', '#6d9449', '#b9c47c'], figure: ['#e2733c', '#cf5130', '#f0a457'], paper: '#f4efe4' },
  pastel: { ground: ['#9fb8d6', '#7f9cc4', '#c3d2e4'], figure: ['#e89aa8', '#d67585', '#f3bcc4'], paper: '#f6f2ee' },
  bw: { ground: ['#f2f0ee', '#e2dfdb', '#ffffff'], figure: ['#1a1a1a', '#333333', '#0a0a0a'], paper: '#c9c6c1' },
  red: { ground: ['#f0d7cd', '#e6c6b9', '#f7e7e0'], figure: ['#d23219', '#b52914', '#e4532f'], paper: '#f2f0ee' },
};
const MQ = 24;                                // colour fade steps per shade
let fills = [];                               // fills[shade * (MQ + 1) + q]
function buildFills() {
  const pal = PALETTES[P.pal] || PALETTES.classic, v = eff().variety;
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  fills = [];
  for (let s = 0; s < 3; s++) {
    const g = mix(hex(pal.ground[0]), hex(pal.ground[s]), v), f = mix(hex(pal.figure[0]), hex(pal.figure[s]), v);
    for (let q = 0; q <= MQ; q++) {
      const c = mix(g, f, q / MQ).map((x) => Math.round(x));
      fills.push(`rgb(${c[0]},${c[1]},${c[2]})`);
    }
  }
}

// ---------------------------------------------------------------- tone field (the contrast is the whole game)
const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
const fctx = fc.getContext('2d', { willReadFrequently: true });
const field = new Float32Array(FW * FH).fill(0.5);   // 0 = ground, 1 = figure
const gray = new Float32Array(FW * FH);
const fieldInfo = { lo: 0, hi: 1, th: 0.5, ms: 0 };
let fieldReady = false;
function updateField() {
  const t0 = performance.now();
  drawCover(fctx, FW, FH);
  const d = fctx.getImageData(0, 0, FW, FH).data, hist = new Uint32Array(256), n = FW * FH;
  for (let i = 0; i < n; i++) { const g = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); gray[i] = g; hist[g]++; }
  // auto levels: 2% / 98% percentiles
  let cum = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { cum += hist[i]; if (cum > n * 0.02) { lo = i; break; } }
  cum = 0; for (let i = 255; i >= 0; i--) { cum += hist[i]; if (cum > n * 0.02) { hi = i; break; } }
  if (hi - lo < 8) hi = lo + 8;
  // Otsu threshold on the stretched tone
  let sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = -1, thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sumB += i * hist[i]; const mB = sumB / wB, mF = (sumAll - sumB) / wF, b = wB * wF * (mB - mF) * (mB - mF);
    if (b > best) { best = b; thr = i; }
  }
  const e = eff(), th = (thr - lo) / (hi - lo) + e.th, k = 1 - e.smooth, sgn = P.inv ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (gray[i] - lo) / (hi - lo)));
    const f = e.con < 0 ? (sgn > 0 ? 1 - t : t) : 1 / (1 + Math.exp(-(th - t) * e.con * sgn));   // dark = figure, unless inverted
    field[i] = fieldReady ? field[i] + (f - field[i]) * k : f;
  }
  fieldReady = true;
  fieldInfo.lo = lo; fieldInfo.hi = hi; fieldInfo.th = th; fieldInfo.ms = performance.now() - t0;
}
function sampleField(x, y) {
  const fx = Math.min(FW - 1.001, Math.max(0, x / 4 - 0.5)), fy = Math.min(FH - 1.001, Math.max(0, y / 4 - 0.5));
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * FW + x0;
  return (field[i] * (1 - tx) + field[i + 1] * tx) * (1 - ty) + (field[i + FW] * (1 - tx) + field[i + FW + 1] * tx) * ty;
}

// ---------------------------------------------------------------- circles (structure of arrays)
const C = {
  n: 0, x: new Float32Array(CAP), y: new Float32Array(CAP), r: new Float32Array(CAP), rv: new Float32Array(CAP),
  m: new Float32Array(CAP), mv: new Float32Array(CAP), rnd: new Float32Array(CAP), shade: new Uint8Array(CAP),
  die: new Uint8Array(CAP), press: new Uint8Array(CAP), rt: new Float32Array(CAP), want: new Float32Array(CAP),
};
function targetR(i, f, e) {
  if (C.die[i]) return 0;
  const k = e.size * f + (1 - e.size) * C.rnd[i];            // 0 = max size, 1 = min size
  return e.rmax + (e.rmin - e.rmax) * k;
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
  C.x[i] = x; C.y[i] = y; C.r[i] = 0; C.rv[i] = 0; C.rnd[i] = 1 - Math.pow(Math.random(), 1.8);
  C.shade[i] = (Math.random() * 3) | 0; C.die[i] = 0; C.press[i] = 0;
  const f = fieldReady ? sampleField(x, y) : 0.5; C.m[i] = f; C.mv[i] = 0; C.rt[i] = 0; C.want[i] = 0;
}
function removeAt(i) {
  const l = --C.n; if (i === l) return;
  for (const k of ['x', 'y', 'r', 'rv', 'm', 'mv', 'rnd', 'shade', 'die', 'press', 'rt', 'want']) C[k][i] = C[k][l];
}

// ---------------------------------------------------------------- one step
const st = { spawned: 0, killed: 0, ms: 0, fps: 0, last: 0 };
function step(dt) {
  const t0 = performance.now(), e = eff(), T = e.ease, gap = e.gap;
  buildGrid(e.rmax, gap);
  const reach = 1;                                            // grid cells around (cell >= 2 * rmax + gap)
  // 1. each circle wants its tone size, but only grows into half of the free space around it (Pastiche style)
  for (let i = 0; i < C.n; i++) {
    const xi = C.x[i], yi = C.y[i], ri = C.r[i];
    const f = sampleField(xi, yi), tone = targetR(i, f, e);
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
    const rt = C.die[i] ? 0 : Math.max(0, Math.min(tone, cap));
    C.rt[i] = rt;
    // starved: held well under its tone size by the neighbours for a while -> the smallest touching neighbour fades out
    // the harder it is starved, the sooner it acts (a big size change clears room in a second or two, small ones stay calm)
    const need = 1 - cap / Math.max(tone, 1e-3), wait = need > 0.7 ? 5 : need > 0.55 ? 20 : 0;
    // a starved circle reserves its whole wished size, so new circles don't spawn into the room it is waiting for
    C.want[i] = C.die[i] ? 0 : wait ? tone : Math.min(tone, ri + Math.max(space, 0));
    if (!C.die[i] && wait && ri > 0.5) {
      if (++C.press[i] > wait && nb >= 0 && nbr <= ri && Math.random() < 0.4) { C.die[nb] = 1; C.press[i] = 0; st.killed++; }
    } else if (C.press[i] > 0) C.press[i]--;
    if (T < 0) { C.r[i] = rt; C.m[i] = f; continue; }
    damp(ri, C.rv[i], rt, T, dt, tmp2); C.r[i] = Math.max(0, Math.min(tmp2[0], Math.max(cap, 0))); C.rv[i] = tmp2[1];
    damp(C.m[i], C.mv[i], f, T, dt, tmp2); C.m[i] = Math.min(1, Math.max(0, tmp2[0])); C.mv[i] = tmp2[1];
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
      C.want[i] = Math.min(free, targetR(i, sampleField(x, y), e));   // reserve its room so the next spawn keeps away
      const c = Math.min(GX - 1, (x / cell) | 0) + Math.min(GY - 1, (y / cell) | 0) * GX; next[i] = head[c]; head[c] = i;
    }
  }
  st.ms = performance.now() - t0;
}


// ---------------------------------------------------------------- draw
const canvas = $('#cv'), ctx = canvas.getContext('2d');
function draw() {
  const pal = PALETTES[P.pal] || PALETTES.classic;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const B = 3 * (MQ + 1), buckets = Array.from({ length: B }, () => []);
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
    row('levels lo / hi', fieldInfo.lo + ' / ' + fieldInfo.hi) +
    row('threshold', fieldInfo.th.toFixed(2)) +
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
  if (vid.readyState >= 2 && vid.currentTime !== lastMedia && !hold.drag) { lastMedia = vid.currentTime; updateField(); }
  if (!fieldReady) return;
  step(dt);
  draw();
}

// ---------------------------------------------------------------- UI
canvas.width = SW * SCALE; canvas.height = SH * SCALE;
$('#ihpal').onchange = (e) => { P.pal = e.target.value; buildFills(); };
$('#ihinv').onchange = (e) => { P.inv = e.target.checked; };
$('#ihv').addEventListener('input', buildFills);
$('#ihv').parentElement.querySelector('.onoff input').addEventListener('change', buildFills);
$('#restart').onclick = () => { C.n = 0; };
cam.onStart = () => { lastMedia = -1; };
initDefaults();
buildFills();

window.__state = { C, P, eff, field, fieldInfo, st };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
