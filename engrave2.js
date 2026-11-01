// DOLLAR 2: banknote engraving, rebuilt from the engraver's procedure.
//  1. Black ink on white paper (palette colours only if asked).
//  2. Clean tone first: greyscale video -> levels -> edge-preserving smoothing (noise goes, edges stay) -> soft tone bands -> time smoothing.
//  3. A smooth direction field: the lines wrap the form. From the depth map (one model) and the clean tone, heavily smoothed,
//     so directions turn gradually; flat spots keep the base angle.
//  4. Lines like V1: evenly spaced streamlines of that field (Jobard-Lefer). Every new line starts one spacing away from a line
//     already placed and stops when it comes closer than the test distance to another line: smooth, never bunched, one distance.
//     Line ends taper. A second set of streamlines crosses at 'cross angle' for the darks.
//  5. Tone on the lines, at one thickness: short dashes in the lights -> longer dashes -> continuous lines -> the crossing set
//     comes in the same way (darks). The lines are rebuilt every so often and cross-fade, the tone on them updates every frame.
import { $, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover, getPalette, onPalette } from './ui.js';
import { createDepthModel, MODELS, OW, OH } from './depthmodel.js';

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Clean tone' },
  { id: 'e2lo', label: 'Levels clip %', min: 0, max: 20, step: 0.5, val: 1.5, off: 'raw video' },
  { id: 'e2c', label: 'Contrast', min: 0.2, max: 4, step: 0.01, val: 1.15, off: '1' },
  { id: 'e2b', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0.05, off: '0' },
  { id: 'e2s', label: 'Smoothing px', min: 0, max: 40, step: 1, val: 10, off: 'raw tone (noisy)' },
  { id: 'e2e', label: 'Keep edges', min: 0.02, max: 0.5, step: 0.01, val: 0.1, off: 'plain blur (soft edges)' },
  { id: 'e2k', label: 'Tone bands', min: 2, max: 12, step: 1, val: 6, off: 'continuous tone' },
  { id: 'e2ks', label: 'Band softness', min: 0, max: 1, step: 0.01, val: 0.5, off: 'hard bands' },
  { id: 'e2t', label: 'Time smoothing', min: 0, max: 0.95, step: 0.01, val: 0.6, off: 'none' },
  { head: 'Lines (like V1: one spacing, smooth)' },
  { id: 'e2sp', label: 'Line spacing px', min: 5, max: 40, step: 0.5, val: 12, off: '12' },
  { id: 'e2w', label: 'Line thickness', min: 0.05, max: 0.7, step: 0.01, val: 0.32, off: '0.32' },
  { id: 'e2a', label: 'Base angle deg', min: -90, max: 90, step: 1, val: 35, off: '0' },
  { id: 'e2x', label: 'Cross angle deg', min: 20, max: 90, step: 1, val: 60, off: 'no crossing lines' },
  { id: 'e2tp', label: 'End taper px', min: 0, max: 80, step: 1, val: 24, off: 'blunt ends' },
  { id: 'e2mn', label: 'Shortest line px', min: 0, max: 200, step: 2, val: 30, off: 'keep every piece' },
  { head: 'Flow (directions)' },
  { id: 'e2fd', label: 'Follow depth', min: 0, max: 1, step: 0.01, val: 0.8, off: 'ignore depth' },
  { id: 'e2ft', label: 'Follow tone', min: 0, max: 1, step: 0.01, val: 0.35, off: 'ignore tone' },
  { id: 'e2fs', label: 'Flow smoothness px', min: 10, max: 300, step: 2, val: 120, off: '120' },
  { id: 'e2rb', label: 'Rebuild lines s', min: 0.2, max: 5, step: 0.1, val: 1, off: 'only on Restart' },
  { head: 'Tone on the lines' },
  { id: 'e2dl', label: 'Dash length px', min: 3, max: 60, step: 0.5, val: 14, off: 'no dashes: continuous' },
  { id: 'e2md', label: 'Shortest dash', min: 0.05, max: 0.9, step: 0.01, val: 0.22, off: '0.22' },
  { id: 'e2mi', label: 'Minimum ink', min: 0, max: 0.3, step: 0.01, val: 0.04, off: 'bare paper in the lights' },
  { id: 'e2pw', label: 'Paper white', min: 0.5, max: 1, step: 0.005, val: 0.95, off: 'no bare paper' },
  { head: 'Depth' },
  { id: 'dpq', label: 'Model detail', min: 12, max: 37, step: 1, val: 22, off: 'lowest' },
  { id: 'dps', label: 'Depth smoothing', min: 0, max: 0.97, step: 0.01, val: 0.85, off: 'none' },
];
const P = { pal: false };
const val = buildSliders(SLIDERS, P);
const offv = (id) => P.on[id] === false;
const num = (id, def) => (offv(id) ? def : P[id]);

// ---------------------------------------------------------------- 2. clean tone (CPU, 270 x 480)
const TW = 270, TH = 480, TN = TW * TH, TS = OW / TW;              // TS: output px per tone px
const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
const tx = tc.getContext('2d', { willReadFrequently: true });
const tone = new Float32Array(TN).fill(1), gray = new Float32Array(TN), tmp = new Float32Array(TN), tmp2 = new Float32Array(TN);
let toneReady = false, toneMs = 0, dirty = true, uploadTone = false;
// edge-preserving smoothing: separable bilateral (neighbours of a clearly different tone are left out)
function bilateral(a, r, sig) {
  if (r < 1) return;
  const LUT = 64, lut = new Float32Array(LUT + 1), sc = LUT / (9 * sig * sig);
  for (let q = 0; q <= LUT; q++) lut[q] = Math.exp(-(q / sc) / (2 * sig * sig));
  const st = r > 6 ? 2 : 1;
  const pass = (src, dst, horiz) => {
    const n = horiz ? TH : TW, len = horiz ? TW : TH, stride = horiz ? 1 : TW;
    for (let k = 0; k < n; k++) {
      const o = horiz ? k * TW : k;
      for (let b = 0; b < len; b++) {
        const i = o + b * stride, c = src[i]; let acc = c, ws = 1;
        for (let t = -r; t <= r; t += st) {
          if (!t) continue;
          const q = b + t, j = o + (q < 0 ? 0 : q >= len ? len - 1 : q) * stride, v = src[j], dd = (v - c) * (v - c) * sc;
          if (dd >= LUT) continue;
          const w = lut[dd | 0] * (1 - Math.abs(t) / (r + 1)); acc += v * w; ws += w;
        }
        dst[i] = acc / ws;
      }
    }
  };
  pass(a, tmp2, true); pass(tmp2, a, false);
}
function updateTone() {
  const t0 = performance.now();
  drawCover(tx, TW, TH);
  const d = tx.getImageData(0, 0, TW, TH).data, hist = new Uint32Array(256);
  for (let i = 0; i < TN; i++) { const g = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); gray[i] = g; hist[g]++; }
  let lo = 0, hi = 255;
  if (!offv('e2lo')) { const c = P.e2lo / 100; let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a > TN * c) { lo = i; break; } } a = 0; for (let i = 255; i >= 0; i--) { a += hist[i]; if (a > TN * c) { hi = i; break; } } }
  if (hi - lo < 16) { const m = (hi + lo) / 2; lo = m - 8; hi = m + 8; }
  const con = num('e2c', 1), br = num('e2b', 0);
  for (let i = 0; i < TN; i++) gray[i] = Math.min(1, Math.max(0, ((gray[i] - lo) / (hi - lo) - 0.5) * con + 0.5 + br));
  // noise out, edges kept: two bilateral rounds
  const r = Math.round(num('e2s', 0) / TS * 2), sig = offv('e2e') ? 10 : P.e2e;
  if (r > 0) { bilateral(gray, r, sig); bilateral(gray, Math.max(1, r >> 1), sig); }
  // soft tone bands: the engraver thinks in a few tone zones
  if (!offv('e2k')) {
    const K = Math.round(P.e2k) - 1, soft = offv('e2ks') ? 0 : P.e2ks;
    for (let i = 0; i < TN; i++) {
      const x = gray[i] * K, f = x - Math.floor(x), e = 0.5 * (1 - soft);
      gray[i] = (Math.floor(x) + (soft >= 1 ? f : Math.min(1, Math.max(0, (f - e) / Math.max(1e-3, 1 - 2 * e))))) / K;
    }
  }
  const k = toneReady && !dirty ? 1 - num('e2t', 0) : 1;
  for (let i = 0; i < TN; i++) tone[i] += (gray[i] - tone[i]) * k;
  toneReady = true; dirty = false; uploadTone = true; toneMs = performance.now() - t0;
}

// ---------------------------------------------------------------- depth (one model)
const DM = createDepthModel((id, def) => (P.on[id] === undefined ? (id === 'dpw' ? 0 : def) : val(id)), () => {});
const M = DM.M;

// ---------------------------------------------------------------- 3. smooth direction field (CPU, 135 x 240)
// structure tensors of depth and of the clean tone, blended and heavily smoothed; the lines run along the contours
const FW = 135, FH = 240, FN = FW * FH, FS = OW / FW;
const fxx = new Float32Array(FN), fxy = new Float32Array(FN), fyy = new Float32Array(FN), ftmp = new Float32Array(FN);
const dirX = new Float32Array(FN), dirY = new Float32Array(FN);
function boxF(a, r) {
  for (let y = 0; y < FH; y++) { let s = 0; const o = y * FW;
    for (let x = -r; x <= r; x++) s += a[o + Math.min(FW - 1, Math.max(0, x))];
    for (let x = 0; x < FW; x++) { ftmp[o + x] = s / (2 * r + 1); s += a[o + Math.min(FW - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < FW; x++) { let s = 0;
    for (let y = -r; y <= r; y++) s += ftmp[Math.min(FH - 1, Math.max(0, y)) * FW + x];
    for (let y = 0; y < FH; y++) { a[y * FW + x] = s / (2 * r + 1); s += ftmp[Math.min(FH - 1, y + r + 1) * FW + x] - ftmp[Math.max(0, y - r) * FW + x]; } }
}
function sampleArr(a, w, h, x, y) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + w] * (1 - fx) + a[i + w + 1] * fx) * fy;
}
function buildField() {
  const wd = M.have ? num('e2fd', 0) : 0, wt = num('e2ft', 0), base = num('e2a', 0) * Math.PI / 180;
  const fieldAt = (arr, w, h, i, j) => sampleArr(arr, w, h, (i + 0.5) / FW * w - 0.5, (j + 0.5) / FH * h - 0.5);
  const dz = new Float32Array(FN), tz = new Float32Array(FN);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    dz[j * FW + i] = wd > 0 ? fieldAt(M.out, M.w, M.h, i, j) : 0;
    tz[j * FW + i] = fieldAt(tone, TW, TH, i, j);
  }
  // gradients -> tensors (each source normalised by its own 90th percentile so depth and tone weigh as asked)
  const tensor = (z, w) => {
    const g = new Float32Array(FN * 2), m = [];
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      const k = j * FW + i, gx = z[j * FW + Math.min(FW - 1, i + 1)] - z[j * FW + Math.max(0, i - 1)], gy = z[Math.min(FH - 1, j + 1) * FW + i] - z[Math.max(0, j - 1) * FW + i];
      g[k * 2] = gx; g[k * 2 + 1] = gy; if (k % 7 === 0) m.push(gx * gx + gy * gy);
    }
    m.sort((a, b) => a - b); const p = Math.max(1e-9, m[(m.length * 0.9) | 0]);
    for (let k = 0; k < FN; k++) { const gx = g[k * 2], gy = g[k * 2 + 1]; fxx[k] += w * gx * gx / p; fxy[k] += w * gx * gy / p; fyy[k] += w * gy * gy / p; }
  };
  fxx.fill(0); fxy.fill(0); fyy.fill(0);
  if (wd > 0) tensor(dz, wd);
  if (wt > 0) tensor(tz, wt);
  const r = Math.max(1, Math.round(num('e2fs', 120) / FS / 2));
  for (const a of [fxx, fxy, fyy]) { boxF(a, r); boxF(a, r); }
  // contour direction where the tensor is strong; the base angle where the surface is flat (smooth blend)
  const bx = Math.cos(base), by = -Math.sin(base);
  for (let k = 0; k < FN; k++) {
    const ang = 0.5 * Math.atan2(2 * fxy[k], fxx[k] - fyy[k]) + Math.PI / 2, s = Math.min(1, Math.sqrt(fxx[k] + fyy[k]) * 1.5);
    let cx = Math.cos(ang), cy = Math.sin(ang); if (cx * bx + cy * by < 0) { cx = -cx; cy = -cy; }
    const vx = bx * (1 - s) + cx * s, vy = by * (1 - s) + cy * s, l = Math.hypot(vx, vy) || 1;
    dirX[k] = vx / l; dirY[k] = vy / l;
  }
}
// direction at an output px (the doubled angle is resolved by keeping the walk going the same way)
function dirAt(x, y, rot) {
  const fx = x / FS - 0.5, fy = y / FS - 0.5;
  let vx = sampleArr(dirX, FW, FH, fx, fy), vy = sampleArr(dirY, FW, FH, fx, fy);
  if (rot) { const c = Math.cos(rot), s = Math.sin(rot); [vx, vy] = [vx * c + vy * s, -vx * s + vy * c]; }
  const l = Math.hypot(vx, vy) || 1; return [vx / l, vy / l];
}

// ---------------------------------------------------------------- 4. evenly spaced streamlines (Jobard-Lefer)
function streamlines(sep, rot) {
  const test = sep * 0.75, h = Math.max(1, sep / 5), cs = sep, GX = Math.ceil(OW / cs) + 1, GY = Math.ceil(OH / cs) + 1;
  const grid = Array.from({ length: GX * GY }, () => []), lines = [];
  const near = (x, y, d, self, from) => {
    const ci = (x / cs) | 0, cj = (y / cs) | 0, d2 = d * d;
    for (let j = Math.max(0, cj - 1); j <= Math.min(GY - 1, cj + 1); j++) for (let i = Math.max(0, ci - 1); i <= Math.min(GX - 1, ci + 1); i++)
      for (const p of grid[j * GX + i]) {
        if (p[2] === self && Math.abs(p[3] - from) < sep * 2 / h) continue;   // skip the line's own recent points
        const dx = p[0] - x, dy = p[1] - y; if (dx * dx + dy * dy < d2) return true;
      }
    return false;
  };
  const inside = (x, y) => x >= 0 && y >= 0 && x < OW && y < OH;
  const trace = (sx, sy, id) => {
    const half = (sgn) => {
      const pts = []; let x = sx, y = sy, [px, py] = dirAt(x, y, rot); px *= sgn; py *= sgn;
      for (let n = 0; n < 4000; n++) {
        let [dx, dy] = dirAt(x, y, rot); if (dx * px + dy * py < 0) { dx = -dx; dy = -dy; }
        let [ex, ey] = dirAt(x + dx * h * 0.5, y + dy * h * 0.5, rot); if (ex * dx + ey * dy < 0) { ex = -ex; ey = -ey; }   // midpoint step
        const nx = x + ex * h, ny = y + ey * h;
        if (!inside(nx, ny) || near(nx, ny, test, id, sgn * (n + 1))) break;
        x = nx; y = ny; px = ex; py = ey; pts.push([x, y]);
      }
      return pts;
    };
    const fwd = half(1), back = half(-1);
    return back.reverse().concat([[sx, sy]], fwd);
  };
  const add = (pts, id) => {
    let s = 0; const L = [];
    pts.forEach((p, k) => { if (k) s += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]); L.push([p[0], p[1], s]); });
    pts.forEach((p, k) => { const g = grid[Math.min(GY - 1, (p[1] / cs) | 0) * GX + Math.min(GX - 1, (p[0] / cs) | 0)]; g.push([p[0], p[1], id, k]); });
    lines.push(L);
  };
  // seeds: from the middle, then from every line placed (one spacing to each side), then a coarse sweep for the gaps
  const queue = [];
  const trySeed = (x, y) => {
    if (!inside(x, y) || near(x, y, sep * 0.99, -1, 0)) return;
    const id = lines.length, pts = trace(x, y, id);
    if (pts.length < 3) return;
    add(pts, id); queue.push(id);
  };
  trySeed(OW / 2, OH / 2);
  const sweep = [];
  for (let y = sep / 2; y < OH; y += sep * 3) for (let x = sep / 2; x < OW; x += sep * 3) sweep.push([x, y]);
  let si = 0;
  for (;;) {
    while (queue.length) {
      const L = lines[queue.shift()], stepK = Math.max(1, Math.round(sep / h / 2));
      for (let k = 0; k < L.length; k += stepK) {
        const k2 = Math.min(L.length - 1, k + 1), k1 = Math.max(0, k2 - 1);
        let dx = L[k2][0] - L[k1][0], dy = L[k2][1] - L[k1][1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        trySeed(L[k][0] - dy * sep, L[k][1] + dx * sep); trySeed(L[k][0] + dy * sep, L[k][1] - dx * sep);
      }
    }
    if (si >= sweep.length) break;
    trySeed(sweep[si][0], sweep[si][1]); si++;
  }
  return lines;
}

// ---------------------------------------------------------------- 5. drawing (WebGL2): quads along the lines, tone on them
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
const VS = `#version 300 es
in vec2 pos; in vec4 att;             // att: across px, along px, distance to the nearer end px, set (0 = main, 1 = crossing)
uniform vec2 res;
out vec4 a; out vec2 uv;
void main() { a = att; uv = pos / res; gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0); }`;
const FSH = `#version 300 es
precision highp float;
in vec4 a; in vec2 uv; out vec4 o;
uniform sampler2D toneT;
uniform float hw, dashLen, minDash, taper, minInk, pwhite, lw, fade;
uniform vec3 ink;
void main() {
  float t = texture(toneT, uv).r;
  float dk = mix(minInk, 1.0, 1.0 - t) * (1.0 - smoothstep(pwhite, min(1.0, pwhite + 0.04), t));
  // the levels at one thickness: the main set carries the tone alone up to lw (dashes grow into a line), then the crossing set
  float cA = lw, cAB = lw + lw * (1.0 - lw);
  float duty = a.w < 0.5 ? clamp(dk / cA, 0.0, 1.0) : clamp((dk - cA) / max(cAB - cA, 0.01), 0.0, 1.0);
  if (duty <= 0.001) discard;
  float w = hw * (taper > 0.0 ? smoothstep(0.0, taper, a.z) : 1.0);   // tapered ends
  if (dashLen > 0.0 && duty < 0.999) {
    float L = max(duty, minDash), u = (fract(a.y / dashLen) - 0.5) / (0.5 * L);
    if (abs(u) >= 1.0) discard;
    w *= sqrt(max(0.0, 1.0 - u * u));                      // pointed dash ends
    if (duty < minDash) w *= sqrt(duty / minDash);
  }
  float cov = 1.0 - smoothstep(w - 0.6, w + 0.6, abs(a.x));
  if (cov <= 0.0) discard;
  o = vec4(ink, cov * fade);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(s); $('#msg').textContent = 'Shader: ' + m; console.error(m); }
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); return p;
}
const pr = prog(VS, FSH); gl.useProgram(pr);
const U = {}; for (const n of ['res', 'toneT', 'hw', 'dashLen', 'minDash', 'taper', 'minInk', 'pwhite', 'lw', 'fade', 'ink']) U[n] = gl.getUniformLocation(pr, n);
const aPos = gl.getAttribLocation(pr, 'pos'), aAtt = gl.getAttribLocation(pr, 'att');
const tTone = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTone);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.toneT, 0);
// a line set as triangles: each segment a quad, widened by the half-width + 1 px for anti-aliasing
function meshOf(lines, set, hwPx) {
  let nseg = 0; for (const L of lines) nseg += L.length - 1;
  const v = new Float32Array(nseg * 6 * 6); let o = 0, minLen = offv('e2mn') ? 0 : P.e2mn;
  for (const L of lines) {
    const len = L[L.length - 1][2]; if (len < minLen) continue;
    for (let k = 0; k < L.length - 1; k++) {
      const p = L[k], q = L[k + 1]; let dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const e = hwPx + 1.2, nx = -dy * e, ny = dx * e;
      const ends = [Math.min(p[2], len - p[2]), Math.min(q[2], len - q[2])];
      const V = [[p[0] + nx, p[1] + ny, e, p[2], ends[0]], [p[0] - nx, p[1] - ny, -e, p[2], ends[0]], [q[0] + nx, q[1] + ny, e, q[2], ends[1]], [q[0] - nx, q[1] - ny, -e, q[2], ends[1]]];
      for (const i of [0, 1, 2, 2, 1, 3]) { const w = V[i]; v[o++] = w[0]; v[o++] = w[1]; v[o++] = w[2]; v[o++] = w[3]; v[o++] = w[4]; v[o++] = set; }
    }
  }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, v.subarray(0, o), gl.STATIC_DRAW);
  return { buf, n: o / 6 };
}
let meshes = { cur: [], old: [], t: 0 }, buildMs = 0, nLines = 0, lastBuild = -1e9, buildKey = '';
function rebuild() {
  if (!toneReady) return;
  const t0 = performance.now();
  buildField();
  const sep = num('e2sp', 12), hwPx = 0.5 * num('e2w', 0.32) * sep, x = offv('e2x') ? 0 : P.e2x * Math.PI / 180;
  const A = streamlines(sep, 0), B = x ? streamlines(sep, x) : [];
  for (const m of meshes.old) gl.deleteBuffer(m.buf);
  meshes = { old: meshes.cur, cur: [meshOf(A, 0, hwPx), ...(B.length ? [meshOf(B, 1, hwPx)] : [])], t: performance.now() };
  nLines = A.length + B.length; buildMs = performance.now() - t0; lastBuild = performance.now();
}
let pal = getPalette(); onPalette((p) => { pal = p; });
function render() {
  if (uploadTone) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTone); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, tone); uploadTone = false; }
  const paper = P.pal ? pal.paper.map((x) => x / 255) : [1, 1, 1], ink = P.pal ? pal.cols[0].map((x) => x / 255) : [0.07, 0.07, 0.07];
  gl.viewport(0, 0, OW, OH); gl.clearColor(paper[0], paper[1], paper[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const sep = num('e2sp', 12);
  gl.uniform2f(U.res, OW, OH); gl.uniform1f(U.hw, 0.5 * num('e2w', 0.32) * sep); gl.uniform1f(U.lw, num('e2w', 0.32));
  gl.uniform1f(U.dashLen, offv('e2dl') ? 0 : P.e2dl); gl.uniform1f(U.minDash, num('e2md', 0.22)); gl.uniform1f(U.taper, offv('e2tp') ? 0 : P.e2tp);
  gl.uniform1f(U.minInk, offv('e2mi') ? 0 : P.e2mi); gl.uniform1f(U.pwhite, offv('e2pw') ? 1.05 : P.e2pw);
  gl.uniform3fv(U.ink, ink);
  const f = Math.min(1, (performance.now() - meshes.t) / 400);           // new lines fade in over the old ones
  const draw = (list, a) => { gl.uniform1f(U.fade, a); for (const m of list) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aAtt); gl.vertexAttribPointer(aAtt, 4, gl.FLOAT, false, 24, 8);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
  } };
  if (f < 1) draw(meshes.old, 1 - f);
  draw(meshes.cur, f);
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML =
    row('CPU clean tone', toneMs.toFixed(1) + ' ms') + row('CPU lines (field + streamlines)', buildMs.toFixed(0) + ' ms') + row('lines', nLines.toLocaleString()) +
    row('depth model', MODELS[0].label) +
    row('runs on', M.ready ? (M.ep === 'webgpu' ? 'GPU (WebGPU)' : 'processor (WASM, slow)') : M.loading ? 'loading...' : '-') +
    row('depth maps per second', M.fps.toFixed(1));
  $('#budget').style.width = Math.min(100, (toneMs + M.ms / 4) / 33.3 * 100) + '%';
}
setInterval(renderStats, 250);

// ---------------------------------------------------------------- loop
let lastMedia = -1;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const fresh = vid.currentTime !== lastMedia; lastMedia = vid.currentTime;
  if (fresh || dirty) updateTone();
  if (M.ready && !M.busy && (fresh || !M.have)) DM.infer();
  const every = offv('e2rb') ? Infinity : P.e2rb * 1000, key = ['e2sp', 'e2w', 'e2a', 'e2x', 'e2fd', 'e2ft', 'e2fs', 'e2mn'].map((k) => val(k)).join();
  if (toneReady && (meshes.cur.length === 0 || key !== buildKey || performance.now() - lastBuild > every)) { buildKey = key; rebuild(); }
  render();
}

// ---------------------------------------------------------------- UI
$('#settings').addEventListener('input', () => { dirty = true; }, true);
$('#settings').addEventListener('change', () => { dirty = true; }, true);
$('#e2pal').onchange = (e) => { P.pal = e.target.checked; };
$('#restart').onclick = () => { M.sm = null; M.have = false; lastBuild = -1e9; };
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r1');

window.__state = { M, P, val, tone, rebuild, get buildMs() { return buildMs; }, get nLines() { return nLines; } };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
