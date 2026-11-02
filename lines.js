// FRACTAL LINES: one layer of evenly spaced, parallel lines whose own shape is a gentle wave (not a labyrinth).
// Line k sits where phi = k:  phi = (p . n + height * sin(2 pi * (p . t) / length + variation * fbm(p / length))) / spacing.
// Every line has the same wave, so the distance between lines stays uniform; 'variation' lets the wave differ a little from
// place to place (fractal noise on its phase), 'drift' moves it slowly. The width carries the tone (thick in the darks).
import { createDepthModel } from './depthmodel.js';
import { $, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover, getPalette, onPalette } from './ui.js';

const OW = 1080, OH = 1920;
const SLIDERS = [
  { head: 'Lines' },
  { id: 'flsp', label: 'Spacing px', min: 3, max: 60, step: 0.5, val: 15, off: '9' },
  { id: 'flw', label: 'Width px (darkest)', min: 0.3, max: 30, step: 0.1, val: 2.3, off: 'hairlines' },
  { id: 'flt', label: 'Thinnest (lights)', min: 0, max: 1, step: 0.01, val: 0, off: 'one width everywhere' },
  { id: 'fla', label: 'Angle deg', min: -90, max: 90, step: 1, val: -6, off: '0' },
  { head: 'Wave (the shape of the lines)' },
  { id: 'flam', label: 'Wave height px', min: 0, max: 200, step: 0.5, val: 86.5, off: 'straight lines' },
  { id: 'flsc', label: 'Wave length px', min: 20, max: 3000, step: 5, val: 1090, off: '1000' },
  { id: 'flcx', label: 'Variation', min: 0, max: 6, step: 0.05, val: 0.8, off: 'identical waves' },
  { id: 'flev', label: 'Drift speed', min: 0, max: 1, step: 0.005, val: 0.06, off: 'still' },
  { id: 'flfl', label: 'Flip with contrast', min: 0, max: 1, step: 0.01, val: 1, off: 'same wave everywhere' },
  { id: 'flfs', label: 'Flip softness px', min: 4, max: 300, step: 2, val: 90, off: '120' },
  { head: 'Mask: Extract (as in AE, luminance of Dollar 1 = alpha of the lines)' },
  { id: 'flmk', label: 'Mask strength', min: 0, max: 1, step: 0.01, val: 1, off: 'no mask: lines everywhere' },
  { id: 'flbp', label: 'Black Point', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: 'flwp', label: 'White Point', min: 0, max: 255, step: 1, val: 235, off: '255' },
  { id: 'flbs', label: 'Black Softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: 'flws', label: 'White Softness', min: 0, max: 255, step: 1, val: 20, off: '0' },
  { id: 'flmi', label: 'Invert', min: 0, max: 1, step: 1, val: 0, off: 'not inverted' },
  { id: 'flms', label: 'Mask blur px', min: 0, max: 64, step: 1, val: 10, off: 'crisp' },
  { head: 'Tone' },
  { id: 'flc', label: 'Contrast', min: 0.2, max: 5, step: 0.01, val: 1.3, off: '1' },
  { id: 'flb', label: 'Brightness', min: -0.6, max: 0.6, step: 0.01, val: 0, off: '0' },
  { id: 'fls', label: 'Smoothing', min: 0, max: 0.95, step: 0.01, val: 0.6, off: 'none' },
];
const P = { pal: false };
const val = buildSliders(SLIDERS, P);
const num = (id, def) => (P.on[id] === false ? def : P[id]);

// ---------------------------------------------------------------- tone (CPU, small and soft: the lines carry the detail)
const TW = 180, TH = 320, TN = TW * TH;
const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
const tx = tc.getContext('2d', { willReadFrequently: true });
const tone = new Float32Array(TN).fill(1);
// the flip map: a soft copy of the tone, so the wave turns over gently between dark and light instead of breaking at every edge
const soft = new Float32Array(TN), stmp = new Float32Array(TN);
function softTone(r) {
  soft.set(tone);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < TH; y++) { let a = 0; const o = y * TW;
      for (let x = -r; x <= r; x++) a += soft[o + Math.min(TW - 1, Math.max(0, x))];
      for (let x = 0; x < TW; x++) { stmp[o + x] = a / (2 * r + 1); a += soft[o + Math.min(TW - 1, x + r + 1)] - soft[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < TW; x++) { let a = 0;
      for (let y = -r; y <= r; y++) a += stmp[Math.min(TH - 1, Math.max(0, y)) * TW + x];
      for (let y = 0; y < TH; y++) { soft[y * TW + x] = a / (2 * r + 1); a += stmp[Math.min(TH - 1, y + r + 1) * TW + x] - stmp[Math.max(0, y - r) * TW + x]; } }
  }
}
let toneReady = false, dirty = true, upload = false;
function updateTone() {
  drawCover(tx, TW, TH);
  const d = tx.getImageData(0, 0, TW, TH).data, k = toneReady && !dirty ? 1 - num('fls', 0) : 1;
  for (let i = 0; i < TN; i++) tone[i] += ((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255 - tone[i]) * k;
  softTone(Math.max(1, Math.round(num('flfs', 120) / (OW / TW) / 2)));
  toneReady = true; dirty = false; upload = true;
}

// ---------------------------------------------------------------- shader
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D toneT, softT;
uniform sampler2D maskT;                                 // Dollar 1's picture: its ink is the alpha of the lines
uniform float mStr, mLod, bp, wp, bs, ws, minv;          // Extract: points and softness in 0..255
uniform float flip;                                     // how much the wave turns over between dark (1) and light (0)
uniform vec2 res;
uniform float sp, wid, thin, ang, amp, scl, oct, evo, con, bri;   // amp = wave height px, scl = wave length px, oct = variation
uniform vec3 ink, paper;
// smooth value noise + fractal sum (octaves = complexity), drifting with evolution
float h21(vec2 q) { q = fract(q * vec2(127.1, 311.7)); q += dot(q, q + 34.53); return fract(q.x * q.y); }
float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 q) { float s = 0.0, a = 0.5, n = 0.0;
  for (int k = 0; k < 3; k++) { s += a * vnoise(q + float(k) * 17.31 + evo * 0.3); n += a; q *= 2.03; a *= 0.5; }
  return s / n - 0.5; }
void main() {
  vec2 px = uv * res;
  vec2 t = vec2(cos(ang), -sin(ang)), nrm = vec2(-t.y, t.x);
  float w = amp * sin(6.2831853 * dot(px, t) / scl + evo + oct * 6.2831853 * fbm(px / scl));   // the wave, in px
  float sd = clamp((0.5 - texture(softT, uv).r) * 2.0 * con, -1.0, 1.0);   // soft contrast: +1 dark .. -1 light
  w *= mix(1.0, sd, flip);                                            // the wave bends one way in the darks, the other way in the lights
  float phi = (dot(px, nrm) + w) / sp;
  float g = length(vec2(dFdx(phi), dFdy(phi))) + 1e-5;
  float d = abs(fract(phi + 0.5) - 0.5) / g;                         // px to the nearest line centre
  float tn = texture(toneT, uv).r;
  float dk = clamp((0.5 - tn) * con + 0.5 - bri, 0.0, 1.0);          // darkness with contrast and brightness
  float hw = 0.5 * wid * mix(thin, 1.0, dk);                        // width follows the darkness
  float inkv = hw < 0.05 ? 0.0 : 1.0 - smoothstep(hw - 0.6, hw + 0.6, d);
  if (mStr > 0.0) {                                                  // alpha from Dollar 1: lines show only where it has ink
    vec3 mc = textureLod(maskT, vec2(uv.x, 1.0 - uv.y), mLod).rgb;
    // AE Extract (luminance): transparent below Black Point and above White Point, feathered by the softness values
    float L = dot(mc, vec3(0.299, 0.587, 0.114)) * 255.0;
    float lo = bs > 0.0 ? smoothstep(bp - bs, bp, L) : step(bp, L);
    float hi = ws > 0.0 ? 1.0 - smoothstep(wp, wp + ws, L) : step(L, wp);
    float a = lo * hi; if (minv > 0.5) a = 1.0 - a;
    inkv *= mix(1.0, a, mStr);
  }
  o = vec4(mix(paper, ink, inkv), 1.0);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [ty, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(s); $('#msg').textContent = 'Shader: ' + m; console.error(m); }
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); return p;
}
const pr = prog(VS, FS); gl.useProgram(pr);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ['toneT', 'softT', 'maskT', 'mStr', 'mLod', 'bp', 'wp', 'bs', 'ws', 'minv', 'flip', 'res', 'sp', 'wid', 'thin', 'ang', 'amp', 'scl', 'oct', 'evo', 'con', 'bri', 'ink', 'paper']) U[n] = gl.getUniformLocation(pr, n);
const tt = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tt);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.toneT, 0);
const ts = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ts);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.softT, 1);
const tm = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tm);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.maskT, 2);
let pal = getPalette(); onPalette((p) => { pal = p; });
let evoT = 0, lastT = performance.now();
function render() {
  const now = performance.now(); evoT += (now - lastT) / 1000 * num('flev', 0); lastT = now;
  if (upload) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tt); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, tone);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ts); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, soft); upload = false;
  }
  gl.uniform1f(U.flip, num('flfl', 0));
  const mOn = P.on.flmk !== false && P.flmk > 0 && DM.M.have;
  gl.uniform1f(U.mStr, mOn ? P.flmk : 0);
  gl.uniform1f(U.bp, num('flbp', 0)); gl.uniform1f(U.wp, num('flwp', 255)); gl.uniform1f(U.bs, num('flbs', 0)); gl.uniform1f(U.ws, num('flws', 0)); gl.uniform1f(U.minv, num('flmi', 0));
  gl.uniform1f(U.mLod, P.on.flms !== false && P.flms > 0 ? Math.log2(P.flms) : 0);
  if (mOn) {                                                         // Dollar 1's frame -> mask texture (mipmaps = softness)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tm);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas); gl.generateMipmap(gl.TEXTURE_2D);
  }
  const usePal = $('#e2pal').checked;
  gl.uniform2f(U.res, OW, OH); gl.uniform1f(U.sp, num('flsp', 10)); gl.uniform1f(U.wid, num('flw', 0.6)); gl.uniform1f(U.thin, num('flt', 1)); gl.uniform1f(U.ang, num('fla', 0) * Math.PI / 180);
  gl.uniform1f(U.amp, num('flam', 0)); gl.uniform1f(U.scl, num('flsc', 520)); gl.uniform1f(U.oct, num('flcx', 0)); gl.uniform1f(U.evo, evoT * 6.2831853);
  gl.uniform1f(U.con, num('flc', 1)); gl.uniform1f(U.bri, num('flb', 0));
  gl.uniform3fv(U.ink, usePal ? pal.cols[0].map((x) => x / 255) : [0.07, 0.07, 0.07]); gl.uniform3fv(U.paper, usePal ? pal.paper.map((x) => x / 255) : [1, 1, 1]);
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------------------------------------------------------- loop
let lastMedia = -1, lastDepth = -1;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState >= 2 && vid.videoWidth && (vid.currentTime !== lastMedia || dirty)) { lastMedia = vid.currentTime; updateTone(); }
  if (vid.readyState >= 2 && DM.M.ready && !DM.M.busy && (!DM.M.have || vid.currentTime !== lastDepth)) { lastDepth = vid.currentTime; DM.infer(); }
  if (toneReady) render();
}
$('#settings').addEventListener('input', () => { dirty = true; }, true);
$('#restart').onclick = () => { evoT = 0; };
cam.onStart = () => { lastMedia = -1; };
setInterval(() => { $('#stats').innerHTML = '<tr><td>one pixel shader</td><td>' + OW + ' x ' + OH + '</td></tr>'; }, 1000);
// the mask: Dollar 1 (Dollar's engraving shader) runs hidden into its own canvas, sharing our video and one depth model
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : id === 'dpq' ? 37 : id === 'dps' ? 0.97 : def), () => {});   // Dollar 1's depth settings
const maskCanvas = document.createElement('canvas');
window.__dollarOverlay = { canvas: maskCanvas, dm: DM, on: () => P.on.flmk !== false && P.flmk > 0,
  defaults: { enlo: 0, enl: 0, enc: 3.02, enb: 0.41 } };   // the mask is Dollar 1: same look (v2.04)
await import('./engrave.js?b=' + (document.querySelector('meta[name=build]')?.content || 0));
DM.load();
initDefaults('.r7');                                       // r6: Dollar 1 mask with Dollar 1's look (v2.04)
window.__state = { P, val, tone };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
