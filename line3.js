// LINE_v03: ONE long line that runs up and down the picture (a serpentine), made by a small, direct generator instead of a physics simulation.
// The picture is never traced by points. Instead a "phase" number phi(u, v) is built: u = across the runs, v = along them. The line is every place where
// phi is a whole number plus a half, so the line is where phi crosses the middle of a step. Neighbouring runs are joined by a U-turn, alternately at the top and the bottom,
// which makes it one continuous line.
//   DENSITY (contrast): the video tone sets the gap between two runs (dark or bright = close together). phi grows faster where the lines should be dense.
//   SHAPE: the picture is cut into pieces along the runs, Run length px long. Inside a piece every run is perfectly straight. Between two pieces a run jogs sideways
//          to its new place, over a distance set by Turn softness (0 = a sharp 90 degree step, 1 = one long S curve). Run length = the whole height gives
//          perfectly straight lines. Wave adds a plain sine on top.
//   MOTION: the tone is eased in time and phi is rebuilt every frame, so the lines slide to their new places; nothing is created or removed in the middle of the picture.
import { $, msg, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, drawCover, getPalette, onPalette } from './ui.js';

const CW = 1080, CH = 1920;                       // canvas size (the canvas element is 1080 x 1920)
const GW = 135, GH = 240;                         // tone grid read from the video
const NU = 256;                                   // phase samples across a run

const SLIDERS = [
  { head: 'Shape of the line' },
  { id: 'l3dir', label: 'Direction (0 = runs up and down, 1 = across)', min: 0, max: 1, step: 1, val: 0, off: 'runs up and down' },
  { id: 'l3run', label: 'Run length px (straight stretch before the next jog)', min: 20, max: 1920, step: 1, val: 220, off: '220' },
  { id: 'l3soft', label: 'Turn softness (0 = sharp 90 degree jog, 1 = long S curve)', min: 0, max: 1, step: 0.005, val: 0.02, off: 'sharp' },
  { id: 'l3wav', label: 'Wave (lines of sideways swing)', min: 0, max: 6, step: 0.01, val: 0, off: 'dead straight' },
  { id: 'l3wavl', label: 'Wave length px', min: 100, max: 2400, step: 1, val: 700, off: '700' },
  { id: 'l3mar', label: 'Turn room px (top and bottom U-turns)', min: 6, max: 120, step: 1, val: 30, off: '30' },
  { head: 'Density (the contrast)' },
  { id: 'l3min', label: 'Closest gap px (densest place)', min: 2, max: 30, step: 0.1, val: 4.5, off: '4.5' },
  { id: 'l3max', label: 'Widest gap px (emptiest place)', min: 6, max: 90, step: 0.1, val: 26, off: '26' },
  { id: 'l3con', label: 'Tone contrast', min: 0.3, max: 5, step: 0.01, val: 1.6, off: '1.6' },
  { id: 'l3th', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0, off: '0' },
  { id: 'l3inv', label: 'Invert (1 = dark is dense)', min: 0, max: 1, step: 1, val: 0, off: 'bright is dense' },
  { id: 'l3lv', label: 'Levels clip %', min: 0, max: 20, step: 0.5, val: 2, off: 'raw tone' },
  { head: 'Ink' },
  { id: 'l3w', label: 'Line width px', min: 0.5, max: 12, step: 0.05, val: 2.6, off: '2.6' },
  { head: 'Motion' },
  { id: 'l3e', label: 'Ease s (how slowly the lines follow the picture)', min: 0.02, max: 4, step: 0.02, val: 0.3, off: 'instant' },
];
const P = {};
buildSliders(SLIDERS, P);
const num = (id, d) => (P.on[id] === false ? d : P[id]);

const canvas = $('#cv'); canvas.width = CW; canvas.height = CH;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) msg('WebGL2 is not available in this browser.');

const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D fld;                       // phase of each run position, one row per piece: fld[col, piece]
uniform vec2 canv; uniform float dirv, nseg, nu, mar, soft, hw, wav, wavl;
uniform vec3 paper, ink;
out vec4 o;
float ph(int seg, float uu, float U) {       // the phase at distance uu across, in piece seg (linear between columns)
  float c = clamp(uu / U, 0.0, 1.0) * nu; int c0 = int(floor(c)); int c1 = min(c0 + 1, int(nu)); float f = c - float(c0);
  return mix(texelFetch(fld, ivec2(c0, seg), 0).r, texelFetch(fld, ivec2(c1, seg), 0).r, f);
}
void main() {
  vec2 q = vec2(gl_FragCoord.x, canv.y - gl_FragCoord.y);
  float U = dirv < 0.5 ? canv.x : canv.y, V = dirv < 0.5 ? canv.y : canv.x;
  float u = dirv < 0.5 ? q.x : q.y, v = dirv < 0.5 ? q.y : q.x;
  float run = V - 2.0 * mar, Ls = run / nseg;
  float vr = clamp(v, mar, V - mar) - mar;
  float pos = vr / Ls - 0.5; int i0 = int(clamp(floor(pos), 0.0, nseg - 1.0)); int i1 = int(min(float(i0) + 1.0, nseg - 1.0));
  float t = clamp(pos - float(i0), 0.0, 1.0);
  float w = smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, t);
  float phi = mix(ph(i0, u, U), ph(i1, u, U), w);
  phi += wav * sin(vr / wavl * 6.2831853);
  float g = max(length(vec2(dFdx(phi), dFdy(phi))), 1e-5);
  float a = 0.0;
  if (v >= mar && v <= V - mar) {                                    // the runs
    float f = abs(fract(phi) - 0.5) / g;
    a = clamp(hw - f + 0.5, 0.0, 1.0);
  } else {                                                           // the U-turns: top joins runs (0,1) (2,3) ..., bottom joins (1,2) (3,4) ...
    bool top = v < mar; float t2 = top ? mar - v : v - (V - mar);
    float c = top ? 2.0 * floor(phi * 0.5) + 1.0 : 2.0 * floor((phi + 1.0) * 0.5);
    float gc = max(length(vec2(dFdx(phi), dFdy(phi))), 1e-5);
    float gu = dirv < 0.5 ? abs(dFdx(phi)) : abs(dFdy(phi)); gu = max(gu, 1e-5);
    vec2 d = vec2(phi - c, t2 * gu);                                // phase units on both axes: the U-turn is a half circle
    float r = length(d), gr = max(gu, 1e-5);
    float f = abs(r - 0.5) / gr;
    a = clamp(hw - f + 0.5, 0.0, 1.0);
    if (!top && c < 1.0) a = 0.0;                                    // the first run has no partner at the bottom
  }
  o = vec4(mix(paper, ink, a), 1.0);
}`;
function prog(vs, fs) {
  const pg = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) msg('Shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(pg, s);
  }
  gl.bindAttribLocation(pg, 0, 'p'); gl.linkProgram(pg); return pg;
}
const pg = prog(VS, FS);
const UL = {}; for (const n of ['fld', 'canv', 'dirv', 'nseg', 'nu', 'mar', 'soft', 'hw', 'wav', 'wavl', 'paper', 'ink']) UL[n] = gl.getUniformLocation(pg, n);
const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const tFld = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tFld);
for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
let fldH = 0;

let pal = getPalette(); onPalette((p) => { pal = p; });
const rgb = (a) => a.map((x) => x / 255);

// ---------------------------------------------------------------- the tone
const tc = document.createElement('canvas'); tc.width = GW; tc.height = GH; const tx = tc.getContext('2d', { willReadFrequently: true });
const tgt = new Float32Array(GW * GH).fill(0.5), cur = new Float32Array(GW * GH).fill(0.5);
let lo = 0, hi = 1, have = false, lastMedia = -1;
function readTone() {                                               // new video frame -> target tone, with auto levels
  drawCover(tx, GW, GH);
  const d = tx.getImageData(0, 0, GW, GH).data, a = new Float32Array(GW * GH);
  for (let i = 0; i < a.length; i++) a[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const clip = num('l3lv', 2) / 100, s = Float32Array.from(a).sort();
  const l = clip > 0 ? s[Math.floor(clip * (s.length - 1))] : 0, h = clip > 0 ? s[Math.floor((1 - clip) * (s.length - 1))] : 1;
  lo += (l - lo) * (have ? 0.15 : 1); hi += (h - hi) * (have ? 0.15 : 1);
  for (let i = 0; i < a.length; i++) tgt[i] = Math.min(1, Math.max(0, (a[i] - lo) / Math.max(0.05, hi - lo)));
  if (!have) { cur.set(tgt); have = true; }
}
function synthTone() {                                               // no video yet: a soft light disc, so the generator can be seen
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const dx = (x / GW - 0.5) / 0.32, dy = (y / GH - 0.42) / 0.22; tgt[y * GW + x] = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)); }
  if (!have) { cur.set(tgt); have = true; }
}
const toneAt = (gx, gy) => {                                         // bilinear, gx 0..GW-1, gy 0..GH-1
  gx = Math.min(GW - 1.001, Math.max(0, gx)); gy = Math.min(GH - 1.001, Math.max(0, gy));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, i = y0 * GW + x0;
  return (cur[i] * (1 - fx) + cur[i + 1] * fx) * (1 - fy) + (cur[i + GW] * (1 - fx) + cur[i + GW + 1] * fx) * fy;
};

// ---------------------------------------------------------------- the phase field
let fld = new Float32Array(1), lastT = performance.now(), lines = 0, nsegNow = 1;
function buildField(dirv, runPx, mar) {
  const U = dirv < 0.5 ? CW : CH, V = dirv < 0.5 ? CH : CW;
  const nseg = Math.max(1, Math.round((V - 2 * mar) / Math.max(10, runPx))); nsegNow = nseg;
  const minG = Math.min(num('l3min', 4.5), num('l3max', 26) - 0.5), maxG = num('l3max', 26), con = num('l3con', 1.6), th = num('l3th', 0), inv = num('l3inv', 0) > 0.5;
  if (fld.length !== (NU + 1) * nseg) fld = new Float32Array((NU + 1) * nseg);
  const Ls = (V - 2 * mar) / nseg;
  for (let s = 0; s < nseg; s++) {
    const v0 = (mar + s * Ls) / V, v1 = (mar + (s + 1) * Ls) / V, nr = Math.max(2, Math.ceil((v1 - v0) * (dirv < 0.5 ? GH : GW) / 2));
    let ph = 0; fld[s * (NU + 1)] = 0;
    for (let k = 0; k < NU; k++) {
      let tsum = 0; const uc = (k + 0.5) / NU;
      for (let r = 0; r < nr; r++) { const vv = v0 + (v1 - v0) * (r + 0.5) / nr; tsum += dirv < 0.5 ? toneAt(uc * (GW - 1), vv * (GH - 1)) : toneAt(vv * (GW - 1), uc * (GH - 1)); }
      let t = tsum / nr; if (inv) t = 1 - t; t = Math.min(1, Math.max(0, (t - 0.5) * con + 0.5 + th));
      const gap = maxG + (minG - maxG) * t;                             // bright (or dark) = close lines
      ph += (U / NU) / gap; fld[s * (NU + 1) + k + 1] = ph;
    }
  }
  // every piece ends with the same total phase (the mean), so a dense place pushes its neighbours only locally and the far lines stay put
  let ref = 0; for (let s = 0; s < nseg; s++) ref += fld[s * (NU + 1) + NU]; ref = ref / nseg;   // kept continuous (never rounded), so nothing jumps
  for (let s = 0; s < nseg; s++) { const tot = fld[s * (NU + 1) + NU], d = ref - tot; for (let k = 0; k <= NU; k++) fld[s * (NU + 1) + k] += d * k / NU; }
  return nseg;
}
function render() {
  const now = performance.now(), dt = Math.min(0.2, (now - lastT) / 1000); lastT = now;
  const k = 1 - Math.exp(-dt / Math.max(0.02, num('l3e', 0.3)));
  for (let i = 0; i < cur.length; i++) cur[i] += (tgt[i] - cur[i]) * k;
  const dirv = Math.round(num('l3dir', 0)), mar = num('l3mar', 30);
  const nseg = buildField(dirv, num('l3run', 220), mar);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tFld);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, NU + 1, nseg, 0, gl.RED, gl.FLOAT, fld);
  lines = fld[NU] / 1;                                                 // number of runs in the first piece
  gl.useProgram(pg); gl.bindVertexArray(vao); gl.uniform1i(UL.fld, 0);
  const cs = pal.cols, p = rgb(pal.paper), c = rgb(cs[cs.length - 1]), c0 = rgb(cs[0]);
  const lum = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2], ink = Math.abs(lum(c) - lum(p)) >= Math.abs(lum(c0) - lum(p)) ? c : c0;
  gl.uniform2f(UL.canv, CW, CH); gl.uniform1f(UL.dirv, dirv); gl.uniform1f(UL.nseg, nseg); gl.uniform1f(UL.nu, NU); gl.uniform1f(UL.mar, mar);
  gl.uniform1f(UL.soft, Math.max(0.0005, num('l3soft', 0.02))); gl.uniform1f(UL.hw, num('l3w', 2.6) / 2); gl.uniform1f(UL.wav, num('l3wav', 0)); gl.uniform1f(UL.wavl, num('l3wavl', 700));
  gl.uniform3fv(UL.paper, p); gl.uniform3fv(UL.ink, ink);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, CW, CH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
let frames = 0, ms = 0, t0 = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  if (vid.readyState >= 2 && vid.videoWidth) { if (vid.currentTime !== lastMedia || !have) { lastMedia = vid.currentTime; readTone(); } } else if (!have || !vid.videoWidth) synthTone();
  const a = performance.now(); render(); ms += performance.now() - a; frames++;
  if (performance.now() - t0 > 1000) { fps = frames * 1000 / (performance.now() - t0); frames = 0; t0 = performance.now(); }
}
setInterval(() => {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML = row('pieces along the runs', nsegNow) + row('draw time per frame', (ms / Math.max(1, frames)).toFixed(1) + ' ms') + row('frames per second', fps.toFixed(0)) + row('source', vid.videoWidth ? 'video / camera' : 'test picture (no video yet)');
  $('#budget').style.width = Math.min(100, (ms / Math.max(1, frames)) / 33.3 * 100) + '%';
}, 500);
cam.onStart = () => { lastMedia = -1; have = false; };
initDefaults('.l3a');
window.__state = { P };
requestAnimationFrame(loop);
versionCheck();
if (!noCam) await startCamera();
