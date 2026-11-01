// DOLLAR (banknote engraving): the video drawn the way a banknote engraver cuts a portrait, as one pixel shader.
// The engraver's rules, as math:
//  1. Line families. Each family is a phase field phi(p); its lines sit where phi is a whole number. For a pixel, the distance to
//     the nearest line in px is |fract(phi + .5) - .5| / |grad phi|; inside the line's half-width it is ink.
//  2. Tone = coverage. The half-width is set so the ink covers the darkness of the spot. When lines grow wider than the gaps,
//     the paper between them becomes thin white lines on black: the inversion happens by itself.
//  3. Layers. Light tones: one family. Darker: a second family crossing at an angle (lozenges). Darkest: a third.
//  4. Depth bends the lines (they wrap around forms like contour engraving) and splits subject from background;
//     the background gets its own straight (horizontal) lines at a different spacing.
//  5. Light areas: lines break into dashes and dots. Mid tones: a dot in the middle of each lozenge.
//  6. Organic: slow wobble of the line paths, ink bleed roughness on the edges, a slight weight change per line.
//  7. Optional outline where depth jumps (the silhouette).
// Inputs: a tone map (video, levels + local contrast + curve, CPU, 270 x 480) and the depth map (depthmodel.js). Ink / paper = palette.
// v1.81: tuned against a close-up of the $100 Franklin portrait: tone reproduction within ~5 points per tone band (38% ink vs 38%).
import { $, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover, getPalette, onPalette } from './ui.js';
import { createDepthModel, MODELS, OW, OH } from './depthmodel.js';

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Tone (contrast map)' },
  { id: 'enlo', label: 'Levels clip %', min: 0, max: 20, step: 0.5, val: 1, off: 'raw video' },
  { id: 'enl', label: 'Local contrast', min: 0, max: 4, step: 0.05, val: 0.5, off: 'global tone only' },
  { id: 'enc', label: 'Contrast', min: 0.2, max: 4, step: 0.01, val: 1.1, off: '1' },
  { id: 'enb', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0, off: '0' },
  { id: 'enmi', label: 'Minimum ink', min: 0, max: 0.4, step: 0.01, val: 0.08, off: 'bare paper in the light areas' },
  { id: 'enpw', label: 'Paper white', min: 0.5, max: 1, step: 0.005, val: 0.985, off: 'no bare paper (1)' },
  { id: 'ent', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.5, off: 'none' },
  { head: 'Lines (measured on the $100 portrait)' },
  { id: 'ensp', label: 'Line spacing px', min: 3, max: 40, step: 0.1, val: 13, off: '13' },
  { id: 'ena', label: 'Angle deg', min: -90, max: 90, step: 0.5, val: 40, off: '0' },
  { id: 'enx', label: 'Cross angle deg', min: 20, max: 90, step: 0.5, val: 62, off: 'no cross lines' },
  { id: 'enw', label: 'Line weight', min: 0.3, max: 2, step: 0.01, val: 1, off: '1' },
  { id: 'en2', label: 'Cross lines from', min: 0.1, max: 0.95, step: 0.01, val: 0.6, off: 'never: one direction only' },
  { id: 'en3', label: 'Third lines from', min: 0.3, max: 1, step: 0.01, val: 0.9, off: 'never' },
  { head: 'Curves and density (driven by contrast)' },
  { id: 'enft', label: 'Flow with the light', min: 0, max: 30, step: 0.1, val: 1.4, off: 'no bending by tone' },
  { id: 'enfr', label: 'Flow smoothness px', min: 4, max: 160, step: 1, val: 48, off: '48' },
  { id: 'endn', label: 'Denser in the darks', min: 0, max: 1.5, step: 0.01, val: 0.25, off: 'same spacing everywhere' },
  { head: 'Dashes (optional: the light skin as short dashes)' },
  { id: 'endw', label: 'Mark thickness', min: 0.08, max: 0.7, step: 0.01, val: 0.24, off: 'hairlines: tone sets the width only' },
  { id: 'enmd', label: 'Shortest dash', min: 0.05, max: 0.9, step: 0.01, val: 0.25, off: '0.25' },
  { id: 'entp', label: 'Dash taper', min: 0, max: 1, step: 0.01, val: 0.85, off: 'square ends' },
  { head: 'Depth' },
  { id: 'dpq', label: 'Model detail', min: 12, max: 37, step: 1, val: 18, off: 'lowest' },
  { id: 'dpw', label: 'Second model weight', min: 0, max: 1, step: 0.01, val: 0.5, off: 'first model only' },
  { id: 'dps', label: 'Depth smoothing', min: 0, max: 0.97, step: 0.01, val: 0.85, off: 'none' },
  { id: 'enbd', label: 'Depth bends lines', min: 0, max: 40, step: 0.5, val: 6, off: 'straight lines' },
  { id: 'ensu', label: 'Subject depth', min: 0, max: 1, step: 0.01, val: 0.45, off: 'no background split' },
  { id: 'enbg', label: 'Background spacing', min: 0.3, max: 3, step: 0.01, val: 0.85, off: 'same as subject' },
  { id: 'enba', label: 'Background angle', min: -90, max: 90, step: 0.5, val: 0, off: '0 (horizontal)' },
  { id: 'enol', label: 'Outline', min: 0, max: 3, step: 0.05, val: 0.6, off: 'no outline' },
  { head: 'Organic' },
  { id: 'enwb', label: 'Wobble px', min: 0, max: 6, step: 0.05, val: 0.7, off: 'ruler straight' },
  { id: 'enws', label: 'Wobble scale px', min: 10, max: 400, step: 1, val: 140, off: '140' },
  { id: 'enr', label: 'Ink roughness', min: 0, max: 1, step: 0.01, val: 0.3, off: 'clean edges' },
  { id: 'env', label: 'Line weight variety', min: 0, max: 0.6, step: 0.01, val: 0.12, off: 'every line the same' },
  { id: 'enh', label: 'Hairline px', min: 0, max: 2, step: 0.05, val: 0.5, off: 'lines vanish in the highlights' },
];
const P = {};
const val = buildSliders(SLIDERS, P);
// continuous lines by default (lines, thicker lines, then crossing lines): the dash option starts off
document.querySelector('#endw').parentElement.querySelector('.onoff input').click();
const num = (id, def) => (val(id) < 0 && P.on[id] === false ? def : P[id]);   // value, or the default when its box is off
const offv = (id) => P.on[id] === false;

// ---------------------------------------------------------------- tone map (CPU): levels, local contrast, contrast, brightness
const TW = 270, TH = 480, TN = TW * TH;
const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
const tx = tc.getContext('2d', { willReadFrequently: true });
const tone = new Float32Array(TN).fill(1), gray = new Float32Array(TN), mean = new Float32Array(TN), tmp = new Float32Array(TN);
const flow = new Float32Array(TN).fill(1);                    // a soft copy of the tone: the lines curve along it and pack closer where it is dark
let toneReady = false, toneMs = 0, dirty = true;
function boxBlur(src, dst, r) {
  for (let y = 0; y < TH; y++) { let a = 0; const row = y * TW;
    for (let x = -r; x <= r; x++) a += src[row + Math.min(TW - 1, Math.max(0, x))];
    for (let x = 0; x < TW; x++) { tmp[row + x] = a / (2 * r + 1); a += src[row + Math.min(TW - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < TW; x++) { let a = 0;
    for (let y = -r; y <= r; y++) a += tmp[Math.min(TH - 1, Math.max(0, y)) * TW + x];
    for (let y = 0; y < TH; y++) { dst[y * TW + x] = a / (2 * r + 1); a += tmp[Math.min(TH - 1, y + r + 1) * TW + x] - tmp[Math.max(0, y - r) * TW + x]; } }
}
function updateTone() {
  const t0 = performance.now();
  drawCover(tx, TW, TH);
  const d = tx.getImageData(0, 0, TW, TH).data, hist = new Uint32Array(256);
  for (let i = 0; i < TN; i++) { const g = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); gray[i] = g; hist[g]++; }
  let lo = 0, hi = 255;
  if (!offv('enlo')) { const c = P.enlo / 100; let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a > TN * c) { lo = i; break; } } a = 0; for (let i = 255; i >= 0; i--) { a += hist[i]; if (a > TN * c) { hi = i; break; } } }
  if (hi - lo < 16) { const m = (hi + lo) / 2; lo = m - 8; hi = m + 8; }
  for (let i = 0; i < TN; i++) gray[i] = Math.min(1, Math.max(0, (gray[i] - lo) / (hi - lo)));
  const loc = offv('enl') ? 0 : P.enl, con = offv('enc') ? 1 : P.enc, br = offv('enb') ? 0 : P.enb, k = toneReady && !dirty ? 1 - (offv('ent') ? 0 : P.ent) : 1;
  if (loc > 0) boxBlur(gray, mean, 20);
  for (let i = 0; i < TN; i++) {
    let t = gray[i]; if (loc > 0) t += loc * (t - mean[i]);
    t = (t - 0.5) * con + 0.5 + br; t = Math.min(1, Math.max(0, t));
    tone[i] += (t - tone[i]) * k;
  }
  boxBlur(tone, flow, Math.max(1, Math.round(num('enfr', 48) / 4)));   // flow smoothness px (output) -> tone map px
  boxBlur(flow, flow, Math.max(1, Math.round(num('enfr', 48) / 4)));
  toneReady = true; dirty = false; uploadTone = true; toneMs = performance.now() - t0;
}

// ---------------------------------------------------------------- depth (shared model)
let uploadDepth = false;
const DM = createDepthModel((id, def) => (P.on[id] === undefined ? def : val(id)), () => { uploadDepth = true; });
const M = DM.M;

// ---------------------------------------------------------------- the engraving shader (WebGL2)
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D toneT, flowT, depT, depPrevT;
uniform float hasDepth, bt;
uniform vec2 res;
uniform float sp, angA, angX, l3, weight, xFrom;         // lines; xFrom: darkness where the cross lines start
uniform float flowAmt, dens;                             // curves and density by contrast
uniform float dw, minDash, taper;                        // dashes: mark thickness, shortest dash, taper
uniform float bend, subj, bgSp, bgAng, outline;          // depth
uniform float wob, wobS, rough, vari, hair;              // organic
uniform float minInk, pwhite;
uniform vec3 ink, paper;

float h21(vec2 q) { q = fract(q * vec2(127.1, 311.7)); q += dot(q, q + 34.53); return fract(q.x * q.y); }
float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 q) { return vnoise(q) * 0.6 + vnoise(q * 2.03 + 7.1) * 0.3 + vnoise(q * 4.1 + 3.3) * 0.1; }
float depthAt(vec2 u) { return hasDepth > 0.5 ? mix(texture(depPrevT, u).r, texture(depT, u).r, bt) : 0.5; }

// One line family, with the other family as its lattice.
//  phi : this family's phase (lines at whole numbers);  psi : the crossing family's phase (cuts the line into dashes)
//  f   : the ink this family must lay down (share of its cell)
// The banknote rule, measured on the $100 portrait: in the light tones the marks are short BOLD dashes of nearly fixed
// thickness (dw of the spacing) and the tone sets their LENGTH (down to dots); once a dash is as long as its cell the
// line is continuous, and only then does the tone make it THICKER, until the paper is left as white lozenges.
float family(float phi, float psi, float f, vec2 px, float id) {
  if (f <= 0.001) return 0.0;
  float g = length(vec2(dFdx(phi), dFdy(phi))) + 1e-5;   // lines per px
  float dpx = abs(fract(phi + 0.5) - 0.5) / g;           // px to the line centre
  float spx = 1.0 / g;
  float w = 1.0 + vari * (h21(vec2(floor(phi + 0.5), id)) - 0.5) * 2.0;
  float L = clamp(f / dw, minDash, 1.0);                  // dash length (share of the cell between two crossings)
  float wid = min(max(dw, f) * w, 0.74);                   // thickness (share of the spacing): fixed until the dash is full; capped so the darks keep white lozenges
  if (L < 1.0) wid = dw * w * clamp(f / (dw * minDash), 0.25, 1.0);   // below the shortest dash: smaller dots
  float a = (fract(psi) - 0.5) / (0.5 * L);              // -1 .. 1 along the dash
  float prof = L >= 0.999 ? 1.0 : (abs(a) >= 1.0 ? 0.0 : mix(1.0, sqrt(max(0.0, 1.0 - a * a)), taper));   // pointed ends
  float hw = max(0.5 * spx * clamp(wid, 0.0, 1.0) * prof, hair * prof);
  float n = (fbm(px * 0.35 + id * 13.0) - 0.5) * rough * 1.6;   // ink bleed
  return 1.0 - smoothstep(hw - 0.6 + n, hw + 0.6 + n, dpx);
}

void main() {
  vec2 px = uv * res;
  float t = texture(toneT, uv).r;                         // tone: 0 dark .. 1 light
  float tf = texture(flowT, uv).r;                        // soft tone: the lines flow along it
  float dk = mix(minInk, 1.0, 1.0 - t) * (1.0 - smoothstep(pwhite, min(1.0, pwhite + 0.03), t));
  float d = depthAt(uv);
  float s = subj < 0.0 ? 1.0 : smoothstep(subj - 0.04, subj + 0.04, d);
  vec2 pw = px + (vec2(fbm(px / wobS), fbm(px / wobS + 17.3)) - 0.5) * wob * 2.0;

  // curves and density by contrast: the phase is warped by the soft tone (lines bend around light and dark shapes, the
  // way they wrap the cheek and the eye) and by depth, and scaled up where the soft tone is dark (lines pack closer)
  float k = 1.0 + dens * (1.0 - tf);                      // density: more lines per px in the darks
  float warp = flowAmt * (1.0 - tf) + bend * d;           // in lines
  vec2 tA = vec2(cos(angA), -sin(angA)), nA = vec2(-tA.y, tA.x);
  vec2 tB = vec2(cos(angA + angX), -sin(angA + angX)), nB = vec2(-tB.y, tB.x);
  vec2 tC = vec2(cos(angA + angX * 0.5 + 1.5708), -sin(angA + angX * 0.5 + 1.5708)), nC = vec2(-tC.y, tC.x);
  float phiA = dot(pw, nA) / sp * k + warp;
  float phiB = dot(pw, nB) / sp * k - warp * 0.8;
  float phiC = dot(pw, nC) / (sp * 1.2) * k + warp * 0.5;

  // the darkness is shared by the two crossing families; dashes join into lines at 'join'; the third family only in the darkest
  // the darkness is shared by the two crossing families (B a little lighter); the third family only in the darkest
  // the tone scale: lines, then thicker lines (one direction carries the ink alone), then for the darkest a second
  // direction crosses them (from 'cross lines from'); the third direction only at the very darkest
  float fA = clamp(dk * weight * 0.86, 0.0, 0.74);
  float fB = angX > 0.0 && xFrom < 1.0 ? clamp((dk - xFrom) / max(1.0 - xFrom, 0.05), 0.0, 1.0) * 0.62 * weight : 0.0;
  float fC = l3 < 1.0 ? clamp((dk - l3) / max(1.0 - l3, 0.05), 0.0, 1.0) * 0.35 * weight : 0.0;
  float inkS = max(family(phiA, phiB, fA, pw, 1.0), family(phiB, phiA, fB, pw, 2.0));
  inkS = max(inkS, family(phiC, phiA + 0.5, fC, pw, 3.0));

  // background: straight lines at their own angle and spacing, crossing lines in the darker parts
  vec2 tG = vec2(cos(bgAng), -sin(bgAng)), nG = vec2(-tG.y, tG.x);
  float phiG = dot(pw, nG) / (sp * bgSp), phiH = dot(pw, tG) / (sp * bgSp);
  float inkB = max(family(phiG, phiH, clamp(dk * weight * 0.75, 0.0, 1.0), pw, 4.0),
                   family(phiH, phiG, clamp((dk - 0.5) * 1.6 * weight, 0.0, 1.0) * 0.8, pw, 5.0));

  float inkv = mix(inkB, inkS, s);
  if (outline > 0.0 && hasDepth > 0.5) {
    float e = length(vec2(dFdx(d), dFdy(d))) * res.y * 0.02;
    inkv = max(inkv, smoothstep(0.25, 0.6, e * outline));
  }
  o = vec4(mix(paper, ink, clamp(inkv, 0.0, 1.0)), 1.0);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(s); document.querySelector('#msg').textContent = 'Shader: ' + m; console.error(m); }
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); return p;
}
const pr = prog(VS, FS); gl.useProgram(pr);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const U = {};
for (const n of ['toneT', 'flowT', 'depT', 'depPrevT', 'hasDepth', 'bt', 'res', 'sp', 'angA', 'angX', 'l3', 'weight', 'xFrom', 'flowAmt', 'dens', 'dw', 'minDash', 'taper', 'bend', 'subj', 'bgSp', 'bgAng', 'outline', 'wob', 'wobS', 'rough', 'vari', 'hair', 'minInk', 'pwhite', 'ink', 'paper']) U[n] = gl.getUniformLocation(pr, n);
const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tTone = mkTex(0), tDep = mkTex(1), tPrev = mkTex(2), tFlow = mkTex(3);
gl.uniform1i(U.toneT, 0); gl.uniform1i(U.depT, 1); gl.uniform1i(U.depPrevT, 2); gl.uniform1i(U.flowT, 3);
let uploadTone = false, pal = getPalette(), tDepth = 0;
onPalette((p) => { pal = p; });
function render() {
  if (uploadTone) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTone); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, tone);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tFlow); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, flow); uploadTone = false;
  }
  if (uploadDepth && M.have) {
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.out);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tPrev); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.prevOut);
    uploadDepth = false; tDepth = performance.now();
  }
  const r = (a) => a.map((x) => x / 255), D = Math.PI / 180;
  gl.uniform1f(U.hasDepth, M.have ? 1 : 0);
  gl.uniform1f(U.bt, Math.min(1, (performance.now() - tDepth) / Math.max(60, M.interval)));
  gl.uniform2f(U.res, OW, OH);
  gl.uniform1f(U.sp, num('ensp', 13)); gl.uniform1f(U.angA, num('ena', 0) * D);
  gl.uniform1f(U.angX, offv('enx') ? 0 : P.enx * D); gl.uniform1f(U.l3, offv('en3') ? 1 : P.en3); gl.uniform1f(U.xFrom, offv('en2') ? 1 : P.en2); gl.uniform1f(U.weight, num('enw', 1));
  gl.uniform1f(U.flowAmt, offv('enft') ? 0 : P.enft); gl.uniform1f(U.dens, offv('endn') ? 0 : P.endn);
  gl.uniform1f(U.dw, offv('endw') ? 0.001 : P.endw); gl.uniform1f(U.minDash, num('enmd', 0.25)); gl.uniform1f(U.taper, offv('entp') ? 0 : P.entp);
  gl.uniform1f(U.bend, offv('enbd') ? 0 : P.enbd); gl.uniform1f(U.subj, offv('ensu') ? -1 : P.ensu);
  gl.uniform1f(U.bgSp, num('enbg', 1)); gl.uniform1f(U.bgAng, num('enba', 0) * D); gl.uniform1f(U.outline, offv('enol') ? 0 : P.enol);
  gl.uniform1f(U.wob, offv('enwb') ? 0 : P.enwb); gl.uniform1f(U.wobS, num('enws', 140)); gl.uniform1f(U.rough, offv('enr') ? 0 : P.enr);
  gl.uniform1f(U.vari, offv('env') ? 0 : P.env); gl.uniform1f(U.hair, offv('enh') ? 0 : P.enh);
  gl.uniform1f(U.minInk, offv('enmi') ? 0 : P.enmi); gl.uniform1f(U.pwhite, offv('enpw') ? 1.01 : P.enpw);
  gl.uniform3fv(U.ink, r(pal.cols[0])); gl.uniform3fv(U.paper, r(pal.paper));
  gl.viewport(0, 0, OW, OH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML =
    row('CPU tone map', toneMs.toFixed(1) + ' ms') +
    row('depth models', M.sess.length > 1 && val('dpw') > 0 ? MODELS.slice(0, 2).map((m) => m.label).join(' + ') : MODELS[0].label) +
    row('runs on', M.ready ? (M.ep === 'webgpu' ? 'GPU (WebGPU)' : 'processor (WASM, slow)') : M.loading ? 'loading...' : '-') +
    row('depth model time', M.ms.toFixed(1) + ' ms') + row('depth maps per second', M.fps.toFixed(1));
  $('#budget').style.width = Math.min(100, (toneMs + M.ms / 4) / 33.3 * 100) + '%';
}
setInterval(renderStats, 250);

// ---------------------------------------------------------------- loop
let lastMedia = -1;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) return;
  const fresh = vid.currentTime !== lastMedia; lastMedia = vid.currentTime;
  if (fresh || dirty) updateTone();
  if (M.ready && !M.busy && (fresh || !M.have)) DM.infer();
  if (toneReady) render();
}

// ---------------------------------------------------------------- UI
$('#settings').addEventListener('input', () => { dirty = true; }, true);
$('#settings').addEventListener('change', () => { dirty = true; }, true);
$('#restart').onclick = () => { M.sm = null; M.have = false; };
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r3');                                       // r3: lines -> thicker lines -> crossing lines (v1.82)

window.__state = { M, P, val, tone };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
