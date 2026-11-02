// FRACTAL LINES: levels of lines, composited by the Master.
//  Each level (Level01 .. Level06) = [Lines] + [Alpha] -> [LevelNN]:
//   [Lines]  procedural lines at one fixed Width (not by tone): a pure sine (height x sin(2 pi x / length), drifting slowly), every line the same wave
//            shifted by the master spacing, so they never bunch. Width by tone; Width, Angle, Dash length, Dash gap.
//   [Alpha]  AE Extract on the video's luminance (smoothed into clean shapes) + six grey level channels (0-5) as the matte.
//  [Master] universal values (CSS variables on :root, read with master(name)) and the output: the levels stacked like ink
//           (multiply: 1 - product of (1 - ink)), so the paper stays white and every level shows.
// [Overlay] on top of everything: the Dollar engraving (Dollar 1's layer, with its v2.02 look: soft, detailed), multiplied over
//           the picture at 'Strength'. It has its own depth model, loaded only when the overlay is on.
// + Duplicate level copies the last level into a new one (up to 6). Click a node: Edit shows that node's settings only.
import { $, vid, cam, VIEW, rows, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover } from './ui.js';
import { createDepthModel } from './depthmodel.js';

const OW = 1080, OH = 1920, MAXL = 6;
// DOLLAR 4 (?view=flines) reads the 6-level luma Map (channels per layer). DOLLAR 5 (?view=dollar5) is the same engine with the
// DEPTH map (the Depth style's model) as the Map, and an AE Extract on it per layer (black / white point + softness).
const D5 = VIEW === 'dollar5';
let depthNew = false;
let dirty = true;                                          // settings changed: upload uniforms and refresh the node thumbnails
// the fixed look of the lines (Gerry's settings, v2.00)
const LOOK = { thin: 0, amp: 86.5, len: 1090, drift: 0.06, con: 1.3, bri: 0, smooth: 0.6 };
const pad = (k) => String(k).padStart(2, '0');
const SLIDERS = [{ head: 'Master' }, { id: 'mspc', label: 'Spacing px', min: 3, max: 60, step: 0.5, val: 15, off: '15' },
  { id: 'mmot', label: 'Motion speed', min: 0, max: 0.5, step: 0.005, val: 0, off: 'still' }];   // the waves drift; 0 = still
for (let k = 1; k <= MAXL; k++) SLIDERS.push(
  { head: `Level${pad(k)} Lines` },
  { id: `l${k}w`, label: 'Width px', min: 0.3, max: 30, step: 0.1, val: 2.3, off: 'hairlines' },
  { id: `l${k}a`, label: 'Angle deg', min: -90, max: 90, step: 1, val: -6 + (k - 1) * 30, off: '0' },
  { id: `l${k}dl`, label: 'Dash length px', min: 1, max: 200, step: 0.5, val: 24, off: 'continuous lines' },
  { id: `l${k}dg`, label: 'Dash gap px', min: 0, max: 200, step: 0.5, val: 8, off: 'no gap' },
  { id: `l${k}rg`, label: 'Rough edges px', min: 0, max: 4, step: 0.05, val: 0.8, off: 'clean edges' },
  { head: `Level${pad(k)} Alpha` },
  ...(D5 ? [                                               // Extract on the depth map: the layer shows where depth is between the points
    { id: `l${k}bp`, label: 'Black point', min: 0, max: 255, step: 1, val: 0, off: '0' },
    { id: `l${k}wp`, label: 'White point', min: 0, max: 255, step: 1, val: 255, off: '255' },
    { id: `l${k}bs`, label: 'Black softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
    { id: `l${k}ws`, label: 'White softness', min: 0, max: 255, step: 1, val: 0, off: '0' },
  ] : [
    { id: `l${k}soft`, label: 'Softness % (own)', min: 0, max: 100, step: 1, val: 0, on: false, off: "uses the Map's softness" },
    { id: `l${k}inv`, label: 'Invert', min: 0, max: 1, step: 1, val: 0, off: 'not inverted' },
  ]),
);
// MAP: the one 6-level map every Alpha reads (luma -> black / white point -> smoothing -> six bands, 0 darkest .. 5 lightest)
const DEPTH_SL = [
  { id: 'dpq', label: 'Depth detail', min: 12, max: 37, step: 1, val: 22, off: 'lowest' },
  { id: 'dps', label: 'Depth smoothing', min: 0, max: 0.97, step: 0.01, val: 0.85, off: 'none' }];
if (D5) SLIDERS.push({ head: 'Map' },                     // the depth map: near = white, far = black
  ...DEPTH_SL, { id: 'msm', label: 'Smoothness px', min: 0, max: 80, step: 1, val: 8, off: 'raw (no smoothing)' });
else SLIDERS.push({ head: 'Map' },
  { id: 'mbp', label: 'Black point', min: 0, max: 255, step: 1, val: 0, off: '0' },
  { id: 'mwp', label: 'White point', min: 0, max: 255, step: 1, val: 255, off: '255' },
  { id: 'msm', label: 'Smoothness px', min: 0, max: 80, step: 1, val: 16, off: 'raw (no smoothing)' },
  { id: 'msf', label: 'Softness %', min: 0, max: 100, step: 1, val: 0, off: 'hard edges' });
// FLIP: the map cut into bands; at every band edge the sine breaks and flips direction (every level's lines)
// FLIP by DETAIL: local contrast of the image (a spot lighter or darker than its surroundings at 'Detail size'); the sine
// breaks and flips at every detail edge, so the line direction itself draws the eyes, brows, wrinkles, hair.
SLIDERS.push({ head: 'Flip' },
  { id: 'mfl', label: 'Bands', min: 2, max: 6, step: 1, val: 2, off: 'no flip' },
  { id: 'mfd', label: 'Detail size px', min: 6, max: 200, step: 1, val: 90, off: '90' },
  { id: 'mfg', label: 'Detail contrast', min: 1, max: 30, step: 0.5, val: 4.5, off: '4.5' },
  { id: 'mfx', label: 'Cross (darker details)', min: 0, max: 1, step: 1, val: 1, off: 'no cross: the turned lines replace' },
  { id: 'mft', label: 'Turn deg', min: -90, max: 90, step: 1, val: 45, off: 'no turn: only the wave flips' });   // flipped areas also turn their lines
SLIDERS.push({ head: 'Overlay' },
  { id: 'ovs', label: 'Strength', min: 0, max: 1, step: 0.01, val: 0.6, off: 'no overlay' }, ...(D5 ? [] : DEPTH_SL));   // Dollar 5: one depth model, its sliders on the Map
const P = {};
buildSliders(SLIDERS, P);
const num = (id, def) => (P.on[id] === false ? def : P[id]);
// MASTER: universal values every node reads, kept as CSS variables on :root (like the palette in css/main.css).
const root = document.documentElement;
const MASTER = { spacing: 'mspc', motion: 'mmot' };
const MDEF = { spacing: 15, motion: 0 };
const MV = {};                                             // cached copy of the CSS variables, so the frame loop never asks the browser for styles
function syncMaster() { for (const [k, id] of Object.entries(MASTER)) { MV[k] = num(id, MDEF[k]); root.style.setProperty('--' + k, String(MV[k])); } dirty = true; }
function master(k, def) { const v = MV[k]; return Number.isFinite(v) ? v : def; }
for (const id of Object.values(MASTER)) { const el = $('#' + id); el.addEventListener('input', syncMaster); el.parentElement.querySelector('.onoff input').addEventListener('change', syncMaster); }
syncMaster();

// saved with the defaults: how many levels, and each level's matte channels
const hidden = (id, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.id = id; i.value = v; i.dataset.save = ''; $('#settings').prepend(i); return i; };
const nIn = hidden('flevels', '1'), chIn = [], hfIn = [];
const hdIn = [];                                           // hide flags per level: 1 = Lines hidden, 2 = Alpha hidden, 4 = the level hidden
for (let k = 1; k <= MAXL; k++) { chIn[k] = hidden(`l${k}ch`, ''); hfIn[k] = hidden(`l${k}half`, '0'); hdIn[k] = hidden(`l${k}hide`, '0'); }   // half: lines moved half a spacing
const ovHideIn = hidden('ovhide', '0');
// SOLO / HIDE, like After Effects. Node ids: L3 (Lines of level 3), A3 (its Alpha), O3 (the level), OV (the overlay).
//  Hide always wins. With nothing soloed the Master shows every visible level (+ overlay). With anything soloed it shows only
//  the soloed nodes (several at once), each as it is: Lines = the lines alone, Alpha = the matte, Level = lines x matte.
//  Solo is a viewing tool (not saved); hides are saved with the setup.
const solo = new Set();
const hideBits = (k) => parseInt(hdIn[k].value) || 0;
const nLevels = () => Math.min(MAXL, Math.max(1, parseInt(nIn.value) || 1));

// ---------------------------------------------------------------- tone (CPU, small and soft)
const TW = 180, TH = 320, TN = TW * TH;
const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
const tx = tc.getContext('2d', { willReadFrequently: true });
const tone = new Float32Array(TN).fill(1), shape = new Float32Array(TN), stmp = new Float32Array(TN);
const fineA = new Float32Array(TN), coarseA = new Float32Array(TN), detail = new Float32Array(TN).fill(0.5);   // Flip: the detail map
function blurInto(dst, r, src = tone) {
  dst.set(src);
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
let lastSm = -1;
const dmap = new Float32Array(TN);                         // Dollar 5: the depth map at the map's size (0 far .. 1 near)
function takeDepth(M) {
  if (!M.out || !M.w) return;
  for (let y = 0, i = 0; y < TH; y++) { const sy = Math.min(M.h - 1, Math.floor((y + 0.5) * M.h / TH)) * M.w;
    for (let x = 0; x < TW; x++, i++) dmap[i] = M.out[sy + Math.min(M.w - 1, Math.floor((x + 0.5) * M.w / TW))]; }
}
function reshape() {                                       // the Map's smoothing (px of the 1080 frame) -> tone map px
  const px = num('msm', 0); lastSm = px;
  const src = D5 ? dmap : tone;
  if (px < 1) shape.set(src); else blurInto(shape, Math.max(1, Math.round(px / (OW / TW) / 2)), src);
  upload = true;
}
function updateTone() {
  drawCover(tx, TW, TH);
  const d = tx.getImageData(0, 0, TW, TH).data, k = toneReady ? 1 - LOOK.smooth : 1;
  for (let i = 0; i < TN; i++) tone[i] += ((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255 - tone[i]) * k;
  reshape(); makeDetail();
  toneReady = true; upload = true;
}
let detKey = '';
function makeDetail() {                                    // detail = 0.5 + contrast x (fine - surroundings), 0..1
  const size = num('mfd', 90), gain = num('mfg', 4.5); detKey = size + '|' + gain;
  blurInto(fineA, 1, tone); blurInto(coarseA, Math.max(1, Math.round(size / (OW / TW) / 2)), tone);
  for (let i = 0; i < TN; i++) detail[i] = Math.min(1, Math.max(0, 0.5 + gain * (fineA[i] - coarseA[i])));
  upload = true;
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
uniform sampler2D toneT, shapeT, detT;
uniform vec2 res;
uniform float sp, evo, pxs;                              // pxs: picture units per screen pixel (1 at full size, more when drawn smaller)
uniform int nL, solo, mode;                              // mode 0: all levels stacked; 1: level 'solo' lines only; 2: level 'solo' lines x alpha; 3: its alpha only; 4: blank paper
uniform int Lhide[${MAXL}];                              // 1 lines hidden, 2 alpha hidden (matte = everything), 4 level hidden
uniform int Lshow[${MAXL}];                              // what the Master shows of each level: 1 lines alone, 2 matte alone, 4 lines x matte
uniform vec4 Lp[${MAXL}];                                // width, dash length (0 = continuous), dash gap, shift (0 or 0.5 of a spacing)
uniform vec4 Lt[${MAXL}];                                // line direction (cos, -sin of the angle), worked out once on the CPU
uniform float flipN;
uniform vec2 flipR;
uniform float flipX;                                     // Flip Cross: 1 = flipped areas keep the first lines too (cross-hatch)                                      // Flip: the turn of the lines in flipped areas (cos, sin)                                     // Flip: number of bands (0 = off)
float FL = 1.0;                                          // this pixel's wave direction (+1 / -1), set in main
uniform vec3 mapP;                                       // the Map: black point, white point, softness (0..1 of half a band)
uniform float Lsoft[${MAXL}];
uniform vec4 Le[${MAXL}];                                // Dollar 5 Extract: black point, white point, black softness, white softness
const bool D5 = ${D5};                            // per level softness override (-1 = use the Map's)
uniform float Linv[${MAXL}];
uniform int Lmask[${MAXL}];                              // level channels on (bit k = grey level k), 0 = all graded
const float THIN = ${LOOK.thin.toFixed(3)}, AMP = ${LOOK.amp.toFixed(3)}, LEN = ${LOOK.len.toFixed(3)}, CON = ${LOOK.con.toFixed(3)}, BRI = ${LOOK.bri.toFixed(3)};
const float TAU = 6.2831853, K = TAU / LEN;
float band(float L, bool inv) {                          // the Map: 0 (darkest) .. 6 (lightest edge), continuous
  float t = clamp((L - mapP.x) / max(1.0, mapP.y - mapP.x), 0.0, 1.0);
  float g = (1.0 - t) * 6.0;                               // internal: 6 = darkest (channel k = floor, 5 = darkest)
  return inv ? 6.0 - g : g;
}
float alpha(int i, float L, float aa) {
  if ((Lhide[i] & 2) != 0) return 1.0;                    // Alpha hidden: fully on
  if (D5) { vec4 e = Le[i];                              // AE Extract on the depth map (aa: anti-aliasing in map units)
    return smoothstep(e.x - e.z - aa, e.x, L) * (1.0 - smoothstep(e.y, e.y + e.w + aa, L)); }
  if (Lmask[i] == 0) return 1.0; // Alpha hidden / no channel chosen: fully on
  float g = band(L, Linv[i] > 0.5);
  float s = max(Lsoft[i] < 0.0 ? mapP.z : Lsoft[i], 0.0) * 0.5 + aa;   // edge half-width in bands (+ anti-aliasing)
  float a = 0.0;
  for (int k = 0; k < 6; k++) {                          // six fully opaque channels; soft edges only where on meets off
    if (((Lmask[i] >> k) & 1) == 0) continue;
    float lo = k == 0 ? 1.0 : smoothstep(float(k) - s, float(k) + s, g);
    float hi = k == 5 ? 0.0 : smoothstep(float(k + 1) - s, float(k + 1) + s, g);
    a += lo - hi;
  }
  return clamp(a, 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y); }
float rough(vec2 px, float r) {                          // ink on paper: the edge wanders by up to r px (two scales of noise, fixed to the paper)
  return r * ((vnoise(px / 5.0) - 0.5) * 1.5 + (vnoise(px / 1.8 + 17.0) - 0.5) * 0.7);
}
float strokes(int i, vec2 px, vec2 t, float fl, vec4 p, float hw) {   // one set of lines in direction t (fl: wave direction)
  vec2 nrm = vec2(-t.y, t.x);
  float s = dot(px, t), arg = K * s + evo;
  float phi = (dot(px, nrm) + fl * AMP * sin(arg)) / sp + p.w;   // a pure sine, shifted by one spacing per line (+ half a spacing when checked)
  float g = length(nrm + (fl * AMP * K * cos(arg)) * t) / sp;    // its exact slope (no screen derivatives, so levels can be skipped)
  float rg = Lt[i].z, rn = rg > 0.0 ? rough(px, rg) : 0.0;
  float d = abs(fract(phi + 0.5) - 0.5) / g + rn;        // distance to the nearest line, picture px (+ rough edges)
  float ink = 1.0 - smoothstep(hw - 0.6 * pxs, hw + 0.6 * pxs, d);
  ink = mix(ink, clamp(2.0 * hw * g, 0.0, 1.0), smoothstep(0.3, 0.6, g * pxs));   // lines finer than the pixels: their average grey
  if (p.y > 0.0 && p.z > 0.0) {
    float per = p.y + p.z, u = mod(s, per);
    ink *= mix(smoothstep(-0.6 * pxs, 0.6 * pxs, min(u, p.y - u) - rn), p.y / per, smoothstep(1.0, 2.0, pxs / per * 2.0));
  }
  return ink;
}
float level(int i, vec2 px, float dk, float L, float aa, bool withAlpha) {
  float a = withAlpha ? alpha(i, L, aa) : 1.0;           // the matte first: where it is 0 the lines are never worked out
  if (a < 0.004) return 0.0;
  vec4 p = Lp[i];
  float hw = 0.5 * p.x;                                  // full Width wherever the matte lets the level through
  if (hw < 0.05) return 0.0;
  vec2 t = Lt[i].xy;
  if (FL > 0.0) return strokes(i, px, t, 1.0, p, hw) * a;
  // FLIPPED detail (darker than its surroundings): the wave flips and the lines turn; with Cross the turned lines are ADDED
  // to the first set (cross-hatching), so dark details get darker: contrast from the details
  vec2 tt = vec2(t.x * flipR.x - t.y * flipR.y, t.x * flipR.y + t.y * flipR.x);
  float ink = strokes(i, px, tt, -1.0, p, hw);
  if (flipX > 0.5) ink = 1.0 - (1.0 - ink) * (1.0 - strokes(i, px, t, 1.0, p, hw));
  return ink * a;
}
void main() {
  vec2 px = uv * res;
  float dk = clamp((0.5 - texture(toneT, uv).r) * CON + 0.5 - BRI, 0.0, 1.0);
  float L = texture(shapeT, uv).r * 255.0, aa = D5 ? fwidth(L) + 1e-3 : 0.5 * fwidth(band(L, false)) + 1e-3;   // anti-aliasing (map units / bands)
  // EVERY LAYER IS BLACK LINES ON WHITE (value = 1 - ink), and the Master MULTIPLIES them, like Multiply in After Effects:
  // white x anything = anything, black x anything = black, so lines of every layer show through each other.
  float dt = texture(detT, uv).r;                         // the detail map: < 0.5 darker than around, > 0.5 lighter
  float fb = flipN > 0.0 ? floor(min(dt * flipN, flipN - 0.001)) : 0.0;
  FL = mod(fb, 2.0) < 0.5 ? -1.0 : 1.0;                   // band 0 (the darker details) flips, then every other band
  float v = 1.0;
  if (mode == 0) {
    for (int i = 0; i < ${MAXL}; i++) {
      if (i >= nL || v < 0.004) break;
      int sh = Lshow[i]; if (sh == 0) continue;
      if ((sh & 4) != 0) v *= 1.0 - level(i, px, dk, L, aa, true);    // the level: lines x matte
      if ((sh & 1) != 0) v *= 1.0 - level(i, px, dk, L, aa, false);   // soloed Lines: the lines alone
      if ((sh & 2) != 0) v *= 1.0 - alpha(i, L, aa);                  // soloed Alpha: the matte (black = lines show)
    }
  }
  else if (mode == 3) v = 1.0 - alpha(solo, L, aa);
  else if (mode == 6) v = flipN > 0.0 ? (FL > 0.0 ? 1.0 : 0.0) : 1.0;   // the Flip bands: black = flipped (the darker details)
  else if (mode == 5) v = D5 ? L / 255.0 : floor(6.0 - min(5.999, band(L, false))) / 5.0;   // the Map (depth: near white)   // the Map: six greys, 0 black .. 5 white
  else if (mode == 4) v = 1.0;
  else if (mode == 2 && (Lhide[solo] & 1) != 0) v = 1.0;  // level thumbnail: its Lines are hidden
  else v = 1.0 - level(solo, px, dk, L, aa, mode == 2);
  if (pxs > 4.0) v = pow(v, 4.0);                         // node thumbnails: darker, so the shapes read at that size
  o = vec4(vec3(v), 1.0);                                 // pure black ink on pure white paper
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
const U = {}; for (const n of ['toneT', 'shapeT', 'detT', 'res', 'sp', 'evo', 'pxs', 'nL', 'solo', 'mode', 'Lp', 'Lt', 'mapP', 'flipN', 'flipR', 'flipX', 'Lsoft', 'Le', 'Linv', 'Lmask', 'Lhide', 'Lshow']) U[n] = gl.getUniformLocation(pr, n);
const tex = (unit, name) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16F, TW, TH); gl.uniform1i(U[name], unit); return t; };
const T = { tone: tex(0, 'toneT'), shape: tex(1, 'shapeT'), det: tex(2, 'detT') };
const levelMask = (k) => { let m = 0; for (const x of (chIn[k].value || '').split(',')) if (x !== '') m |= 1 << +x; return m; };
let evoT = 0, lastT = performance.now();
const uLp = new Float32Array(MAXL * 4), uLt = new Float32Array(MAXL * 4), uLs2 = new Float32Array(MAXL), uLe = new Float32Array(MAXL * 4), uLi = new Float32Array(MAXL), uLm = new Int32Array(MAXL), uLh = new Int32Array(MAXL), uLs = new Int32Array(MAXL);
gl.uniform2f(U.res, OW, OH);
function setUniforms() {                                  // only when a setting changed (dirty)
  for (let k = 1; k <= MAXL; k++) {
    const i = k - 1, ang = num(`l${k}a`, 0) * Math.PI / 180;
    uLp[i * 4] = num(`l${k}w`, 0.6); uLp[i * 4 + 1] = P.on[`l${k}dl`] === false ? 0 : P[`l${k}dl`]; uLp[i * 4 + 2] = num(`l${k}dg`, 0); uLp[i * 4 + 3] = hfIn[k].value === '1' ? 0.5 : 0;
    uLt[i * 4] = Math.cos(ang); uLt[i * 4 + 1] = -Math.sin(ang); uLt[i * 4 + 2] = num(`l${k}rg`, 0);
    if (D5) { uLe[i * 4] = num(`l${k}bp`, 0); uLe[i * 4 + 1] = num(`l${k}wp`, 255); uLe[i * 4 + 2] = num(`l${k}bs`, 0); uLe[i * 4 + 3] = num(`l${k}ws`, 0); }
    else uLs2[i] = P.on[`l${k}soft`] === false ? -1 : P[`l${k}soft`] / 100;
    uLi[i] = num(`l${k}inv`, 0); uLm[i] = levelMask(k); uLh[i] = hideBits(k); uLs[i] = showBits(k);
  }
  gl.uniform4fv(U.Lp, uLp); gl.uniform4fv(U.Lt, uLt); gl.uniform1fv(U.Lsoft, uLs2); gl.uniform1f(U.flipN, P.on.mfl === false ? 0 : P.mfl); { const a = num('mft', 0) * Math.PI / 180; gl.uniform2f(U.flipR, Math.cos(a), Math.sin(a)); gl.uniform1f(U.flipX, num('mfx', 0)); } gl.uniform4fv(U.Le, uLe); gl.uniform3f(U.mapP, num('mbp', 0), Math.max(num('mbp', 0) + 1, num('mwp', 255)), num('msf', 0) / 100);
  if (num('msm', 0) !== lastSm && toneReady) reshape();
  if (num('mfd', 90) + '|' + num('mfg', 4.5) !== detKey && toneReady) makeDetail(); gl.uniform1fv(U.Linv, uLi); gl.uniform1iv(U.Lmask, uLm); gl.uniform1iv(U.Lhide, uLh); gl.uniform1iv(U.Lshow, uLs);
  gl.uniform1f(U.sp, master('spacing', 15)); gl.uniform1i(U.nL, nLevels());
}
function render(mode = 0, solo = 0, vw = canvas.width, vh = canvas.height) {
  if (upload) {
    for (const [k, unit, arr] of [['tone', 0, tone], ['shape', 1, shape], ['det', 2, detail]]) {
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
// STUDIO layout: nodes on the left, the picture always in the centre, the settings always open on the right (stacked on phones)
const studio = true;
document.body.classList.add('studio');
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
    <div class="node master" data-grp="Master" style="grid-row:1 / span ${n + 1};grid-column:6"><b>Master</b><span id="nMasterV"></span><span class="mmode">Multiply</span><canvas id="tm" width="90" height="160"></canvas></div>
    <div class="node map" data-grp="Map" style="grid-row:${n + 1};grid-column:2"><b>${D5 ? 'Depth map' : 'Map'}${sh('MP', true)}</b><canvas id="tmap" width="${TWN}" height="${THN}"></canvas></div>
    <div class="node flip" data-grp="Flip" style="grid-row:${n + 1};grid-column:1"><b>Flip${sh('FL', true)}</b><canvas id="tflip" width="${TWN}" height="${THN}"></canvas></div>
    <button type="button" class="addlvl" style="grid-row:${n + 2};grid-column:1 / span 2;align-self:center"${n >= MAXL ? ' disabled' : ''}>+ Duplicate level</button>`;
  nodeView.innerHTML = `<div class="ngrid">${h}</div>`;
  nodeView.querySelector('.ngrid').style.gridTemplateColumns = 'auto auto 30px auto 30px auto';
  // CLICK A NODE = solo it (and edit it). Click it again: solo off. Another node: solo that one instead. Master: the full picture.
  for (const el of nodeView.querySelectorAll('.node')) el.onclick = () => {
    const id = el.querySelector('.nb')?.dataset.id;
    if (!id) solo.clear();                                // Master
    else if (solo.size === 1 && solo.has(id)) solo.clear();
    else { solo.clear(); solo.add(id); }
    if (el.dataset.grp) selectNode(el.dataset.grp);
    showFlags();
    if (!document.body.classList.contains('editing')) $('#setbtn').click();
  };
  for (const b of nodeView.querySelectorAll('.nb i')) b.onclick = (e) => { e.stopPropagation(); (b.classList.contains('so') ? toggleSolo : toggleHide)(b.parentElement.dataset.id); };
  showFlags();
  const rm = nodeView.querySelector('.rm'); if (rm) rm.onclick = (e) => { e.stopPropagation(); removeLevel(); };
  nodeView.querySelector('.addlvl').onclick = addLevel;
  if (!nodeView.querySelector(`[data-grp="${selected}"]`)) selected = 'Level01 Lines';
  selectNode(selected); dirty = true; wiresKey = '';
}
// solo / hide buttons on every node
const sh = (id, noHide) => `<span class="nb" data-id="${id}"><i class="so" title="Solo: show only this node">Solo</i>${noHide ? '' : '<i class="hd" title="Hide this node">Hide</i>'}</span>`;
const nodeEl = (id) => nodeView.querySelector(`.nb[data-id="${id}"]`)?.closest('.node');
const isHidden = (id) => id === 'MP' || id === 'FL' ? false : id === 'OV' ? ovHideIn.value === '1' : !!(hideBits(+id.slice(1)) & { L: 1, A: 2, O: 4 }[id[0]]);
function toggleHide(id) {
  if (id === 'OV') { ovHideIn.value = isHidden(id) ? '0' : '1'; ovHideIn.dispatchEvent(new Event('input')); }
  else { const k = +id.slice(1); hdIn[k].value = String(hideBits(k) ^ { L: 1, A: 2, O: 4 }[id[0]]); hdIn[k].dispatchEvent(new Event('input')); }
}
function toggleSolo(id) { if (solo.has(id)) solo.delete(id); else solo.add(id); showFlags(); }
function showBits(k) {                                    // what the Master shows of level k (hide always wins)
  if (k > nLevels()) return 0;
  const hb = hideBits(k);
  if (!solo.size) return hb & 5 ? 0 : 4;
  return (solo.has('L' + k) && !(hb & 1) ? 1 : 0) | (solo.has('A' + k) && !(hb & 2) ? 2 : 0) | (solo.has('O' + k) && !(hb & 5) ? 4 : 0);
}
function showFlags() {
  for (const b of nodeView.querySelectorAll('.nb')) {
    const id = b.dataset.id, el = b.closest('.node');
    el.classList.toggle('hid', isHidden(id)); el.classList.toggle('solo', solo.has(id));
    b.querySelector('.so').classList.toggle('on', solo.has(id)); b.querySelector('.hd')?.classList.toggle('on', isHidden(id));
  }
  nodeView.classList.toggle('soloing', solo.size > 0); wiresKey = '';
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
  for (const key of D5 ? ['w', 'a', 'dl', 'dg', 'rg', 'bp', 'wp', 'bs', 'ws'] : ['w', 'a', 'dl', 'dg', 'rg', 'soft', 'inv']) {
    const a = rows[`l${n}${key}`], b = rows[`l${n + 1}${key}`];
    b.rng.max = a.rng.max; b.mx.value = a.rng.max; b.rng.value = a.rng.value; b.rng.dispatchEvent(new Event('input'));
    if (b.cb.checked !== a.cb.checked) b.cb.click();
  }
  chIn[n + 1].value = chIn[n].value; chIn[n + 1].dispatchEvent(new Event('input'));
  hfIn[n + 1].value = hfIn[n].value; hfIn[n + 1].dispatchEvent(new Event('input'));
  hdIn[n + 1].value = hdIn[n].value; hdIn[n + 1].dispatchEvent(new Event('input'));
  nIn.value = String(n + 1); selected = `Level${pad(n + 1)} Lines`; buildNodes();
}
function removeLevel() { const n = nLevels(); if (n <= 1) return; for (const t of 'LAO') solo.delete(t + n); nIn.value = String(n - 1); buildNodes(); }
nIn.addEventListener('input', buildNodes);                // Set default restores the level count through this field

// thumbnails: small renders (the shader at a small viewport), copied from the bottom-left corner of the canvas.
// Refreshed only when something changed (a setting, a new video frame), at most ~3 times a second, and in the same
// frame as the main picture, which is drawn last, so it never costs an extra full render.
const grab = (id, w, h) => { const c = document.getElementById(id); if (c) c.getContext('2d').drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, w, h); };
const aimg = new ImageData(TWN, THN);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-3, b - a))); return t * t * (3 - 2 * t); };
const mapBand = (sv, inv) => {                           // the Map, as in the shader: 0 .. 6, 6 = darkest edge
  const bp = num('mbp', 0), wp = Math.max(bp + 1, num('mwp', 255)), t = Math.min(1, Math.max(0, (sv * 255 - bp) / (wp - bp))), g = (1 - t) * 6;
  return inv ? 6 - g : g;
};
function alphaThumb(k) {                                 // the same matte as the shader (black = lines show), at node size
  const inv = num(`l${k}inv`, 0) > 0.5, lm = levelMask(k), d = aimg.data;
  const bp = num(`l${k}bp`, 0), wp = num(`l${k}wp`, 255), bs = num(`l${k}bs`, 0), ws = num(`l${k}ws`, 0);
  const s = (P.on[`l${k}soft`] === false ? num('msf', 0) : P[`l${k}soft`]) / 100 * 0.5 + 0.02;
  for (let y = 0, i = 0; y < THN; y++) { const row = Math.floor((y + 0.5) * TH / THN) * TW;
    for (let x = 0; x < TWN; x++, i += 4) {
      let a = 1;
      if (D5 && !(hideBits(k) & 2)) {                     // Extract on the depth map
        const L = shape[row + Math.floor((x + 0.5) * TW / TWN)] * 255;
        a = (bs > 0 ? ss(bp - bs, bp, L) : L >= bp ? 1 : 0) * (ws > 0 ? 1 - ss(wp, wp + ws, L) : L <= wp ? 1 : 0);
      } else if (!D5 && lm && !(hideBits(k) & 2)) {
        const g = mapBand(shape[row + Math.floor((x + 0.5) * TW / TWN)], inv); a = 0;
        for (let c = 0; c < 6; c++) if ((lm >> c) & 1) a += (c === 0 ? 1 : ss(c - s, c + s, g)) - (c === 5 ? 0 : ss(c + 1 - s, c + 1 + s, g));
        a = Math.min(1, Math.max(0, a));
      }
      d[i] = d[i + 1] = d[i + 2] = (1 - a) * 255; d[i + 3] = 255;
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
  render(5, 0, TWN, THN); grab('tmap', TWN, THN);
  render(6, 0, TWN, THN); grab('tflip', TWN, THN);
  render(0, 0, 90, 160); grab('tm', 90, 160);
  const tov = document.getElementById('tov'), tm = document.getElementById('tm');
  if (ovOn()) { ovx.drawImage(ovCanvas, 0, 0, 216, 384); }    // shrink in two steps (1080 -> 216 -> node) so the fine lines average to grey instead of aliasing
  if (tov) { const c = tov.getContext('2d'); c.imageSmoothingQuality = 'high'; c.fillStyle = '#fff'; c.fillRect(0, 0, TWN, THN); if (ovLoaded) c.drawImage(ovSmall, 0, 0, TWN, THN); }   // its last picture, also while hidden (dimmed)
  if (tm && ovOn()) { const c = tm.getContext('2d'); c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'multiply'; c.globalAlpha = num('ovs', 0); c.drawImage(ovSmall, 0, 0, 90, 160); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
  $('#nMasterV').textContent = 'spacing ' + master('spacing', 15) + ' px' + (master('motion', 0) > 0 ? ' · motion ' + master('motion', 0) : '');
}
function layoutNodes() {                                 // the panel's place and its wires, redrawn only when something moved
  if (nodeView.hidden) return;
  if (studio) { layoutWires(); return; }
  const sr = $('#stage').getBoundingClientRect(), room = innerWidth - $('#settings').offsetWidth - 32 - sr.right;
  nodeView.style.left = document.body.classList.contains('editing') && room > nodeView.offsetWidth + 16 ? (sr.right + 16) + 'px' : '';
  layoutWires();
}
function layoutWires() {
  const g = nodeView.querySelector('.ngrid'); if (!g) return;
  // fit the graph to its column: scale it down (never up), and cancel the empty space the scale leaves
  const z = Math.min(1, (nodeView.clientWidth - 24) / g.offsetWidth);
  const r = g.getBoundingClientRect(), key = nodeView.clientWidth + '|' + P.on.mfl + '|' + [r.width, r.height, nLevels(), [...solo].join(), hdIn.map((x) => x.value).join(), ovHideIn.value].join('|');
  if (key === wiresKey) return; wiresKey = key;
  g.style.transform = z < 1 ? `scale(${z})` : ''; g.style.marginRight = (z - 1) * g.offsetWidth + 'px'; g.style.marginBottom = (z - 1) * g.offsetHeight + 'px';
  const r2 = g.getBoundingClientRect();
  const pt = (el, right) => { const b = el.getBoundingClientRect(); return [((right ? b.right : b.left) - r2.left) / z, (b.top - r2.top + b.height / 2) / z]; };
  const curve = (p, q, off) => `<path${off ? ' class="dash"' : ''} d="M${p[0]},${p[1]} C${p[0] + 18},${p[1]} ${q[0] - 18},${q[1]} ${q[0]},${q[1]}"/>`;
  const m = pt(nodeView.querySelector('.master'), false), n = nLevels(); let w = '';
  for (let k = 1; k <= n; k++) {
    const out = nodeView.querySelector(`[data-out="${k}"]`), o = pt(out, false);
    w += curve(pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Lines"]`), true), o, isHidden('L' + k)) + curve(pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Alpha"]`), true), o, isHidden('A' + k));
    w += curve(pt(out, true), m, !showBits(k));            // dashed: this level does not reach the Master
  }
  w += curve(pt(nodeView.querySelector('[data-grp="Overlay"]'), true), m, !ovOn());
  // the Map feeds every Alpha: a bus up the gap left of the Alpha column, a short tap into each Alpha
  const mp = nodeView.querySelector('.node.map'), mb = mp.getBoundingClientRect(), bx = (mb.left - r2.left) / z - 4, by = (mb.top - r2.top + mb.height / 2) / z;
  let bus = `M${(mb.left - r2.left) / z},${by} L${bx},${by}`, top = by;
  for (let k = 1; k <= n; k++) { const a = pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Alpha"]`), false); top = Math.min(top, a[1]); bus += ` M${bx},${a[1]} L${a[0]},${a[1]}`; }
  w += `<path class="bus" d="${bus} M${bx},${by} L${bx},${top}"/>`;
  // the Flip feeds every Lines node: a bus up their left side
  const fe = nodeView.querySelector('.node.flip').getBoundingClientRect(), fx = (fe.left - r2.left) / z - 5, fy = (fe.top - r2.top + fe.height / 2) / z;
  let fbus = `M${fx + 5},${fy} L${fx},${fy}`, ftop = fy;
  for (let k = 1; k <= n; k++) { const l = pt(nodeView.querySelector(`[data-grp="Level${pad(k)} Lines"]`), false); ftop = Math.min(ftop, l[1]); fbus += ` M${fx},${l[1]} L${l[0]},${l[1]}`; }
  w += `<path class="fbus${P.on.mfl === false ? ' dash' : ''}" d="${fbus} M${fx},${fy} L${fx},${ftop}"/>`;
  nodeView.querySelector('.wires').innerHTML = w;
}
setInterval(layoutNodes, 250);                           // cheap: two layout reads, the SVG only when the size changed
addEventListener('resize', () => { wiresKey = ''; });
$('#nodebtn').onclick = () => { nodeView.hidden = !nodeView.hidden; dirty = true; wiresKey = ''; $('#nodebtn').classList.toggle('on', !nodeView.hidden); try { localStorage.setItem('genArt002.nodes', nodeView.hidden ? '0' : '1'); } catch {} };
nodeView.hidden = (() => { try { return localStorage.getItem('genArt002.nodes') === '0'; } catch { return false; } })();
$('#nodebtn').classList.toggle('on', !nodeView.hidden);

// ---------------------------------------------------------------- level channels: six grey buttons per level (like RGB channels; Dollar 4 only)
for (let k = 1; k <= (D5 ? 0 : MAXL); k++) {
  const row = document.createElement('div'); row.className = 'chanrow';
  row.innerHTML = '<span class="lab">Levels as matte</span><span class="chans">' +
    // labels: 0 = darkest .. 5 = lightest (left to right). Stored values keep the internal index k (5 = darkest), so saved setups are unchanged.
    [0, 1, 2, 3, 4, 5].map((j) => { const k = 5 - j; return `<button type="button" data-k="${k}" style="--g:${Math.round(255 - k * 255 / 5)}"><i></i>${j}</button>`; }).join('') + '</span>';
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
let lastMedia = -1, lastDraw = 0, frames = 0, drawMs = 0, fresh = true;
const FRAME_MS = 1000 / 30 - 2;
function loop(now) {
  requestAnimationFrame(loop);
  if (vid.readyState >= 2 && vid.videoWidth && vid.currentTime !== lastMedia) { lastMedia = vid.currentTime; updateTone(); thumbDirty = true; fresh = true; }
  if (D5 && depthNew) { depthNew = false; takeDepth(DM.M); reshape(); thumbDirty = true; fresh = true; }   // a new depth map
  if (!toneReady || now - lastDraw < FRAME_MS) return;
  const speed = master('motion', 0);                      // Master > Motion speed (0 = still)
  if (!fresh && !dirty && !thumbDirty && speed <= 0) { lastT = now; return; }   // nothing changed: no redraw at all
  const t0 = performance.now();
  evoT += Math.min(0.1, (now - lastT) / 1000) * speed; lastT = now; lastDraw = now; fresh = false;
  gl.uniform1f(U.evo, evoT * 6.2831853);
  if (dirty) { setUniforms(); dirty = false; thumbDirty = true; }
  nodeThumbs(now);
  if (solo.has('FL')) render(6);                         // the Flip soloed: its bands
  else if (solo.has('MP')) render(5);                         // the Map soloed: its six greys
  else render(0);                                        // the full picture (solo / hide applied), always last
  frames++; drawMs += performance.now() - t0;
}
$('#restart').onclick = () => { evoT = 0; dirty = true; };
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
const ovOn = () => P.on.ovs !== false && P.ovs > 0 && ovHideIn.value !== '1' && (!solo.size || solo.has('OV'));   // visible: worked out only then
const DM = createDepthModel((id, def) => (id === 'dpw' ? 0 : id in P ? (P.on[id] === false ? -1 : P[id]) : def), () => { depthNew = true; });
let ovLoaded = false;
function ovStyle() { ovCanvas.style.opacity = ovOn() ? num('ovs', 0) : 0; if (ovOn() && !ovLoaded) { ovLoaded = true; DM.load(); } thumbDirty = true; }
// the look Gerry liked (v2.02): the engraving's own defaults; depth detail 22, smoothing 0.85, strength 0.6
window.__dollarOverlay = { canvas: ovCanvas, dm: DM, on: ovOn, defaults: null };
await import('./engrave.js?b=' + (document.querySelector('meta[name=build]')?.content || 0));
for (const ev of ['input', 'change']) $('#settings').addEventListener(ev, () => setTimeout(ovStyle), true);   // capture (restored settings too), read after the slider has updated
if (D5) { ovLoaded = true; DM.load(); }                    // Dollar 5: the depth map is the Map, always on
setInterval(() => { if ((D5 || ovOn()) && DM.M.ready && !DM.M.busy && vid.readyState >= 2) DM.infer(); }, 100);   // depth for the overlay, only while it is on
nodeView.hidden = false;
if (!document.body.classList.contains('editing')) $('#setbtn').click();
buildNodes();
initDefaults('.r13');
ovStyle();                                      // r13: levels (Level01..06) into the Master (v2.13)
window.__state = { P, tone, shape, nLevels, addLevel, removeLevel, canvas, LOOK, solo };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
