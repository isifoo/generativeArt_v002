// WINDOWS: a night-time apartment block. The picture is a grid of windows; the person is the windows with their light on.
// Each window is one cell of the camera picture: its (time-smoothed) brightness against its own fixed random threshold decides whether the light is on,
// so a portrait appears as a dithered pattern of lit windows. The block itself is drawn by the GPU: panel seams, frames, mullions, curtains, warm and cool lights.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';
import { createDepthModel } from './depthmodel.js';

const SLIDERS = [
  { head: 'Grid' },
  { id: 'wcol', label: 'Windows across', min: 12, max: 90, step: 1, val: 52, off: '52' },
  { id: 'wasp', label: 'Window height / width', min: 0.7, max: 1.4, step: 0.01, val: 0.95, off: '0.95' },
  { head: 'Light' },
  { id: 'wfg', label: 'Person edge (depth)', min: 0.1, max: 0.9, step: 0.01, val: 0.5, off: '0.5' },
  { id: 'wtone', label: 'Face detail (tone)', min: 0, max: 1, step: 0.01, val: 0.65, off: 'the whole person lit' },
  { id: 'wthr', label: 'Threshold (more = fewer lights)', min: -0.4, max: 0.4, step: 0.01, val: 0, off: '0' },
  { id: 'wcon', label: 'Contrast', min: 0.5, max: 6, step: 0.05, val: 2, off: '2' },
  { id: 'wsp', label: 'Random spread', min: 0, max: 1, step: 0.01, val: 0.35, off: 'every window flips at the same tone' },
  { id: 'wbg', label: 'Lights elsewhere %', min: 0, max: 30, step: 0.5, val: 4, off: 'none' },
  { id: 'winv', label: 'Invert (1 = lights where it is dark)', min: 0, max: 1, step: 1, val: 0, off: '0' },
  { id: 'wsm', label: 'Time smoothing', min: 0, max: 0.95, step: 0.01, val: 0.6, off: 'none' },
  { head: 'Look' },
  { id: 'wwarm', label: 'Warm / cool light', min: 0, max: 1, step: 0.01, val: 0.85, off: 'all cool white' },
  { id: 'wgl', label: 'Glow', min: 0, max: 1, step: 0.01, val: 0.45, off: 'none' },
  { id: 'wdim', label: 'Facade brightness', min: 0, max: 2, step: 0.01, val: 1, off: 'black' },
];
const P = {};
const val = buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);
const inv = () => num('winv', 0) >= 0.5;

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
uniform sampler2D toneT;                                 // one texel per window: smoothed tone 0..1
uniform vec2 res, cell, grid;                            // picture px, window size px, windows across / down
uniform float thr, con, spread, bgp, warm, glow, dim, invert;
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float box(vec2 p, vec2 c, vec2 hs, float aa) { vec2 d = abs(p - c) - hs; return 1.0 - smoothstep(-aa, aa, max(d.x, d.y)); }
void main() {
  vec2 px = uv * res, cid = floor(px / cell), loc = (px - cid * cell) / cell;       // loc 0..1 inside the cell
  vec2 ci = vec2(cid.x, grid.y - 1.0 - cid.y);                                       // texture rows run top to bottom: cid.y counts from the top already
  ci = cid;
  float aa = 1.2 / cell.x;
  float r1 = h21(cid), r2 = h21(cid + 17.3), r3 = h21(cid + 41.7), r4 = h21(cid + 5.1);
  float tone = texelFetch(toneT, ivec2(clamp(cid, vec2(0.0), grid - 1.0)), 0).r;
  if (invert > 0.5) tone = 1.0 - tone;
  float tAdj = clamp((tone - 0.5) * con + 0.5, 0.0, 1.0);
  float lim = 0.5 + thr + (r1 - 0.5) * spread * 1.2;                                  // this window's own switch-on tone
  float lit = smoothstep(lim - 0.04, lim + 0.04, tAdj);
  lit = max(lit, step(r2, bgp * 0.01) * (0.5 + 0.5 * r3));                            // a few lights anywhere
  float level = lit * mix(0.55, 1.0, clamp(tAdj * 0.8 + r3 * 0.35, 0.0, 1.0));       // brighter tone = brighter room
  // the facade: dark panels with vertical seams and a faint sky gradient
  float seam = smoothstep(0.012, 0.0, abs(loc.x - 0.0) * 1.0) * step(0.5, h11(cid.x * 3.7)) ;
  vec3 wall = vec3(0.060, 0.072, 0.088) * (0.85 + 0.3 * h21(cid * 0.37 + 3.0)) * dim;
  wall *= 0.8 + 0.25 * (1.0 - uv.y);
  wall *= 1.0 - 0.5 * seam;
  // window geometry (varies by cell)
  float wide = r4 < 0.35 ? 1.0 : 0.0, balc = r2 > 0.8 ? 1.0 : 0.0, small = r3 > 0.9 ? 1.0 : 0.0;
  vec2 c = vec2(0.5, 0.52 + 0.04 * (r1 - 0.5)), hs = vec2(0.34 + 0.06 * wide, small > 0.5 ? 0.17 : 0.27);
  float frame = box(loc, c, hs + vec2(0.035, 0.04), aa);
  float glass = box(loc, c, hs, aa);
  vec3 col = wall;
  col = mix(col, vec3(0.025, 0.03, 0.04) * dim, frame);
  // unlit glass: night sky reflection, slightly varied, a few dim ones
  float dimLit = step(r3, 0.07) * (1.0 - lit);
  vec3 glassOff = mix(vec3(0.045, 0.060, 0.080), vec3(0.11, 0.14, 0.18), smoothstep(0.7, 0.2, loc.y) * 0.5 + 0.25 * r1) * dim;
  glassOff = mix(glassOff, vec3(0.28, 0.17, 0.09) * (0.5 + r2), dimLit * 0.65);
  // lit glass: warm or cool light, curtain, floor, a sill shadow
  vec3 warmC = mix(vec3(1.0, 0.78, 0.50), vec3(1.0, 0.58, 0.32), r2), coolC = vec3(0.78, 0.90, 1.0);
  vec3 lc = mix(coolC, warmC, step(r1, warm) * 0.0 + (h21(cid + 9.0) < warm ? 1.0 : 0.0));
  float inner = 1.0 - 0.55 * smoothstep(0.35, 0.95, abs(loc.x - 0.5) * 2.0);          // brighter in the middle
  float floorS = smoothstep(c.y + hs.y * 0.55, c.y + hs.y, loc.y);                    // darker toward the sill
  float curtain = box(loc, vec2(c.x + (r4 - 0.5) * 0.3, c.y), vec2(0.04 + 0.05 * r3, hs.y), aa) * step(0.45, r1);
  float mull = box(loc, vec2(c.x, c.y), vec2(0.012, hs.y), aa) * wide;
  vec3 glassOn = lc * level * (0.45 + 0.65 * inner) * (1.0 - 0.45 * floorS) * (1.0 - 0.6 * curtain);
  glassOn *= 1.0 - 0.85 * mull;
  vec3 g = mix(glassOff, glassOn, lit);
  g *= 1.0 - 0.85 * box(loc, vec2(c.x, c.y), vec2(0.008, hs.y), aa) * (1.0 - wide) * step(0.6, r2) * 0.0;
  col = mix(col, g, glass);
  // railing on some floors
  col = mix(col, vec3(0.03, 0.035, 0.045), balc * box(loc, vec2(0.5, c.y + hs.y + 0.1), vec2(hs.x + 0.05, 0.012), aa));
  // glow: a halo of the room's light on the wall around the window
  vec2 d = max(abs(loc - c) - hs, 0.0); float halo = exp(-dot(d, d) * 55.0) * (1.0 - glass);
  col += lc * level * lit * halo * glow * 0.30;
  col = pow(col, vec3(0.92));
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
let pr; const U = {}; let toneTex;
if (gl) {
  pr = prog(VS, FS); gl.useProgram(pr);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['toneT', 'res', 'cell', 'grid', 'thr', 'con', 'spread', 'bgp', 'warm', 'glow', 'dim', 'invert']) U[n] = gl.getUniformLocation(pr, n);
  toneTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, toneTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.uniform1i(U.toneT, 0);
}

// the camera picture, one pixel per window (cover-cropped, mirrored for the camera), smoothed over time
const sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true });
let cols = 0, rows = 0, tone = null, texUp = false, lastMedia = -1, nLit = 0;
function grid() {
  const c = Math.round(num('wcol', 40)), cw = OW / c, ch = cw * num('wasp', 0.95), r = Math.ceil(OH / ch);
  return { c, r, cw, ch };
}
function updateTone() {
  const g = grid();
  if (g.c !== cols || g.r !== rows) { cols = g.c; rows = g.r; sc.width = cols; sc.height = rows; tone = new Float32Array(cols * rows).fill(-1); }
  // the window rows cover rows * ch picture px; the last row can hang over the bottom edge, so draw the picture to the covered height
  const asp = num('wasp', 0.95); sx.setTransform(1, 0, 0, 1 / asp, 0, 0); drawCover(sx, cols, rows * asp); sx.setTransform(1, 0, 0, 1, 0, 0);   // the picture exactly under the window grid
  const d = sx.getImageData(0, 0, cols, rows).data, k = 1 - num('wsm', 0.6), M = DM.M, fgT = num('wfg', 0.5), wt = num('wtone', 0.65), hasD = M.have && M.out && M.w;
  const n = cols * rows, lumA = new Float32Array(n), fgA = new Float32Array(n);
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
    lumA[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; fgA[i] = 1;
    if (hasD) {                                              // the person = near in the depth map
      const mx = Math.min(M.w - 1, Math.floor((x + 0.5) / cols * M.w)), my = Math.min(M.h - 1, Math.floor(Math.min(0.999, (y + 0.5) * g.ch / OH) * M.h));
      const near = M.out[my * M.w + mx], e = 0.12; fgA[i] = Math.min(1, Math.max(0, (near - (fgT - e)) / (2 * e)));
    }
  }
  const R = Math.max(2, Math.round(cols / 14));            // local mean of the tone inside the person: features = lighter or darker than their surroundings
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
    let sw = 0, sl = 0;
    for (let yy = Math.max(0, y - R); yy <= Math.min(rows - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(cols - 1, x + R); xx++) { const j = yy * cols + xx, w = fgA[j]; sw += w; sl += w * lumA[j]; }
    const loc = sw > 0 ? lumA[i] - sl / sw : 0;
    const v = hasD ? fgA[i] * Math.min(1, Math.max(0, 0.62 + wt * (loc * 3.0) + 0.25 * (lumA[i] - 0.4) * (1 - wt))) : lumA[i];
    tone[i] = tone[i] < 0 ? v : tone[i] + (v - tone[i]) * k;
  }
  texUp = true;
}
function render() {
  if (!gl || !tone) return;
  const g = grid();
  if (texUp) {
    const u8 = new Uint8Array(cols * rows); for (let i = 0; i < u8.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round(tone[i] * 255)));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, toneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, u8); texUp = false;
  }
  gl.uniform2f(U.res, OW, OH); gl.uniform2f(U.cell, g.cw, g.ch); gl.uniform2f(U.grid, cols, rows);
  gl.uniform1f(U.thr, num('wthr', 0)); gl.uniform1f(U.con, num('wcon', 2.2)); gl.uniform1f(U.spread, num('wsp', 0.35));
  gl.uniform1f(U.bgp, num('wbg', 4)); gl.uniform1f(U.warm, num('wwarm', 0.85)); gl.uniform1f(U.glow, num('wgl', 0.45)); gl.uniform1f(U.dim, num('wdim', 1));
  gl.uniform1f(U.invert, inv() ? 1 : 0);
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

let frames = 0, ms = 0, lastDepth = 0, t0 = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const fresh = vid.currentTime !== lastMedia; if (DM.M.ready && !DM.M.busy && (fresh || !DM.M.have)) DM.infer();
  if (fresh || !tone || depthNew) { lastMedia = vid.currentTime; depthNew = false; updateTone(); }
  const a = performance.now(); render(); ms += performance.now() - a; frames++;
  if (performance.now() - t0 > 1000) { fps = frames * 1000 / (performance.now() - t0); frames = 0; t0 = performance.now(); }
}
setInterval(() => {
  const g = grid(), row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML = row('windows', `${cols} x ${rows} = ${cols * rows}`) + row('window size', `${g.cw.toFixed(0)} x ${g.ch.toFixed(0)} px`) + row('frames per second', fps.toFixed(0));
  $('#budget').style.width = Math.min(100, (ms / Math.max(1, frames)) / 33.3 * 100) + '%';
}, 500);
for (const id of ['wcol', 'wasp']) $('#' + id).addEventListener('input', () => { tone = null; });
$('#settings').addEventListener('input', () => { texUp = !!tone; }, true);
cam.onStart = () => { lastMedia = -1; tone = null; };
initDefaults('.w1');
window.__state = { P, grid, DM, get tone() { return tone; } };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
