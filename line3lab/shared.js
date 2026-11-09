// LINE_v03 LAB: shared parts for every candidate: the input (camera / video file / built-in test picture), the eased tone field, helpers,
// the slider rows and the editable curve widget. The palette comes from the main app (../palette.js), so the colours are the same system.
import { getPalette, onPalette, mountPaletteEditor, serialize as serializePalette, restore as restorePalette } from '../palette.js';
export { getPalette, onPalette, mountPaletteEditor, serializePalette, restorePalette };

export const $ = (s, r = document) => r.querySelector(s);
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const msg = (m) => { const e = $('#msg'); if (e) e.textContent = m; };
export const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------------------------------------------------------------- the tone field
// Every candidate sees the same field: GW x GH numbers 0..1 (0 = dark, 1 = bright), already auto-levelled, inverted if asked, and EASED IN TIME.
// The candidates are pure functions of this field (no hidden state), so when the field changes smoothly the line changes smoothly.
export const GW = 90, GH = 160;
export const G = { ease: 0.3, clip: 2, bright: 0, invert: 0, mirror: true };
export const tone = new Float32Array(GW * GH).fill(0.5);
const tgt = new Float32Array(GW * GH).fill(0.5), raw = new Float32Array(GW * GH).fill(0.5);
let lo = 0, hi = 1, haveRaw = false, lastMedia = -1;
export const src = { kind: 'test', name: 'test picture' };
export const vid = document.getElementById('vid');
const tc = document.createElement('canvas'); tc.width = GW; tc.height = GH;
const tx = tc.getContext('2d', { willReadFrequently: true });

export function toneAt(u, v) {                         // bilinear, u and v in 0..1
  const gx = clamp(u * GW - 0.5, 0, GW - 1.001), gy = clamp(v * GH - 0.5, 0, GH - 1.001);
  const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, i = y0 * GW + x0;
  return (tone[i] * (1 - fx) + tone[i + 1] * fx) * (1 - fy) + (tone[i + GW] * (1 - fx) + tone[i + GW + 1] * fx) * fy;
}
// summed-area table (rebuilt once per frame): mean tone of any rectangle, continuous in position and size
const sat = new Float64Array((GW + 1) * (GH + 1));
function buildSAT() {
  for (let y = 0; y < GH; y++) {
    let row = 0;
    for (let x = 0; x < GW; x++) { row += tone[y * GW + x]; sat[(y + 1) * (GW + 1) + x + 1] = sat[y * (GW + 1) + x + 1] + row; }
  }
}
function satAt(x, y) {                                 // x 0..GW, y 0..GH (cell units), bilinear
  x = clamp(x, 0, GW - 1e-6); y = clamp(y, 0, GH - 1e-6);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, W1 = GW + 1, i = y0 * W1 + x0;
  return (sat[i] * (1 - fx) + sat[i + 1] * fx) * (1 - fy) + (sat[i + W1] * (1 - fx) + sat[i + W1 + 1] * fx) * fy;
}
export function boxMean(u0, v0, u1, v1) {              // mean tone in the rectangle (0..1 coordinates)
  const x0 = Math.min(u0, u1) * GW, x1 = Math.max(u0, u1) * GW, y0 = Math.min(v0, v1) * GH, y1 = Math.max(v0, v1) * GH;
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const a = cx - w / 2, b = cx + w / 2, c = cy - h / 2, d = cy + h / 2;      // at least one cell big
  return (satAt(b, d) - satAt(a, d) - satAt(b, c) + satAt(a, c)) / (w * h);
}

function drawTest(ctx, t) {                            // the built-in moving test picture: a drifting soft head, a sweeping bar, a pulsing ring
  const g = ctx.createLinearGradient(0, 0, 0, GH); g.addColorStop(0, '#2a2a2a'); g.addColorStop(1, '#6a6a6a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, GW, GH);
  const cx = 45 + 20 * Math.sin(t * 0.55), cy = 58 + 16 * Math.sin(t * 0.37 + 1);
  let r = ctx.createRadialGradient(cx, cy, 2, cx, cy, 32); r.addColorStop(0, '#fff'); r.addColorStop(0.55, '#e8e8e8'); r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, GW, GH);
  const by = ((t * 14) % 220) - 30; const bg = ctx.createLinearGradient(0, by - 12, 0, by + 12);
  bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.5, 'rgba(0,0,0,0.85)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, by - 12, GW, 24);
  ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(45 + 8 * Math.cos(t * 0.8), 122, 20 + 7 * Math.sin(t * 0.9), 0, 6.2832); ctx.stroke();
  ctx.fillStyle = '#101010'; ctx.beginPath(); ctx.arc(cx - 8, cy - 4, 4, 0, 6.2832); ctx.arc(cx + 8, cy - 4, 4, 0, 6.2832); ctx.fill();   // two dark "eyes": sharp small features
}
function drawCover(ctx, w, h) {                        // the video, cover-cropped, mirrored for the camera
  const vw = vid.videoWidth, vh = vid.videoHeight, ar = w / h;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (vw / vh > ar) { sw = vh * ar; sx = (vw - sw) / 2; } else { sh = vw / ar; sy = (vh - sh) / 2; }
  ctx.save(); if (cam.stream && G.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, w, h); ctx.restore();
}
function readRaw() {                                   // luminance + auto levels
  const d = tx.getImageData(0, 0, GW, GH).data, a = new Float32Array(GW * GH);
  for (let i = 0; i < a.length; i++) a[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const clip = G.clip / 100, s = Float32Array.from(a).sort();
  const l = clip > 0 ? s[Math.floor(clip * (s.length - 1))] : 0, h = clip > 0 ? s[Math.floor((1 - clip) * (s.length - 1))] : 1;
  lo += (l - lo) * (haveRaw ? 0.15 : 1); hi += (h - hi) * (haveRaw ? 0.15 : 1);
  for (let i = 0; i < a.length; i++) raw[i] = clamp((a[i] - lo) / Math.max(0.05, hi - lo));
  haveRaw = true;
}
let tmark = 0;
export function updateTone(dt, now) {                  // once per animation frame, before the candidates draw
  if (src.kind === 'test') { drawTest(tx, now / 1000); readRaw(); }
  else if (vid.readyState >= 2 && vid.videoWidth && (vid.currentTime !== lastMedia || cam.stream)) { lastMedia = vid.currentTime; drawCover(tx, GW, GH); readRaw(); }
  const k = tmark ? 1 - Math.exp(-dt / Math.max(0.02, G.ease)) : 1; tmark = 1;
  for (let i = 0; i < tone.length; i++) {
    let t = G.invert > 0.5 ? 1 - raw[i] : raw[i]; t = clamp(t + G.bright); tgt[i] = t;
    tone[i] += (t - tone[i]) * k;
  }
  buildSAT();
}
export function snapTone() { tmark = 0; }
export const refreshSAT = buildSAT;                    // for the motion test (it sets the tone by hand)

// ---------------------------------------------------------------- the input source
export const cam = { stream: null };
function stopStream() { if (cam.stream) { cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; } vid.srcObject = null; }
export function useTest() { stopStream(); vid.removeAttribute('src'); vid.pause(); src.kind = 'test'; src.name = 'test picture'; haveRaw = false; snapTone(); }
export async function startCamera() {
  try { cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 } }, audio: false }); }
  catch (e) { cam.stream = null; msg('Camera is not available here (' + (e.name || e.message) + '). Use "Load video" or the test picture.'); return false; }
  msg(''); vid.removeAttribute('src'); vid.srcObject = cam.stream; vid.loop = false; await vid.play().catch(() => {});
  src.kind = 'video'; src.name = 'camera'; haveRaw = false; snapTone(); return true;
}
export async function loadVideo(url, name = 'video file') {
  stopStream(); vid.src = url; vid.muted = true; vid.loop = true; vid.playsInline = true;
  await new Promise((res, rej) => { vid.onloadeddata = res; vid.onerror = () => rej(new Error('video failed to load')); });
  await vid.play().catch(() => {});
  src.kind = 'video'; src.name = name; haveRaw = false; snapTone();
}
export const thumbDraw = (ctx, w, h) => { ctx.drawImage(tc, 0, 0, w, h); };

// ---------------------------------------------------------------- colours
export function inkPaper() {                           // the same rule as Line_v03: the palette colour that contrasts most with the paper is the ink
  const pal = getPalette(), cs = pal.cols, p = pal.paper, lum = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  const a = cs[cs.length - 1], b = cs[0], ink = Math.abs(lum(a) - lum(p)) >= Math.abs(lum(b) - lum(p)) ? a : b;
  const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  return { paper: p, ink, paperCss: css(p), inkCss: css(ink) };
}
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }   // small seeded random (xorshift)

// ---------------------------------------------------------------- slider rows (compact, same look as the main app)
export function mountSliders(host, defs, P, storeKey, onChange) {
  const saved = lsGet('line3lab.sl.' + storeKey, {}) || {}, rowsById = {};
  for (const s of defs) {
    P[s.id] = saved[s.id] !== undefined ? saved[s.id] : s.val;
    const row = document.createElement('div'); row.className = 'sl2'; row.title = s.tip || '';
    row.innerHTML = `<span class="lab">${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><output></output>`;
    host.append(row);
    const rng_ = row.querySelector('input'), out = row.querySelector('output');
    const dec = (String(s.step).split('.')[1] || '').length;
    rng_.value = P[s.id]; out.textContent = Number(P[s.id]).toFixed(dec);
    rng_.addEventListener('input', () => { P[s.id] = parseFloat(rng_.value); out.textContent = Number(P[s.id]).toFixed(dec); const o = {}; for (const d of defs) o[d.id] = P[d.id]; lsSet('line3lab.sl.' + storeKey, o); onChange && onChange(s.id); });
    rowsById[s.id] = { rng: rng_, out, dec, def: s };
  }
  return {
    reset() { for (const s of defs) { P[s.id] = s.val; const r = rowsById[s.id]; r.rng.value = s.val; r.out.textContent = Number(s.val).toFixed(r.dec); } lsSet('line3lab.sl.' + storeKey, null); },
  };
}

// ---------------------------------------------------------------- the editable curve (a spline through draggable points, smooth and never overshooting)
export function pchip(pts) {                           // pts sorted by x: [[x, y], ...]; returns f(x)
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  if (n === 1) return () => ys[0];
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
export function mountCurve(host, def, storeKey, onChange) {   // def: { id, label, xl, yl, pts: [[x, y], ...] }; returns { fn(x) -> y in 0..1 }
  const key = 'line3lab.curve.' + storeKey + '.' + def.id;
  let pts = (lsGet(key) || def.pts).map((p) => [p[0], p[1]]);
  const wrap = document.createElement('div'); wrap.className = 'curve';
  wrap.innerHTML = `<div class="clab"><span>${def.label}</span><button type="button" class="crs" title="Back to the default curve">reset</button></div><canvas width="440" height="220"></canvas><div class="cax"><span>${def.xl}</span><span>${def.yl}</span></div>`;
  host.append(wrap);
  const cv = wrap.querySelector('canvas'), cx = cv.getContext('2d'), Wd = cv.width, Hd = cv.height, pad = 14;
  const out = { fn: pchip(pts), pts: () => pts };
  const X = (x) => pad + x * (Wd - 2 * pad), Y = (y) => Hd - pad - y * (Hd - 2 * pad);
  const draw = () => {
    cx.clearRect(0, 0, Wd, Hd); cx.fillStyle = '#101010'; cx.fillRect(0, 0, Wd, Hd);
    cx.strokeStyle = '#2e2e2e'; cx.lineWidth = 1; cx.beginPath();
    for (let i = 0; i <= 4; i++) { cx.moveTo(X(i / 4), Y(0)); cx.lineTo(X(i / 4), Y(1)); cx.moveTo(X(0), Y(i / 4)); cx.lineTo(X(1), Y(i / 4)); }
    cx.stroke();
    cx.strokeStyle = '#e8b04a'; cx.lineWidth = 2.5; cx.beginPath();
    for (let i = 0; i <= 100; i++) { const x = i / 100, y = clamp(out.fn(x)); i ? cx.lineTo(X(x), Y(y)) : cx.moveTo(X(x), Y(y)); }
    cx.stroke();
    for (const p of pts) { cx.fillStyle = '#d23219'; cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(X(p[0]), Y(p[1]), 7, 0, 6.2832); cx.fill(); cx.stroke(); }
  };
  const commit = () => { pts.sort((a, b) => a[0] - b[0]); out.fn = pchip(pts); lsSet(key, pts); draw(); onChange && onChange(); };
  let drag = -1;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [clamp(((e.clientX - r.left) / r.width * Wd - pad) / (Wd - 2 * pad)), clamp(1 - ((e.clientY - r.top) / r.height * Hd - pad) / (Hd - 2 * pad))]; };
  const near = (e) => { const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * Wd, my = (e.clientY - r.top) / r.height * Hd; let b = -1, bd = 18; pts.forEach((p, i) => { const dd = Math.hypot(X(p[0]) - mx, Y(p[1]) - my); if (dd < bd) { bd = dd; b = i; } }); return b; };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); let i = near(e);
    if (i < 0) { const p = pos(e); pts.push([p[0], p[1]]); pts.sort((a, b) => a[0] - b[0]); i = pts.findIndex((q) => q[0] === p[0] && q[1] === p[1]); }
    drag = i; commit();
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag < 0) return; const p = pos(e), last = pts.length - 1;
    const lo_ = drag === 0 ? 0 : pts[drag - 1][0] + 0.01, hi_ = drag === last ? 1 : pts[drag + 1][0] - 0.01;
    pts[drag][0] = drag === 0 ? 0 : drag === last ? 1 : clamp(p[0], lo_, hi_); pts[drag][1] = p[1]; commit();
  });
  const up = () => { drag = -1; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', (e) => { const i = near(e); if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); commit(); } });
  wrap.querySelector('.crs').onclick = () => { pts = def.pts.map((p) => [p[0], p[1]]); lsSet(key, null); out.fn = pchip(pts); draw(); onChange && onChange(); };
  draw();
  return out;
}
