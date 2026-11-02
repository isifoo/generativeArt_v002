// FRACTAL LINES: levels of lines, composited by the Master.
//  Each level (Level01 .. Level06) = [Lines] + [Alpha] -> [LevelNN]:
//   [Lines]  procedural lines: a pure sine (height x sin(2 pi x / length), drifting slowly), every line the same wave
//            shifted by the master spacing, so they never bunch. Width by tone; Width, Angle, Dash length, Dash gap.
//   [Alpha]  AE Extract on the video's luminance (smoothed into clean shapes) + six grey level channels (0-5) as the matte.
//  [Master] universal values (CSS variables on :root, read with master(name)) and the output: the levels stacked like ink
//           (multiply: 1 - product of (1 - ink)), so the paper stays white and every level shows.
// [Overlay] on top of everything: the Dollar engraving (Dollar 1's layer, with its v2.02 look: soft, detailed), multiplied over
//           the picture at 'Strength'. It has its own depth model, loaded only when the overlay is on.
// + Duplicate level copies the last level into a new one (up to 6). Click a node: Edit shows that node's settings only.
import { $, vid, cam, rows, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';
import { createDepthModel } from './depthmodel.js';

const OW = 1080, OH = 1920, MAXL = 6;
let dirty = true;                                          // settings changed: upload uniforms and refresh the node thumbnails
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
SLIDERS.push({ head: 'Overlay' },
  { id: 'ovs', label: 'Strength', min: 0, max: 1, step: 0.01, val: 0.6, off: 'no overlay' },
  { id: 'dpq', label: 'Depth detail', min: 12, max: 37, step: 1, val: 22, off: 'lowest' },
  { id: 'dps', label: 'Depth smoothing', min: 0, max: 0.97, step: 0.01, val: 0.85, off: 'none' });
const P = {};
buildSliders(SLIDERS, P);
const num = (id, def) => (P.on[id] === false ? def : P[id]);
// MASTER: universal values every node reads, kept as CSS variables on :root (like the palette in css/main.css).
const root = document.documentElement;
const MASTER = { spacing: 'mspc' };
const MV = {};                                             // cached copy of the CSS variables, so the frame loop never asks the browser for styles
function syncMaster() { for (const [k, id] of Object.entries(MASTER)) { MV[k] = num(id, 15); root.style.setProperty('--' + k, String(MV[k])); } dirty = true; }
function master(k, def) { const v = MV[k]; return Number.isFinite(v) ? v : def; }
for (const id of Object.values(MASTER)) { const el = $('#' + id); el.addEventListener('input', syncMaster); el.parentElement.querySelector('.onoff input').addEventListener('change', syncMaster); }
syncMaster();

// saved with the defaults: how many levels, and each level's matte channels
const hidden = (id, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.id = id; i.value = v; i.dataset.save = ''; $('#settings').prepend(i); return i; };
const nIn = hidden('flevels', '1'), chIn = [], hfIn = [];
const hdIn = [];                                           // hide flags per level: 1 = Lines hidden, 2 = Alpha hidden, 4 = the level hidden
for (let k = 1; k <= MAXL; k++) { chIn[k] = hidden(`l${k}ch`, ''); hfIn[k] = hidden(`l${k}half`, '0'); hdIn[k] = hidden(`l${k}hide`, '0'); }   // half: lines moved half a spacing
const ovHideIn = hidden('ovhide', '0');
// SOLO (not saved, a viewing tool): '' or a node id: L3 (Lines of level 3), A3 (its Alpha), O3 (the level), OV (the overlay)
let solo = '';
const hideBits = (k) => parseInt(hdIn[k].value) || 0;
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
// the picture is 1080 x 1920 in its own units, drawn at the size it is shown (screen pixels, at most 1080 wide): no wasted pixels
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
function fitCanvas() {
  const w = Math.round(Math.min(OW, Math.max(360, (canvas.offsetWidth || OW) * (devicePixelRatio || 1)))), h = Math.round(w * OH / OW);
  if (w !== canvas.width) { canvas.width = w; canvas.height = h; dirty = true; }
}
new ResizeObserver(fitCanvas).observe(canvas); fitCanvas();
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D toneT, shapeT;
uniform vec2 res;
uniform float sp, evo, pxs;                              // pxs: picture units per screen pixel (1 at full size, more when drawn smaller)
uniform int nL, solo, mode;                              // mode 0: all levels stacked; 1: level 'solo' lines only; 2: level 'solo' lines x alpha; 3: its alpha only; 4: blank paper
uniform int Lhide[${MAXL}];                              // 1 lines hidden, 2 alpha hidden (matte = everything), 4 level hidden
uniform vec4 Lp[${MAXL}];                                // width, dash length (0 = continuous), dash gap, shift (0 or 0.5 of a spacing)
uniform vec4 Lt[${MAXL}];                                // line direction (cos, -sin of the angle), worked out once on the CPU
uniform vec4 Le[${MAXL}];                                // Extract: black point, white point, black softness, white softness
uniform float Linv[${MAXL}];
uniform int Lmask[${MAXL}];                              // level channels on (bit k = grey level k), 0 = all graded
const float THIN = ${LOOK.thin.toFixed(3)}, AMP = ${LOOK.amp.toFixed(3)}, LEN = ${LOOK.len.toFixed(3)}, CON = ${LOOK.con.toFixed(3)}, BRI = ${LOOK.bri.toFixed(3)};
const float TAU = 6.2831853, K = TAU / LEN;
float alpha(int i, float L, float aa) {
    if ((Lhide[i] & 2) != 0) return 1.0;                 // Alpha node hidden: no matte
    vec4 e = Le[i];
    float a;
    a = smoothstep(e.x - e.z - aa, e.x, L) * (1.0 - smoothstep(e.y, e.y + e.w + aa, L));   // AE Extract
    float g6 = (1.0 - L / 255.0) * 6.0;
    if (Linv[i] > 0.5) { a = 1.0 - a; g6 = 6.0 - g6; }
    int k = clamp(int(floor(g6)), 0, 5);
    return a * (Lmask[i] == 0 ? float(k) / 5.0 : float((Lmask[i] >> k) & 1));
}
float level(int i, vec2 px, float dk, float L, float aa, bool withAlpha) {
  float a = withAlpha ? alpha(i, L, aa) : 1.0;           // the matte first: where it is 0 the lines are never worked out
  if (a < 0.004) return 0.0;
  vec4 p = Lp[i];
  float hw = 0.5 * p.x * mix(THIN, 1.0, dk);
  if (hw < 0.05) return 0.0;
  vec2 t = Lt[i].xy, nrm = vec2(-t.y, t.x);
  float s = dot(px, t), arg = K * s + evo;
  float phi = (dot(px, nrm) + AMP * sin(arg)) / sp + p.w;   // a pure sine, shifted by one spacing per line (+ half a spacing when checked)
  float g = length(nrm + (AMP * K * cos(arg)) * t) / sp; // its exact slope (no screen derivatives, so levels can be skipped)
  float d = abs(fract(phi + 0.5) - 0.5) / g;             // distance to the nearest line, picture px
  float ink = 1.0 - smoothstep(hw - 0.6 * pxs, hw + 0.6 * pxs, d);
  ink = mix(ink, clamp(2.0 * hw * g, 0.0, 1.0), smoothstep(0.3, 0.6, g * pxs));   // lines finer than the pixels: their average grey
  if (p.y > 0.0 && p.z > 0.0) {
    float per = p.y + p.z, u = mod(s, per);
    ink *= mix(smoothstep(-0.6 * pxs, 0.6 * pxs, min(u, p.y - u)), p.y / per, smoothstep(1.0, 2.0, pxs / per * 2.0));
  }
  return ink * a;
}
void main() {
  vec2 px = uv * res;
  float dk = clamp((0.5 - texture(toneT, uv).r) * CON + 0.5 - BRI, 0.0, 1.0);
  float L = texture(shapeT, uv).r * 255.0, aa = fwidth(L) + 1e-3;
  float ink = 0.0;
  if (mode == 0) { for (int i = 0; i < ${MAXL}; i++) { if (i >= nL || ink > 0.996) break; if ((Lhide[i] & 5) != 0) continue; ink = 1.0 - (1.0 - ink) * (1.0 - level(i, px, dk, L, aa, true)); } }
  else if (mode == 3) ink = alpha(solo, L, aa);
  else if (mode == 4) ink = 0.0;
  else ink = level(solo, px, dk, L, aa, mode == 2);
  if (pxs > 4.0) ink = 1.0 - pow(1.0 - ink, 4.0);         // node thumbnails: darker, so the shapes read at that size
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
const U = {}; for (const n of ['toneT', 'shapeT', 'res', 'sp', 'evo', 'pxs', 'nL', 'solo', 'mode', 'Lp', 'Lt', 'Le', 'Linv', 'Lmask', 'Lhide']) U[n] = gl.getUniformLocation(pr, n);
const tex = (unit, name) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16F, TW, TH); gl.uniform1i(U[name], unit); return t; };
const T = { tone: tex(0, 'toneT'), shape: tex(1, 'shapeT') };
const levelMask = (k) => { let m = 0; for (const x of (chIn[k].value || '').split(',')) if (x !== '') m |= 1 << +x; return m; };
let evoT = 0, lastT = performance.now();
const uLp = new Float32Array(MAXL * 4), uLt = new Float32Array(MAXL * 4), uLe = new Float32Array(MAXL * 4), uLi = new Float32Array(MAXL), uLm = new Int32Array(MAXL), uLh = new Int32Array(MAXL);
gl.uniform2f(U.res, OW, OH);
function setUniforms() {                                  // only when a setting changed (dirty)
  for (let k = 1; k <= MAXL; k++) {
    const i = k - 1, ang = num(`l${k}a`, 0) * Math.PI / 180;
    uLp[i * 4] = num(`l${k}w`, 0.6); uLp[i * 4 + 1] = P.on[`l${k}dl`] === false ? 0 : P[`l${k}dl`]; uLp[i * 4 + 2] = num(`l${k}dg`, 0); uLp[i * 4 + 3] = hfIn[k].value === '1' ? 0.5 : 0;
    uLt[i * 4] = Math.cos(ang); uLt[i * 4 + 1] = -Math.sin(ang);
    uLe[i * 4] = num(`l${k}bp`, 0); uLe[i * 4 + 1] = num(`l${k}wp`, 255); uLe[i * 4 + 2] = num(`l${k}bs`, 0); uLe[i * 4 + 3] = num(`l${k}ws`, 0);
    uLi[i] = num(`l${k}inv`, 0); uLm[i] = levelMask(k); uLh[i] = hideBits(k);
  }
  gl.uniform4fv(U.Lp, uLp); gl.uniform4fv(U.Lt, uLt); gl.uniform4fv(U.Le, uLe); gl.uniform1fv(U.Linv, uLi); gl.uniform1iv(U.Lmask, uLm); gl.uniform1iv(U.Lhide, uLh);
  gl.uniform1f(U.sp, master('spacing', 15)); gl.uniform1i(U.nL, nLevels());
}
function render(mode = 0, solo = 0, vw = canvas.width, vh = canvas.height) {
  if (upload) {
    for (const [k, unit, arr] of [['tone', 0, tone], ['shape', 1, shape]]) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, T[k]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, TH, gl.RED, gl.FLOAT, arr);
    }
    upload = false;
  }
  gl.uniform1i(U.mode, mode); gl.uniform1i(U.solo, solo); gl.uniform1f(U.pxs, OW / vw);
  gl.viewport(0, 0, vw, vh); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------------------------------------------------------- nodes: per level [Lines] [Alpha] -> [LevelNN]; all levels -> [Master]
const nodeView = $('#nodes'), TWN = 54, THN = 96, OV_TONE = 'Overlay Dollar: Tone (contrast map)';
document.body.classList.add('nodeedit');
let selected = 'Level01 Lines';
function buildNodes() {
  const n = nLevels();
  let h = '<svg class="wires"></svg>';
  for (let k = 1; k <= n; k++) {
    const L = 'Level' + pad(k);
    h += `<div class="node" data-grp="${L} Lines" style="grid-row:${k};grid-column:1"><b>Lines${sh('L' + k)}</b><canvas id="tl${k}" width="${TWN}" height="${THN}"></canvas></div>
      <div class="node" data-grp="${L} Alpha" style="grid-row:${k};grid-column:2"><b>Alpha${sh('A' + k)}</b><canvas id="ta${k}" width="${TWN}" height="${THN}"></canvas></div>
      <div class="node out" data-out="${k}" style="grid-row:${k};grid-column:4"><b>${L}${sh('O' + k)}${k === n && n > 1 ? ' <i class="rm" title="Remove this level">x</i>' : ''}</b><canvas id="to${k}" width="${TWN}" height="${THN}"></canvas></div>`;
  }
  h += `<div class="node" data-grp="Overlay" style="grid-row:${n + 1};grid-column:4"><b>Overlay${sh('OV')}</b><canvas id="tov" width="${TWN}" height="${THN}"></canvas></div>
    <div class="node master" data-grp="Master" style="grid-row:1 / span ${n + 1};grid-column:6"><b>Master</b><span id="nMasterV"></span><canvas id="tm" width="90" height="160"></canvas></div>
    <button type="button" class="addlvl" style="grid-row:${n + 1};grid-column:1 / span 2;align-self:center"${n >= MAXL ? ' disabled' : ''}>+ Duplicate level</button>`;
  nodeView.innerHTML = h;
  nodeView.style.gridTemplateColumns = 'auto auto 36px auto 36px auto';
  for (const el of nodeView.querySelectorAll('.node[data-grp]')) el.onclick = () => { selectNode(el.dataset.grp); if (!document.body.classList.contains('editing')) $('#setbtn').click(); };
  for (const b of nodeView.querySelectorAll('.nb i')) b.onclick = (e) => { e.stopPropagation(); (b.classList.contains('so') ? toggleSolo : toggleHide)(b.parentElement.dataset.id); };
  showFlags();
  const rm = nodeView.querySelector('.rm'); if (rm) rm.onclick = (e) => { e.stopPropagation(); removeLevel(); };
  nodeView.querySelector('.addlvl').onclick = addLevel;
  if (!nodeView.querySelector(`[data-grp="${selected}"]`)) selected = 'Level01 Lines';
  selectNode(selected); dirty = true; wiresKey = '';
}
// solo / hide buttons on every node
const sh = (id) => `<span class="nb" data-id="${id}"><i class="so" title="Solo: show only this node">S</i><i class="hd" title="Hide this node">H</i></span>`;
const nodeEl = (id) => nodeView.querySelector(`.nb[data-id="${id}"]`)?.closest('.node');
const isHidden = (id) => id === 'OV' ? ovHideIn.value === '1' : !!(hideBits(+id.slice(1)) & { L: 1, A: 2, O: 4 }[id[0]]);
function toggleHide(id) {
  if (id === 'OV') { ovHideIn.value = isHidden(id) ? '0' : '1'; ovHideIn.dispatchEvent(new Event('input')); }
  else { const k = +id.slice(1); hdIn[k].value = String(hideBits(k) ^ { L: 1, A: 2, O: 4 }[id[0]]); hdIn[k].dispatchEvent(new Event('input')); }
}
function toggleSolo(id) { solo = solo === id ? '' : id; showFlags(); }
function showFlags() {
  for (const b of nodeView.querySelectorAll('.nb')) {
    const id = b.dataset.id, el = b.closest('.node');
    el.classList.toggle('hid', isHidden(id)); el.classList.toggle('solo', solo === id);
    b.querySelector('.so').classList.toggle('on', solo === id); b.querySelector('.hd').classList.toggle('on', isHidden(id));
  }
  nodeView.classList.toggle('soloing', !!solo);
  dirty = true; if (typeof ovStyle === 'function') ovStyle();
}
for (const inp of [...hdIn.slice(1), ovHideIn]) inp.addEventListener('input', showFlags);   // restored settings too
function selectNode(grp) {
  selected = grp;
  // the Overlay node shows its own group and the engraving's tone group (the rest of the engraving keeps its v2.02 values)
  const show = (t) => t === grp || (grp === 'Overlay' && t === OV_TONE);
  for (const h of document.querySelectorAll('#sliders h2.grp')) { h.hidden = true; h.nextElementSibling.hidden = !show(h.textContent); }
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
  hfIn[n + 1].value = hfIn[n].value; hfIn[n + 1].dispatchEvent(new Event('input'));
  hdIn[n + 1].value = hdIn[n].value; hdIn[n + 1].dispatchEvent(new Event('input'));
  nIn.value = String(n + 1); selected = `Level${pad(n + 1)} Lines`; buildNodes();
}
function removeLevel() { const n = nLevels(); if (n <= 1) return; nIn.value = String(n - 1); buildNodes(); }
nIn.addEventListener('input', buildNodes);                // Set default restores the level count through this field

// thumbnails: small renders (the shader at a small viewport), copied from the bottom-left corner of the canvas.
// Refreshed only when something changed (a setting, a new video frame), at most ~3 times a second, and in the same
// frame as the main picture, which is drawn last, so it never costs an extra full render.
const grab = (id, w, h) => { const c = document.getElementById(id); if (c) c.getContext('2d').drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, w, h); };
const aimg = new ImageData(TWN, THN);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-3, b - a))); return t * t * (3 - 2 * t); };
function alphaThumb(k) {                                 // the same Extract x channels as the shader (black = lines show), at node size
  const bp = num(`l${k}bp`, 0), wp = num(`l${k}wp`, 255), bs = num(`l${k}bs`, 0), ws = num(`l${k}ws`, 0), inv = num(`l${k}inv`, 0) > 0.5, lm = levelMask(k), d = aimg.data;
  for (let y = 0, i = 0; y < THN; y++) { const row = Math.floor((y + 0.5) * TH / THN) * TW;
    for (let x = 0; x < TWN; x++, i += 4) {
      const sv = shape[row + Math.floor((x + 0.5) * TW / TWN)], L = sv * 255;
      let a = (bs > 0 ? ss(bp - bs, bp, L) : L >= bp ? 1 : 0) * (ws > 0 ? 1 - ss(wp, wp + ws, L) : L <= wp ? 1 : 0);
      let g6 = (1 - sv) * 6; if (inv) { a = 1 - a; g6 = 6 - g6; }
      const kk = Math.min(5, Math.max(0, Math.floor(g6))), g = lm ? (lm >> kk) & 1 : kk / 5;
      d[i] = d[i + 1] = d[i + 2] = (1 - a * g) * 255; d[i + 3] = 255;
    } }
  const c = document.getElementById('ta' + k); if (c) c.getContext('2d').putImageData(aimg, 0, 0);
}
let lastThumb = 0, thumbDirty = true, wiresKey = '';
function nodeThumbs(now) {
  if (nodeView.hidden || !thumbDirty || now - lastThumb < 330) return;
  lastThumb = now; thumbDirty = false;
  const n = nLevels();
  for (let k = 1; k <= n; k++) {
    render(1, k - 1, TWN, THN); grab('tl' + k, TWN, THN);
    render(2, k - 1, TWN, THN); grab('to' + k, TWN, THN);
    alphaThumb(k);
  }
  render(0, 0, 90, 160); grab('tm', 90, 160);
  const tov = document.getElementById('tov'), tm = document.getElementById('tm');
  if (ovOn()) { ovx.drawImage(ovCanvas, 0, 0, 216, 384); }    // shrink in two steps (1080 -> 216 -> node) so the fine lines average to grey instead of aliasing
  if (tov) { const c = tov.getContext('2d'); c.imageSmoothingQuality = 'high'; c.fillStyle = '#fff'; c.fillRect(0, 0, TWN, THN); if (ovOn()) c.drawImage(ovSmall, 0, 0, TWN, THN); }
  if (tm && ovOn()) { const c = tm.getContext('2d'); c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'multiply'; c.globalAlpha = num('ovs', 0); c.drawImage(ovSmall, 0, 0, 90, 160); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
  $('#nMasterV').textContent = 'spacing ' + master('spacing', 15) + ' px';
}
function layoutNodes() {                                 // the panel's place and its wires, redrawn only when something moved
  if (nodeView.hidden) return;
  const sr = $('#stage').getBoundingClientRect(), room = innerWidth - $('#settings').offsetWidth - 32 - sr.right;
  nodeView.style.left = document.body.classList.contains('editing') && room > nodeView.offsetWidth + 16 ? (sr.right + 16) + 'px' : '';
  const r = nodeView.getBoundingClientRect(), key = [r.width, r.height, nLevels()].join();
  if (key === wiresKey) return; wiresKey = key;
  const pt = (el, right) => { const b = el.getBoundingClientRect(); return [right ? b.right - r.left : b.left - r.left, b.top - r.top + b.height / 2]; };
  const curve = (p, q) => `<path d="M${p[0]},${p[1]} C${p[0] + 18},${p[1]} ${q[0] - 18},${q[1]} ${q[0]},${q[1]}"/>`;
  const m = pt(nodeView.querySelector('.master'), false), n = nLevels(); let w = '';
  for (let k = 1; k <= n; k++) {
    const out = nodeView.querySelector(`[data-out="${k}"]`), o = pt(out, false);
    w += curve(pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Lines"]`), true), o) + curve(pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Alpha"]`), true), o);
    w += curve(pt(out, true), m);
  }
  w += curve(pt(nodeView.querySelector('[data-grp="Overlay"]'), true), m);
  nodeView.querySelector('.wires').innerHTML = w;
}
setInterval(layoutNodes, 250);                           // cheap: two layout reads, the SVG only when the size changed
addEventListener('resize', () => { wiresKey = ''; });
$('#nodebtn').onclick = () => { nodeView.hidden = !nodeView.hidden; dirty = true; wiresKey = ''; $('#nodebtn').classList.toggle('on', !nodeView.hidden); try { localStorage.setItem('genArt002.nodes', nodeView.hidden ? '0' : '1'); } catch {} };
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
  row.querySelectorAll('button').forEach((b) => { b.onclick = () => { const s = sel(), j = +b.dataset.k; if (s.has(j)) s.delete(j); else s.add(j); inp.value = [...s].sort().join(','); show(); dirty = true; }; });
  inp.addEventListener('input', show); show();
}

// ---------------------------------------------------------------- half-spacing shift: one checkbox per level (in its Lines node)
for (let k = 1; k <= MAXL; k++) {
  const row = document.createElement('label'); row.className = 'chanrow halfrow';
  row.innerHTML = '<input type="checkbox"> <span class="lab">Shift half a spacing (lines in the middle of the original ones)</span>';
  [...document.querySelectorAll('#sliders h2.grp')].find((h) => h.textContent === `Level${pad(k)} Lines`).nextElementSibling.append(row);
  const cb = row.querySelector('input'), inp = hfIn[k];
  cb.onchange = () => { inp.value = cb.checked ? '1' : '0'; dirty = true; };
  inp.addEventListener('input', () => { cb.checked = inp.value === '1'; dirty = true; });
}

// ---------------------------------------------------------------- loop
// Draws only when there is something new: a video frame, a changed setting, or the slow drift (capped at 30 per second).
for (const ev of ['input', 'change']) $('#settings').addEventListener(ev, () => { dirty = true; }, true);
let lastMedia = -1, lastDraw = 0, frames = 0, drawMs = 0;
const FRAME_MS = 1000 / 30 - 2;
function loop(now) {
  requestAnimationFrame(loop);
  if (vid.readyState >= 2 && vid.videoWidth && vid.currentTime !== lastMedia) { lastMedia = vid.currentTime; updateTone(); thumbDirty = true; }
  if (!toneReady || now - lastDraw < FRAME_MS) return;
  const t0 = performance.now();
  evoT += Math.min(0.1, (now - lastT) / 1000) * LOOK.drift; lastT = now; lastDraw = now;
  gl.uniform1f(U.evo, evoT * 6.2831853);
  if (dirty) { setUniforms(); dirty = false; thumbDirty = true; }
  nodeThumbs(now);
  if (!solo) render(0);                                  // the full picture, always last
  else if (solo === 'OV') render(4);                       // overlay alone: blank paper under it
  else render({ L: 1, A: 3, O: 2 }[solo[0]], +solo.slice(1) - 1);
  frames++; drawMs += performance.now() - t0;
}
$('#restart').onclick = () => { evoT = 0; };
cam.onStart = () => { lastMedia = -1; };
setInterval(() => {
  $('#stats').innerHTML = `<tr><td>drawn at</td><td>${canvas.width} x ${canvas.height}</td></tr><tr><td>frames / s</td><td>${frames}</td></tr><tr><td>CPU per frame</td><td>${frames ? (drawMs / frames).toFixed(1) : '-'} ms</td></tr>`;
  frames = 0; drawMs = 0;
}, 1000);
// ---------------------------------------------------------------- overlay: the Dollar engraving on top (multiply), with its own depth model
const ovCanvas = document.createElement('canvas');
ovCanvas.style.cssText = 'mix-blend-mode:multiply;pointer-events:none;opacity:0';
canvas.after(ovCanvas);
const ovSmall = document.createElement('canvas'); ovSmall.width = 216; ovSmall.height = 384; const ovx = ovSmall.getContext('2d'); ovx.imageSmoothingQuality = 'high';
const ovOn = () => P.on.ovs !== false && P.ovs > 0 && ovHideIn.value !== '1';
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : id in P ? (P.on[id] === false ? -1 : P[id]) : def), () => {});
let ovLoaded = false;
function ovStyle() { ovCanvas.style.opacity = !ovOn() || (solo && solo !== 'OV') ? 0 : solo === 'OV' ? 1 : num('ovs', 0); if (ovOn() && !ovLoaded) { ovLoaded = true; DM.load(); } thumbDirty = true; }
// the look Gerry liked (v2.02): the engraving's own defaults; depth detail 22, smoothing 0.85, strength 0.6
window.__dollarOverlay = { canvas: ovCanvas, dm: DM, on: ovOn, defaults: null };
await import('./engrave.js?b=' + (document.querySelector('meta[name=build]')?.content || 0));
for (const ev of ['input', 'change']) $('#settings').addEventListener(ev, () => setTimeout(ovStyle), true);   // capture (restored settings too), read after the slider has updated
setInterval(() => { if (ovOn() && DM.M.ready && !DM.M.busy && vid.readyState >= 2) DM.infer(); }, 100);   // depth for the overlay, only while it is on
buildNodes();
initDefaults('.r13');
ovStyle();                                      // r13: levels (Level01..06) into the Master (v2.13)
window.__state = { P, tone, shape, nLevels, addLevel, canvas };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
