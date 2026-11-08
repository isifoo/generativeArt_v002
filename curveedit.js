// CURVE EDITOR: a small graph in the Edit panel. 2 to 12 points joined by Bezier segments (with handles) or straight lines.
// x runs 0 .. 1 left to right, y 0 .. 1 bottom to top. The curve is sampled into a 256 entry table that the line engine reads on the GPU.
// All state lives in one JSON string (the hidden input #cvdata), so the settings system saves and restores it like any other control.
import { $ } from './ui.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const MODES = [['dark', 'Darkness of the picture (light left, dark right)'], ['y', 'Position, top to bottom'], ['x', 'Position, left to right'], ['centre', 'Distance from the centre']];

// the default: a flat line at y (0.30 = the V1 straightening), 6 points
function flat(n, y) {
  const pts = []; for (let i = 0; i < n; i++) pts.push({ x: i / (n - 1), y, ax: 0, ay: 0, bx: 0, by: 0 });
  return smooth({ n, type: 'bezier', pts });
}
// handles from the neighbours (a smooth curve through the points): a third of the way to each neighbour, along the slope between them
function smooth(s) {
  const p = s.pts, n = p.length;
  for (let i = 0; i < n; i++) {
    const prev = p[Math.max(0, i - 1)], next = p[Math.min(n - 1, i + 1)], dx = next.x - prev.x || 1, m = (next.y - prev.y) / dx;
    const hl = i > 0 ? (p[i].x - p[i - 1].x) / 3 : 0, hr = i < n - 1 ? (p[i + 1].x - p[i].x) / 3 : 0;
    p[i].ax = -hl; p[i].ay = -m * hl; p[i].bx = hr; p[i].by = m * hr;
  }
  return s;
}
// the curve as a polyline [x, y] pairs (dense for Bezier)
function polyline(s) {
  const p = s.pts, out = [];
  if (s.type === 'linear') { for (const q of p) out.push([q.x, q.y]); return out; }
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], x0 = a.x, x1 = b.x;
    const c1x = clamp(a.x + a.bx, x0, x1), c1y = a.y + a.by, c2x = clamp(b.x + b.ax, x0, x1), c2y = b.y + b.ay;
    for (let k = 0; k < 40; k++) {
      const t = k / 40, u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      out.push([w0 * x0 + w1 * c1x + w2 * c2x + w3 * x1, w0 * a.y + w1 * c1y + w2 * c2y + w3 * b.y]);
    }
  }
  const l = p[p.length - 1]; out.push([l.x, l.y]); return out;
}
export function evalTable(s) {                                  // 256 values, y clamped to 0 .. 0.98 (a straightening amount)
  const poly = polyline(s), lut = new Float32Array(256); let j = 0;
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    while (j < poly.length - 2 && poly[j + 1][0] < x) j++;
    const [x0, y0] = poly[j], [x1, y1] = poly[j + 1], t = x1 > x0 ? clamp((x - x0) / (x1 - x0), 0, 1) : 0;
    lut[k] = clamp(y0 + (y1 - y0) * t, 0, 0.98);
  }
  return lut;
}
function resample(s, n) {                                       // a new number of points on the same shape
  const lut = evalTable({ ...s, pts: s.pts }), pts = [];
  for (let i = 0; i < n; i++) { const x = i / (n - 1); pts.push({ x, y: lut[Math.round(x * 255)], ax: 0, ay: 0, bx: 0, by: 0 }); }
  return smooth({ n, type: s.type, pts });
}

// mountCurveEditor(host, onChange): builds the controls inside host. onChange(table, mode) fires on every edit and on a restore.
export function mountCurveEditor(host, onChange, defaultY = 0.3) {
  host.innerHTML = `
    <canvas id="cvcanvas" width="560" height="320" style="width:100%;max-width:320px;height:auto;aspect-ratio:7/4;touch-action:none;background:#111;border:1px solid #444;border-radius:4px;cursor:crosshair"></canvas>
    <div class="note" style="margin:2px 0 4px">y = straightening (up = straighter, down = wigglier). Drag the dots; in Bezier mode drag the small squares (handles) to bend.</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
      <label class="note">Curve reads <select id="cvmode" data-save>${MODES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="note">Line type <select id="cvtype" data-save><option value="bezier">Bezier</option><option value="linear">Linear</option></select></label>
      <label class="note">Points <input id="cvn" data-save type="number" min="2" max="12" step="1" value="6" style="width:46px"></label>
      <button type="button" id="cvsmooth" title="Smooth handles from the neighbouring points">Smooth</button>
      <button type="button" id="cvreset" title="Flat line at the V1 straightening">Reset</button>
    </div>
    <input id="cvdata" data-save type="text" style="display:none">`;
  const cv = host.querySelector('#cvcanvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height, PAD = 18;
  const selType = host.querySelector('#cvtype'), inN = host.querySelector('#cvn'), data = host.querySelector('#cvdata'), selMode = host.querySelector('#cvmode');
  let S = flat(6, defaultY), drag = null;
  const px = (x) => PAD + x * (W - 2 * PAD), py = (y) => H - PAD - y * (H - 2 * PAD), ux = (X) => (X - PAD) / (W - 2 * PAD), uy = (Y) => (H - PAD - Y) / (H - 2 * PAD);
  const fire = () => { data.value = JSON.stringify(S); onChange(evalTable(S), selMode.value); };
  function draw() {
    g.clearRect(0, 0, W, H); g.lineWidth = 1; g.strokeStyle = '#2c2c2c';
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(px(i / 4), py(0)); g.lineTo(px(i / 4), py(1)); g.moveTo(px(0), py(i / 4)); g.lineTo(px(1), py(i / 4)); g.stroke(); }
    g.strokeStyle = '#555'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px(0), py(0.3)); g.lineTo(px(1), py(0.3)); g.stroke(); g.setLineDash([]);   // 0.30: the V1 value
    g.strokeStyle = '#e8d37a'; g.lineWidth = 2.5; g.beginPath(); polyline(S).forEach(([x, y], i) => (i ? g.lineTo(px(x), py(clamp(y, 0, 1))) : g.moveTo(px(x), py(clamp(y, 0, 1))))); g.stroke();
    if (S.type === 'bezier') {
      g.lineWidth = 1; g.strokeStyle = '#7aa8e8'; g.fillStyle = '#7aa8e8';
      S.pts.forEach((p, i) => {
        for (const [dx, dy, on] of [[p.ax, p.ay, i > 0], [p.bx, p.by, i < S.pts.length - 1]]) if (on) {
          const hx = px(p.x + dx), hy = py(p.y + dy); g.beginPath(); g.moveTo(px(p.x), py(p.y)); g.lineTo(hx, hy); g.stroke(); g.fillRect(hx - 4, hy - 4, 8, 8);
        }
      });
    }
    S.pts.forEach((p) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(px(p.x), py(p.y), 6, 0, 7); g.fill(); });
  }
  function hit(mx, my) {                                         // the dot or handle under the pointer
    let best = null, bd = 14;
    S.pts.forEach((p, i) => {
      let d = Math.hypot(px(p.x) - mx, py(p.y) - my); if (d < bd) { bd = d; best = { i, k: 'p' }; }
      if (S.type === 'bezier') {
        if (i > 0) { d = Math.hypot(px(p.x + p.ax) - mx, py(p.y + p.ay) - my); if (d < bd) { bd = d; best = { i, k: 'a' }; } }
        if (i < S.pts.length - 1) { d = Math.hypot(px(p.x + p.bx) - mx, py(p.y + p.by) - my); if (d < bd) { bd = d; best = { i, k: 'b' }; } }
      }
    });
    return best;
  }
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  cv.addEventListener('pointerdown', (e) => { const [mx, my] = pos(e), h = hit(mx, my); if (h) { drag = h; cv.setPointerCapture(e.pointerId); } });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [mx, my] = pos(e), p = S.pts[drag.i], n = S.pts.length, X = ux(mx), Y = clamp(uy(my), 0, 1);
    if (drag.k === 'p') {
      p.y = Y; if (drag.i > 0 && drag.i < n - 1) p.x = clamp(X, S.pts[drag.i - 1].x + 0.02, S.pts[drag.i + 1].x - 0.02);
      for (const q of [S.pts[drag.i - 1], S.pts[drag.i + 1]]) if (q) { /* neighbours' handles stay: they are offsets */ }
    } else if (drag.k === 'a') { p.ax = clamp(X - p.x, S.pts[drag.i - 1].x - p.x, 0); p.ay = Y - p.y; }
    else { p.bx = clamp(X - p.x, 0, S.pts[drag.i + 1].x - p.x); p.by = Y - p.y; }
    draw(); fire();
  });
  const up = () => { drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  selType.onchange = () => { S.type = selType.value; draw(); fire(); };
  selMode.onchange = fire;
  inN.oninput = () => { const n = clamp(Math.round(+inN.value) || 6, 2, 12); if (n !== S.pts.length) { S = resample(S, n); draw(); fire(); } };
  host.querySelector('#cvsmooth').onclick = () => { smooth(S); draw(); fire(); };
  host.querySelector('#cvreset').onclick = () => { S = flat(S.pts.length, defaultY); draw(); fire(); };
  // a restored setting (autosave, defaults, a settings file): the whole state arrives as JSON
  data.oninput = () => {
    try {
      const o = JSON.parse(data.value);
      if (o && Array.isArray(o.pts) && o.pts.length >= 2) { S = { n: o.pts.length, type: o.type === 'linear' ? 'linear' : 'bezier', pts: o.pts.map((q) => ({ x: +q.x, y: +q.y, ax: +q.ax || 0, ay: +q.ay || 0, bx: +q.bx || 0, by: +q.by || 0 })) }; selType.value = S.type; inN.value = S.pts.length; draw(); onChange(evalTable(S), selMode.value); }
    } catch {}
  };
  draw(); fire();
  return { state: () => S };
}
