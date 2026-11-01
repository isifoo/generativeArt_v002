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
import { $, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover, getPalette, onPalette } from './ui.js';
import { createDepthModel, MODELS, OW, OH } from './depthmodel.js';

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Tone (contrast map)' },
  { id: 'enlo', label: 'Levels clip %', min: 0, max: 20, step: 0.5, val: 1, off: 'raw video' },
  { id: 'enl', label: 'Local contrast', min: 0, max: 4, step: 0.05, val: 1.2, off: 'global tone only' },
  { id: 'enc', label: 'Contrast', min: 0.2, max: 4, step: 0.01, val: 1.1, off: '1' },
  { id: 'enb', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0, off: '0' },
  { id: 'enmi', label: 'Minimum ink', min: 0, max: 0.4, step: 0.01, val: 0.12, off: 'bare paper in the light areas' },
  { id: 'enpw', label: 'Paper white', min: 0.5, max: 1, step: 0.005, val: 0.97, off: 'no bare paper (1)' },
  { id: 'ent', label: 'Tone smoothing', min: 0, max: 0.95, step: 0.01, val: 0.5, off: 'none' },
  { head: 'Lines' },
  { id: 'ensp', label: 'Line spacing px', min: 3, max: 24, step: 0.1, val: 7, off: '7' },
  { id: 'ena', label: 'Angle deg', min: -90, max: 90, step: 0.5, val: 28, off: '0' },
  { id: 'enx', label: 'Cross angle deg', min: 20, max: 90, step: 0.5, val: 58, off: 'no cross lines' },
  { id: 'en2', label: 'Cross lines from', min: 0.1, max: 0.9, step: 0.01, val: 0.42, off: 'never' },
  { id: 'en3', label: 'Third lines from', min: 0.3, max: 1, step: 0.01, val: 0.78, off: 'never' },
  { id: 'enw', label: 'Line weight', min: 0.3, max: 2, step: 0.01, val: 1, off: '1' },
  { head: 'Depth' },
  { id: 'dpq', label: 'Model detail', min: 12, max: 37, step: 1, val: 18, off: 'lowest' },
  { id: 'dpw', label: 'Second model weight', min: 0, max: 1, step: 0.01, val: 0.5, off: 'first model only' },
  { id: 'dps', label: 'Depth smoothing', min: 0, max: 0.97, step: 0.01, val: 0.85, off: 'none' },
  { id: 'enbd', label: 'Depth bends lines', min: 0, max: 40, step: 0.5, val: 9, off: 'straight lines' },
  { id: 'ensu', label: 'Subject depth', min: 0, max: 1, step: 0.01, val: 0.45, off: 'no background split' },
  { id: 'enbg', label: 'Background spacing', min: 0.3, max: 3, step: 0.01, val: 0.75, off: 'same as subject' },
  { id: 'enba', label: 'Background angle', min: -90, max: 90, step: 0.5, val: 0, off: '0 (horizontal)' },
  { id: 'enol', label: 'Outline', min: 0, max: 3, step: 0.05, val: 0.8, off: 'no outline' },
  { head: 'Dots and dashes' },
  { id: 'endl', label: 'Dash length px', min: 2, max: 60, step: 0.5, val: 14, off: 'no dashes' },
  { id: 'endt', label: 'Dashes below tone', min: 0, max: 0.6, step: 0.01, val: 0.22, off: 'no dashes' },
  { id: 'endo', label: 'Lozenge dots', min: 0, max: 2, step: 0.01, val: 0.9, off: 'no dots' },
  { head: 'Organic' },
  { id: 'enwb', label: 'Wobble px', min: 0, max: 6, step: 0.05, val: 0.9, off: 'ruler straight' },
  { id: 'enws', label: 'Wobble scale px', min: 10, max: 400, step: 1, val: 120, off: '120' },
  { id: 'enr', label: 'Ink roughness', min: 0, max: 1, step: 0.01, val: 0.35, off: 'clean edges' },
  { id: 'env', label: 'Line weight variety', min: 0, max: 0.6, step: 0.01, val: 0.12, off: 'every line the same' },
  { id: 'enh', label: 'Hairline px', min: 0, max: 2, step: 0.05, val: 0.55, off: 'lines vanish in the highlights' },
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
uniform sampler2D toneT, depT, depPrevT;
uniform float hasDepth, bt;
uniform vec2 res;
uniform float sp, angA, angX, l2, l3, weight;            // lines
uniform float bend, subj, bgSp, bgAng, outline;          // depth
uniform float dashLen, dashBelow, dots;                  // dots and dashes
uniform float wob, wobS, rough, vari, hair;              // organic, hairline px
uniform float minInk, pwhite;                            // tone floor
uniform vec3 ink, paper;

// value noise (organic wobble, ink bleed)
float h21(vec2 q) { q = fract(q * vec2(127.1, 311.7)); q += dot(q, q + 34.53); return fract(q.x * q.y); }
float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 q) { return vnoise(q) * 0.6 + vnoise(q * 2.03 + 7.1) * 0.3 + vnoise(q * 4.1 + 3.3) * 0.1; }

float depthAt(vec2 u) { return hasDepth > 0.5 ? mix(texture(depPrevT, u).r, texture(depT, u).r, bt) : 0.5; }

// one line family: phase phi (lines at whole numbers). Coverage f (0..1) of the line spacing is ink. Returns ink 0..1.
// Also returns the along-line dash gate for light lines.
float family(float phi, float f, vec2 px, vec2 tdir, float lineId, float dk) {
  if (f <= 0.001) return 0.0;
  float g = length(vec2(dFdx(phi), dFdy(phi))) + 1e-5;   // lines per px
  float dpx = abs(fract(phi + 0.5) - 0.5) / g;           // px to the nearest line centre
  float spx = 1.0 / g;                                    // spacing in px here
  float w = 1.0 + vari * (h21(vec2(floor(phi + 0.5), lineId)) - 0.5) * 2.0;   // a slight weight change per line
  // half-width: coverage f of the spacing, but never thinner than a hairline (engravers keep fine lines in the highlights)
  float hw = max(0.5 * spx * clamp(f * w, 0.0, 1.0), hair * smoothstep(0.0, 0.08, f));
  // ink bleed: the edge wanders a little
  float n = (fbm(px * 0.35 + lineId * 13.0) - 0.5) * rough * 1.6;
  float ink = 1.0 - smoothstep(hw - 0.6 + n, hw + 0.6 + n, dpx);
  // light lines break into dashes and dots: along-line gate, duty grows with coverage
  if (dashLen > 0.0 && dashBelow > 0.0) {
    float duty = clamp(dk / dashBelow, 0.08, 1.0);           // the lighter the spot, the shorter the dashes (down to dots)
    float s = dot(px, tdir) / dashLen + h21(vec2(floor(phi + 0.5), lineId + 3.0)) * 7.0;
    float a = abs(fract(s) - 0.5) * 2.0;                  // 0 at dash centre .. 1 at its end
    float gate = 1.0 - smoothstep(duty - 0.1, duty + 0.1, a);
    ink *= dk < dashBelow ? gate : 1.0;
  }
  return ink;
}

void main() {
  vec2 px = uv * res;
  float t = texture(toneT, uv).r;                         // tone: 0 dark .. 1 light
  // darkness = ink to put down. Engravers keep fine lines almost everywhere: a minimum ink, and bare paper only above paper white
  float dk = mix(minInk, 1.0, pow(1.0 - t, 0.85)) * (1.0 - smoothstep(pwhite, min(1.0, pwhite + 0.03), t));
  float d = depthAt(uv);
  float s = subj < 0.0 ? 1.0 : smoothstep(subj - 0.04, subj + 0.04, d);   // 1 = subject, 0 = background
  vec2 w2 = vec2(fbm(px / wobS), fbm(px / wobS + 17.3)) - 0.5;
  vec2 pw = px + w2 * wob * 2.0;                          // wobbled position

  // ---- subject: family A bent by depth, cross family B, third family C
  // angles are the direction of the lines (0 = horizontal); t = along the line, n = across (the phase runs along n)
  vec2 tA = vec2(cos(angA), -sin(angA)), nA = vec2(-tA.y, tA.x);
  vec2 tB = vec2(cos(angA + angX), -sin(angA + angX)), nB = vec2(-tB.y, tB.x);
  vec2 tC = vec2(cos(angA - angX * 0.5), -sin(angA - angX * 0.5)), nC = vec2(-tC.y, tC.x);
  float phiA = dot(pw, nA) / sp + bend * d;
  float phiB = dot(pw, nB) / sp - bend * d * 0.7;
  float phiC = dot(pw, nC) / (sp * 1.15) + bend * d * 0.4;
  // the engraver's split of the darkness over the layers
  float fA = dk / max(l2, 0.05);                          // A carries the tone alone up to l2
  float fB = angX > 0.0 && l2 < 1.0 ? (dk - l2) / max(1.0 - l2, 0.05) : 0.0;
  float fC = l3 < 1.0 ? (dk - l3) / max(1.0 - l3, 0.05) : 0.0;
  fA = clamp(fA * weight, 0.0, 1.0) * mix(0.62, 1.0, smoothstep(l2, 1.0, dk));   // A keeps thickening into the darks
  float inkS = max(family(phiA, fA, pw, tA, 1.0, dk), max(family(phiB, clamp(fB * weight, 0.0, 1.0) * 0.8, pw, tB, 2.0, dk), family(phiC, clamp(fC * weight, 0.0, 1.0) * 0.75, pw, tC, 3.0, dk)));
  // lozenge dots: a dot in the middle of each A x B cell, in the mid tones
  if (dots > 0.0) {
    float gA = length(vec2(dFdx(phiA), dFdy(phiA))) + 1e-5, gB = length(vec2(dFdx(phiB), dFdy(phiB))) + 1e-5;
    vec2 c = vec2((fract(phiA) - 0.5) / gA, (fract(phiB) - 0.5) / gB);   // px from the middle of the cell (lines sit at whole numbers)
    float r = dots * sp * 0.22 * smoothstep(0.12, 0.35, dk) * (1.0 - smoothstep(0.55, 0.8, dk));
    inkS = max(inkS, 1.0 - smoothstep(r - 0.6, r + 0.6, length(c)));
  }

  // ---- background: straight lines at their own angle and spacing, a crossing family in the darks
  vec2 tG = vec2(cos(bgAng), -sin(bgAng)), nG = vec2(-tG.y, tG.x);
  float bsp = sp * bgSp;
  float phiG = dot(pw, nG) / bsp;
  float phiH = dot(pw, tG) / bsp;
  float inkB = max(family(phiG, clamp(dk / max(l2, 0.05) * weight, 0.0, 1.0) * mix(0.62, 1.0, smoothstep(l2, 1.0, dk)), pw, tG, 4.0, dk),
                   family(phiH, clamp((dk - l2) / max(1.0 - l2, 0.05) * weight, 0.0, 1.0) * 0.8, pw, nG, 5.0, dk));

  float inkv = mix(inkB, inkS, s);
  // ---- outline: a thin line where depth jumps (the silhouette)
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
for (const n of ['toneT', 'depT', 'depPrevT', 'hasDepth', 'bt', 'res', 'sp', 'angA', 'angX', 'l2', 'l3', 'weight', 'bend', 'subj', 'bgSp', 'bgAng', 'outline', 'dashLen', 'dashBelow', 'dots', 'wob', 'wobS', 'rough', 'vari', 'hair', 'minInk', 'pwhite', 'ink', 'paper']) U[n] = gl.getUniformLocation(pr, n);
const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const tTone = mkTex(0), tDep = mkTex(1), tPrev = mkTex(2);
gl.uniform1i(U.toneT, 0); gl.uniform1i(U.depT, 1); gl.uniform1i(U.depPrevT, 2);
let uploadTone = false, pal = getPalette(), tDepth = 0;
onPalette((p) => { pal = p; });
function render() {
  if (uploadTone) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTone); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, tone); uploadTone = false; }
  if (uploadDepth && M.have) {
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.out);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tPrev); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.w, M.h, 0, gl.RED, gl.FLOAT, M.prevOut);
    uploadDepth = false; tDepth = performance.now();
  }
  const r = (a) => a.map((x) => x / 255), D = Math.PI / 180;
  gl.uniform1f(U.hasDepth, M.have ? 1 : 0);
  gl.uniform1f(U.bt, Math.min(1, (performance.now() - tDepth) / Math.max(60, M.interval)));
  gl.uniform2f(U.res, OW, OH);
  gl.uniform1f(U.sp, num('ensp', 7)); gl.uniform1f(U.angA, num('ena', 0) * D);
  gl.uniform1f(U.angX, offv('enx') ? 0 : P.enx * D);
  gl.uniform1f(U.l2, offv('en2') ? 1 : P.en2); gl.uniform1f(U.l3, offv('en3') ? 1 : P.en3); gl.uniform1f(U.weight, num('enw', 1));
  gl.uniform1f(U.bend, offv('enbd') ? 0 : P.enbd); gl.uniform1f(U.subj, offv('ensu') ? -1 : P.ensu);
  gl.uniform1f(U.bgSp, num('enbg', 1)); gl.uniform1f(U.bgAng, num('enba', 0) * D); gl.uniform1f(U.outline, offv('enol') ? 0 : P.enol);
  gl.uniform1f(U.dashLen, offv('endl') ? 0 : P.endl); gl.uniform1f(U.dashBelow, offv('endt') ? 0 : P.endt); gl.uniform1f(U.dots, offv('endo') ? 0 : P.endo);
  gl.uniform1f(U.wob, offv('enwb') ? 0 : P.enwb); gl.uniform1f(U.wobS, num('enws', 120)); gl.uniform1f(U.rough, offv('enr') ? 0 : P.enr); gl.uniform1f(U.vari, offv('env') ? 0 : P.env); gl.uniform1f(U.hair, offv('enh') ? 0 : P.enh); gl.uniform1f(U.minInk, offv('enmi') ? 0 : P.enmi); gl.uniform1f(U.pwhite, offv('enpw') ? 1.01 : P.enpw);
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
initDefaults('.r1');

window.__state = { M, P, val, tone };
DM.load();
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
