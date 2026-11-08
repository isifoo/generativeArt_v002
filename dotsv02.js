// DEPTH DOTS v02 = v01 (dots.js, kept as it was) plus four CONTRAST HOT SPOTS: the four places where the depth map changes the most are found on every new depth map
// (and followed smoothly), and extra drones, NOT on the lattice, crowd around each of them, so the edges and details there get a much denser set of dots.
// DEPTH DOTS: the depth map as small glowing dots in a night sky, like a drone show, now in real 3D space. One dot per "drone" on an even lattice; the depth
// map puts each drone at its own distance from the camera (z), decides which drones are lit (near = the subject), how bright and what colour (palette ramp,
// far to near). The drones are drawn as points through a perspective camera, so near ones spread wider and look bigger, far ones sit deeper in the sky, and a
// slow sway of the camera shows the depth. They also hover and twinkle; a few faint drones fill the rest of the sky. The glow is the light of the dots blurred
// in three levels. Colours come from the universal palette (paper = the sky, the colour ramp = the drones).
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, getPalette, onPalette } from './ui.js';
import { loadPreset } from './palette.js';
import { createDepthModel, OW, OH } from './depthmodel.js';

const SLIDERS = [
  { head: 'Drones' },
  { id: 'ddcol', label: 'Dots across', min: 20, max: 200, step: 1, val: 72, off: '72' },
  { id: 'ddsz', label: 'Dot size', min: 0.3, max: 1.6, step: 0.01, val: 1, off: '1' },
  { id: 'dbri', label: 'Dot brightness', min: 0.3, max: 2, step: 0.01, val: 1.1, off: '1.1' },
  { id: 'djit', label: 'Lattice jitter', min: 0, max: 1, step: 0.01, val: 0.2, off: 'a perfect lattice' },
  { head: 'Contrast hot spots (v02)' },
  { id: 'dexn', label: 'Extra dots per hot spot', min: 0, max: 8000, step: 10, val: 1500, off: 'none' },
  { id: 'dhr', label: 'Hot spot radius (picture widths)', min: 0.02, max: 0.3, step: 0.005, val: 0.09, off: '0.09' },
  { id: 'desz', label: 'Extra dot size', min: 0.2, max: 1.2, step: 0.01, val: 0.6, off: '0.6' },
  { head: 'Place in 3D space (from the depth map)' },
  { id: 'dz', label: 'Depth in space', min: 0, max: 3, step: 0.01, val: 1.1, off: 'flat' },
  { id: 'dpe', label: 'Perspective', min: 0, max: 1.5, step: 0.01, val: 0.7, off: 'none (flat projection)' },
  { id: 'dyaw', label: 'Turn deg', min: -50, max: 50, step: 0.5, val: 0, off: 'straight on' },
  { id: 'dpit', label: 'Tilt deg', min: -40, max: 40, step: 0.5, val: 0, off: 'level' },
  { id: 'dsw', label: 'Sway deg', min: 0, max: 25, step: 0.5, val: 6, off: 'still' },
  { id: 'dsws', label: 'Sway speed', min: 0, max: 1, step: 0.01, val: 0.15, off: 'still' },
  { head: 'Depth' },
  { id: 'dthr', label: 'Depth threshold (higher = fewer drones)', min: 0, max: 1, step: 0.01, val: 0.42, off: '0.42' },
  { id: 'dsft', label: 'Edge softness', min: 0.01, max: 0.5, step: 0.01, val: 0.14, off: '0.14' },
  { id: 'dcon', label: 'Depth contrast', min: 0.5, max: 4, step: 0.01, val: 1.7, off: '1.7' },
  { id: 'dinv', label: 'Invert (1 = far drones lit)', min: 0, max: 1, step: 1, val: 0, off: '0' },
  { head: 'Motion' },
  { id: 'dhov', label: 'Hover', min: 0, max: 1, step: 0.01, val: 0.5, off: 'still' },
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

// the drones are points: the vertex shader reads the depth of its lattice cell, places the point in 3D, and projects it; the fragment shader draws the soft round dot
const VS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 cellIJ; in vec3 rnd;
uniform sampler2D dep, depPrev;
uniform vec2 res; uniform vec2 grid; uniform float vpw, bt, time;
uniform float extra, hrad, esz; uniform vec3 hot[4];
uniform float thr, soft, dcon, inv, size, bri, jit, hov, tw, sky, zamt, persp, yaw, pitch;
uniform vec3 c0, c1, c2;
out vec3 vCol; out float vA;
float depthAt(vec2 q) { float d = mix(texture(depPrev, q).r, texture(dep, q).r, bt); d = inv > 0.5 ? 1.0 - d : d; return clamp((d - 0.5) * dcon + 0.5, 0.0, 1.0); }
vec3 ramp(float d) { return d < 0.5 ? mix(c0, c1, d * 2.0) : mix(c1, c2, d * 2.0 - 1.0); }
void main() {
  vec2 uvc = (cellIJ + 0.5) / grid;
  if (extra > 0.5) {                                                                                  // an extra drone: not on the lattice, gathered round one of the 4 hot spots
    vec3 h = hot[int(floor(cellIJ.x * 3.999))]; float ang = cellIJ.y * 6.2832, rr = hrad * sqrt(-2.0 * log(1.0 - rnd.x * 0.98));
    uvc = clamp(h.xy + vec2(cos(ang), sin(ang) * res.x / res.y) * rr, 0.01, 0.99);
  }
  float d = depthAt(uvc);
  float on = smoothstep(thr - soft, thr + soft, d);
  if (extra < 0.5 && rnd.z < sky * 0.01 && on < 0.3) { on = 0.22 + 0.2 * rnd.x; d = 0.12 + 0.3 * rnd.y; }       // a few faint ones far back in the empty sky
  if (on <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); return; }
  float aspect = res.y / res.x;
  vec3 p = vec3(uvc.x - 0.5, (0.5 - uvc.y) * aspect, (d - 0.35) * zamt);                           // frame units: the picture is 1 wide
  float cellU = 1.0 / grid.x;
  p.xy += (rnd.xy - 0.5) * jit * cellU * 0.30;                                                      // lattice jitter
  p.xy += vec2(sin(time * 0.7 + rnd.x * 6.283), cos(time * 0.6 + rnd.y * 6.283)) * hov * cellU * 0.10;   // hover
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);                            // the camera turns around the middle of the depth
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  float camD = 2.2, s = camD / max(0.3, camD - p.z * persp);                                       // perspective: near = bigger and spread wider
  vec2 q = p.xy * s;
  gl_Position = vec4(q.x * 2.0, q.y * 2.0 / aspect, 0.0, 1.0);
  float r = size * (extra > 0.5 ? esz : 1.0) * (0.10 + 0.08 * d) * s * (vpw / grid.x);                                         // dot radius in target pixels
  gl_PointSize = max(2.0, 2.0 * r + 3.0);
  vCol = mix(ramp(d), vec3(1.0), 0.12 * d) * bri * (0.65 + 0.7 * d) * (1.0 - tw * (0.5 + 0.5 * sin(time * (2.0 + rnd.z * 6.0) + rnd.y * 40.0))) * on;
  vA = r;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vA; out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0; float dist = length(c) * (vA + 1.5), r = vA;                // soft round dot, radius vA pixels
  float dot = 1.0 - smoothstep(r * 0.55, r, dist);
  o = vec4(vCol * dot, 1.0);
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
const VS3 = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS3 = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o; uniform sampler2D g1, g2, g3, pts; uniform vec3 paper; uniform float glow, spread;      // the final picture: the sky, the dots at full size, the glow
void main() {
  vec2 gq = vec2(uv.x, 1.0 - uv.y);
  float w1 = 1.0 - 0.6 * spread, w2 = 0.35 + 0.65 * spread, w3 = 0.15 + 0.85 * spread;
  vec3 gl = (texture(g1, gq).rgb * w1 + texture(g2, gq).rgb * w2 + texture(g3, gq).rgb * w3) * glow;
  vec3 col = paper * 0.9 + texture(pts, gq).rgb + gl;
  o = vec4(pow(clamp(col, 0.0, 4.0), vec3(0.95)), 1.0);
}`;
function prog(vs, fs, attrs) {
  const pg = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) msg('Shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(pg, s);
  }
  (attrs || []).forEach((a, i) => gl.bindAttribLocation(pg, i, a));
  gl.linkProgram(pg); return pg;
}
const pDot = prog(VS, FS, ['cellIJ', 'rnd']), pb = prog(VS2, FSB, ['p']), pFin = prog(VS3, FS3, ['p']);
const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ['extra', 'hrad', 'esz', 'hot', 'dep', 'depPrev', 'res', 'grid', 'vpw', 'bt', 'time', 'thr', 'soft', 'dcon', 'inv', 'size', 'bri', 'jit', 'hov', 'tw', 'sky', 'zamt', 'persp', 'yaw', 'pitch', 'c0', 'c1', 'c2']) U[n] = gl.getUniformLocation(pDot, n);
const UB = { src: gl.getUniformLocation(pb, 'src'), dir: gl.getUniformLocation(pb, 'dir') };
const UF = {}; for (const n of ['g1', 'g2', 'g3', 'pts', 'paper', 'glow', 'spread']) UF[n] = gl.getUniformLocation(pFin, n);
gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_color_buffer_half_float'); gl.getExtension('OES_texture_float_linear');
// iPad / iPhone Safari can refuse a half float render target: test one, and fall back to plain 8 bit targets (the glow is a little less bright, but it draws)
let RTF = { i: gl.RGBA16F, t: gl.HALF_FLOAT, name: 'half float' };
{
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.getError(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  if (gl.getError() !== 0 || gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) RTF = { i: gl.RGBA8, t: gl.UNSIGNED_BYTE, name: '8 bit' };
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t);
}
let depth8 = false;                                                       // depth upload: 16 bit float first, 8 bit if the device refuses it
const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tDep = mkTex(0), tPrev = mkTex(1);
const mkRT = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, RTF.i, w, h, 0, gl.RGBA, RTF.t, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; };
const E = mkRT(540, 960), F = mkRT(OW, OH), L = [[270, 480], [135, 240], [68, 120]].map(([w, h]) => ({ a: mkRT(w, h), b: mkRT(w, h) }));
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

// the drone lattice: one point per cell, with its cell and three random numbers
let nDots = 0, gcols = 0, grows = 0, dotVao = null, dotBuf = null;
const XMAX = 32000;                                          // extra drones: random places (a1, a2) and three random numbers, made once; each picks one of the 4 hot spots by a1
const xVao = gl.createVertexArray(), xBuf = gl.createBuffer();
{ const a = new Float32Array(XMAX * 5); let q = 12345; const rn = () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; for (let k = 0; k < a.length; k++) a[k] = rn();
  gl.bindVertexArray(xVao); gl.bindBuffer(gl.ARRAY_BUFFER, xBuf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8); gl.bindVertexArray(null); }
function buildDots(cols) {
  gcols = cols; grows = Math.ceil(OH / (OW / cols)); nDots = gcols * grows;
  const a = new Float32Array(nDots * 5); let k = 0;
  for (let j = 0; j < grows; j++) for (let i = 0; i < gcols; i++) { const h = (n) => { const s = Math.sin((i * 127.1 + j * 311.7 + n * 74.7)) * 43758.5453; return s - Math.floor(s); }; a.set([i, j, h(1), h(2), h(3)], k); k += 5; }
  if (!dotVao) { dotVao = gl.createVertexArray(); dotBuf = gl.createBuffer(); }
  gl.bindVertexArray(dotVao); gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
  gl.bindVertexArray(null);
}
function blurLevel(src, lv) {
  gl.bindVertexArray(quadVao); gl.useProgram(pb); gl.uniform1i(UB.src, 8); gl.activeTexture(gl.TEXTURE8);
  const { a, b } = lv;
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.f); gl.viewport(0, 0, a.w, a.h); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform2f(UB.dir, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.bindTexture(gl.TEXTURE_2D, a.t); gl.uniform2f(UB.dir, 1.2 / a.w, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.f); gl.bindTexture(gl.TEXTURE_2D, b.t); gl.uniform2f(UB.dir, 0, 1.2 / a.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
let pal = getPalette(); onPalette((p) => { pal = p; });
const rgb = (a) => a.map((x) => x / 255);
function drawDots(target, vpw) {                             // all the drones, added together, into a target of width vpw
  gl.useProgram(pDot); gl.bindVertexArray(dotVao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.f); gl.viewport(0, 0, target.w, target.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.uniform1f(U.vpw, vpw); gl.uniform1f(U.extra, 0); gl.drawArrays(gl.POINTS, 0, nDots);
  const nx = Math.min(XMAX, Math.round(num('dexn', 1500)) * 4);
  if (nx > 0) { gl.bindVertexArray(xVao); gl.uniform1f(U.extra, 1); gl.drawArrays(gl.POINTS, 0, nx); gl.uniform1f(U.extra, 0); }
  gl.disable(gl.BLEND);
}
// the 4 contrast hot spots: the depth map's change (|dx| + |dy|) summed in blocks; take the strongest block, centre on it, clear the area round it, repeat
const HOT = [[0.5, 0.3], [0.5, 0.5], [0.5, 0.7], [0.3, 0.5]], TGT = HOT.map((h) => h.slice()); let hotFirst = true;
function findHot() {
  const w = M.w, h = M.h, a = M.out, bx = 16, by = Math.max(4, Math.round(16 * h / w)), sc = new Float32Array(bx * by), asp = h / w;
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) { const i = y * w + x; sc[Math.floor(x * bx / w) + bx * Math.floor(y * by / h)] += Math.abs(a[i] - a[i - 1]) + Math.abs(a[i] - a[i - w]); }
  const found = [];
  for (let n = 0; n < 4; n++) {
    let bi = -1, bv = 1e-6; for (let k = 0; k < sc.length; k++) if (sc[k] > bv) { bv = sc[k]; bi = k; }
    if (bi < 0) break;
    const i0 = bi % bx, j0 = Math.floor(bi / bx); let sx = 0, sy = 0, sw = 0;
    for (let j = Math.max(0, j0 - 1); j <= Math.min(by - 1, j0 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(bx - 1, i0 + 1); i++) { const v = sc[i + bx * j]; sx += (i + 0.5) * v; sy += (j + 0.5) * v; sw += v; }
    found.push([sx / sw / bx, sy / sw / by]);
    for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) if (Math.hypot((i - i0) / bx, (j - j0) / by * asp) < 0.2) sc[i + bx * j] = 0;
  }
  const free = found.slice();                                    // each spot keeps following the nearest new one, so they glide instead of swapping places
  for (let s = 0; s < 4 && free.length; s++) { let bk = 0, bd = 9; free.forEach((f, k) => { const d = Math.hypot(f[0] - TGT[s][0], f[1] - TGT[s][1]); if (d < bd) { bd = d; bk = k; } }); TGT[s] = free.splice(bk, 1)[0]; }
  if (hotFirst && found.length) { for (let s = 0; s < 4; s++) HOT[s] = TGT[s].slice(); hotFirst = false; }
}
function putDepth(tex, unit, arr) {
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
  if (!depth8) { gl.getError(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, arr); if (gl.getError() === 0) return; depth8 = true; }
  const u = new Uint8Array(M.w * M.h); for (let i = 0; i < u.length; i++) u[i] = Math.max(0, Math.min(255, arr[i] * 255 + 0.5));
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, M.w, M.h, 0, gl.RED, gl.UNSIGNED_BYTE, u);
}
function render() {
  if (!M.have) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, OW, OH); const p = rgb(pal.paper); gl.clearColor(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
  const cols = Math.round(num('ddcol', 72)); if (cols !== gcols) buildDots(cols);
  if (upload) { putDepth(tDep, 0, M.out); putDepth(tPrev, 1, M.prevOut || M.out); findHot(); upload = false; }
  for (const s of [0, 1, 2, 3]) { HOT[s][0] += (TGT[s][0] - HOT[s][0]) * 0.06; HOT[s][1] += (TGT[s][1] - HOT[s][1]) * 0.06; }
  gl.useProgram(pDot); gl.uniform3fv(U.hot, HOT.flatMap((h) => [h[0], h[1], 1])); gl.uniform1f(U.hrad, num('dhr', 0.09)); gl.uniform1f(U.esz, num('desz', 0.6));
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tPrev);
  gl.useProgram(pDot); gl.uniform1i(U.dep, 0); gl.uniform1i(U.depPrev, 1);
  const cs = pal.cols, c0 = rgb(cs[0]), c2 = rgb(cs[cs.length - 1]), c1 = cs.length === 3 ? rgb(cs[1]) : c0.map((x, i) => (x + c2[i]) / 2), t = performance.now() / 1000;
  const sw = num('dsw', 6) * Math.sin(t * num('dsws', 0.15) * Math.PI * 2);
  gl.uniform2f(U.res, OW, OH); gl.uniform2f(U.grid, gcols, grows); gl.uniform1f(U.bt, Math.min(1, (performance.now() - M.tUp) / Math.max(16, M.interval))); gl.uniform1f(U.time, t);
  gl.uniform1f(U.thr, num('dthr', 0.42)); gl.uniform1f(U.soft, num('dsft', 0.14)); gl.uniform1f(U.dcon, num('dcon', 1.7)); gl.uniform1f(U.inv, num('dinv', 0));
  gl.uniform1f(U.size, num('ddsz', 1)); gl.uniform1f(U.bri, num('dbri', 1.1)); gl.uniform1f(U.jit, num('djit', 0.2)); gl.uniform1f(U.hov, num('dhov', 0.5));
  gl.uniform1f(U.tw, num('dtw', 0.25)); gl.uniform1f(U.sky, num('dsky', 4)); gl.uniform1f(U.zamt, num('dz', 1.1)); gl.uniform1f(U.persp, num('dpe', 0.7));
  gl.uniform1f(U.yaw, (num('dyaw', 0) + sw) * Math.PI / 180); gl.uniform1f(U.pitch, num('dpit', 0) * Math.PI / 180);
  gl.uniform3fv(U.c0, c0); gl.uniform3fv(U.c1, c1); gl.uniform3fv(U.c2, c2);
  drawDots(E, E.w); blurLevel(E.t, L[0]); blurLevel(L[0].a.t, L[1]); blurLevel(L[1].a.t, L[2]);            // the light alone at half size, then three levels of blur
  drawDots(F, OW);                                                                                          // the dots at full size
  gl.bindVertexArray(quadVao); gl.useProgram(pFin);
  for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE5 + i); gl.bindTexture(gl.TEXTURE_2D, L[i].a.t); gl.uniform1i(UF['g' + (i + 1)], 5 + i); }
  gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, F.t); gl.uniform1i(UF.pts, 9);
  gl.uniform3fv(UF.paper, rgb(pal.paper)); gl.uniform1f(UF.glow, num('dgl', 1.8)); gl.uniform1f(UF.spread, num('dgs', 0.5));
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
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML = row('drones', `${gcols} x ${grows} = ${nDots} + ${Math.min(XMAX, Math.round(num('dexn', 1500)) * 4)} extra`) + row('hot spots', HOT.map((h) => h[0].toFixed(2) + ',' + h[1].toFixed(2)).join('  ')) + row('runs on', M.ready ? (M.ep === 'webgpu' ? 'GPU (WebGPU)' : 'processor (WASM, slow)') : M.loading ? 'loading...' : '-') +
    row('model time per frame', M.ms.toFixed(1) + ' ms') + row('depth maps per second', M.fps.toFixed(1)) + row('frames per second', fps.toFixed(0)) + row('glow buffers / depth', RTF.name + ' / ' + (depth8 ? '8 bit' : '16 bit'));
  $('#budget').style.width = Math.min(100, M.ms / 33.3 * 100) + '%';
}, 500);
cam.onStart = () => { lastMedia = -1; };
initDefaults('.d5');
window.__state = { P, M, DM };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
