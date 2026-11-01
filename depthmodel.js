// The depth model, shared by every depth style (Depth, Depth Dots).
// Depth Anything V2 Small (+ V1 Small if its file is in vendor/), fp16 ONNX, onnxruntime-web on WebGPU (WASM fallback).
// Output: M.out, depth 0 (far) .. 1 (near), M.w x M.h, smoothed in time (motion aware) and with shape detail; M.prevOut = the map before.
// opt(id, default) reads a setting: the style's slider value, -1 when its box is off, or the default when the style has no such slider.
import { msg, vid, cam } from './ui.js';

export const OW = 1080, OH = 1920;

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
  async function infer() {
    M.busy = true;
    try {
      const k = Math.max(12, Math.round(opt('dpq', 22) < 0 ? 12 : opt('dpq', 22))), W = 14 * k, H = 14 * Math.round(W * 16 / 9 / 14);
      if (ic.width !== W || ic.height !== H) { ic.width = W; ic.height = H; }
      const c = crop();
      ix.save(); if (c.mir) { ix.translate(W, 0); ix.scale(-1, 1); }
      ix.drawImage(vid, c.sx, c.sy, c.cw, c.ch, 0, 0, W, H); ix.restore();
      const px = ix.getImageData(0, 0, W, H).data, n = W * H, f = new Float32Array(3 * n);
      const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
      for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) f[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / sd[ch];
      const t0 = performance.now();
      const run = async (sess) => {
        const out = await sess.run({ [sess.inputNames[0]]: new M.ort.Tensor('float32', f, [1, 3, H, W]) });
        const o = out[sess.outputNames[0]], dims = o.dims;
        return { d: Float32Array.from(o.data ?? await o.getData()), oh: dims[dims.length - 2], ow: dims[dims.length - 1] };
      };
      const w2 = M.sess.length > 1 ? Math.max(0, opt('dpw', 0.5)) : 0;
      const res = await Promise.all(M.sess.slice(0, w2 > 0 ? 2 : 1).map(run));
      const { d, oh, ow } = res[0];
      if (res[1] && res[1].d.length === d.length) {             // second model: fit a*d2 + b to d1 (least squares), then average
        const d2 = res[1].d; let sx = 0, sy = 0, sxx = 0, sxy = 0; const n2 = d.length;
        for (let i = 0; i < n2; i++) { sx += d2[i]; sy += d[i]; sxx += d2[i] * d2[i]; sxy += d2[i] * d[i]; }
        const a = (n2 * sxy - sx * sy) / Math.max(1e-9, n2 * sxx - sx * sx), b = (sy - a * sx) / n2;
        for (let i = 0; i < n2; i++) d[i] = d[i] * (1 - w2) + (a * d2[i] + b) * w2;
      }
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
      if (first) { for (const k of ['sm', 'out', 'bl', 'tmp', 'prevOut', 'mot', 'lum']) M[k] = new Float32Array(nd); M.prevLum = null; }
      const v = M.tmp;                                          // this map, normalised 0 (far) .. 1 (near), not clipped yet
      for (let i = 0; i < nd; i++) v[i] = (d[i] - M.lo) / span;
      // motion: how much the video changed at each spot since the last map (moving spots follow fast, still spots smooth hard)
      const lum = M.lum, sameSize = ow * oh === W * H;
      if (sameSize) for (let i = 0; i < nd; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
      const mf = Math.max(0, opt('dpm', 0.7)), mot = M.mot;
      if (M.prevLum && mf > 0 && sameSize) {
        for (let i = 0; i < nd; i++) mot[i] = Math.abs(lum[i] - M.prevLum[i]);
        blur3(mot, M.bl, ow, oh);                               // spread a little so whole moving shapes follow
      } else mot.fill(0);
      M.prevLum = sameSize ? Float32Array.from(lum) : null;
      if (first) { M.sm.set(v); }
      else {
        // time smoothing, motion aware: still spots keep most of the old map, moving spots follow the new one
        const s = Math.max(0, opt('dps', 0.8));
        for (let i = 0; i < nd; i++) {
          const keep = s * (1 - Math.min(1, mot[i] * 25 * mf));
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
