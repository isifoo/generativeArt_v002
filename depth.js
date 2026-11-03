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
  { id: 'dpk', label: 'Colour steps (0 = continuous)', min: 0, max: 16, step: 1, val: 0, off: 'continuous' },
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
uniform sampler2D dep, depPrev, vidT;
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
  o = vec4(col, 1.0);
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
let pr, U = {}, tDep, tVid, tPrev, upload = false;
if (gl) {
  pr = prog(VS, FS); gl.useProgram(pr);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['dep', 'depPrev', 'bt', 'vidT', 'dsz', 'crop', 'mir', 'sharp', 'detail', 'gam', 'con', 'steps', 'mode', 'ncol', 'c0', 'c1', 'c2', 'paper']) U[n] = gl.getUniformLocation(pr, n);
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  tDep = tex(0); tVid = tex(1); tPrev = tex(2);
  gl.uniform1i(U.dep, 0); gl.uniform1i(U.vidT, 1); gl.uniform1i(U.depPrev, 2);
}
let pal = getPalette();
onPalette((p) => { pal = p; });
function render() {
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
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
  render();
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
