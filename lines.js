// FRACTAL LINES: two nodes, wired into the output.
//  [Lines]  evenly spaced lines whose shape is a wave that turns over between the dark and light of the video (soft
//           contrast), width by tone. The look is fixed (it works); the node only has Spacing, Width and Angle.
//  [Alpha]  AE Extract on the video's luminance (smoothed into clean shapes): Black Point, White Point, Black Softness,
//           White Softness, Invert. Opaque = the lines show. With the defaults it is solid black and white, like a poster.
//  [Out]    lines x alpha.
// Click a node: the Edit panel shows that node's settings only.
import { $, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';

const OW = 1080, OH = 1920;
// the fixed look of the lines (Gerry's settings, v2.00)
const LOOK = { thin: 0, amp: 86.5, len: 1090, variation: 0.8, drift: 0.06, flip: 1, flipSoft: 90, con: 1.3, bri: 0, smooth: 0.6 };
const SHAPE_PX = 16;                                       // the alpha's shapes are smoothed this much, so they are clean
const SLIDERS = [
  { head: 'Lines' },
  { id: 'flsp', label: 'Spacing px', min: 3, max: 60, step: 0.5, val: 15, off: '15' },
  { id: 'flw', label: 'Width px', min: 0.3, max: 30, step: 0.1, val: 2.3, off: 'hairlines' },
  { id: 'fla', label: 'Angle deg', min: -90, max: 90, step: 1, val: -6, off: '0' },
  { head: 'Alpha (Extract)' },
  { id: 'xbp', label: 'Black Point', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: 'xwp', label: 'White Point', min: 0, max: 255, step: 1, val: 128, off: '255' },
  { id: 'xbs', label: 'Black Softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: 'xws', label: 'White Softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: 'xinv', label: 'Invert', min: 0, max: 1, step: 1, val: 0, off: 'not inverted' },
];
const P = {};
buildSliders(SLIDERS, P);
const num = (id, def) => (P.on[id] === false ? def : P[id]);

// ---------------------------------------------------------------- tone (CPU, small and soft)
const TW = 180, TH = 320, TN = TW * TH;
const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
const tx = tc.getContext('2d', { willReadFrequently: true });
const tone = new Float32Array(TN).fill(1), soft = new Float32Array(TN), shape = new Float32Array(TN), stmp = new Float32Array(TN);
function blurInto(dst, r) {
  dst.set(tone);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < TH; y++) { let a = 0; const o = y * TW;
      for (let x = -r; x <= r; x++) a += dst[o + Math.min(TW - 1, Math.max(0, x))];
      for (let x = 0; x < TW; x++) { stmp[o + x] = a / (2 * r + 1); a += dst[o + Math.min(TW - 1, x + r + 1)] - dst[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < TW; x++) { let a = 0;
      for (let y = -r; y <= r; y++) a += stmp[Math.min(TH - 1, Math.max(0, y)) * TW + x];
      for (let y = 0; y < TH; y++) { dst[y * TW + x] = a / (2 * r + 1); a += stmp[Math.min(TH - 1, y + r + 1) * TW + x] - stmp[Math.max(0, y - r) * TW + x]; } }
  }
}
let toneReady = false, upload = false;
function updateTone() {
  drawCover(tx, TW, TH);
  const d = tx.getImageData(0, 0, TW, TH).data, k = toneReady ? 1 - LOOK.smooth : 1;
  for (let i = 0; i < TN; i++) tone[i] += ((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255 - tone[i]) * k;
  blurInto(soft, Math.max(1, Math.round(LOOK.flipSoft / (OW / TW) / 2)));
  blurInto(shape, Math.max(1, Math.round(SHAPE_PX / (OW / TW) / 2)));
  toneReady = true; upload = true;
}

// ---------------------------------------------------------------- shader
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D toneT, softT, shapeT;
uniform vec2 res;
uniform float sp, wid, ang, evo, useAlpha, bp, wp, bs, ws, inv;
const float THIN = ${LOOK.thin.toFixed(3)}, AMP = ${LOOK.amp.toFixed(3)}, LEN = ${LOOK.len.toFixed(3)}, VAR = ${LOOK.variation.toFixed(3)};
const float FLIP = ${LOOK.flip.toFixed(3)}, CON = ${LOOK.con.toFixed(3)}, BRI = ${LOOK.bri.toFixed(3)};
float h21(vec2 q) { q = fract(q * vec2(127.1, 311.7)); q += dot(q, q + 34.53); return fract(q.x * q.y); }
float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 q) { float s = 0.0, a = 0.5, n = 0.0;
  for (int k = 0; k < 3; k++) { s += a * vnoise(q + float(k) * 17.31 + evo * 0.3); n += a; q *= 2.03; a *= 0.5; }
  return s / n - 0.5; }
void main() {
  vec2 px = uv * res;
  // [Lines]
  vec2 t = vec2(cos(ang), -sin(ang)), nrm = vec2(-t.y, t.x);
  float w = AMP * sin(6.2831853 * dot(px, t) / LEN + evo + VAR * 6.2831853 * fbm(px / LEN));
  float sd = clamp((0.5 - texture(softT, uv).r) * 2.0 * CON, -1.0, 1.0);   // the wave turns over between dark and light
  w *= mix(1.0, sd, FLIP);
  float phi = (dot(px, nrm) + w) / sp;
  float g = length(vec2(dFdx(phi), dFdy(phi))) + 1e-5;
  float d = abs(fract(phi + 0.5) - 0.5) / g;
  float dk = clamp((0.5 - texture(toneT, uv).r) * CON + 0.5 - BRI, 0.0, 1.0);
  float hw = 0.5 * wid * mix(THIN, 1.0, dk);
  float inkv = hw < 0.05 ? 0.0 : 1.0 - smoothstep(hw - 0.6, hw + 0.6, d);
  // [Alpha] AE Extract on the luminance: transparent below Black Point and above White Point, feathered by the softness
  float L = texture(shapeT, uv).r * 255.0, aa = fwidth(L) + 1e-3;
  float lo = smoothstep(bp - bs - aa, bp, L);
  float hi = 1.0 - smoothstep(wp, wp + ws + aa, L);
  float a = lo * hi; if (inv > 0.5) a = 1.0 - a;
  if (useAlpha > 0.5) inkv *= a;
  o = vec4(mix(vec3(1.0), vec3(0.07), inkv), 1.0);
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
const U = {}; for (const n of ['toneT', 'softT', 'shapeT', 'res', 'sp', 'wid', 'ang', 'evo', 'useAlpha', 'bp', 'wp', 'bs', 'ws', 'inv']) U[n] = gl.getUniformLocation(pr, n);
const tex = (unit, name) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U[name], unit); return t; };
const T = { tone: tex(0, 'toneT'), soft: tex(1, 'softT'), shape: tex(2, 'shapeT') };
let evoT = 0, lastT = performance.now();
function render(withAlpha = true) {
  const now = performance.now(); evoT += (now - lastT) / 1000 * LOOK.drift; lastT = now;
  if (upload) {
    for (const [k, unit, arr] of [['tone', 0, tone], ['soft', 1, soft], ['shape', 2, shape]]) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, T[k]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, arr);
    }
    upload = false;
  }
  gl.uniform2f(U.res, OW, OH); gl.uniform1f(U.sp, num('flsp', 15)); gl.uniform1f(U.wid, num('flw', 0.6)); gl.uniform1f(U.ang, num('fla', 0) * Math.PI / 180);
  gl.uniform1f(U.evo, evoT * 6.2831853); gl.uniform1f(U.useAlpha, withAlpha ? 1 : 0);
  gl.uniform1f(U.bp, num('xbp', 0)); gl.uniform1f(U.wp, num('xwp', 255)); gl.uniform1f(U.bs, num('xbs', 0)); gl.uniform1f(U.ws, num('xws', 0)); gl.uniform1f(U.inv, num('xinv', 0));
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------------------------------------------------------- nodes: live thumbnails, wires; click = that node's settings
const nodeView = $('#nodes');
nodeView.innerHTML = `<svg class="wires"><path id="w1"/><path id="w2"/></svg>
  <div class="node" id="nLines" data-grp="Lines"><b>Lines</b><canvas width="90" height="160"></canvas></div>
  <div class="node" id="nAlpha" data-grp="Alpha (Extract)"><b>Alpha (Extract)</b><canvas width="90" height="160"></canvas></div>
  <div class="node out" id="nOut"><b>Out = lines x alpha</b><canvas width="90" height="160"></canvas></div>`;
const thumb = (id) => $('#' + id + ' canvas').getContext('2d');
const acv = document.createElement('canvas'); acv.width = TW; acv.height = TH; const acx = acv.getContext('2d'), aimg = acx.createImageData(TW, TH);
const ext = (L) => {                                       // the same Extract as the shader, for the thumbnail (black = lines show)
  const bp = num('xbp', 0), wp = num('xwp', 255), bs = num('xbs', 0), ws = num('xws', 0);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-3, b - a))); return t * t * (3 - 2 * t); };
  const a = (bs > 0 ? ss(bp - bs, bp, L) : L >= bp ? 1 : 0) * (ws > 0 ? 1 - ss(wp, wp + ws, L) : L <= wp ? 1 : 0);
  return num('xinv', 0) > 0.5 ? 1 - a : a;
};
let lastThumb = 0;
function nodeThumbs() {
  if (nodeView.hidden || performance.now() - lastThumb < 250) return; lastThumb = performance.now();
  // keep the graph off the picture: while editing it sits in the free space right of the picture (if there is room)
  const sr = $('#stage').getBoundingClientRect(), room = innerWidth - $('#settings').offsetWidth - 32 - sr.right;
  nodeView.style.left = document.body.classList.contains('editing') && room > nodeView.offsetWidth + 16 ? (sr.right + 16) + 'px' : '';
  thumb('nOut').drawImage(canvas, 0, 0, 90, 160);
  render(false); thumb('nLines').drawImage(canvas, 0, 0, 90, 160); render(true);
  for (let i = 0; i < TN; i++) { const v = (1 - ext(shape[i] * 255)) * 255; aimg.data[i * 4] = aimg.data[i * 4 + 1] = aimg.data[i * 4 + 2] = v; aimg.data[i * 4 + 3] = 255; }
  acx.putImageData(aimg, 0, 0); thumb('nAlpha').drawImage(acv, 0, 0, 90, 160);
  const r = nodeView.getBoundingClientRect(), pt = (el, right) => { const b = el.getBoundingClientRect(); return [right ? b.right - r.left : b.left - r.left, b.top - r.top + b.height / 2]; };
  const o = pt($('#nOut'), false);
  for (const [w, n] of [['w1', 'nLines'], ['w2', 'nAlpha']]) { const p = pt($('#' + n), true); $('#' + w).setAttribute('d', `M${p[0]},${p[1]} C${p[0] + 30},${p[1]} ${o[0] - 30},${o[1]} ${o[0]},${o[1]}`); }
}
// the Edit panel shows the selected node's sliders only
document.body.classList.add('nodeedit');
function selectNode(grp) {
  for (const h of document.querySelectorAll('#sliders h2.grp')) { h.hidden = true; h.nextElementSibling.hidden = !h.textContent.startsWith(grp); }
  $('#setHead').textContent = 'Edit: ' + grp;
  for (const n of nodeView.querySelectorAll('.node[data-grp]')) n.classList.toggle('sel', n.dataset.grp === grp);
}
for (const n of nodeView.querySelectorAll('.node[data-grp]')) n.onclick = () => { selectNode(n.dataset.grp); if (!document.body.classList.contains('editing')) $('#setbtn').click(); };
selectNode('Lines');
$('#nodebtn').onclick = () => { nodeView.hidden = !nodeView.hidden; $('#nodebtn').classList.toggle('on', !nodeView.hidden); try { localStorage.setItem('genArt002.nodes', nodeView.hidden ? '0' : '1'); } catch {} };
nodeView.hidden = (() => { try { return localStorage.getItem('genArt002.nodes') === '0'; } catch { return false; } })();
$('#nodebtn').classList.toggle('on', !nodeView.hidden);

// ---------------------------------------------------------------- loop
let lastMedia = -1;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState >= 2 && vid.videoWidth && vid.currentTime !== lastMedia) { lastMedia = vid.currentTime; updateTone(); }
  if (toneReady) { render(); nodeThumbs(); }
}
$('#restart').onclick = () => { evoT = 0; };
cam.onStart = () => { lastMedia = -1; };
setInterval(() => { $('#stats').innerHTML = '<tr><td>one pixel shader</td><td>' + OW + ' x ' + OH + '</td></tr>'; }, 1000);
initDefaults('.r9');                                       // r9: two nodes, minimal sliders (v2.07)
window.__state = { P, tone, shape };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
