// LINES V2: horizontal lines, every one carrying the same sine wave (so they never touch: one even spacing everywhere).
//  y offset = Amplitude x sin(2 pi x Frequency x / width + motion). Black lines on white, one pixel shader, exact distance to
//  the nearest line (phase field: phi = (y + A sin(k x)) / spacing, distance = |fract(phi + .5) - .5| / |grad phi|).
import { $, buildSliders, initDefaults, versionCheck } from './ui.js';

const OW = 1080, OH = 1920;
const SLIDERS = [
  { head: 'Wave' },
  { id: 'v2f', label: 'Frequency (waves across)', min: 0, max: 20, step: 0.05, val: 3, off: 'straight lines' },
  { id: 'v2a', label: 'Amplitude px', min: 0, max: 300, step: 0.5, val: 30, off: 'straight lines' },
  { head: 'Lines' },
  { id: 'v2s', label: 'Spacing px', min: 3, max: 80, step: 0.5, val: 15, off: '15' },
  { id: 'v2w', label: 'Width px', min: 0.3, max: 30, step: 0.1, val: 2, off: 'hairlines' },
  { id: 'v2m', label: 'Motion speed', min: 0, max: 2, step: 0.01, val: 0, off: 'still' },
];
const P = {};
buildSliders(SLIDERS, P);
const num = (id, def) => (P.on[id] === false ? def : P[id]);

// ---------------------------------------------------------------- canvas: drawn at the size it is shown (at most 1080 wide)
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
let dirty = true;
function fit() {
  const w = Math.round(Math.min(OW, Math.max(360, (canvas.offsetWidth || OW) * (devicePixelRatio || 1)))), h = Math.round(w * OH / OW);
  if (w !== canvas.width) { canvas.width = w; canvas.height = h; dirty = true; }
}
new ResizeObserver(fit).observe(canvas); fit();
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });

const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform vec2 res;        // the picture in its own units (1080 x 1920)
uniform float pxs;       // picture units per screen pixel
uniform float sp, hw, A, k, ph;
void main() {
  vec2 px = uv * res;
  float phi = (px.y + A * sin(k * px.x + ph)) / sp;                 // every line the same wave, one spacing apart
  float g = length(vec2(A * k * cos(k * px.x + ph), 1.0)) / sp;     // its exact slope
  float d = abs(fract(phi + 0.5) - 0.5) / g;                        // distance to the nearest line, picture px
  float ink = 1.0 - smoothstep(hw - 0.6 * pxs, hw + 0.6 * pxs, d);
  ink = mix(ink, clamp(2.0 * hw * g, 0.0, 1.0), smoothstep(0.3, 0.6, g * pxs));   // finer than the pixels: their average grey
  o = vec4(vec3(1.0 - ink), 1.0);                                    // black on white
}`;
function prog() {
  const p = gl.createProgram();
  for (const [ty, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(s); $('#msg').textContent = 'Shader: ' + m; console.error(m); }
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); return p;
}
const pr = prog(); gl.useProgram(pr);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ['res', 'pxs', 'sp', 'hw', 'A', 'k', 'ph']) U[n] = gl.getUniformLocation(pr, n);

// ---------------------------------------------------------------- loop: draws only when something changed (or while moving)
for (const ev of ['input', 'change']) $('#settings').addEventListener(ev, () => { dirty = true; }, true);
let phase = 0, last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const speed = num('v2m', 0); phase += Math.min(0.1, (now - last) / 1000) * speed * 2 * Math.PI; last = now;
  if (!dirty && speed <= 0) return;
  dirty = false;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(U.res, OW, OH); gl.uniform1f(U.pxs, OW / canvas.width);
  gl.uniform1f(U.sp, num('v2s', 15)); gl.uniform1f(U.hw, 0.5 * num('v2w', 0.3));
  gl.uniform1f(U.A, num('v2a', 0)); gl.uniform1f(U.k, 2 * Math.PI * num('v2f', 0) / OW); gl.uniform1f(U.ph, phase);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
$('#restart').onclick = () => { phase = 0; dirty = true; };
initDefaults('.r1');
window.__state = { P, canvas };
requestAnimationFrame(loop);
versionCheck();
