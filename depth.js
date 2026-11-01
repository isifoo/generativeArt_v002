// DEPTH: the best looking real-time depth map we can make in a browser.
// Model: Depth Anything V2 Small (fp16 ONNX, onnxruntime-web on WebGPU, WASM fallback). It gives relative depth at low resolution;
// the look comes from what we do after it, on the GPU (WebGL2):
//   robust near / far range (percentiles, slow follow) -> time smoothing -> edge-aware upsampling guided by the video itself
//   (joint bilateral: depth follows the real outlines instead of blurry blobs) -> optional fine detail from the video -> depth curve
//   -> grey or the universal palette.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, getPalette, onPalette } from './ui.js';

const OW = 1080, OH = 1920;

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
  { id: 'dpk', label: 'Colour steps', min: 2, max: 16, step: 1, val: 8, off: 'continuous' },
  { head: 'Motion' },
  { id: 'dps', label: 'Time smoothing', min: 0, max: 0.97, step: 0.01, val: 0.8, off: 'none' },
  { id: 'dpm', label: 'Motion follow', min: 0, max: 1, step: 0.01, val: 0.7, off: 'same smoothing everywhere' },
  { id: 'dpb', label: 'Blend between maps', min: 0, max: 1, step: 0.01, val: 1, off: 'step from map to map' },
];
const P = { mode: 'grey' };
const val = buildSliders(SLIDERS, P);
// colour steps start off (continuous): the box is unticked by default
document.querySelector('#dpk').parentElement.querySelector('.onoff input').click();

// ---------------------------------------------------------------- model
// The models: the first one always; a second one (if its file is in vendor/) runs on the same frame, is aligned to the first
// (scale + offset fit) and averaged in. Two models make different mistakes, so the average flickers less.
const MODELS = [
  { file: 'depth_anything_v2_small_fp16.onnx', label: 'Depth Anything V2 Small' },
  { file: 'depth_anything_v1_small_fp16.onnx', label: 'Depth Anything V1 Small', optional: true },
];
const M = { ort: null, sess: [], ep: '', ready: false, loading: false, busy: false, ms: 0, w: 0, h: 0, fps: 0, last: 0,
  dep: null, sm: null, lo: 0, hi: 1, have: false, prevLum: null, interval: 200, tUp: 0 };
const ic = document.createElement('canvas'), ix = ic.getContext('2d', { willReadFrequently: true });
async function loadModel() {
  if (M.ready || M.loading) return;
  M.loading = true; msg('Loading the depth model (Depth Anything V2 Small, 50 MB, first time only)...');
  try {
    M.ort = await import('./vendor/ort/ort.webgpu.min.mjs');
    M.ort.env.wasm.wasmPaths = new URL('./vendor/ort/', location.href).href;
    M.ort.env.wasm.numThreads = 1; M.ort.env.wasm.proxy = false;
    for (const ep of ['webgpu', 'wasm']) {
      try { M.sess = [await M.ort.InferenceSession.create(new URL('./vendor/' + MODELS[0].file, import.meta.url).href, { executionProviders: [ep] })]; M.ep = ep; break; }
      catch (e) { if (ep === 'wasm') throw e; }
    }
    for (const m of MODELS.slice(1)) {                        // optional extra models: used only if the file is there
      try {
        const u = new URL('./vendor/' + m.file, import.meta.url).href;
        if ((await fetch(u, { method: 'HEAD' })).ok) M.sess.push(await M.ort.InferenceSession.create(u, { executionProviders: [M.ep] }));
      } catch {}
    }
    M.ready = true; msg(M.ep === 'wasm' ? 'No WebGPU here: the depth model runs on the processor (slow).' : '');
  } catch (e) { msg('Depth model failed: ' + e.message); }
  M.loading = false;
}
// the crop of the video that fills the 9:16 frame (same for the model input and the guide texture)
function crop() {
  const vw = vid.videoWidth, vh = vid.videoHeight, ar = OW / OH;
  let cw = vw, ch = vw / ar; if (ch > vh) { ch = vh; cw = vh * ar; }
  return { sx: (vw - cw) / 2, sy: (vh - ch) / 2, cw, ch, vw, vh, mir: !!(cam.stream && cam.mirror) };
}
async function infer() {
  M.busy = true;
  try {
    const k = Math.max(12, Math.round(val('dpq') < 0 ? 12 : P.dpq)), W = 14 * k, H = 14 * Math.round(W * 16 / 9 / 14);
    if (ic.width !== W || ic.height !== H) { ic.width = W; ic.height = H; }
    const c = crop();
    ix.save(); if (c.mir) { ix.translate(W, 0); ix.scale(-1, 1); }
    ix.drawImage(vid, c.sx, c.sy, c.cw, c.ch, 0, 0, W, H); ix.restore();
    const px = ix.getImageData(0, 0, W, H).data, n = W * H, f = new Float32Array(3 * n);
    const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) f[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / sd[ch];
    const t0 = performance.now();
    const run = async (sess) => {
      const out = await sess.run({ [sess.inputNames[0]]: new M.ort.Tensor('float32', f, [1, 3, H, W]) });
      const o = out[sess.outputNames[0]], dims = o.dims;
      return { d: Float32Array.from(o.data ?? await o.getData()), oh: dims[dims.length - 2], ow: dims[dims.length - 1] };
    };
    const w2 = M.sess.length > 1 ? Math.max(0, val('dpw')) : 0;
    const res = await Promise.all(M.sess.slice(0, w2 > 0 ? 2 : 1).map(run));
    const { d, oh, ow } = res[0];
    if (res[1] && res[1].d.length === d.length) {             // second model: fit a*d2 + b to d1 (least squares), then average
      const d2 = res[1].d; let sx = 0, sy = 0, sxx = 0, sxy = 0; const n2 = d.length;
      for (let i = 0; i < n2; i++) { sx += d2[i]; sy += d[i]; sxx += d2[i] * d2[i]; sxy += d2[i] * d[i]; }
      const a = (n2 * sxy - sx * sy) / Math.max(1e-9, n2 * sxx - sx * sx), b = (sy - a * sx) / n2;
      for (let i = 0; i < n2; i++) d[i] = d[i] * (1 - w2) + (a * d2[i] + b) * w2;
    }
    const now = performance.now(); M.ms += ((now - t0) - M.ms) * 0.2;
    if (M.last) { M.fps += (1000 / (now - M.last) - M.fps) * 0.2; M.interval += ((now - M.last) - M.interval) * 0.3; } M.last = now;
    // robust range: near / far percentiles (the model gives larger = nearer), followed slowly so the map does not pump
    let mn = Infinity, mx = -Infinity; for (let i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
    const hist = new Uint32Array(1024), sp = Math.max(1e-6, mx - mn);
    for (let i = 0; i < d.length; i++) hist[Math.min(1023, ((d[i] - mn) / sp * 1024) | 0)]++;
    const far = Math.max(0, val('dpf')) / 100, near = Math.max(0, val('dpn')) / 100;
    let acc = 0, l = 0, h = 1023;
    for (let b = 0; b < 1024; b++) { acc += hist[b]; if (acc <= d.length * far) l = b; if (acc <= d.length * (1 - near)) h = b + 1; }
    const lo = mn + l / 1024 * sp, hi = mn + Math.min(1024, h) / 1024 * sp, fo = val('dpr') < 0 ? 1 : P.dpr;
    const first = !M.sm || M.sm.length !== d.length;
    if (first) { M.lo = lo; M.hi = hi; } else { M.lo += (lo - M.lo) * fo; M.hi += (hi - M.hi) * fo; }
    const span = Math.max(1e-6, M.hi - M.lo), nd = d.length;
    if (first) { for (const k of ['sm', 'out', 'bl', 'tmp', 'prevOut', 'mot', 'lum']) M[k] = new Float32Array(nd); M.prevLum = null; }
    const v = M.tmp;                                          // this map, normalised 0 (far) .. 1 (near), not clipped yet
    for (let i = 0; i < nd; i++) v[i] = (d[i] - M.lo) / span;
    // motion: how much the video changed at each spot since the last map (moving spots follow fast, still spots smooth hard)
    const lum = M.lum, sameSize = ow * oh === W * H;
    if (sameSize) for (let i = 0; i < nd; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    const mf = Math.max(0, val('dpm')), mot = M.mot;
    if (M.prevLum && mf > 0 && sameSize) {
      for (let i = 0; i < nd; i++) mot[i] = Math.abs(lum[i] - M.prevLum[i]);
      blur3(mot, M.bl, ow, oh);                               // spread a little so whole moving shapes follow
    } else mot.fill(0);
    M.prevLum = sameSize ? Float32Array.from(lum) : null;
    if (first) { M.sm.set(v); }
    else {
      // time smoothing, motion aware: still spots keep most of the old map, moving spots follow the new one
      const s = Math.max(0, val('dps'));
      for (let i = 0; i < nd; i++) {
        const keep = s * (1 - Math.min(1, mot[i] * 25 * mf));
        M.sm[i] = M.sm[i] * keep + v[i] * (1 - keep);
      }
    }
    M.w = ow; M.h = oh; M.dep = d;
    if (M.have) M.prevOut.set(M.out);
    shape(); if (!M.have) M.prevOut.set(M.out); M.have = true; upload = true; M.tUp = performance.now();
  } catch (e) { msg('Depth run failed: ' + e.message); M.ready = false; }
  M.busy = false;
}

// 3x3 box blur (in place via scratch)
function blur3(a, tmp, w, h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; acc += a[yy * w + xx]; c++; } }
    tmp[y * w + x] = acc / c;
  }
  a.set(tmp);
}

// shape detail: each spot compared with its surroundings (depth minus blurred depth), so round and angled forms read
// even when they are a small part of the whole depth range (a sphere next to a long floor).
// The blur is edge-aware (neighbours at a clearly different depth are left out, separable bilateral), so there are no halos.
function shape() {
  const { sm, out, bl, tmp, w, h } = M, k = Math.max(0, val('dpl'));
  if (k <= 0) { out.set(sm); return; }
  const r = Math.max(1, Math.round((val('dplr') < 0 ? 48 : P.dplr) / 1920 * h));   // shape size px (output frame) -> depth px
  // weights: spatial gaussian per tap; depth-difference gaussian from a lookup table (no Math.exp in the loop); every 2nd tap for big radii
  const st = r > 6 ? 2 : 1, sw = new Float32Array(2 * r + 1), LUT = 256, cut = 0.16, lut = new Float32Array(LUT + 1), sc = LUT / (cut * cut);
  for (let t = -r; t <= r; t++) sw[t + r] = Math.exp(-(t * t) / (2 * (r / 2) * (r / 2)));
  for (let q = 0; q <= LUT; q++) lut[q] = Math.exp(-(q / sc) / (2 * 0.04 * 0.04));
  const pass = (src, dst, dx, dy, n, len) => {
    const stride = dx ? 1 : w;
    for (let a = 0; a < n; a++) {
      const o = dx ? a * w : a;
      for (let b = 0; b < len; b++) {
        const i = o + b * stride, c = src[i];
        let acc = c, ws = 1;                                  // the centre always counts (no empty average next to a sharp edge)
        for (let t = -r; t <= r; t += st) {
          if (t === 0) continue;
          const q = b + t, j = o + (q < 0 ? 0 : q >= len ? len - 1 : q) * stride, v = src[j], dd = (v - c) * (v - c) * sc;
          if (dd >= LUT) continue;
          const wt = sw[t + r] * lut[dd | 0]; acc += v * wt; ws += wt;
        }
        dst[i] = acc / ws;
      }
    }
  };
  pass(sm, tmp, 1, 0, h, w); pass(tmp, bl, 0, 1, w, h);
  for (let i = 0; i < sm.length; i++) out[i] = sm[i] + k * (sm[i] - bl[i]);
}

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
  gl.uniform1f(U.steps, val('dpk') < 0 ? 0 : P.dpk);
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
    row('model input', ic.width ? ic.width + ' x ' + ic.height + ' px' : '-') +
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
  if (M.ready && !M.busy && (fresh || !M.have)) infer();
  if (!M.have && M.ready) msg('Waiting for the first depth map...'); else if (M.have && $('#msg').textContent.startsWith('Waiting')) msg('');
  render();
}

// ---------------------------------------------------------------- UI
$('#dpmode').onchange = (e) => { P.mode = e.target.value; };
$('#restart').onclick = () => { M.sm = null; M.have = false; };
// shape sliders recompute from the last depth map at once (no need to wait for the model)
for (const id of ['dpl', 'dplr']) { const el = $('#' + id); const re = () => { if (M.have) { shape(); M.prevOut.set(M.out); upload = true; } }; el.addEventListener('input', re); el.parentElement.querySelector('.onoff input').addEventListener('change', re); }
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r1');

window.__state = { M, P, val, shape };
loadModel();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
