// FRACTAL LINES: levels of lines, composited by the Master.
//  Each level (Level01 .. Level06) = [Lines] + [Alpha] -> [LevelNN]:
//   [Lines]  procedural lines: a pure sine (height x sin(2 pi x / length), drifting slowly), every line the same wave
//            shifted by the master spacing, so they never bunch. Width by tone; Width, Angle, Dash length, Dash gap.
//   [Alpha]  AE Extract on the video's luminance (smoothed into clean shapes) + six grey level channels (0-5) as the matte.
//  [Master] universal values (CSS variables on :root, read with master(name)) and the output: the levels stacked like ink
//           (multiply: 1 - product of (1 - ink)), so the paper stays white and every level shows.
// + Duplicate level copies the last level into a new one (up to 6). Click a node: Edit shows that node's settings only.
import { $, vid, cam, rows, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';

const OW = 1080, OH = 1920, MAXL = 6;
// the fixed look of the lines (Gerry's settings, v2.00)
const LOOK = { thin: 0, amp: 86.5, len: 1090, drift: 0.06, con: 1.3, bri: 0, smooth: 0.6 };
const SHAPE_PX = 16;                                       // the alpha's shapes are smoothed this much, so they are clean
const pad = (k) => String(k).padStart(2, '0');
const SLIDERS = [{ head: 'Master' }, { id: 'mspc', label: 'Spacing px', min: 3, max: 60, step: 0.5, val: 15, off: '15' }];
for (let k = 1; k <= MAXL; k++) SLIDERS.push(
  { head: `Level${pad(k)} Lines` },
  { id: `l${k}w`, label: 'Width px', min: 0.3, max: 30, step: 0.1, val: 2.3, off: 'hairlines' },
  { id: `l${k}a`, label: 'Angle deg', min: -90, max: 90, step: 1, val: -6 + (k - 1) * 30, off: '0' },
  { id: `l${k}dl`, label: 'Dash length px', min: 1, max: 200, step: 0.5, val: 24, off: 'continuous lines' },
  { id: `l${k}dg`, label: 'Dash gap px', min: 0, max: 200, step: 0.5, val: 8, off: 'no gap' },
  { head: `Level${pad(k)} Alpha` },
  { id: `l${k}bp`, label: 'Black Point', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: `l${k}wp`, label: 'White Point', min: 0, max: 255, step: 1, val: 255, off: '255' },
  { id: `l${k}bs`, label: 'Black Softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: `l${k}ws`, label: 'White Softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: `l${k}inv`, label: 'Invert', min: 0, max: 1, step: 1, val: 0, off: 'not inverted' },
);
const P = {};
buildSliders(SLIDERS, P);
const num = (id, def) => (P.on[id] === false ? def : P[id]);
// MASTER: universal values every node reads, kept as CSS variables on :root (like the palette in css/main.css).
const root = document.documentElement;
const MASTER = { spacing: 'mspc' };
function syncMaster() { for (const [k, id] of Object.entries(MASTER)) root.style.setProperty('--' + k, String(num(id, 15))); }
function master(k, def) { const v = parseFloat(getComputedStyle(root).getPropertyValue('--' + k)); return Number.isFinite(v) ? v : def; }
for (const id of Object.values(MASTER)) { const el = $('#' + id); el.addEventListener('input', syncMaster); el.parentElement.querySelector('.onoff input').addEventListener('change', syncMaster); }
syncMaster();

// saved with the defaults: how many levels, and each level's matte channels
const hidden = (id, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.id = id; i.value = v; i.dataset.save = ''; $('#settings').prepend(i); return i; };
const nIn = hidden('flevels', '1'), chIn = [];
for (let k = 1; k <= MAXL; k++) chIn[k] = hidden(`l${k}ch`, '');
const nLevels = () => Math.min(MAXL, Math.max(1, parseInt(nIn.value) || 1));

// ---------------------------------------------------------------- tone (CPU, small and soft)
const TW = 180, TH = 320, TN = TW * TH;
const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
const tx = tc.getContext('2d', { willReadFrequently: true });
const tone = new Float32Array(TN).fill(1), shape = new Float32Array(TN), stmp = new Float32Array(TN);
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
  blurInto(shape, Math.max(1, Math.round(SHAPE_PX / (OW / TW) / 2)));
  toneReady = true; upload = true;
}

// ---------------------------------------------------------------- shader: all levels in one pass
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D toneT, shapeT;
uniform vec2 res;
uniform float sp, evo;
uniform int nL, solo, mode;                              // mode 0: all levels stacked; 1: level 'solo' lines only; 2: level 'solo' lines x alpha
uniform vec4 Lp[${MAXL}];                                // width, angle (rad), dash length (0 = continuous), dash gap
uniform vec4 Le[${MAXL}];                                // Extract: black point, white point, black softness, white softness
uniform float Linv[${MAXL}];
uniform int Lmask[${MAXL}];                              // level channels on (bit k = grey level k), 0 = all graded
const float THIN = ${LOOK.thin.toFixed(3)}, AMP = ${LOOK.amp.toFixed(3)}, LEN = ${LOOK.len.toFixed(3)}, CON = ${LOOK.con.toFixed(3)}, BRI = ${LOOK.bri.toFixed(3)};
float level(int i, vec2 px, float dk, float L, float aa, bool withAlpha) {
  vec4 p = Lp[i];
  vec2 t = vec2(cos(p.y), -sin(p.y)), nrm = vec2(-t.y, t.x);
  float phi = (dot(px, nrm) + AMP * sin(6.2831853 * dot(px, t) / LEN + evo)) / sp;   // a pure sine, shifted by one spacing per line
  float g = length(vec2(dFdx(phi), dFdy(phi))) + 1e-5;
  float d = abs(fract(phi + 0.5) - 0.5) / g;
  float hw = 0.5 * p.x * mix(THIN, 1.0, dk);
  float ink = hw < 0.05 ? 0.0 : 1.0 - smoothstep(hw - 0.6, hw + 0.6, d);
  if (p.z > 0.0 && p.w > 0.0) { float per = p.z + p.w, u = mod(dot(px, t), per); ink *= smoothstep(-0.6, 0.6, min(u, p.z - u)); }
  if (!withAlpha) return ink;
  vec4 e = Le[i];
  float a = smoothstep(e.x - e.z - aa, e.x, L) * (1.0 - smoothstep(e.y, e.y + e.w + aa, L));   // AE Extract
  float g6 = (1.0 - L / 255.0) * 6.0;
  if (Linv[i] > 0.5) { a = 1.0 - a; g6 = 6.0 - g6; }
  int k = clamp(int(floor(g6)), 0, 5);
  float gq = Lmask[i] == 0 ? float(k) / 5.0 : float((Lmask[i] >> k) & 1);
  return ink * a * gq;
}
void main() {
  vec2 px = uv * res;
  float dk = clamp((0.5 - texture(toneT, uv).r) * CON + 0.5 - BRI, 0.0, 1.0);
  float L = texture(shapeT, uv).r * 255.0, aa = fwidth(L) + 1e-3;
  float ink = 0.0;
  if (mode == 0) { for (int i = 0; i < ${MAXL}; i++) { if (i >= nL) break; ink = 1.0 - (1.0 - ink) * (1.0 - level(i, px, dk, L, aa, true)); } }
  else ink = level(solo, px, dk, L, aa, mode == 2);
  o = vec4(mix(vec3(1.0), vec3(0.07), ink), 1.0);
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
const U = {}; for (const n of ['toneT', 'shapeT', 'res', 'sp', 'evo', 'nL', 'solo', 'mode', 'Lp', 'Le', 'Linv', 'Lmask']) U[n] = gl.getUniformLocation(pr, n);
const tex = (unit, name) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U[name], unit); return t; };
const T = { tone: tex(0, 'toneT'), shape: tex(1, 'shapeT') };
const levelMask = (k) => { let m = 0; for (const x of (chIn[k].value || '').split(',')) if (x !== '') m |= 1 << +x; return m; };
let evoT = 0, lastT = performance.now();
function setUniforms() {
  const Lp = new Float32Array(MAXL * 4), Le = new Float32Array(MAXL * 4), Li = new Float32Array(MAXL), Lm = new Int32Array(MAXL);
  for (let k = 1; k <= MAXL; k++) {
    const i = k - 1;
    Lp.set([num(`l${k}w`, 0.6), num(`l${k}a`, 0) * Math.PI / 180, P.on[`l${k}dl`] === false ? 0 : P[`l${k}dl`], num(`l${k}dg`, 0)], i * 4);
    Le.set([num(`l${k}bp`, 0), num(`l${k}wp`, 255), num(`l${k}bs`, 0), num(`l${k}ws`, 0)], i * 4);
    Li[i] = num(`l${k}inv`, 0); Lm[i] = levelMask(k);
  }
  gl.uniform4fv(U.Lp, Lp); gl.uniform4fv(U.Le, Le); gl.uniform1fv(U.Linv, Li); gl.uniform1iv(U.Lmask, Lm);
  gl.uniform2f(U.res, OW, OH); gl.uniform1f(U.sp, master('spacing', 15)); gl.uniform1f(U.evo, evoT * 6.2831853); gl.uniform1i(U.nL, nLevels());
}
function render(mode = 0, solo = 0, vw = OW, vh = OH) {
  if (upload) {
    for (const [k, unit, arr] of [['tone', 0, tone], ['shape', 1, shape]]) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, T[k]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, arr);
    }
    upload = false;
  }
  gl.uniform1i(U.mode, mode); gl.uniform1i(U.solo, solo);
  gl.viewport(0, 0, vw, vh); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------------------------------------------------------- nodes: per level [Lines] [Alpha] -> [LevelNN]; all levels -> [Master]
const nodeView = $('#nodes'), TWN = 54, THN = 96;
document.body.classList.add('nodeedit');
let selected = 'Level01 Lines';
function buildNodes() {
  const n = nLevels();
  let h = '<svg class="wires"></svg>';
  for (let k = 1; k <= n; k++) {
    const L = 'Level' + pad(k);
    h += `<div class="node" data-grp="${L} Lines" style="grid-row:${k};grid-column:1"><b>Lines</b><canvas id="tl${k}" width="${TWN}" height="${THN}"></canvas></div>
      <div class="node" data-grp="${L} Alpha" style="grid-row:${k};grid-column:2"><b>Alpha</b><canvas id="ta${k}" width="${TWN}" height="${THN}"></canvas></div>
      <div class="node out" data-out="${k}" style="grid-row:${k};grid-column:4"><b>${L}${k === n && n > 1 ? ' <i class="rm" title="Remove this level">x</i>' : ''}</b><canvas id="to${k}" width="${TWN}" height="${THN}"></canvas></div>`;
  }
  h += `<div class="node master" data-grp="Master" style="grid-row:1 / span ${n};grid-column:6"><b>Master</b><span id="nMasterV"></span><canvas id="tm" width="90" height="160"></canvas></div>
    <button type="button" class="addlvl" style="grid-row:${n + 1};grid-column:1 / span 4"${n >= MAXL ? ' disabled' : ''}>+ Duplicate level</button>`;
  nodeView.innerHTML = h;
  nodeView.style.gridTemplateColumns = 'auto auto 36px auto 36px auto';
  for (const el of nodeView.querySelectorAll('.node[data-grp]')) el.onclick = () => { selectNode(el.dataset.grp); if (!document.body.classList.contains('editing')) $('#setbtn').click(); };
  const rm = nodeView.querySelector('.rm'); if (rm) rm.onclick = (e) => { e.stopPropagation(); removeLevel(); };
  nodeView.querySelector('.addlvl').onclick = addLevel;
  if (!nodeView.querySelector(`[data-grp="${selected}"]`)) selected = 'Level01 Lines';
  selectNode(selected); lastThumb = 0;
}
function selectNode(grp) {
  selected = grp;
  for (const h of document.querySelectorAll('#sliders h2.grp')) { h.hidden = true; h.nextElementSibling.hidden = h.textContent !== grp; }
  $('#setHead').textContent = 'Edit: ' + grp;
  for (const n of nodeView.querySelectorAll('.node[data-grp]')) n.classList.toggle('sel', n.dataset.grp === grp);
}
// duplicate: the new level starts as a copy of the last one
function addLevel() {
  const n = nLevels(); if (n >= MAXL) return;
  for (const key of ['w', 'a', 'dl', 'dg', 'bp', 'wp', 'bs', 'ws', 'inv']) {
    const a = rows[`l${n}${key}`], b = rows[`l${n + 1}${key}`];
    b.rng.max = a.rng.max; b.mx.value = a.rng.max; b.rng.value = a.rng.value; b.rng.dispatchEvent(new Event('input'));
    if (b.cb.checked !== a.cb.checked) b.cb.click();
  }
  chIn[n + 1].value = chIn[n].value; chIn[n + 1].dispatchEvent(new Event('input'));
  nIn.value = String(n + 1); selected = `Level${pad(n + 1)} Lines`; buildNodes();
}
function removeLevel() { const n = nLevels(); if (n <= 1) return; nIn.value = String(n - 1); buildNodes(); }
nIn.addEventListener('input', buildNodes);                // Set default restores the level count through this field

// thumbnails: small renders (the shader at a small viewport), copied from the bottom-left corner of the canvas
const grab = (id, w, h) => { const c = document.getElementById(id); if (c) c.getContext('2d').drawImage(canvas, 0, OH - h, w, h, 0, 0, w, h); };
const acv = document.createElement('canvas'); acv.width = TW; acv.height = TH; const acx = acv.getContext('2d'), aimg = acx.createImageData(TW, TH);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-3, b - a))); return t * t * (3 - 2 * t); };
function alphaThumb(k) {                                 // the same Extract x channels as the shader (black = lines show)
  const bp = num(`l${k}bp`, 0), wp = num(`l${k}wp`, 255), bs = num(`l${k}bs`, 0), ws = num(`l${k}ws`, 0), inv = num(`l${k}inv`, 0) > 0.5, lm = levelMask(k);
  for (let i = 0; i < TN; i++) {
    const L = shape[i] * 255;
    let a = (bs > 0 ? ss(bp - bs, bp, L) : L >= bp ? 1 : 0) * (ws > 0 ? 1 - ss(wp, wp + ws, L) : L <= wp ? 1 : 0);
    let g6 = (1 - shape[i]) * 6; if (inv) { a = 1 - a; g6 = 6 - g6; }
    const kk = Math.min(5, Math.max(0, Math.floor(g6))), g = lm ? (lm >> kk) & 1 : kk / 5, v = (1 - a * g) * 255;
    aimg.data[i * 4] = aimg.data[i * 4 + 1] = aimg.data[i * 4 + 2] = v; aimg.data[i * 4 + 3] = 255;
  }
  acx.putImageData(aimg, 0, 0); const c = document.getElementById('ta' + k); if (c) c.getContext('2d').drawImage(acv, 0, 0, TWN, THN);
}
let lastThumb = 0;
function nodeThumbs() {
  if (nodeView.hidden || performance.now() - lastThumb < 300) return; lastThumb = performance.now();
  const sr = $('#stage').getBoundingClientRect(), room = innerWidth - $('#settings').offsetWidth - 32 - sr.right;
  nodeView.style.left = document.body.classList.contains('editing') && room > nodeView.offsetWidth + 16 ? (sr.right + 16) + 'px' : '';
  const n = nLevels();
  for (let k = 1; k <= n; k++) {
    render(1, k - 1, TWN, THN); grab('tl' + k, TWN, THN);
    render(2, k - 1, TWN, THN); grab('to' + k, TWN, THN);
    alphaThumb(k);
  }
  render(0, 0, 90, 160); grab('tm', 90, 160);
  render(0);                                             // the full picture again
  $('#nMasterV').textContent = 'spacing ' + master('spacing', 15) + ' px';
  // wires: Lines and Alpha -> Level, every Level -> Master
  const r = nodeView.getBoundingClientRect(), pt = (el, right) => { const b = el.getBoundingClientRect(); return [right ? b.right - r.left : b.left - r.left, b.top - r.top + b.height / 2]; };
  const curve = (p, q) => `<path d="M${p[0]},${p[1]} C${p[0] + 18},${p[1]} ${q[0] - 18},${q[1]} ${q[0]},${q[1]}"/>`;
  const m = pt(nodeView.querySelector('.master'), false); let w = '';
  for (let k = 1; k <= n; k++) {
    const out = nodeView.querySelector(`[data-out="${k}"]`), o = pt(out, false);
    w += curve(pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Lines"]`), true), o) + curve(pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Alpha"]`), true), o);
    w += curve(pt(out, true), m);
  }
  nodeView.querySelector('.wires').innerHTML = w;
}
$('#nodebtn').onclick = () => { nodeView.hidden = !nodeView.hidden; $('#nodebtn').classList.toggle('on', !nodeView.hidden); try { localStorage.setItem('genArt002.nodes', nodeView.hidden ? '0' : '1'); } catch {} };
nodeView.hidden = (() => { try { return localStorage.getItem('genArt002.nodes') === '0'; } catch { return false; } })();
$('#nodebtn').classList.toggle('on', !nodeView.hidden);

// ---------------------------------------------------------------- level channels: six grey buttons per level (like RGB channels)
for (let k = 1; k <= MAXL; k++) {
  const row = document.createElement('div'); row.className = 'chanrow';
  row.innerHTML = '<span class="lab">Levels as matte</span><span class="chans">' +
    [0, 1, 2, 3, 4, 5].map((j) => `<button type="button" data-k="${j}" style="--g:${Math.round(255 - j * 255 / 5)}"><i></i>${j}</button>`).join('') + '</span>';
  [...document.querySelectorAll('#sliders h2.grp')].find((h) => h.textContent === `Level${pad(k)} Alpha`).nextElementSibling.append(row);
  const inp = chIn[k], sel = () => new Set((inp.value || '').split(',').filter((x) => x !== '').map(Number));
  const show = () => { const s = sel(); row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', s.has(+b.dataset.k))); };
  row.querySelectorAll('button').forEach((b) => { b.onclick = () => { const s = sel(), j = +b.dataset.k; if (s.has(j)) s.delete(j); else s.add(j); inp.value = [...s].sort().join(','); show(); }; });
  inp.addEventListener('input', show); show();
}

// ---------------------------------------------------------------- loop
let lastMedia = -1;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(); evoT += (now - lastT) / 1000 * LOOK.drift; lastT = now;
  if (vid.readyState >= 2 && vid.videoWidth && vid.currentTime !== lastMedia) { lastMedia = vid.currentTime; updateTone(); }
  if (toneReady) { setUniforms(); render(0); nodeThumbs(); }
}
$('#restart').onclick = () => { evoT = 0; };
cam.onStart = () => { lastMedia = -1; };
setInterval(() => { $('#stats').innerHTML = '<tr><td>one pixel shader</td><td>' + OW + ' x ' + OH + '</td></tr>'; }, 1000);
buildNodes();
initDefaults('.r13');                                      // r13: levels (Level01..06) into the Master (v2.13)
window.__state = { P, tone, shape, nLevels, addLevel };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
