// WINDOWS: a night apartment block (a generated photograph: windows/bg.webp) and the camera picture drawn with the lights of its windows.
// windows/win.json lists every window (found once, offline) and windows/id.png says which window each pixel belongs to. Each window's light is a solid yellow
// laid over its own area in Screen mode, so the photograph's frames and curtains stay; the brightness of the camera under that window drives how strong the light is
// (dark = a dim light, bright = a strong light). The depth model can fade the background so the person stands out. The light is also blurred in three levels for the glow.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';
import { createDepthModel } from './depthmodel.js';

const SLIDERS = [
  { head: 'Camera to light' },
  { id: 'wauto', label: 'Auto levels', min: 0, max: 1, step: 0.01, val: 1, off: 'use Black / White point only' },
  { id: 'wblk', label: 'Black point', min: 0, max: 0.8, step: 0.005, val: 0.05, off: '0.05' },
  { id: 'wwht', label: 'White point', min: 0.1, max: 1, step: 0.005, val: 0.8, off: '0.8' },
  { id: 'wgam', label: 'Contrast curve (gamma)', min: 0.3, max: 3, step: 0.01, val: 1.9, off: '1.9' },
  { id: 'wstr', label: 'Light strength', min: 0, max: 2, step: 0.01, val: 0.95, off: 'no light' },
  { id: 'wvar', label: 'Variation per window', min: 0, max: 0.6, step: 0.01, val: 0.12, off: 'none' },
  { id: 'winv', label: 'Invert (1 = lights where it is dark)', min: 0, max: 1, step: 1, val: 0, off: '0' },
  { id: 'wsm', label: 'Time smoothing', min: 0, max: 0.95, step: 0.01, val: 0.55, off: 'none' },
  { head: 'Person' },
  { id: 'wbgf', label: 'Fade the background (depth)', min: 0, max: 1, step: 0.01, val: 0.85, off: 'whole picture' },
  { id: 'wfg', label: 'Person edge (depth)', min: 0.1, max: 0.9, step: 0.01, val: 0.5, off: '0.5' },
  { head: 'Look' },
  { id: 'wwarm', label: 'Yellow / cool white', min: 0, max: 1, step: 0.01, val: 0.9, off: 'all cool white' },
  { id: 'wgl', label: 'Glow', min: 0, max: 2, step: 0.01, val: 0.7, off: 'none' },
  { id: 'wgs', label: 'Glow spread (tight to wide)', min: 0, max: 1, step: 0.01, val: 0.5, off: 'tight only' },
  { id: 'wdim', label: 'Facade brightness', min: 0, max: 2.5, step: 0.01, val: 1.15, off: 'black' },
];
const P = {};
const val = buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);

let depthNew = false;
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : def), () => { depthNew = true; });
const canvas = $('#cv');
let OW = 1024, OH = 2000; canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');

const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D bgT, idT, litT, rectT;                  // the photograph, window id per pixel, light level per window, window rectangles (uv)
uniform sampler2D g1, g2, g3;                             // three blur levels of the emitted light: tight, medium, wide
uniform float warm, glow, spread, dim, mode;              // mode 0: only the light of the windows (for the glow), mode 1: the final picture
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
int idAt(vec2 q) { vec4 c = texture(idT, q); return int(c.r * 255.0 + 0.5) + 256 * int(c.g * 255.0 + 0.5); }
vec3 emit(vec2 q) {                                       // a solid yellow (or cool white) over the window's area, as strong as its level
  int id = idAt(q); if (id == 0) return vec3(0.0);
  float lv = texelFetch(litT, ivec2(id & 255, id >> 8), 0).r * 1.5;
  if (lv <= 0.002) return vec3(0.0);
  vec4 rc = texelFetch(rectT, ivec2(id & 255, id >> 8), 0);
  vec2 loc = clamp((q - rc.xy) / rc.zw, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.07, min(min(loc.x, 1.0 - loc.x), min(loc.y, 1.0 - loc.y)));
  float fid = float(id);
  vec3 yel = mix(vec3(1.0, 0.80, 0.42), vec3(1.0, 0.64, 0.28), h11(fid + 7.7)), cool = vec3(0.82, 0.92, 1.0);
  return (h11(fid) < warm ? yel : cool) * lv * edge;
}
void main() {
  vec3 e = emit(uv);
  if (mode < 0.5) { o = vec4(e, 1.0); return; }
  vec3 base = texture(bgT, uv).rgb * dim;
  vec2 gq = vec2(uv.x, 1.0 - uv.y);
  float w1 = 1.0 - 0.6 * spread, w2 = 0.35 + 0.65 * spread, w3 = 0.15 + 0.85 * spread;
  vec3 gl = (texture(g1, gq).rgb * w1 + texture(g2, gq).rgb * w2 + texture(g3, gq).rgb * w3) * glow;
  vec3 col = 1.0 - (1.0 - clamp(base, 0.0, 1.0)) * (1.0 - clamp(e, 0.0, 1.0));          // Screen
  col += max(e - 1.0, 0.0) * 0.5 + gl;                                                    // light above white and the glow add on top
  o = vec4(pow(clamp(col, 0.0, 4.0), vec3(0.95)), 1.0);
}`;
const VS2 = `#version 300 es
in vec2 p; out vec2 vt; void main() { vt = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FSB = `#version 300 es
precision highp float;
in vec2 vt; out vec4 o; uniform sampler2D src; uniform vec2 dir;                    // dir (0,0) = plain copy (a linear down-sample)
void main() {
  if (dir.x == 0.0 && dir.y == 0.0) { o = texture(src, vt); return; }
  vec4 s = texture(src, vt) * 0.227027;
  s += (texture(src, vt + dir * 1.0) + texture(src, vt - dir * 1.0)) * 0.1945946; s += (texture(src, vt + dir * 2.0) + texture(src, vt - dir * 2.0)) * 0.1216216;
  s += (texture(src, vt + dir * 3.0) + texture(src, vt - dir * 3.0)) * 0.054054;  s += (texture(src, vt + dir * 4.0) + texture(src, vt - dir * 4.0)) * 0.016216;
  o = s;
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
const pr = prog(VS, FS), pb = prog(VS2, FSB);
{
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  for (const q of [pr, pb]) { gl.useProgram(q); const loc = gl.getAttribLocation(q, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
}
gl.useProgram(pr);
const U = {}; for (const n of ['bgT', 'idT', 'litT', 'rectT', 'g1', 'g2', 'g3', 'warm', 'glow', 'spread', 'dim', 'mode']) U[n] = gl.getUniformLocation(pr, n);
const UB = { src: gl.getUniformLocation(pb, 'src'), dir: gl.getUniformLocation(pb, 'dir') };
gl.getExtension('EXT_color_buffer_float');
const mkTex = (unit, filter) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tBg = mkTex(0, gl.LINEAR), tId = mkTex(1, gl.NEAREST), tLit = mkTex(2, gl.NEAREST), tRect = mkTex(3, gl.NEAREST);
for (const [n, i] of [['bgT', 0], ['idT', 1], ['litT', 2], ['rectT', 3], ['g1', 5], ['g2', 6], ['g3', 7]]) gl.uniform1i(U[n], i);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
// light and blur targets: E = the light of the windows (512 wide), then three blurred levels at half, quarter and eighth of that
const mkRT = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; };
const RT = { E: mkRT(512, 1000) };
RT.L = [[256, 500], [128, 250], [64, 125]].map(([w, h]) => ({ a: mkRT(w, h), b: mkRT(w, h) }));
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

// ---------------------------------------------------------------- the camera under the block: brightness per grid cell, the person from the depth model
const COLS = 128; let ROWS = 250;
const sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true }); sc.width = COLS; sc.height = ROWS;
let tone = null, fgv = null, lo = 0.05, hi = 0.8, lastMedia = -1, nLit = 0, litUp = false;

// ---------------------------------------------------------------- the picture of the block and its window list
let WINS = [], BW = 1024, BH = 2000, ready = false;
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src + '?b=' + document.querySelector('meta[name=build]').content; });
async function loadBlock() {
  try {
    const [bg, idi, js] = await Promise.all([loadImg('windows/bg.webp'), loadImg('windows/id.png'), fetch('windows/win.json').then((r) => r.json())]);
    WINS = js.wins; BW = js.w; BH = js.h; OW = BW; OH = BH; canvas.width = OW; canvas.height = OH;
    ROWS = Math.round(COLS * BH / BW); sc.width = COLS; sc.height = ROWS; tone = null; $('#stage').style.aspectRatio = BW + ' / ' + BH;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBg); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg);
    const c = document.createElement('canvas'); c.width = idi.width; c.height = idi.height; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(idi, 0, 0); const px = x.getImageData(0, 0, c.width, c.height);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tId); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, c.width, c.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.data.buffer));
    const wdt = 256, hgt = Math.ceil((WINS.length + 1) / wdt), rc = new Float32Array(wdt * hgt * 4);   // window rectangles in picture uv: x, y, w, h
    WINS.forEach(([x0, y0, w, h], k) => rc.set([x0 / BW, y0 / BH, w / BW, h / BH], (k + 1) * 4));
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tRect); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, wdt, hgt, 0, gl.RGBA, gl.FLOAT, rc);
    ready = true;
  } catch (e) { msg('Windows: ' + e.message); }
}

function updateTone() {
  drawCover(sx, COLS, ROWS);
  const d = sx.getImageData(0, 0, COLS, ROWS).data, M = DM.M, fgT = num('wfg', 0.5), hasD = M.have && M.out && M.w, n = COLS * ROWS;
  const lum = new Float32Array(n), fg = new Float32Array(n).fill(1);
  for (let y = 0, i = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++, i++) {
    lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    if (hasD) {                                              // the person = near in the depth map
      const dx = ((x + 0.5) / COLS - 0.5) * (BW / BH) / (9 / 16) + 0.5, mx = Math.min(M.w - 1, Math.max(0, Math.floor(dx * M.w))), my = Math.min(M.h - 1, Math.floor((y + 0.5) / ROWS * M.h));
      const near = M.out[my * M.w + mx], e = 0.12; fg[i] = Math.min(1, Math.max(0, (near - (fgT - e)) / (2 * e)));
    }
  }
  // auto levels: the 4 % and 96 % of the camera brightness (inside the person when there is one), following slowly
  const hist = new Float32Array(256); let tot = 0;
  for (let i = 0; i < n; i++) { const w = hasD ? fg[i] : 1; hist[Math.min(255, Math.floor(lum[i] * 255))] += w; tot += w; }
  if (tot > 20) {
    let c = 0, a = 0, b = 255; for (; a < 255 && (c += hist[a]) < tot * 0.04; a++); c = 0; for (; b > 0 && (c += hist[b]) < tot * 0.04; b--);
    lo += (a / 255 - lo) * 0.25; hi += (Math.max(a + 12, b) / 255 - hi) * 0.25;
  }
  const k = 1 - num('wsm', 0.55);
  if (!tone) { tone = lum.slice(); fgv = fg.slice(); } else for (let i = 0; i < n; i++) { tone[i] += (lum[i] - tone[i]) * k; fgv[i] += (fg[i] - fgv[i]) * k; }
  litUp = true;
}
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
const hasDepth = () => !!(DM.M.have && DM.M.out && DM.M.w);
function uploadLevels() {
  const N = WINS.length + 1, wdt = 256, hgt = Math.ceil(N / wdt) || 1, u8 = new Uint8Array(wdt * hgt);
  const auto = num('wauto', 1), blk = auto * lo + (1 - auto) * num('wblk', 0.05), wht = auto * hi + (1 - auto) * num('wwht', 0.8), gam = num('wgam', 1.15), str = num('wstr', 1), vr = num('wvar', 0.12);
  const bgf = hasDepth() ? num('wbgf', 0.85) : 0, inv = num('winv', 0) >= 0.5; nLit = 0;
  for (let k = 0; k < WINS.length; k++) {
    const [x, y, w, h] = WINS[k], id = k + 1; let s = 0, sf = 0, c = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {                                           // 3 x 3 samples over the window's own area
      const gx = Math.min(COLS - 1, Math.max(0, Math.floor((x + w * (i + 0.5) / 3) / BW * COLS))), gy = Math.min(ROWS - 1, Math.max(0, Math.floor((y + h * (j + 0.5) / 3) / BH * ROWS)));
      s += tone[gy * COLS + gx]; sf += fgv[gy * COLS + gx]; c++;
    }
    let v = s / c; if (inv) v = 1 - v;
    let I = Math.pow(Math.min(1, Math.max(0, (v - blk) / Math.max(0.05, wht - blk))), gam);
    I *= 1 - bgf * (1 - sf / c);
    I *= str * (1 + (hash(id) - 0.5) * 2 * vr);
    I = Math.min(1.5, Math.max(0, I)); if (I > 0.15) nLit++;
    u8[id] = Math.round(I / 1.5 * 255);
  }
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tLit);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, wdt, hgt, 0, gl.RED, gl.UNSIGNED_BYTE, u8); litUp = false;
}
function blurLevel(src, lv) {                                // copy (linear down-sample) into the level, then a horizontal and a vertical blur
  gl.useProgram(pb); gl.uniform1i(UB.src, 8); gl.activeTexture(gl.TEXTURE8);   // its own unit, so the picture textures stay bound
  const { a, b } = lv;
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.f); gl.viewport(0, 0, a.w, a.h); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform2f(UB.dir, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.bindTexture(gl.TEXTURE_2D, a.t); gl.uniform2f(UB.dir, 1.2 / a.w, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.f); gl.bindTexture(gl.TEXTURE_2D, b.t); gl.uniform2f(UB.dir, 0, 1.2 / a.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function render() {
  if (!ready || !tone) return;
  if (litUp) uploadLevels();
  gl.useProgram(pr);
  gl.uniform1f(U.warm, num('wwarm', 0.9)); gl.uniform1f(U.glow, num('wgl', 0.9)); gl.uniform1f(U.spread, num('wgs', 0.5)); gl.uniform1f(U.dim, num('wdim', 1.15));
  gl.uniform1f(U.mode, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, RT.E.f); gl.viewport(0, 0, RT.E.w, RT.E.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);   // the light alone
  blurLevel(RT.E.t, RT.L[0]); blurLevel(RT.L[0].a.t, RT.L[1]); blurLevel(RT.L[1].a.t, RT.L[2]);                                              // three levels of blur
  gl.useProgram(pr); gl.uniform1f(U.mode, 1);
  for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE5 + i); gl.bindTexture(gl.TEXTURE_2D, RT.L[i].a.t); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
  $('#stats').innerHTML = row('windows', WINS.length) + row('strongly lit', nLit) + row('frames per second', fps.toFixed(0));
  $('#budget').style.width = Math.min(100, (ms / Math.max(1, frames)) / 33.3 * 100) + '%';
}, 500);
$('#settings').addEventListener('input', () => { litUp = !!tone; }, true);
cam.onStart = () => { lastMedia = -1; tone = null; };
initDefaults('.w3');
window.__state = { P, DM, WINS: () => WINS, get tone() { return tone; } };
DM.load(); loadBlock();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
