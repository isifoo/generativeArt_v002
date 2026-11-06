// WINDOWS: a night apartment block (a generated, photographic background: windows/bg.webp) and the person made of the windows with their light on.
// windows/win.json lists every window (found once, offline); windows/id.png says which window each pixel belongs to. Each window has its own
// fixed random switch-on level; the camera person (found by the depth model) decides which switch on, and the tone inside the person carves the face.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';
import { createDepthModel } from './depthmodel.js';

const SLIDERS = [
  { head: 'Person' },
  { id: 'wfg', label: 'Person edge (depth)', min: 0.1, max: 0.9, step: 0.01, val: 0.5, off: '0.5' },
  { id: 'wtone', label: 'Face detail (tone)', min: 0, max: 1, step: 0.01, val: 0.65, off: 'the whole person lit' },
  { id: 'winv', label: 'Invert (1 = lights where it is dark)', min: 0, max: 1, step: 1, val: 0, off: '0' },
  { head: 'Light' },
  { id: 'wthr', label: 'Threshold (more = fewer lights)', min: -0.4, max: 0.4, step: 0.01, val: 0, off: '0' },
  { id: 'wcon', label: 'Contrast', min: 0.5, max: 6, step: 0.05, val: 2, off: '2' },
  { id: 'wsp', label: 'Random spread', min: 0, max: 1, step: 0.01, val: 0.35, off: 'every window flips at the same tone' },
  { id: 'wbg', label: 'Lights elsewhere %', min: 0, max: 30, step: 0.5, val: 3, off: 'none' },
  { id: 'wsm', label: 'Time smoothing', min: 0, max: 0.95, step: 0.01, val: 0.6, off: 'none' },
  { head: 'Look' },
  { id: 'wwarm', label: 'Warm / cool light', min: 0, max: 1, step: 0.01, val: 0.85, off: 'all cool white' },
  { id: 'wgl', label: 'Glow', min: 0, max: 1, step: 0.01, val: 0.5, off: 'none' },
  { id: 'wdim', label: 'Facade brightness', min: 0, max: 2.5, step: 0.01, val: 1.15, off: 'black' },
];
const P = {};
const val = buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);

let depthNew = false;
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : def), () => { depthNew = true; });
const canvas = $('#cv'); canvas.width = 1080; canvas.height = 1920;
const OW = 1080, OH = 1920;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');

const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D bgT, idT, litT;                        // the photograph, the window id of each pixel, the light level of each window
uniform vec2 bgSize;
uniform float warm, glow, dim;
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
int idAt(vec2 q) { vec4 c = texture(idT, q); return int(c.r * 255.0 + 0.5) + 256 * int(c.g * 255.0 + 0.5); }
float levelOf(int id) { return id == 0 ? 0.0 : texelFetch(litT, ivec2(id & 255, id >> 8), 0).r; }
void main() {
  vec3 base = texture(bgT, uv).rgb * dim;
  int id = idAt(uv); float lv = levelOf(id);
  vec3 col = base;
  if (id > 0 && lv > 0.0) {
    float r1 = h11(float(id)), r2 = h11(float(id) + 7.7);
    vec3 warmC = mix(vec3(1.0, 0.80, 0.52), vec3(1.0, 0.58, 0.30), r2), coolC = vec3(0.80, 0.91, 1.0);
    vec3 lc = mix(coolC, warmC, r1 < warm ? 1.0 : 0.0);
    float frame = smoothstep(0.16, 0.34, luma(base / max(dim, 0.01)));       // bright frames and bars of the picture stay as dark silhouettes against the light
    col = base * 0.15 + lc * lv * (1.05 - 0.85 * frame);
  } else if (glow > 0.0) {                                   // halo on the wall around a lit window
    float h = 0.0, rr = 7.0 / bgSize.x;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982; vec2 d = vec2(cos(a), sin(a) * bgSize.x / bgSize.y) * rr;
      int j = idAt(uv + d); if (j > 0) h = max(h, levelOf(j));
      j = idAt(uv + d * 2.0); if (j > 0) h = max(h, levelOf(j) * 0.55);
    }
    col += vec3(1.0, 0.72, 0.45) * h * glow * 0.20;
  }
  o = vec4(pow(col, vec3(0.95)), 1.0);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) msg('Shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); return p;
}
const pr = prog(VS, FS); gl.useProgram(pr);
{
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}
const U = {}; for (const n of ['bgT', 'idT', 'litT', 'bgSize', 'warm', 'glow', 'dim']) U[n] = gl.getUniformLocation(pr, n);
const mkTex = (unit, filter) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tBg = mkTex(0, gl.LINEAR), tId = mkTex(1, gl.NEAREST), tLit = mkTex(2, gl.NEAREST);
gl.uniform1i(U.bgT, 0); gl.uniform1i(U.idT, 1); gl.uniform1i(U.litT, 2); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

// ---------------------------------------------------------------- the picture of the block and its window list
let WINS = [], BW = 768, BH = 1376, ready = false;
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src + '?b=' + document.querySelector('meta[name=build]').content; });
async function loadBlock() {
  try {
    const [bg, idi, js] = await Promise.all([loadImg('windows/bg.webp'), loadImg('windows/id.png'), fetch('windows/win.json').then((r) => r.json())]);
    WINS = js.wins; BW = js.w; BH = js.h;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBg); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg);
    const c = document.createElement('canvas'); c.width = idi.width; c.height = idi.height; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(idi, 0, 0); const px = x.getImageData(0, 0, c.width, c.height);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tId); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, c.width, c.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.data.buffer));
    gl.uniform2f(U.bgSize, BW, BH); ready = true;
  } catch (e) { msg('Windows: ' + e.message); }
}

// ---------------------------------------------------------------- the person: tone grid under the picture, one value per window
const COLS = 96, ROWS = 172;
const sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true }); sc.width = COLS; sc.height = ROWS;
let tone = null, wv = null, lastMedia = -1, nLit = 0;
function updateTone() {
  drawCover(sx, COLS, ROWS);
  const d = sx.getImageData(0, 0, COLS, ROWS).data, M = DM.M, fgT = num('wfg', 0.5), wt = num('wtone', 0.65), hasD = M.have && M.out && M.w, n = COLS * ROWS;
  const lumA = new Float32Array(n), fgA = new Float32Array(n), vA = new Float32Array(n);
  for (let y = 0, i = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++, i++) {
    lumA[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; fgA[i] = 1;
    if (hasD) {                                              // the person = near in the depth map
      const mx = Math.min(M.w - 1, Math.floor((x + 0.5) / COLS * M.w)), my = Math.min(M.h - 1, Math.floor((y + 0.5) / ROWS * M.h));
      const near = M.out[my * M.w + mx], e = 0.12; fgA[i] = Math.min(1, Math.max(0, (near - (fgT - e)) / (2 * e)));
    }
  }
  const R = 7;                                               // local mean of the tone inside the person: features = lighter or darker than their surroundings
  const sumW = new Float32Array(n), sumL = new Float32Array(n);   // box sums by two passes
  const rowW = new Float32Array(n), rowL = new Float32Array(n);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { let sw = 0, sl = 0; for (let xx = Math.max(0, x - R); xx <= Math.min(COLS - 1, x + R); xx++) { const j = y * COLS + xx; sw += fgA[j]; sl += fgA[j] * lumA[j]; } rowW[y * COLS + x] = sw; rowL[y * COLS + x] = sl; }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { let sw = 0, sl = 0; for (let yy = Math.max(0, y - R); yy <= Math.min(ROWS - 1, y + R); yy++) { sw += rowW[yy * COLS + x]; sl += rowL[yy * COLS + x]; } sumW[y * COLS + x] = sw; sumL[y * COLS + x] = sl; }
  for (let i = 0; i < n; i++) {
    const loc = sumW[i] > 0 ? lumA[i] - sumL[i] / sumW[i] : 0;
    vA[i] = hasD ? fgA[i] * Math.min(1, Math.max(0, 0.62 + wt * (loc * 3.0) + 0.25 * (lumA[i] - 0.4) * (1 - wt))) : lumA[i];
  }
  const k = 1 - num('wsm', 0.6); if (!tone) tone = new Float32Array(n).fill(-1);
  for (let i = 0; i < n; i++) tone[i] = tone[i] < 0 ? vA[i] : tone[i] + (vA[i] - tone[i]) * k;
  litUp = true;
}
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
let litUp = false;
function uploadLevels() {
  const N = WINS.length + 1, wdt = 256, hgt = Math.ceil(N / wdt) || 1, u8 = new Uint8Array(wdt * hgt);
  const thr = num('wthr', 0), con = num('wcon', 2), sp = num('wsp', 0.35), bgp = num('wbg', 3) * 0.01, inv = num('winv', 0) >= 0.5; nLit = 0;
  for (let k = 0; k < WINS.length; k++) {
    const [x, y, w, h] = WINS[k], id = k + 1;
    const gx = Math.min(COLS - 1, Math.max(0, (x + w / 2) / BW * COLS)), gy = Math.min(ROWS - 1, Math.max(0, (y + h / 2) / BH * ROWS));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(COLS - 1, x0 + 1), y1 = Math.min(ROWS - 1, y0 + 1), fx = gx - x0, fy = gy - y0;
    const T = (xx, yy) => tone[yy * COLS + xx];
    let v = (T(x0, y0) * (1 - fx) + T(x1, y0) * fx) * (1 - fy) + (T(x0, y1) * (1 - fx) + T(x1, y1) * fx) * fy;
    if (inv) v = 1 - v;
    const tA = Math.min(1, Math.max(0, (v - 0.5) * con + 0.5)), lim = 0.5 + thr + (hash(id) - 0.5) * sp * 1.2;
    let lit = Math.min(1, Math.max(0, (tA - (lim - 0.04)) / 0.08)); lit = lit * lit * (3 - 2 * lit);
    if (hash(id + 3.1) < bgp) lit = Math.max(lit, 0.5 + 0.5 * hash(id + 5.3));
    const level = lit * (0.55 + 0.45 * Math.min(1, Math.max(0, tA * 0.8 + hash(id + 9.1) * 0.35)));
    if (level > 0.05) nLit++;
    u8[id] = Math.round(level * 255);
  }
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tLit);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, wdt, hgt, 0, gl.RED, gl.UNSIGNED_BYTE, u8); litUp = false;
}
function render() {
  if (!ready || !tone) return;
  if (litUp) uploadLevels();
  gl.uniform1f(U.warm, num('wwarm', 0.85)); gl.uniform1f(U.glow, num('wgl', 0.5)); gl.uniform1f(U.dim, num('wdim', 1.15));
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

let frames = 0, ms = 0, t0 = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const fresh = vid.currentTime !== lastMedia; if (DM.M.ready && !DM.M.busy && (fresh || !DM.M.have)) DM.infer();
  if (fresh || !tone || depthNew) { lastMedia = vid.currentTime; depthNew = false; updateTone(); }
  const a = performance.now(); render(); ms += performance.now() - a; frames++;
  if (performance.now() - t0 > 1000) { fps = frames * 1000 / (performance.now() - t0); frames = 0; t0 = performance.now(); }
}
setInterval(() => {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML = row('windows', WINS.length) + row('lit now', nLit) + row('frames per second', fps.toFixed(0));
  $('#budget').style.width = Math.min(100, (ms / Math.max(1, frames)) / 33.3 * 100) + '%';
}, 500);
$('#settings').addEventListener('input', () => { litUp = !!tone; }, true);
cam.onStart = () => { lastMedia = -1; tone = null; };
initDefaults('.w2');
window.__state = { P, DM, WINS: () => WINS, get tone() { return tone; } };
DM.load(); loadBlock();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
