// CAMERA: just the camera, in real time, no effect. A clean base for recording (the Record button) and a light tone and colour grade.
// Brightness, contrast, saturation and zoom; "Palette tint" maps the picture from the palette's dark colour to its light colour (a duotone) when you want the colour system on it.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, getPalette, onPalette } from './ui.js';

const SLIDERS = [
  { head: 'Grade' },
  { id: 'cbr', label: 'Brightness', min: -0.5, max: 0.5, step: 0.005, val: 0, off: '0' },
  { id: 'cct', label: 'Contrast', min: 0.4, max: 2.5, step: 0.01, val: 1, off: '1' },
  { id: 'csa', label: 'Saturation', min: 0, max: 2, step: 0.01, val: 1, off: '1' },
  { id: 'cgm', label: 'Gamma', min: 0.4, max: 2.5, step: 0.01, val: 1, off: '1' },
  { head: 'Frame' },
  { id: 'czm', label: 'Zoom', min: 1, max: 4, step: 0.01, val: 1, off: '1' },
  { id: 'cpx', label: 'Shift left / right', min: -0.5, max: 0.5, step: 0.005, val: 0, off: 'centred' },
  { id: 'cpy', label: 'Shift up / down', min: -0.5, max: 0.5, step: 0.005, val: 0, off: 'centred' },
  { head: 'Colour' },
  { id: 'ctn', label: 'Palette tint (duotone)', min: 0, max: 1, step: 0.01, val: 0, off: 'natural colours' },
];
const P = {};
buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);

const OW = 1080, OH = 1920, canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D vidT; uniform vec4 crop;                // video uv: offset xy, scale zw (cover crop with the zoom and shift)
uniform float mir, br, ct, sa, gm, tint; uniform vec3 dark, light;
void main() {
  vec2 q = vec2(mir > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
  vec3 c = texture(vidT, crop.xy + q * crop.zw).rgb;
  c = pow(max(c, 0.0), vec3(1.0 / gm));
  c = (c - 0.5) * ct + 0.5 + br;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sa);
  c = mix(c, mix(dark, light, clamp(l, 0.0, 1.0)), tint);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
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
const pr = prog(VS, FS); gl.useProgram(pr);
{
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}
const U = {}; for (const n of ['vidT', 'crop', 'mir', 'br', 'ct', 'sa', 'gm', 'tint', 'dark', 'light']) U[n] = gl.getUniformLocation(pr, n);
const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(U.vidT, 0);
let pal = getPalette(); onPalette((p) => { pal = p; });
const rgb = (a) => a.map((x) => x / 255);
let frames = 0, ms = 0, t0 = performance.now(), fps = 0, lastMedia = -1;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const a = performance.now(), vw = vid.videoWidth, vh = vid.videoHeight;
  let cw = vw, ch = vh; const ar = OW / OH;                                           // cover crop to the 9:16 frame, then the zoom
  if (vw / vh > ar) cw = vh * ar; else ch = vw / ar;
  const z = Math.max(1, num('czm', 1)); cw /= z; ch /= z;
  const sx = Math.min(vw - cw, Math.max(0, (vw - cw) / 2 + num('cpx', 0) * (vw - cw))), sy = Math.min(vh - ch, Math.max(0, (vh - ch) / 2 + num('cpy', 0) * (vh - ch)));
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);
  gl.uniform4f(U.crop, sx / vw, sy / vh, cw / vw, ch / vh); gl.uniform1f(U.mir, cam.stream && cam.mirror ? 1 : 0);
  gl.uniform1f(U.br, num('cbr', 0)); gl.uniform1f(U.ct, num('cct', 1)); gl.uniform1f(U.sa, num('csa', 1)); gl.uniform1f(U.gm, num('cgm', 1)); gl.uniform1f(U.tint, num('ctn', 0));
  gl.uniform3fv(U.dark, rgb(pal.cols[0])); gl.uniform3fv(U.light, rgb(pal.cols[pal.cols.length - 1]));
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  ms += performance.now() - a; frames++;
  if (performance.now() - t0 > 1000) { fps = frames * 1000 / (performance.now() - t0); frames = 0; t0 = performance.now(); }
}
setInterval(() => {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML = row('camera', vid.videoWidth ? vid.videoWidth + ' x ' + vid.videoHeight : '-') + row('frames per second', fps.toFixed(0));
  $('#budget').style.width = Math.min(100, (ms / Math.max(1, frames)) / 33.3 * 100) + '%';
}, 500);
initDefaults('.c1');
window.__state = { P };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
