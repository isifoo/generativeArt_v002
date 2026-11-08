// DEPTH: the best looking real-time depth map we can make in a browser.
// Model: Depth Anything V2 Small (fp16 ONNX, onnxruntime-web on WebGPU, WASM fallback). It gives relative depth at low resolution;
// the look comes from what we do after it, on the GPU (WebGL2):
//   robust near / far range (percentiles, slow follow) -> time smoothing -> edge-aware upsampling guided by the video itself
//   (joint bilateral: depth follows the real outlines instead of blurry blobs) -> optional fine detail from the video -> depth curve
//   -> grey or the universal palette.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, getPalette, onPalette } from './ui.js';
import { createDepthModel, MODELS, OW, OH } from './depthmodel.js';

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Model' },
  { id: 'dpq', label: 'Model detail', min: 12, max: 37, step: 1, val: 22, off: 'lowest (12 = 168 px)' },
  { id: 'dpw', label: 'Second model weight', min: 0, max: 1, step: 0.01, val: 0.5, off: 'first model only' },
  { head: 'Range' },
  { id: 'dpn', label: 'Near clip %', min: 0, max: 20, step: 0.1, val: 0.5, off: 'no clip: nearest pixel = white' },
  { id: 'dpf', label: 'Far clip %', min: 0, max: 40, step: 0.5, val: 4, off: 'no clip: farthest pixel = black' },
  { id: 'dpr', label: 'Range follow', min: 0.01, max: 1, step: 0.01, val: 0.1, off: 'instant (1)' },
  { head: 'Look' },
  { id: 'dpg', label: 'Depth curve', min: 0.3, max: 3, step: 0.01, val: 1, off: 'linear (1)' },
  { id: 'dpc', label: 'Contrast', min: 0, max: 3, step: 0.01, val: 1, off: '1' },
  { id: 'dpl', label: 'Shape detail', min: 0, max: 6, step: 0.05, val: 2, off: 'flat: only the overall depth' },
  { id: 'dplr', label: 'Shape size px', min: 8, max: 160, step: 2, val: 48, off: '48' },
  { id: 'dpe', label: 'Edge sharpness', min: 0, max: 1, step: 0.01, val: 0.75, off: 'plain upsampling (soft edges)' },
  { id: 'dpd', label: 'Video detail', min: 0, max: 1, step: 0.01, val: 0.12, off: 'pure depth' },
  { id: 'dpli', label: 'Lines (cartoon pass)', min: 0, max: 2, step: 0.01, val: 0.6, off: 'no lines' },
  { id: 'dpk', label: 'Colour steps (0 = continuous)', min: 0, max: 16, step: 1, val: 0, off: 'continuous' },
  { head: 'Echo (ghost, like the After Effects Echo effect)' },
  { id: 'dech', label: 'Echoes', min: 0, max: 12, step: 1, val: 5, off: 'none' },
  { id: 'dect', label: 'Echo time (s, between echoes)', min: 0.02, max: 0.15, step: 0.005, val: 0.08, off: '0.08' },
  { id: 'dec0', label: 'Starting intensity', min: 0, max: 1, step: 0.01, val: 0.8, off: '0.8' },
  { id: 'decd', label: 'Decay (each echo keeps this much)', min: 0.3, max: 0.98, step: 0.01, val: 0.75, off: '0.75' },
  { head: 'Motion' },
  { id: 'dps', label: 'Time smoothing', min: 0, max: 0.97, step: 0.01, val: 0.8, off: 'none' },
  { id: 'dpm', label: 'Motion follow', min: 0, max: 1, step: 0.01, val: 0.7, off: 'same smoothing everywhere' },
  { id: 'dpb', label: 'Blend between maps', min: 0, max: 1, step: 0.01, val: 1, off: 'step from map to map' },
];
const P = { mode: 'grey' };
const val = buildSliders(SLIDERS, P);
// colour steps start at 0: continuous

// ---------------------------------------------------------------- model (shared: depthmodel.js)
const DM = createDepthModel((id, def) => (P.on[id] === undefined ? def : val(id)), () => { upload = true; });
const M = DM.M, crop = DM.crop;

// ---------------------------------------------------------------- GPU look (WebGL2)
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D dep, depPrev, vidT, lin;
uniform float lh, ls; uniform vec2 lsz;   // line pass: halo and sharp strength, size of the line textures
uniform float bt;          // blend between the previous and the newest depth map (0 .. 1 over the time between maps)
uniform vec2 dsz;          // depth texture size
uniform vec4 crop;         // video uv: offset xy, scale zw (cover crop)
uniform float mir, sharp, detail, gam, con, steps, mode, ncol;
uniform vec3 c0, c1, c2, paper;
vec3 guide(vec2 q) { vec2 u = vec2(mir > 0.5 ? 1.0 - q.x : q.x, q.y); return texture(vidT, crop.xy + u * crop.zw).rgb; }
void main() {
  // joint bilateral upsampling: low-res depth samples around this pixel, weighted by distance and by how close
  // their video colour is to this pixel's video colour, so depth edges snap to the real outlines
  vec3 g0 = guide(uv);
  vec2 tc = uv * dsz - 0.5, base = floor(tc);
  float sr = mix(0.6, 0.035, sharp), acc = 0.0, wsum = 0.0, lum = 0.0;
  for (int j = -2; j <= 3; j++) for (int i = -2; i <= 3; i++) {
    vec2 t = base + vec2(float(i), float(j)), q = (t + 0.5) / dsz;
    vec2 dd = t - tc; float ws = exp(-dot(dd, dd) / 2.2);
    vec3 g = guide(q), dg = g - g0; float wr = exp(-dot(dg, dg) / (2.0 * sr * sr));
    float w = ws * wr + 1e-6;
    acc += mix(texture(depPrev, q).r, texture(dep, q).r, bt) * w; wsum += w; lum += dot(g, vec3(0.299, 0.587, 0.114)) * ws;
  }
  float d = acc / wsum;
  // video detail: the fine light / dark texture of the video (high-pass) laid on the depth
  float wsp = 0.0; for (int j = -2; j <= 3; j++) for (int i = -2; i <= 3; i++) { vec2 dd = vec2(float(i), float(j)) + base - tc; wsp += exp(-dot(dd, dd) / 2.2); }
  d += detail * (dot(g0, vec3(0.299, 0.587, 0.114)) - lum / wsp) * 1.5;
  d = clamp(d, 0.0, 1.0);
  d = pow(d, 1.0 / gam);
  d = clamp((d - 0.5) * con + 0.5, 0.0, 1.0);
  if (steps > 1.5) d = floor(d * steps) / (steps - 1.0), d = clamp(d, 0.0, 1.0);
  vec3 col;
  if (mode < 0.5) col = vec3(d);                                   // grey: near = white
  else {                                                           // palette: near = dark colour (mode 1) or light colour (mode 2)
    float t = mode < 1.5 ? 1.0 - d : d;
    if (ncol > 2.5) col = t < 0.5 ? mix(c0, c1, t * 2.0) : mix(c1, c2, t * 2.0 - 1.0);
    else col = mix(c0, c2, t);
  }
  if (lh + ls > 0.0) {                                              // steady lines from the cleaned picture (see the line pass below), laid on like the AE cartoon effect
    vec2 ec = vec2(uv.x, 1.0 - uv.y); float E = texture(lin, ec).r, hb = 0.0; vec2 hs = 4.0 / lsz;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) hb += texture(lin, ec + vec2(float(i), float(j)) * hs).r;
    col *= 1.0 - lh * clamp(hb / 3.0, 0.0, 1.0) - ls * E;
  }
  o = vec4(col, 1.0);
}`;
// LINE PASS (procedural, no model). Pass 1: picture brightness averaged over time, much more where nothing moves, fully fresh where it moves.
// Pass 2: soft edge strength of that steady picture with one fixed threshold (no per frame choosing, so lines never switch on and off).
const FSL = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D vidT, Lp; uniform vec4 crop; uniform float mir, amin, reset; uniform vec2 lsz;
float lum(vec2 q) { vec2 u = vec2(mir > 0.5 ? 1.0 - q.x : q.x, q.y); return dot(texture(vidT, crop.xy + u * crop.zw).rgb, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 h = 0.5 / lsz, tc = gl_FragCoord.xy / lsz;
  float L = 0.25 * (lum(uv + vec2(-h.x, -h.y)) + lum(uv + vec2(h.x, -h.y)) + lum(uv + vec2(-h.x, h.y)) + lum(uv + h));
  float P = texture(Lp, tc).r, a = reset > 0.5 ? 1.0 : mix(amin, 1.0, smoothstep(0.03, 0.10, abs(L - P)));
  o = vec4(mix(P, L, a), 0.0, 0.0, 1.0);
}`;
const FSE = `#version 300 es
precision highp float;
out vec4 o; uniform sampler2D Lt; uniform vec2 lsz; uniform float lo, hi;
void main() {
  vec2 tc = gl_FragCoord.xy / lsz, d = 1.0 / lsz;
  float gx = (texture(Lt, tc + vec2(d.x, 0.0)).r - texture(Lt, tc - vec2(d.x, 0.0)).r) * 0.5, gy = (texture(Lt, tc + vec2(0.0, d.y)).r - texture(Lt, tc - vec2(0.0, d.y)).r) * 0.5;
  float x = clamp((length(vec2(gx, gy)) - lo) / (hi - lo), 0.0, 1.0); o = vec4(x * x * (3.0 - 2.0 * x), 0.0, 0.0, 1.0);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) msg('Shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p;
}
let pr, U = {}, tDep, tVid, tPrev, upload = false;
if (gl) {
  pr = prog(VS, FS); gl.useProgram(pr);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['dep', 'depPrev', 'bt', 'vidT', 'dsz', 'crop', 'mir', 'sharp', 'detail', 'gam', 'con', 'steps', 'mode', 'ncol', 'c0', 'c1', 'c2', 'paper', 'lin', 'lh', 'ls', 'lsz']) U[n] = gl.getUniformLocation(pr, n);
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  tDep = tex(0); tVid = tex(1); tPrev = tex(2);
  gl.uniform1i(U.dep, 0); gl.uniform1i(U.vidT, 1); gl.uniform1i(U.depPrev, 2); gl.uniform1i(U.lin, 3);
}
// line pass resources: half size (540 x 960), brightness in R16F when the browser can render to it (else 8 bit, with less time averaging)
const LW = 540, LH = 960; let prL, prE, LF = [], LT = [], EF, ET, lcur = 0, haveL = false, lhalf = false; const LU = {}, EU = {};
function initLines() {
  lhalf = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  const mk = (unit, half) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, LW, LH, 0, gl.RED, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, LW, LH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return [t, f]; };
  [LT[0], LF[0]] = mk(4, lhalf); [LT[1], LF[1]] = mk(5, lhalf); [ET, EF] = mk(3, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  prL = prog(VS, FSL); prE = prog(VS, FSE);
  for (const n of ['vidT', 'Lp', 'crop', 'mir', 'amin', 'reset', 'lsz']) LU[n] = gl.getUniformLocation(prL, n);
  for (const n of ['Lt', 'lsz', 'lo', 'hi']) EU[n] = gl.getUniformLocation(prE, n);
}
function runLines(c) {
  const cur = lcur, nxt = 1 - lcur;
  gl.bindFramebuffer(gl.FRAMEBUFFER, LF[nxt]); gl.viewport(0, 0, LW, LH);
  gl.useProgram(prL); gl.uniform1i(LU.vidT, 1); gl.uniform1i(LU.Lp, 4 + cur); gl.uniform4f(LU.crop, c.sx / c.vw, c.sy / c.vh, c.cw / c.vw, c.ch / c.vh);
  gl.uniform1f(LU.mir, c.mir ? 1 : 0); gl.uniform1f(LU.amin, lhalf ? 0.3 : 0.55); gl.uniform1f(LU.reset, haveL ? 0 : 1); gl.uniform2f(LU.lsz, LW, LH);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, EF); gl.useProgram(prE); gl.uniform1i(EU.Lt, 4 + nxt); gl.uniform2f(EU.lsz, LW, LH); gl.uniform1f(EU.lo, 0.0025); gl.uniform1f(EU.hi, 0.025);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(pr); gl.viewport(0, 0, OW, OH); lcur = nxt; haveL = true;
}
if (gl) initLines();
// ECHO (like the AE Echo effect): the finished picture is kept 30 times a second in a ring of 64 small frames; the echoes are the picture as it was 1, 2, 3 ... echo-times ago,
// each weaker than the one before (starting intensity x decay^n), laid under the live picture with Maximum, Add or Screen. Off (0 echoes) draws straight to the screen.
const EL = 64, EW2 = 360, EH2 = 640, EMAX = 12; let FCt, FC, ringT, ringF, prCap, prEcho, eHead = -1, lastCap = 0; const ets = new Float64Array(EL).fill(-1e9), CU = {}, ECU = {};
function initEcho() {
  const VSN = `#version 300 es
in vec2 p; out vec2 vt; void main() { vt = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FSCAP = `#version 300 es
precision highp float; in vec2 vt; out vec4 o; uniform sampler2D src; void main() { o = texture(src, vt); }`;
  const FSEC = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec2 vt; out vec4 o; uniform sampler2D cur; uniform sampler2DArray ring; uniform float lay[${EMAX}], wgt[${EMAX}]; uniform int n; uniform float mode;
void main() {
  vec3 col = texture(cur, vt).rgb;
  for (int i = 0; i < ${EMAX}; i++) { if (i >= n) break;
    vec3 g = texture(ring, vec3(vt, lay[i])).rgb * wgt[i];
    col = mode < 0.5 ? max(col, g) : (mode < 1.5 ? col + g : 1.0 - (1.0 - col) * (1.0 - g)); }
  o = vec4(min(col, vec3(1.0)), 1.0);
}`;
  const par = (tg) => { for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(tg, k, v); };
  FCt = gl.createTexture(); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, FCt); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, OW, OH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); par(gl.TEXTURE_2D);
  FC = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, FC); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, FCt, 0);
  ringT = gl.createTexture(); gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D_ARRAY, ringT); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, EW2, EH2, EL); par(gl.TEXTURE_2D_ARRAY);
  ringF = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  prCap = prog(VSN, FSCAP); prEcho = prog(VSN, FSEC);
  CU.src = gl.getUniformLocation(prCap, 'src');
  for (const n of ['cur', 'ring', 'lay', 'wgt', 'n', 'mode']) ECU[n] = gl.getUniformLocation(prEcho, n);
}
if (gl) initEcho();
function echoPass(en) {                                         // the picture is in FC: keep it, then compose the echoes onto the screen
  const now = performance.now(), T = Math.max(0.02, val('dect') < 0 ? 0.08 : P.dect) * 1000, w0 = val('dec0') < 0 ? 0.8 : P.dec0, dc = val('decd') < 0 ? 0.75 : P.decd;
  if (now - lastCap >= 33) {                                    // at most 30 snapshots a second
    eHead = (eHead + 1) % EL; ets[eHead] = now; lastCap = now;
    gl.bindFramebuffer(gl.FRAMEBUFFER, ringF); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, ringT, 0, eHead);
    gl.viewport(0, 0, EW2, EH2); gl.useProgram(prCap); gl.uniform1i(CU.src, 7); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const lay = new Float32Array(EMAX), wg = new Float32Array(EMAX); let n = 0;
  for (let i = 0; i < Math.min(en, EMAX); i++) {                 // echo i = the snapshot nearest to (now - (i + 1) x echo time)
    const target = now - (i + 1) * T; let best = -1, bd = 1e9;
    for (let k = 0; k < EL; k++) { const d = Math.abs(ets[k] - target); if (d < bd) { bd = d; best = k; } }
    if (best >= 0 && bd < 70) { lay[n] = best; wg[n] = w0 * Math.pow(dc, i); n++; }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, OW, OH); gl.useProgram(prEcho);
  gl.uniform1i(ECU.cur, 7); gl.uniform1i(ECU.ring, 8); gl.uniform1fv(ECU.lay, lay); gl.uniform1fv(ECU.wgt, wg); gl.uniform1i(ECU.n, n);
  gl.uniform1f(ECU.mode, { max: 0, add: 1, screen: 2 }[$('#decmode').value] ?? 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.useProgram(pr);
}
let pal = getPalette();
onPalette((p) => { pal = p; });
function render(fresh) {
  if (!gl || !M.have) return;
  if (upload) {                                              // new depth: R16F texture, linear filtered
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tDep);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.out);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tPrev);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.prevOut); upload = false;
  }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tVid);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);
  const c = crop(), rgb = (a) => a.map((x) => x / 255), cols = pal.cols;
  const lk = Math.max(0, val('dpli'));
  if (lk > 0 && (fresh || !haveL)) runLines(c); else if (lk <= 0) haveL = false;
  const bf = Math.max(0, val('dpb'));                         // fade over the expected time to the next map
  gl.uniform1f(U.bt, bf > 0 ? Math.min(1, (performance.now() - M.tUp) / Math.max(16, M.interval * bf)) : 1);
  gl.uniform2f(U.dsz, M.w, M.h);
  gl.uniform4f(U.crop, c.sx / c.vw, c.sy / c.vh, c.cw / c.vw, c.ch / c.vh);
  gl.uniform1f(U.mir, c.mir ? 1 : 0);
  gl.uniform1f(U.sharp, val('dpe') < 0 ? -1 : P.dpe);          // off (-1): very wide colour tolerance = plain soft upsampling
  gl.uniform1f(U.detail, Math.max(0, val('dpd')));
  gl.uniform1f(U.gam, val('dpg') < 0 ? 1 : P.dpg);
  gl.uniform1f(U.con, val('dpc') < 0 ? 1 : P.dpc);
  gl.uniform1f(U.steps, P.dpk >= 2 ? P.dpk : 0);
  gl.uniform1f(U.mode, { grey: 0, palnear: 1, palfar: 2 }[P.mode] ?? 0);
  gl.uniform1f(U.ncol, pal.n);
  gl.uniform3fv(U.c0, rgb(cols[0])); gl.uniform3fv(U.c1, rgb(cols[pal.n === 3 ? 1 : 0])); gl.uniform3fv(U.c2, rgb(cols[cols.length - 1]));
  gl.uniform3fv(U.paper, rgb(pal.paper));
  gl.uniform1f(U.lh, lk * 0.05); gl.uniform1f(U.ls, lk * 0.025); gl.uniform2f(U.lsz, LW, LH);
  const en = Math.max(0, Math.round(val('dech')));
  gl.bindFramebuffer(gl.FRAMEBUFFER, en > 0 ? FC : null);
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (en > 0) echoPass(en);
}
// ---------------------------------------------------------------- stats
function renderStats() {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML =
    row('models', M.sess.length > 1 && val('dpw') > 0 ? MODELS.slice(0, 2).map((m) => m.label).join(' + ') : MODELS[0].label + (M.sess.length > 1 ? '' : ' (second model not installed)')) +
    row('runs on', M.ready ? (M.ep === 'webgpu' ? 'GPU (WebGPU)' : 'processor (WASM, slow)') : M.loading ? 'loading...' : '-') +
    row('depth output', M.w ? M.w + ' x ' + M.h + ' px' : '-') +
    row('model time per frame', M.ms.toFixed(1) + ' ms') +
    row('depth maps per second', M.fps.toFixed(1));
  $('#budget').style.width = Math.min(100, M.ms / 33.3 * 100) + '%';
}
setInterval(renderStats, 250);

// ---------------------------------------------------------------- loop
let lastMedia = -1;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const fresh = vid.currentTime !== lastMedia; lastMedia = vid.currentTime;
  if (M.ready && !M.busy && (fresh || !M.have)) DM.infer();
  if (!M.have && M.ready) msg('Waiting for the first depth map...'); else if (M.have && $('#msg').textContent.startsWith('Waiting')) msg('');
  render(fresh);
}

// ---------------------------------------------------------------- UI
$('#dpmode').onchange = (e) => { P.mode = e.target.value; };
$('#restart').onclick = () => { M.sm = null; M.have = false; };
// shape sliders recompute from the last depth map at once (no need to wait for the model)
for (const id of ['dpl', 'dplr']) { const el = $('#' + id); const re = () => { if (M.have) { DM.shape(); M.prevOut.set(M.out); upload = true; } }; el.addEventListener('input', re); el.parentElement.querySelector('.onoff input').addEventListener('change', re); }
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r1');

window.__state = { M, P, val, shape: DM.shape };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
