// DOLLAR (banknote engraving): the video drawn the way a banknote engraver cuts a portrait, as one pixel shader.
// The engraver's rules, as math (v1.83, after a close look at the $100 portrait):
//  1. Line families. Each family is a phase field phi(p); its lines sit where phi is a whole number. For a pixel, the distance to
//     the nearest line in px is |fract(phi + .5) - .5| / |grad phi|; inside the line's half-width it is ink.
//  2. One spacing and one line thickness everywhere. Contrast is never made by widening lines; it comes in levels:
//     short dashes -> longer dashes -> continuous lines (one direction) -> the crossing direction comes in the same way
//     -> dots grow in the middle of the lozenges (the darkest).
//  3. Dashes are cut on the crossing family's lattice, staggered line to line, with pointed ends.
//  4. Gentle curves: the lines bend along a soft copy of the tone and along depth (kept small so the spacing stays even);
//     depth also splits subject from background (the background gets its own straight lines).
//  5. Organic: slow wobble of the line paths, ink bleed roughness on the edges, a slight weight change per line.
//  6. Optional outline where depth jumps (the silhouette).
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
  { id: 'enmi', label: 'Minimum ink', min: 0, max: 0.4, step: 0.01, val: 0.05, off: 'bare paper in the light areas' },
  { id: 'enpw', label: 'Paper white', min: 0.5, max: 1, step: 0.005, val: 0.985, off: 'no bare paper (1)' },
  { id: 'ent', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.5, off: 'none' },
  { head: 'Lines: one spacing, one thickness' },
  { id: 'ensp', label: 'Line spacing px', min: 3, max: 40, step: 0.1, val: 13, off: '13' },
  { id: 'ena', label: 'Angle deg', min: -90, max: 90, step: 0.5, val: 40, off: '0' },
  { id: 'enx', label: 'Cross angle deg', min: 20, max: 90, step: 0.5, val: 62, off: 'no cross lines' },
  { id: 'endw', label: 'Line thickness', min: 0.08, max: 0.6, step: 0.01, val: 0.3, off: '0.3' },
  { id: 'endo', label: 'Lozenge dots', min: 0, max: 1, step: 0.01, val: 0.8, off: 'no dots: cross lines are the darkest' },
  { id: 'en3', label: 'Third lines from', min: 0.3, max: 1, step: 0.01, val: 0.95, off: 'never' },
  { head: 'Curves (spacing stays even)' },
  { id: 'enft', label: 'Flow with the light', min: 0, max: 30, step: 0.1, val: 0.7, off: 'no bending by tone' },
  { id: 'enfr', label: 'Flow smoothness px', min: 4, max: 160, step: 1, val: 48, off: '48' },
  { id: 'endn', label: 'Denser in the darks', min: 0, max: 1.5, step: 0.01, val: 0, off: 'same spacing everywhere' },
  { head: 'Dashes (light areas)' },
  { id: 'enmd', label: 'Shortest dash', min: 0.05, max: 0.9, step: 0.01, val: 0.25, off: '0.25' },
  { id: 'entp', label: 'Dash taper', min: 0, max: 1, step: 0.01, val: 0.85, off: 'square ends' },
  { head: 'Depth' },
  { id: 'dpq', label: 'Model detail', min: 12, max: 37, step: 1, val: 18, off: 'lowest' },
  { id: 'dpw', label: 'Second model weight', min: 0, max: 1, step: 0.01, val: 0.5, off: 'first model only' },
  { id: 'dps', label: 'Depth smoothing', min: 0, max: 0.97, step: 0.01, val: 0.85, off: 'none' },
  { id: 'enbd', label: 'Depth bends lines', min: 0, max: 40, step: 0.5, val: 4, off: 'straight lines' },
  { id: 'ensu', label: 'Subject depth', min: 0, max: 1, step: 0.01, val: 0.45, off: 'no background split' },
  { id: 'enbg', label: 'Background spacing', min: 0.3, max: 3, step: 0.01, val: 0.85, off: 'same as subject' },
  { id: 'enba', label: 'Background angle', min: -90, max: 90, step: 0.5, val: 0, off: '0 (horizontal)' },
  { id: 'enol', label: 'Outline', min: 0, max: 3, step: 0.05, val: 0.6, off: 'no outline' },
  { head: 'Organic' },
  { id: 'enwb', label: 'Wobble px', min: 0, max: 6, step: 0.05, val: 0.7, off: 'ruler straight' },
  { id: 'enws', label: 'Wobble scale px', min: 10, max: 400, step: 1, val: 140, off: '140' },
  { id: 'enr', label: 'Ink roughness', min: 0, max: 1, step: 0.01, val: 0.3, off: 'clean edges' },
  { id: 'env', label: 'Line weight variety', min: 0, max: 0.6, step: 0.01, val: 0.12, off: 'every line the same' },
];
const P = {};
const val = buildSliders(SLIDERS, P);
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
uniform float sp, angA, angX, l3, dots;                  // lines; dots: size of the lozenge dots
uniform float flowAmt, dens;                             // curves and density by contrast
uniform float dw, minDash, taper;                        // line thickness (share of the spacing), shortest dash, taper
uniform float bend, subj, bgSp, bgAng, outline;          // depth
uniform float wob, wobS, rough, vari;                    // organic
uniform float minInk, pwhite;
uniform vec3 ink, paper;

float h21(vec2 q) { q = fract(q * vec2(127.1, 311.7)); q += dot(q, q + 34.53); return fract(q.x * q.y); }
float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 q) { return vnoise(q) * 0.6 + vnoise(q * 2.03 + 7.1) * 0.3 + vnoise(q * 4.1 + 3.3) * 0.1; }
float depthAt(vec2 u) { return hasDepth > 0.5 ? mix(texture(depPrevT, u).r, texture(depT, u).r, bt) : 0.5; }

// One line family at a FIXED spacing and a FIXED thickness (dw of the spacing). The tone only decides how much of each line
// is drawn: duty = share of each dash cell that is ink (0 nothing .. 1 continuous). The dashes are cut on the crossing
// family's lattice (psi), staggered from line to line, with pointed ends; below the shortest dash they shrink to dots.
float family(float phi, float psi, float duty, vec2 px, float id) {
  if (duty <= 0.001) return 0.0;
  float g = length(vec2(dFdx(phi), dFdy(phi))) + 1e-5;   // lines per px
  float dpx = abs(fract(phi + 0.5) - 0.5) / g;           // px to the line centre
  float lineNo = floor(phi + 0.5);
  float hw = 0.5 / g * dw * (1.0 + vari * (h21(vec2(lineNo, id)) - 0.5) * 2.0);   // fixed thickness (a slight per-line variety)
  float L = max(duty, minDash);
  if (L < 0.999) {
    float a = (fract(psi + h21(vec2(lineNo, id + 7.0))) - 0.5) / (0.5 * L);   // -1 .. 1 along the dash
    hw *= abs(a) >= 1.0 ? 0.0 : mix(1.0, sqrt(max(0.0, 1.0 - a * a)), taper);
    if (duty < minDash) hw *= sqrt(duty / minDash);
  }
  float n = (fbm(px * 0.35 + id * 13.0) - 0.5) * rough * 1.6;   // ink bleed
  return 1.0 - smoothstep(hw - 0.6 + n, hw + 0.6 + n, dpx);
}
// a dot in the middle of each lozenge of two families; r in px
float lozDot(float phiA, float phiB, float r) {
  if (r <= 0.0) return 0.0;
  float gA = length(vec2(dFdx(phiA), dFdy(phiA))) + 1e-5, gB = length(vec2(dFdx(phiB), dFdy(phiB))) + 1e-5;
  vec2 c = vec2((fract(phiA) - 0.5) / gA, (fract(phiB) - 0.5) / gB);   // px from the middle of the cell
  return 1.0 - smoothstep(r - 0.6, r + 0.6, length(c));
}
// The levels of contrast, all at one spacing and one thickness:
//  1-3: dashes on one direction grow from short marks to continuous lines; 4: the crossing direction comes in the same way;
//  5: dots grow in the middle of the lozenges. (dk -> ink share of the area: each level adds ink, none makes a line wider.)
float levels(float dk, float phiA, float phiB, vec2 pw, float idA) {
  float cA = dw, cAB = dw + dw * (1.0 - dw), cD = cAB + dots * (1.0 - cAB) * 0.6;
  float inkv = max(family(phiA, phiB, clamp(dk / cA, 0.0, 1.0), pw, idA),
                   family(phiB, phiA, angX > 0.0 ? clamp((dk - cA) / max(cAB - cA, 0.01), 0.0, 1.0) : 0.0, pw, idA + 1.0));
  if (dots > 0.0 && angX > 0.0) {
    float df = clamp((dk - cAB) / max(cD - cAB, 0.01), 0.0, 1.0);
    inkv = max(inkv, lozDot(phiA, phiB, df > 0.0 ? 0.5 * (1.0 - dw) * sp * dots * sqrt(df) : 0.0));
  }
  return inkv;
}

void main() {
  vec2 px = uv * res;
  float t = texture(toneT, uv).r;                         // tone: 0 dark .. 1 light
  float tf = texture(flowT, uv).r;                        // soft tone: the lines flow along it
  float dk = mix(minInk, 1.0, 1.0 - t) * (1.0 - smoothstep(pwhite, min(1.0, pwhite + 0.03), t));
  float d = depthAt(uv);
  float s = subj < 0.0 ? 1.0 : smoothstep(subj - 0.04, subj + 0.04, d);
  vec2 pw = px + (vec2(fbm(px / wobS), fbm(px / wobS + 17.3)) - 0.5) * wob * 2.0;

  // curves: the lines bend gently along the soft tone and the depth (kept small so the distance between lines stays even)
  float k = 1.0 + dens * (1.0 - tf);                      // optional: closer lines in the darks (off by default)
  float warp = flowAmt * (1.0 - tf) + bend * d;           // in lines
  vec2 tA = vec2(cos(angA), -sin(angA)), nA = vec2(-tA.y, tA.x);
  vec2 tB = vec2(cos(angA + angX), -sin(angA + angX)), nB = vec2(-tB.y, tB.x);
  vec2 tC = vec2(cos(angA + angX * 0.5 + 1.5708), -sin(angA + angX * 0.5 + 1.5708)), nC = vec2(-tC.y, tC.x);
  float phiA = dot(pw, nA) / sp * k + warp;
  float phiB = dot(pw, nB) / sp * k - warp * 0.8;
  float phiC = dot(pw, nC) / sp * k + warp * 0.5;
  float inkS = levels(dk, phiA, phiB, pw, 1.0);
  if (l3 < 1.0) inkS = max(inkS, family(phiC, phiA + 0.5, clamp((dk - l3) / max(1.0 - l3, 0.05), 0.0, 1.0), pw, 3.0));   // optional third direction

  // background: the same levels on straight lines at their own angle
  vec2 tG = vec2(cos(bgAng), -sin(bgAng)), nG = vec2(-tG.y, tG.x);
  float inkB = levels(dk, dot(pw, nG) / (sp * bgSp), dot(pw, tG) / (sp * bgSp), pw, 4.0);

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
for (const n of ['toneT', 'flowT', 'depT', 'depPrevT', 'hasDepth', 'bt', 'res', 'sp', 'angA', 'angX', 'l3', 'dots', 'flowAmt', 'dens', 'dw', 'minDash', 'taper', 'bend', 'subj', 'bgSp', 'bgAng', 'outline', 'wob', 'wobS', 'rough', 'vari', 'minInk', 'pwhite', 'ink', 'paper']) U[n] = gl.getUniformLocation(pr, n);
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
  gl.uniform1f(U.angX, offv('enx') ? 0 : P.enx * D); gl.uniform1f(U.l3, offv('en3') ? 1 : P.en3); gl.uniform1f(U.dots, offv('endo') ? 0 : P.endo);
  gl.uniform1f(U.flowAmt, offv('enft') ? 0 : P.enft); gl.uniform1f(U.dens, offv('endn') ? 0 : P.endn);
  gl.uniform1f(U.dw, num('endw', 0.3)); gl.uniform1f(U.minDash, num('enmd', 0.25)); gl.uniform1f(U.taper, offv('entp') ? 0 : P.entp);
  gl.uniform1f(U.bend, offv('enbd') ? 0 : P.enbd); gl.uniform1f(U.subj, offv('ensu') ? -1 : P.ensu);
  gl.uniform1f(U.bgSp, num('enbg', 1)); gl.uniform1f(U.bgAng, num('enba', 0) * D); gl.uniform1f(U.outline, offv('enol') ? 0 : P.enol);
  gl.uniform1f(U.wob, offv('enwb') ? 0 : P.enwb); gl.uniform1f(U.wobS, num('enws', 140)); gl.uniform1f(U.rough, offv('enr') ? 0 : P.enr);
  gl.uniform1f(U.vari, offv('env') ? 0 : P.env);
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
initDefaults('.r4');                                       // r4: one spacing, one thickness: dashes -> lines -> cross lines -> dots (v1.83)

window.__state = { M, P, val, tone };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
