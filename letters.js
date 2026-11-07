// LETTERS: the camera picture drawn with characters on a grid, like the Coinbase / Buck piece: white symbols (- + = < 0 # 1 & $) on one saturated colour.
// The brightness under each character picks a symbol from a ramp (empty .. dense), so the subject is built out of type; a few faint symbols fill the empty ground.
// Colours come from the universal palette (Edit > Colours): background = the dark colour, symbols = the light colours (and the paper colour at full brightness).
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover, getPalette, onPalette } from './ui.js';
import { loadPreset } from './palette.js';
import { createDepthModel } from './depthmodel.js';

const RAMPS = {
  coinbase: { label: 'Symbols (Coinbase)', chars: ' .-+=<0#1&$' },
  dollar: { label: 'Dollars and plus', chars: ' .-+=#$' },
  ascii: { label: 'Classic ASCII', chars: ' .:-=+*#%@' },
  code: { label: 'Code symbols', chars: ' .,;:!/\\[]{}()<>#&$@' },
  digits: { label: 'Digits', chars: ' 1740295863' },
  binary: { label: 'Binary', chars: ' 01' },
  letters: { label: 'Letters', chars: ' icoeaxmBWM@' },
};
const SLIDERS = [
  { head: 'Grid' },
  { id: 'lcol', label: 'Characters across', min: 24, max: 240, step: 1, val: 96, off: '96' },
  { id: 'lasp', label: 'Character height / width', min: 1.2, max: 2.6, step: 0.01, val: 1.75, off: '1.75' },
  { id: 'lsz', label: 'Symbol size in its cell', min: 0.5, max: 1.3, step: 0.01, val: 0.92, off: '0.92' },
  { head: 'Camera to symbols' },
  { id: 'lauto', label: 'Auto levels', min: 0, max: 1, step: 0.01, val: 1, off: 'use Black / White point only' },
  { id: 'lblk', label: 'Black point', min: 0, max: 0.8, step: 0.005, val: 0.05, off: '0.05' },
  { id: 'lwht', label: 'White point', min: 0.1, max: 1, step: 0.005, val: 0.85, off: '0.85' },
  { id: 'lgam', label: 'Contrast curve (gamma)', min: 0.3, max: 3, step: 0.01, val: 1.2, off: '1.2' },
  { id: 'linv', label: 'Invert (1 = dense where it is dark)', min: 0, max: 1, step: 1, val: 0, off: '0' },
  { id: 'lsm', label: 'Time smoothing', min: 0, max: 0.97, step: 0.01, val: 0.8, off: 'none' },
  { id: 'lbgf', label: 'Fade the background (depth)', min: 0, max: 1, step: 0.01, val: 0, off: 'whole picture (the depth model stays off)' },
  { head: 'Calm (less flicker)' },
  { id: 'lcalm', label: 'Calm mode (0 = the original behaviour)', min: 0, max: 1, step: 1, val: 1, off: '0' },
  { id: 'lpat', label: 'Patch size (characters, areas change together)', min: 1, max: 16, step: 1, val: 5, off: '5' },
  { id: 'lstp', label: 'Symbols a character moves per change', min: 0.5, max: 4, step: 0.5, val: 1, off: '1' },
  { id: 'lstep', label: 'Updates per second (low = slow, steady)', min: 1, max: 30, step: 0.5, val: 8, off: '8' },
  { id: 'lcom', label: 'Share of areas that change each update', min: 0.02, max: 1, step: 0.01, val: 0.25, off: '0.25' },
  { id: 'lhys', label: 'Hold a symbol until the change is bigger than (steps)', min: 0, max: 2, step: 0.05, val: 0.6, off: '0.6' },
  { head: 'Type' },
  { id: 'lshim', label: 'Shimmer (symbols change)', min: 0, max: 1, step: 0.01, val: 0.15, off: 'steady' },
  { id: 'lrate', label: 'Shimmer hops per second (each symbol on its own beat)', min: 0.2, max: 24, step: 0.1, val: 1.5, off: '1.5' },
  { id: 'lbg', label: 'Faint symbols in the empty ground', min: 0, max: 1, step: 0.01, val: 0.12, off: 'none' },
  { id: 'lwt', label: 'Symbol weight', min: 0, max: 1, step: 0.01, val: 0.6, off: 'light' },
];
const P = {};
const val = buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);
let ramp = 'coinbase';

// this style opens with the electric blue palette (the palette is shared by every style; a saved default replaces it)
loadPreset('electric');   // saved defaults (Save as default) are restored later by initDefaults and win

let depthNew = false, depthOn = false;
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : def), () => { depthNew = true; });
const canvas = $('#cv'); canvas.width = 1080; canvas.height = 1920; const OW = 1080, OH = 1920;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D lvlT, atlasT;                           // brightness per character cell, the glyph atlas (white on black, one glyph per column)
uniform vec2 res, cell; uniform float nG, shim, time, size, bgd, wt, calm;
uniform vec3 bgC, lowC, highC;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 px = uv * res, cid = floor(px / cell), loc = fract(px / cell);
  float lv = texelFetch(lvlT, ivec2(cid), 0).r;
  float r = h21(cid + 3.3);
  if (r < bgd * 0.5) lv = max(lv, 0.10 + 0.22 * h21(cid + 9.1));                       // faint symbols in the empty ground
  float g = floor(lv * (nG - 0.001));
  float sh = (h21(cid + floor(time + r * 7.0 * calm) * 1.7) - 0.5) * 2.0 * shim * 2.0;                  // the symbol hops to a neighbour of the ramp
  g = clamp(g + (g > 0.5 ? floor(sh + 0.5) : 0.0), 0.0, nG - 1.0);
  vec2 q = (loc - 0.5) / size + 0.5;
  float cov = 0.0;
  if (g > 0.5 && q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) cov = texture(atlasT, vec2((g + q.x) / nG, q.y)).r;
  cov = smoothstep(0.5 - 0.45 * (1.0 - wt) - 0.2, 0.55 + 0.4 * wt, cov * (0.8 + 0.5 * wt));
  vec3 ink = mix(lowC, highC, smoothstep(0.2, 0.9, lv));
  o = vec4(mix(bgC, ink, clamp(cov, 0.0, 1.0)), 1.0);
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
const U = {}; for (const n of ['lvlT', 'atlasT', 'res', 'cell', 'nG', 'shim', 'time', 'size', 'bgd', 'wt', 'calm', 'bgC', 'lowC', 'highC']) U[n] = gl.getUniformLocation(pr, n);
const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tLvl = mkTex(0), tAtlas = mkTex(1);
gl.uniform1i(U.lvlT, 0); gl.uniform1i(U.atlasT, 1); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tLvl); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

// ---------------------------------------------------------------- the glyph atlas: one 64 x 96 tile per symbol of the ramp, drawn with the browser's monospace font
let nG = 1;
function buildAtlas() {
  const chars = [...RAMPS[ramp].chars], T = 64, TH = 96, c = document.createElement('canvas'); c.width = T * chars.length; c.height = TH;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 78px ui-monospace, "Cascadia Mono", Consolas, Menlo, "Courier New", monospace`;
  chars.forEach((ch, i) => { if (ch !== ' ') x.fillText(ch, i * T + T / 2, TH / 2 + 4); });
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tAtlas);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); nG = chars.length;
}
buildAtlas();

// ---------------------------------------------------------------- the camera under the characters
const sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true });
let cols = 0, rows = 0, tone = null, fgv = null, lo = 0.05, hi = 0.85, lastMedia = -1, lvlUp = false, nLit = 0;
function grid() { const c = Math.round(num('lcol', 96)), cw = OW / c, ch = cw * num('lasp', 1.75); return { c, r: Math.ceil(OH / ch), cw, ch }; }
function updateTone() {
  const g = grid(); if (g.c !== cols || g.r !== rows) { cols = g.c; rows = g.r; sc.width = cols; sc.height = rows; tone = null; }
  const asp = num('lasp', 1.75); sx.setTransform(1, 0, 0, 1 / asp, 0, 0); drawCover(sx, cols, rows * asp); sx.setTransform(1, 0, 0, 1, 0, 0);   // the picture exactly under the grid
  const d = sx.getImageData(0, 0, cols, rows).data, M = DM.M, n = cols * rows, hasD = depthOn && M.have && M.out && M.w, fgT = 0.5;
  const lum = new Float32Array(n), fg = new Float32Array(n).fill(1);
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
    lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    if (hasD) { const mx = Math.min(M.w - 1, Math.floor((x + 0.5) / cols * M.w)), my = Math.min(M.h - 1, Math.floor(Math.min(0.999, (y + 0.5) * g.ch / OH) * M.h)), e = 0.12; fg[i] = Math.min(1, Math.max(0, (M.out[my * M.w + mx] - (fgT - e)) / (2 * e))); }
  }
  const hist = new Float32Array(256); let tot = 0;                                                    // auto levels: 4 % .. 96 % of the brightness (inside the person when depth is on)
  for (let i = 0; i < n; i++) { const w = hasD ? fg[i] : 1; hist[Math.min(255, Math.floor(lum[i] * 255))] += w; tot += w; }
  if (tot > 20) { let c = 0, a = 0, b = 255; for (; a < 255 && (c += hist[a]) < tot * 0.04; a++); c = 0; for (; b > 0 && (c += hist[b]) < tot * 0.04; b--); lo += (a / 255 - lo) * 0.25; hi += (Math.max(a + 12, b) / 255 - hi) * 0.25; }
  const k = 1 - num('lsm', 0.5);
  if (!tone) { tone = lum.slice(); fgv = fg.slice(); } else for (let i = 0; i < n; i++) { tone[i] += (lum[i] - tone[i]) * k; fgv[i] += (fg[i] - fgv[i]) * k; }
  lvlUp = true;
}
const calmOn = () => num('lcalm', 1) >= 0.5;
let shown = null, lastCommit = 0, force = false, tick = 0;      // shown = the level each character currently displays; it only moves when its area commits to a change
function uploadLevels() {
  const auto = num('lauto', 1), blk = auto * lo + (1 - auto) * num('lblk', 0.05), wht = auto * hi + (1 - auto) * num('lwht', 0.85), gam = num('lgam', 1.2), inv = num('linv', 0) >= 0.5;
  const bgf = depthOn ? num('lbgf', 0) : 0, n = cols * rows, u8 = new Uint8Array(n); nLit = 0;
  const calm = calmOn() && !force, com = num('lcom', 0.25), step1 = 1 / Math.max(1, nG - 1), hys = num('lhys', 0.6) * step1, mv = num('lstp', 1) * step1;
  const ps = Math.max(1, Math.round(num('lpat', 5))), pw = Math.ceil(cols / ps); tick++;
  if (!shown || shown.length !== n) shown = new Float32Array(n), shown.fill(-1);
  for (let i = 0; i < n; i++) {
    let v = tone[i]; if (inv) v = 1 - v;
    const I = Math.min(1, Math.pow(Math.min(1, Math.max(0, (v - blk) / Math.max(0.05, wht - blk))), gam) * (1 - bgf * (1 - fgv[i])));
    if (!calmOn() || shown[i] < 0) shown[i] = I;                                                 // original mode, or the first picture: show it at once
    else if (force) shown[i] = I;
    else {
      const px = (i % cols / ps) | 0, py = ((i / cols | 0) / ps) | 0, h = Math.imul(px + py * pw + 1, 2654435761) ^ Math.imul(tick, 40503);
      const hv = ((Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) % 1000) / 1000;                  // this patch's dice roll for this update
      const dI = I - shown[i];
      if (hv < com && Math.abs(dI) > hys) shown[i] += Math.sign(dI) * Math.min(Math.abs(dI), mv);   // a random patch commits and its characters move a step toward the picture
    }
    if (shown[i] > 0.3) nLit++; u8[i] = Math.round(shown[i] * 255);
  }
  force = false; lastCommit = performance.now();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tLvl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, u8); lvlUp = false;
}
let pal = getPalette(); onPalette((p) => { pal = p; });
const rgb = (a) => a.map((x) => x / 255);
function render() {
  if (!tone) return;
  if (lvlUp && (force || !calmOn() || performance.now() - lastCommit >= 1000 / num('lstep', 8))) uploadLevels();
  const g = grid(), light = pal.cols[pal.cols.length - 1], mid = pal.n === 3 ? pal.cols[1] : light.map((x, i) => x * 0.8 + pal.cols[0][i] * 0.2);
  gl.useProgram(pr); gl.viewport(0, 0, OW, OH);
  gl.uniform2f(U.res, OW, OH); gl.uniform2f(U.cell, g.cw, g.ch); gl.uniform1f(U.nG, nG); gl.uniform1f(U.shim, num('lshim', 0.2)); gl.uniform1f(U.time, performance.now() / 1000 * num('lrate', 6));
  gl.uniform1f(U.size, num('lsz', 0.92)); gl.uniform1f(U.bgd, num('lbg', 0.12)); gl.uniform1f(U.wt, num('lwt', 0.6)); gl.uniform1f(U.calm, calmOn() ? 1 : 0);
  gl.uniform3fv(U.bgC, rgb(pal.cols[0])); gl.uniform3fv(U.lowC, rgb(mid)); gl.uniform3fv(U.highC, rgb(pal.paper));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

let frames = 0, ms = 0, t0 = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  if (num('lbgf', 0) > 0 && !depthOn) { depthOn = true; DM.load(); }
  const fresh = vid.currentTime !== lastMedia; if (depthOn && DM.M.ready && !DM.M.busy && (fresh || !DM.M.have)) DM.infer();
  if (fresh || !tone || depthNew) { lastMedia = vid.currentTime; depthNew = false; updateTone(); }
  const a = performance.now(); render(); ms += performance.now() - a; frames++;
  if (performance.now() - t0 > 1000) { fps = frames * 1000 / (performance.now() - t0); frames = 0; t0 = performance.now(); }
}
// the ramp choice: a select in the settings, built like the other selects
{
  const row = document.createElement('div'); row.className = 'ctl';
  row.innerHTML = `<span>Symbols</span><select id="lramp" data-save>${Object.entries(RAMPS).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('')}</select>`;
  $('#sliders').before(row);
  const sel = row.querySelector('select'); sel.value = ramp;
  sel.onchange = () => { ramp = sel.value; buildAtlas(); lvlUp = true; };
}
setInterval(() => {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML = row('characters', `${cols} x ${rows} = ${cols * rows}`) + row('dense ones', nLit) + row('frames per second', fps.toFixed(0));
  $('#budget').style.width = Math.min(100, (ms / Math.max(1, frames)) / 33.3 * 100) + '%';
}, 500);
$('#settings').addEventListener('input', (e) => { lvlUp = !!tone; if (!/^l(step|com|hys|shim|rate|pat|stp|calm)$/.test(e.target.id || '')) force = true; }, true);   // a picture setting shows at once; the calm settings only change the pace
cam.onStart = () => { lastMedia = -1; tone = null; shown = null; };
initDefaults('.l1');
window.__state = { P, DM };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
