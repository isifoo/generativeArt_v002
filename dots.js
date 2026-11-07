// DEPTH DOTS: the depth map as small glowing dots in a night sky, like a drone show. One dot per "drone" on an even lattice; the depth map decides
// which drones are lit (near = the subject), how bright and what colour (palette ramp, far to near); they hover a little, twinkle, and sway with depth.
// A few faint stars fill the rest of the sky. The glow is the light of the dots blurred in three levels. Colours come from the universal palette
// (paper = the sky, the colour ramp = the drones).
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, getPalette, onPalette } from './ui.js';
import { loadPreset } from './palette.js';
import { createDepthModel, OW, OH } from './depthmodel.js';

const SLIDERS = [
  { head: 'Drones' },
  { id: 'ddcol', label: 'Dots across', min: 20, max: 200, step: 1, val: 72, off: '72' },
  { id: 'ddsz', label: 'Dot size', min: 0.3, max: 1.6, step: 0.01, val: 1, off: '1' },
  { id: 'dbri', label: 'Dot brightness', min: 0.3, max: 2, step: 0.01, val: 1.1, off: '1.1' },
  { id: 'djit', label: 'Lattice jitter', min: 0, max: 1, step: 0.01, val: 0.2, off: 'a perfect lattice' },
  { head: 'Depth' },
  { id: 'dthr', label: 'Depth threshold (higher = fewer drones)', min: 0, max: 1, step: 0.01, val: 0.42, off: '0.42' },
  { id: 'dsft', label: 'Edge softness', min: 0.01, max: 0.5, step: 0.01, val: 0.14, off: '0.14' },
  { id: 'dcon', label: 'Depth contrast', min: 0.5, max: 4, step: 0.01, val: 1.7, off: '1.7' },
  { id: 'dinv', label: 'Invert (1 = far drones lit)', min: 0, max: 1, step: 1, val: 0, off: '0' },
  { head: 'Motion' },
  { id: 'dhov', label: 'Hover', min: 0, max: 1, step: 0.01, val: 0.5, off: 'still' },
  { id: 'dpar', label: 'Depth sway', min: 0, max: 1, step: 0.01, val: 0.4, off: 'still' },
  { id: 'dtw', label: 'Twinkle', min: 0, max: 1, step: 0.01, val: 0.25, off: 'steady' },
  { head: 'Sky' },
  { id: 'dsky', label: 'Faint drones elsewhere %', min: 0, max: 30, step: 0.5, val: 4, off: 'none' },
  { id: 'dgl', label: 'Glow', min: 0, max: 3, step: 0.01, val: 1.8, off: 'none' },
  { id: 'dgs', label: 'Glow spread (tight to wide)', min: 0, max: 1, step: 0.01, val: 0.5, off: 'tight only' },
];
const P = {};
buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);

loadPreset('drones');   // this style opens with the drone-show palette (a saved default replaces it)

let upload = false;
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : def), () => { upload = true; });
const M = DM.M;
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D dep, depPrev, g1, g2, g3;
uniform vec2 res; uniform float cell, bt, mode, time;
uniform float thr, soft, dcon, inv, size, bri, jit, hov, par, tw, sky, glow, spread;
uniform vec3 c0, c1, c2, paper;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float depthAt(vec2 q) { float d = mix(texture(depPrev, q).r, texture(dep, q).r, bt); d = inv > 0.5 ? 1.0 - d : d; return clamp((d - 0.5) * dcon + 0.5, 0.0, 1.0); }
vec3 ramp(float d) { return d < 0.5 ? mix(c0, c1, d * 2.0) : mix(c1, c2, d * 2.0 - 1.0); }
vec3 drones(vec2 px) {                                    // the light of the drone of this cell (hover and sway stay inside the cell)
  vec2 cid = floor(px / cell), base = (cid + 0.5) * cell;
  float a = h21(cid), b = h21(cid + 7.1), c = h21(cid + 13.7);
  float d = depthAt(base / res);
  float on = smoothstep(thr - soft, thr + soft, d);
  float faint = step(c, sky * 0.01);
  if (faint > 0.5 && on < 0.3) { on = 0.22 + 0.2 * h21(cid + 3.3); d = 0.25 + 0.4 * a; }       // a few faint ones in the empty sky
  if (on <= 0.001) return vec3(0.0);
  float r = size * cell * (0.10 + 0.08 * d);
  vec2 off = (vec2(a, b) - 0.5) * jit * cell * 0.30
           + vec2(sin(time * 0.7 + a * 6.283), cos(time * 0.6 + b * 6.283)) * hov * cell * 0.10
           + vec2(sin(time * 0.31 + d * 3.0), cos(time * 0.23 + d * 2.0)) * par * (d - 0.3) * cell * 0.22;
  vec2 cen = base + clamp(off, vec2(-0.5 * cell + r + 1.0), vec2(0.5 * cell - r - 1.0));
  float dist = length(px - cen);
  float dot = 1.0 - smoothstep(r * 0.55, r, dist);
  float tws = 1.0 - tw * (0.5 + 0.5 * sin(time * (2.0 + c * 6.0) + b * 40.0));
  return mix(ramp(d), vec3(1.0), 0.12 * d) * dot * on * tws * bri * (0.65 + 0.7 * d);
}
void main() {
  vec2 px = uv * res;
  vec3 e = drones(px);
  if (mode < 0.5) { o = vec4(e, 1.0); return; }
  vec2 gq = vec2(uv.x, 1.0 - uv.y);
  float w1 = 1.0 - 0.6 * spread, w2 = 0.35 + 0.65 * spread, w3 = 0.15 + 0.85 * spread;
  vec3 gl = (texture(g1, gq).rgb * w1 + texture(g2, gq).rgb * w2 + texture(g3, gq).rgb * w3) * glow;
  vec3 col = paper * 0.9 + e + gl;
  o = vec4(pow(clamp(col, 0.0, 4.0), vec3(0.95)), 1.0);
}`;
const VS2 = `#version 300 es
in vec2 p; out vec2 vt; void main() { vt = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FSB = `#version 300 es
precision highp float;
in vec2 vt; out vec4 o; uniform sampler2D src; uniform vec2 dir;
void main() {
  if (dir.x == 0.0 && dir.y == 0.0) { o = texture(src, vt); return; }
  vec4 s = texture(src, vt) * 0.227027;
  s += (texture(src, vt + dir * 1.0) + texture(src, vt - dir * 1.0)) * 0.1945946; s += (texture(src, vt + dir * 2.0) + texture(src, vt - dir * 2.0)) * 0.1216216;
  s += (texture(src, vt + dir * 3.0) + texture(src, vt - dir * 3.0)) * 0.054054;  s += (texture(src, vt + dir * 4.0) + texture(src, vt - dir * 4.0)) * 0.016216;
  o = s;
}`;
function prog(vs, fs) {
  const pg = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) msg('Shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(pg, s);
  }
  gl.linkProgram(pg); return pg;
}
const pr = prog(VS, FS), pb = prog(VS2, FSB);
{
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  for (const q of [pr, pb]) { gl.useProgram(q); const loc = gl.getAttribLocation(q, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
}
gl.useProgram(pr);
const U = {}; for (const n of ['dep', 'depPrev', 'g1', 'g2', 'g3', 'res', 'cell', 'bt', 'mode', 'time', 'thr', 'soft', 'dcon', 'inv', 'size', 'bri', 'jit', 'hov', 'par', 'tw', 'sky', 'glow', 'spread', 'c0', 'c1', 'c2', 'paper']) U[n] = gl.getUniformLocation(pr, n);
const UB = { src: gl.getUniformLocation(pb, 'src'), dir: gl.getUniformLocation(pb, 'dir') };
gl.getExtension('EXT_color_buffer_float');
const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tDep = mkTex(0), tPrev = mkTex(1);
gl.uniform1i(U.dep, 0); gl.uniform1i(U.depPrev, 1); gl.uniform1i(U.g1, 5); gl.uniform1i(U.g2, 6); gl.uniform1i(U.g3, 7);
const mkRT = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; };
const E = mkRT(540, 960), L = [[270, 480], [135, 240], [68, 120]].map(([w, h]) => ({ a: mkRT(w, h), b: mkRT(w, h) }));
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
function blurLevel(src, lv) {
  gl.useProgram(pb); gl.uniform1i(UB.src, 8); gl.activeTexture(gl.TEXTURE8);
  const { a, b } = lv;
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.f); gl.viewport(0, 0, a.w, a.h); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform2f(UB.dir, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.bindTexture(gl.TEXTURE_2D, a.t); gl.uniform2f(UB.dir, 1.2 / a.w, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.f); gl.bindTexture(gl.TEXTURE_2D, b.t); gl.uniform2f(UB.dir, 0, 1.2 / a.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
let pal = getPalette(); onPalette((p) => { pal = p; });
const rgb = (a) => a.map((x) => x / 255);
function setUniforms(mode) {
  const cols = pal.cols, c0 = rgb(cols[0]), c2 = rgb(cols[cols.length - 1]), c1 = cols.length === 3 ? rgb(cols[1]) : c0.map((x, i) => (x + c2[i]) / 2);
  gl.uniform2f(U.res, OW, OH); gl.uniform1f(U.cell, OW / Math.round(num('ddcol', 72))); gl.uniform1f(U.mode, mode); gl.uniform1f(U.time, performance.now() / 1000);
  gl.uniform1f(U.thr, num('dthr', 0.42)); gl.uniform1f(U.soft, num('dsft', 0.14)); gl.uniform1f(U.dcon, num('dcon', 1.7)); gl.uniform1f(U.inv, num('dinv', 0));
  gl.uniform1f(U.size, num('ddsz', 1)); gl.uniform1f(U.bri, num('dbri', 1.1)); gl.uniform1f(U.jit, num('djit', 0.2)); gl.uniform1f(U.hov, num('dhov', 0.5));
  gl.uniform1f(U.par, num('dpar', 0.4)); gl.uniform1f(U.tw, num('dtw', 0.25)); gl.uniform1f(U.sky, num('dsky', 4));
  gl.uniform1f(U.glow, num('dgl', 1.8)); gl.uniform1f(U.spread, num('dgs', 0.5));
  gl.uniform3fv(U.c0, c0); gl.uniform3fv(U.c1, c1); gl.uniform3fv(U.c2, c2); gl.uniform3fv(U.paper, rgb(pal.paper));
}
function render() {
  if (!M.have) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, OW, OH); const p = rgb(pal.paper); gl.clearColor(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
  if (upload) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.out);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tPrev); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.prevOut); upload = false;
  }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tPrev);
  gl.useProgram(pr); gl.uniform1f(U.bt, Math.min(1, (performance.now() - M.tUp) / Math.max(16, M.interval)));
  setUniforms(0); gl.bindFramebuffer(gl.FRAMEBUFFER, E.f); gl.viewport(0, 0, E.w, E.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);     // the light of the dots alone
  blurLevel(E.t, L[0]); blurLevel(L[0].a.t, L[1]); blurLevel(L[1].a.t, L[2]);
  gl.useProgram(pr); gl.uniform1f(U.bt, Math.min(1, (performance.now() - M.tUp) / Math.max(16, M.interval)));
  setUniforms(1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tPrev);
  for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE5 + i); gl.bindTexture(gl.TEXTURE_2D, L[i].a.t); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
let lastMedia = -1, frames = 0, ms = 0, t0 = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const fresh = vid.currentTime !== lastMedia; lastMedia = vid.currentTime;
  if (M.ready && !M.busy && (fresh || !M.have)) DM.infer();
  if (!M.have && M.ready) msg('Waiting for the first depth map...'); else if (M.have && $('#msg').textContent.startsWith('Waiting')) msg('');
  const a = performance.now(); render(); ms += performance.now() - a; frames++;
  if (performance.now() - t0 > 1000) { fps = frames * 1000 / (performance.now() - t0); frames = 0; t0 = performance.now(); }
}
setInterval(() => {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`, cols = Math.round(num('ddcol', 72)), rows = Math.ceil(OH / (OW / cols));
  $('#stats').innerHTML = row('drones', `${cols} x ${rows} = ${cols * rows}`) + row('runs on', M.ready ? (M.ep === 'webgpu' ? 'GPU (WebGPU)' : 'processor (WASM, slow)') : M.loading ? 'loading...' : '-') +
    row('model time per frame', M.ms.toFixed(1) + ' ms') + row('depth maps per second', M.fps.toFixed(1)) + row('frames per second', fps.toFixed(0));
  $('#budget').style.width = Math.min(100, M.ms / 33.3 * 100) + '%';
}, 500);
cam.onStart = () => { lastMedia = -1; };
initDefaults('.d4');
window.__state = { P, M, DM };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
