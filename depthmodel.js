// The depth model, shared by every depth style (Depth, Depth Dots).
// Depth Anything V2 Small (+ V1 Small if its file is in vendor/), fp16 ONNX, onnxruntime-web on WebGPU (WASM fallback).
// Output: M.out, depth 0 (far) .. 1 (near), M.w x M.h, smoothed in time (motion aware) and with shape detail; M.prevOut = the map before.
// opt(id, default) reads a setting: the style's slider value, -1 when its box is off, or the default when the style has no such slider.
import { $, msg, vid, cam, buildSliders } from './ui.js';

export const OW = 1080, OH = 1920;

// STEADINESS (shared by every style that uses depth): fewer, better depth maps, and each one averaged with the frame before.
const SL = [
  { head: 'Depth steadiness (all depth styles)' },
  { id: 'dsfps', label: 'Depth maps per second (lower = fewer, steadier)', min: 1, max: 30, step: 0.5, val: 12, off: '12' },
  { id: 'dsbl', label: 'Average with the frame before (still areas)', min: 0, max: 0.9, step: 0.01, val: 0.5, off: 'off' },
  { id: 'dsst', label: 'Hold still areas steady', min: 0, max: 1, step: 0.01, val: 0.5, off: 'off' },
  { id: 'dsfid', label: 'Extra detail when there is big movement', min: 0, max: 1, step: 0.01, val: 0.5, off: 'off' },
];
const SP = {}; let spBuilt = false;
const sv = (id, d) => (SP.on && SP.on[id] !== undefined ? SP[id] : d);
function buildSteady() {
  if (spBuilt || !$('#sliders')) return; spBuilt = true;
  buildSliders(SL, SP);
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('gaDepthSteady') || '{}'); } catch {}
  for (const s of SL) if (s.id && saved[s.id] !== undefined) { const el = $('#' + s.id); if (el) { el.value = saved[s.id]; el.dispatchEvent(new Event('input', { bubbles: true })); } }
  $('#sliders').addEventListener('input', (e) => { if (/^ds(fps|bl|st|fid)$/.test(e.target.id || '')) { try { const o = {}; for (const s of SL) if (s.id) o[s.id] = SP[s.id]; localStorage.setItem('gaDepthSteady', JSON.stringify(o)); } catch {} } });
}

export const MODELS = [
  { file: 'depth_anything_v2_small_fp16.onnx', label: 'Depth Anything V2 Small' },
  { file: 'depth_anything_v1_small_fp16.onnx', label: 'Depth Anything V1 Small', optional: true },
];
export function createDepthModel(opt, onMap = () => {}) {
  const M = { ort: null, sess: [], ep: '', ready: false, loading: false, busy: false, ms: 0, w: 0, h: 0, fps: 0, last: 0,
    dep: null, sm: null, lo: 0, hi: 1, have: false, prevLum: null, interval: 200, tUp: 0 };
  const ic = document.createElement('canvas'), ix = ic.getContext('2d', { willReadFrequently: true });
  async function loadModel() {
    if (M.ready || M.loading) return;
    buildSteady();
    M.loading = true; msg('Loading the depth models (Depth Anything V2 + V1 Small, 2 x 50 MB, first time only)...');
    try {
      M.ort = await import('./vendor/ort/ort.webgpu.min.mjs');
      M.ort.env.wasm.wasmPaths = new URL('./vendor/ort/', location.href).href;
      M.ort.env.wasm.numThreads = 1; M.ort.env.wasm.proxy = false;
      for (const ep of ['webgpu', 'wasm']) {
        try { M.sess = [await M.ort.InferenceSession.create(new URL('./vendor/' + MODELS[0].file, import.meta.url).href, { executionProviders: [ep] })]; M.ep = ep; break; }
        catch (e) { if (ep === 'wasm') throw e; }
      }
      for (const m of MODELS.slice(1)) {                        // optional extra models: used only if the file is there
        if (opt('dpw', 0.5) <= 0) break;                        // ... and only if the style wants a second model (not downloaded otherwise)
        try {
          const u = new URL('./vendor/' + m.file, import.meta.url).href;
          if ((await fetch(u, { method: 'HEAD' })).ok) M.sess.push(await M.ort.InferenceSession.create(u, { executionProviders: [M.ep] }));
        } catch {}
      }
      M.ready = true; msg(M.ep === 'wasm' ? 'No WebGPU here: the depth model runs on the processor (slow).' : '');
    } catch (e) { msg('Depth model failed: ' + e.message); }
    M.loading = false;
  }
  // the crop of the video that fills the 9:16 frame (same for the model input and the guide texture)
  function crop() {
    const vw = vid.videoWidth, vh = vid.videoHeight, ar = OW / OH;
    let cw = vw, ch = vw / ar; if (ch > vh) { ch = vh; cw = vh * ar; }
    return { sx: (vw - cw) / 2, sy: (vh - ch) / 2, cw, ch, vw, vh, mir: !!(cam.stream && cam.mirror) };
  }
  const lc = document.createElement('canvas'), lx = lc.getContext('2d', { willReadFrequently: true });
  function resample(a, aw, ah, bw, bh) {                         // bilinear resize of a depth map
    const o = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) { const fy = Math.min(ah - 1, (y + 0.5) * ah / bh - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(ah - 1, y0 + 1), ty = Math.max(0, fy - y0);
      for (let x = 0; x < bw; x++) { const fx = Math.min(aw - 1, (x + 0.5) * aw / bw - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(aw - 1, x0 + 1), tx = Math.max(0, fx - x0);
        o[y * bw + x] = (a[y0 * aw + x0] * (1 - tx) + a[y0 * aw + x1] * tx) * (1 - ty) + (a[y1 * aw + x0] * (1 - tx) + a[y1 * aw + x1] * tx) * ty; } }
    return o;
  }
  async function infer() {
    const tStart = performance.now();
    if (!cam.isFile && M.tStart && tStart - M.tStart < 1000 / Math.max(1, sv('dsfps', 12)) - 3) return;   // fewer maps per second (a loaded video always gets every map)
    M.tStart = tStart; M.busy = true;
    try {
      const nice = window.__niceVideo === true;                  // a loaded video in nice mode: the model gets time, so it works at its best (bigger input, and a mirrored second pass averaged in)
      const k0 = Math.max(12, Math.round(opt('dpq', 22) < 0 ? 12 : opt('dpq', 22))), lvl = nice ? 0 : (M.fidLvl || 0), k = nice ? Math.max(k0, 40) : k0 + lvl * Math.round(k0 * 0.25);
      const W = 14 * k, H = 14 * Math.round(W * 16 / 9 / 14), W0 = 14 * k0, H0 = 14 * Math.round(W0 * 16 / 9 / 14), tw = nice ? W : W0, th = nice ? H : H0;   // tw x th = the size of the map we keep
      if (ic.width !== W || ic.height !== H) { ic.width = W; ic.height = H; }
      const c = crop();
      ix.save(); if (c.mir) { ix.translate(W, 0); ix.scale(-1, 1); }
      ix.drawImage(vid, c.sx, c.sy, c.cw, c.ch, 0, 0, W, H); ix.restore();
      const px = ix.getImageData(0, 0, W, H).data, n = W * H, f = new Float32Array(3 * n);
      // the frame compared with the frame before: where did the picture change (at the kept map size)?
      let lpx = px;
      if (tw !== W) { if (lc.width !== tw || lc.height !== th) { lc.width = tw; lc.height = th; } lx.save(); if (c.mir) { lx.translate(tw, 0); lx.scale(-1, 1); } lx.drawImage(vid, c.sx, c.sy, c.cw, c.ch, 0, 0, tw, th); lx.restore(); lpx = lx.getImageData(0, 0, tw, th).data; }
      const nt = tw * th;
      if (!M.lum || M.lum.length !== nt) { M.lum = new Float32Array(nt); M.mot = new Float32Array(nt); M.bl = new Float32Array(nt); M.prevLum = null; M.prevF = null; }
      const lum = M.lum, mot = M.mot;
      for (let i = 0; i < nt; i++) lum[i] = (0.299 * lpx[i * 4] + 0.587 * lpx[i * 4 + 1] + 0.114 * lpx[i * 4 + 2]) / 255;
      const mf = Math.max(0, opt('dpm', 0.7));
      if (M.prevLum && mf > 0) { for (let i = 0; i < nt; i++) mot[i] = Math.abs(lum[i] - M.prevLum[i]); blur3(mot, M.bl, tw, th); } else mot.fill(0);   // spread a little so whole moving shapes follow
      M.prevLum = Float32Array.from(lum);
      let ms2 = 0; for (let i = 0; i < nt; i += 7) ms2 += mot[i]; ms2 /= Math.ceil(nt / 7);                   // how much moves overall
      const tl = Math.min(2, Math.floor(sv('dsfid', 0.5) * Math.min(1, ms2 * 25) * 2.99));                       // big movement: next map gets more detail (larger input)
      if (tl > (M.fidLvl || 0) || performance.now() - (M.fidT || 0) > 1500) { if (tl > (M.fidLvl || 0)) M.fidT = performance.now(); M.fidLvl = tl; }
      const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
      for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) f[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / sd[ch];
      const bw = sv('dsbl', 0.5);                                // average with the frame before, only where the picture is still (no ghosts on moving parts)
      if (bw > 0 && M.prevF && M.prevF.length === f.length) {
        for (let y = 0; y < H; y++) { const my = Math.min(th - 1, (y * th / H) | 0) * tw;
          for (let x = 0; x < W; x++) { const i = y * W + x, wgt = bw * (1 - Math.min(1, mot[my + Math.min(tw - 1, (x * tw / W) | 0)] * 25));
            if (wgt > 0.001) for (let ch = 0; ch < 3; ch++) f[ch * n + i] += (M.prevF[ch * n + i] - f[ch * n + i]) * wgt; } }
      }
      M.prevF = f.slice();
      const t0 = performance.now();
      const run1 = async (sess, input) => {
        const out = await sess.run({ [sess.inputNames[0]]: new M.ort.Tensor('float32', input, [1, 3, H, W]) });
        const o = out[sess.outputNames[0]], dims = o.dims;
        return { d: Float32Array.from(o.data ?? await o.getData()), oh: dims[dims.length - 2], ow: dims[dims.length - 1] };
      };
      let ff = null;                                            // nice mode: the same picture mirrored left to right
      if (nice) { ff = new Float32Array(3 * n); for (let ch = 0; ch < 3; ch++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ff[ch * n + y * W + x] = f[ch * n + y * W + (W - 1 - x)]; }
      const run = async (sess) => {
        const a = await run1(sess, f);
        if (!ff) return a;
        const b = await run1(sess, ff), { ow, oh } = a;           // un-mirror the second answer and average the two: less noise, steadier edges
        if (b.ow === ow && b.oh === oh) for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) a.d[y * ow + x] = (a.d[y * ow + x] + b.d[y * ow + (ow - 1 - x)]) * 0.5;
        return a;
      };
      const w2 = M.sess.length > 1 ? Math.max(0, nice ? Math.max(opt('dpw', 0.5), 0.5) : opt('dpw', 0.5)) : 0;
      const res = await Promise.all(M.sess.slice(0, w2 > 0 ? 2 : 1).map(run));
      let { d, oh, ow } = res[0];
      if (res[1] && res[1].d.length === d.length) {             // second model: fit a*d2 + b to d1 (least squares), then average
        const d2 = res[1].d; let sx = 0, sy = 0, sxx = 0, sxy = 0; const n2 = d.length;
        for (let i = 0; i < n2; i++) { sx += d2[i]; sy += d[i]; sxx += d2[i] * d2[i]; sxy += d2[i] * d[i]; }
        const a = (n2 * sxy - sx * sy) / Math.max(1e-9, n2 * sxx - sx * sx), b = (sy - a * sx) / n2;
        for (let i = 0; i < n2; i++) d[i] = d[i] * (1 - w2) + (a * d2[i] + b) * w2;
      }
      if (ow !== tw || oh !== th) { d = resample(d, ow, oh, tw, th); ow = tw; oh = th; }       // a bigger input is brought back to the kept size, so nothing pops when the detail level changes
      const now = performance.now(); M.ms += ((now - t0) - M.ms) * 0.2;
      if (M.last) { M.fps += (1000 / (now - M.last) - M.fps) * 0.2; M.interval += ((now - M.last) - M.interval) * 0.3; } M.last = now;
      // robust range: near / far percentiles (the model gives larger = nearer), followed slowly so the map does not pump
      let mn = Infinity, mx = -Infinity; for (let i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
      const hist = new Uint32Array(1024), sp = Math.max(1e-6, mx - mn);
      for (let i = 0; i < d.length; i++) hist[Math.min(1023, ((d[i] - mn) / sp * 1024) | 0)]++;
      const far = Math.max(0, opt('dpf', 4)) / 100, near = Math.max(0, opt('dpn', 0.5)) / 100;
      let acc = 0, l = 0, h = 1023;
      for (let b = 0; b < 1024; b++) { acc += hist[b]; if (acc <= d.length * far) l = b; if (acc <= d.length * (1 - near)) h = b + 1; }
      const lo = mn + l / 1024 * sp, hi = mn + Math.min(1024, h) / 1024 * sp, fo = opt('dpr', 0.1) < 0 ? 1 : opt('dpr', 0.1);
      const first = !M.sm || M.sm.length !== d.length;
      if (first) { M.lo = lo; M.hi = hi; } else { M.lo += (lo - M.lo) * fo; M.hi += (hi - M.hi) * fo; }
      const span = Math.max(1e-6, M.hi - M.lo), nd = d.length;
      if (first) { for (const k of ['sm', 'out', 'tmp', 'prevOut']) M[k] = new Float32Array(nd); }
      const v = M.tmp;                                          // this map, normalised 0 (far) .. 1 (near), not clipped yet
      for (let i = 0; i < nd; i++) v[i] = (d[i] - M.lo) / span;
      if (first) { M.sm.set(v); }
      else {
        // time smoothing, motion aware: still spots keep most of the old map, moving spots follow the new one
        const s0 = Math.max(0, opt('dps', 0.8)), s = nice ? Math.min(s0, 0.5) : s0;      // nice mode: every map is already clean, so less smoothing lag
        const hold = sv('dsst', 0.5), sS = s + (0.95 - s) * hold * (s < 0.95 ? 1 : 0), mot = M.mot, mf = Math.max(0, opt('dpm', 0.7));   // still spots can hold the old map harder
        for (let i = 0; i < nd; i++) {
          const keep = sS * (1 - Math.min(1, mot[i] * 25 * mf));
          M.sm[i] = M.sm[i] * keep + v[i] * (1 - keep);
        }
      }
      M.w = ow; M.h = oh; M.dep = d;
      if (M.have) M.prevOut.set(M.out);
      shape(); if (!M.have) M.prevOut.set(M.out); M.have = true; M.tUp = performance.now(); onMap();
    } catch (e) { msg('Depth run failed: ' + e.message); M.ready = false; }
    M.busy = false;
  }

  // 3x3 box blur (in place via scratch)
  function blur3(a, tmp, w, h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let acc = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; acc += a[yy * w + xx]; c++; } }
      tmp[y * w + x] = acc / c;
    }
    a.set(tmp);
  }

  // shape detail: each spot compared with its surroundings (depth minus blurred depth), so round and angled forms read
  // even when they are a small part of the whole depth range (a sphere next to a long floor).
  // The blur is edge-aware (neighbours at a clearly different depth are left out, separable bilateral), so there are no halos.
  function shape() {
    const { sm, out, bl, tmp, w, h } = M, k = Math.max(0, opt('dpl', 2));
    if (k <= 0) { out.set(sm); return; }
    const r = Math.max(1, Math.round((opt('dplr', 48) < 0 ? 48 : opt('dplr', 48)) / 1920 * h));   // shape size px (output frame) -> depth px
    // weights: spatial gaussian per tap; depth-difference gaussian from a lookup table (no Math.exp in the loop); every 2nd tap for big radii
    const st = r > 6 ? 2 : 1, sw = new Float32Array(2 * r + 1), LUT = 256, cut = 0.16, lut = new Float32Array(LUT + 1), sc = LUT / (cut * cut);
    for (let t = -r; t <= r; t++) sw[t + r] = Math.exp(-(t * t) / (2 * (r / 2) * (r / 2)));
    for (let q = 0; q <= LUT; q++) lut[q] = Math.exp(-(q / sc) / (2 * 0.04 * 0.04));
    const pass = (src, dst, dx, dy, n, len) => {
      const stride = dx ? 1 : w;
      for (let a = 0; a < n; a++) {
        const o = dx ? a * w : a;
        for (let b = 0; b < len; b++) {
          const i = o + b * stride, c = src[i];
          let acc = c, ws = 1;                                  // the centre always counts (no empty average next to a sharp edge)
          for (let t = -r; t <= r; t += st) {
            if (t === 0) continue;
            const q = b + t, j = o + (q < 0 ? 0 : q >= len ? len - 1 : q) * stride, v = src[j], dd = (v - c) * (v - c) * sc;
            if (dd >= LUT) continue;
            const wt = sw[t + r] * lut[dd | 0]; acc += v * wt; ws += wt;
          }
          dst[i] = acc / ws;
        }
      }
    };
    pass(sm, tmp, 1, 0, h, w); pass(tmp, bl, 0, 1, w, h);
    for (let i = 0; i < sm.length; i++) out[i] = sm[i] + k * (sm[i] - bl[i]);
  }
  return { M, load: loadModel, infer, shape, crop };
}
