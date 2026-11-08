// PATTERN SPLINE EDITOR (Line_v02). The repeating shape of the line, drawn as a small spline in the plane: 2 to 12 points, each with an x and a y,
// joined by Bezier segments (with handles) or straight lines. Units are R, the line spacing, so one unit = the gap between two neighbouring lines.
// Two directions, one shape:
//   RECOGNISE: "Read from the result" finds the repeating motif in the line the generator has made and puts it here as a spline.
//   DRIVE: the spline is turned into a curvature signature (how much the line bends along its length); the generator makes every point of the line
//          follow that signature, one copy after the other (each copy mirrored, so left and right turns alternate like the labyrinth lines).
// All state is one JSON string (the hidden input #cvdata), so the settings system saves and restores it like any other control.
import { $ } from './ui.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const BOX = 7;                                                   // the editor shows a BOX x BOX area, in R units
const KMAX = 2.5;                                                // largest bend, 1/R

// the first motif: one hairpin of the labyrinth line, as drawn by hand on a screenshot of the result (x, y in R, y down)
const DEFAULT_PTS = [[0.25, 0.2], [0.5, 1.28], [1.83, 1.95], [1.23, 4.73], [0.28, 4.8], [0.25, 2.58]].map(([x, y]) => [x + 2.6, y + 1.0]);

function newState(pts, type = 'bezier', alt = true) {
  const s = { v: 2, type, alt, pts: pts.map(([x, y]) => ({ x, y, ax: 0, ay: 0, bx: 0, by: 0 })) };
  return smooth(s);
}
// handles from the neighbours: a third of the way to each neighbour, along the direction between them (a smooth path through the points)
function smooth(s) {
  const p = s.pts, n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const hl = i > 0 ? Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) / 3 : 0, hr = i < n - 1 ? Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) / 3 : 0;
    p[i].ax = -tx * hl; p[i].ay = -ty * hl; p[i].bx = tx * hr; p[i].by = ty * hr;
  }
  return s;
}
export function polyline(s, steps = 48) {                        // the path as [x, y] pairs
  const p = s.pts, out = [];
  if (s.type === 'linear') { for (const q of p) out.push([q.x, q.y]); return out; }
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], c1x = a.x + a.bx, c1y = a.y + a.by, c2x = b.x + b.ax, c2y = b.y + b.ay;
    for (let k = 0; k < steps; k++) {
      const t = k / steps, u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      out.push([w0 * a.x + w1 * c1x + w2 * c2x + w3 * b.x, w0 * a.y + w1 * c1y + w2 * c2y + w3 * b.y]);
    }
  }
  const l = p[p.length - 1]; out.push([l.x, l.y]); return out;
}
// the bend along the path: kappa(s) = d(heading)/ds, on an even grid of n steps, plus the path length (R)
export function bend(poly, n = 128) {
  const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1] || 1e-6, at = (s) => { let j = 1; while (j < cum.length - 1 && cum[j] < s) j++; const t = cum[j] > cum[j - 1] ? (s - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0; return [poly[j - 1][0] + (poly[j][0] - poly[j - 1][0]) * t, poly[j - 1][1] + (poly[j][1] - poly[j - 1][1]) * t]; };
  const m = 400, head = [];                                       // heading at 400 even steps, unwrapped
  let prev = at(0), last = 0;
  for (let k = 1; k <= m; k++) { const q = at(L * k / m); let h = Math.atan2(q[1] - prev[1], q[0] - prev[0]); while (h - last > Math.PI) h -= 2 * Math.PI; while (h - last < -Math.PI) h += 2 * Math.PI; head.push(h); last = h; prev = q; }
  const ds = L / m, w = Math.max(2, Math.round(0.2 / ds)), kap = new Float32Array(n);
  for (let k = 0; k < n; k++) { const c = Math.round((k + 0.5) / n * (m - 1)), a = Math.max(0, c - w), b = Math.min(m - 1, c + w); kap[k] = clamp((head[b] - head[a]) / Math.max(1e-6, (b - a) * ds), -KMAX, KMAX); }
  return { kap, L };
}
// the table the GPU reads: 256 bends over one full period (the motif, then its mirror image), and the period length in R at index 256
export function tableOf(s) {
  const { kap, L } = bend(polyline(s), 128), t = new Float32Array(257);
  for (let k = 0; k < 128; k++) { t[k] = kap[k]; t[128 + k] = s.alt ? -kap[k] : kap[k]; }
  t[256] = Math.max(1, (s.alt ? 2 : 1) * L); return t;
}
function resample(s, n) {                                        // a new number of points on the same path
  const poly = polyline(s), cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1], pts = []; let j = 1;
  for (let i = 0; i < n; i++) { const t = L * i / (n - 1); while (j < cum.length - 1 && cum[j] < t) j++; const f = cum[j] > cum[j - 1] ? (t - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0; pts.push([poly[j - 1][0] + (poly[j][0] - poly[j - 1][0]) * f, poly[j - 1][1] + (poly[j][1] - poly[j - 1][1]) * f]); }
  return newState(pts, s.type, s.alt);
}

// RECOGNISE. pos: Float32Array of xy pairs (the line, in order, a closed ring), rOf(x, y): the spacing R there, rmax: the largest spacing.
// Steps: bend along the line in R units, keep the light regions (even spacing), find the repeat length by autocorrelation, cut windows round the
// strongest bends (right bends flipped to left), average them. That average is the motif; its bend is integrated back into a path of 6 points.
export function recogniseMotif(pos, rOf, rmax, nPts = 6) {
  const N = pos.length / 2; if (N < 200) return null;
  const sR = new Float64Array(N + 1), kR = new Float64Array(N), ok = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = i, b = (i + 1) % N, x0 = pos[2 * a], y0 = pos[2 * a + 1], x1 = pos[2 * b], y1 = pos[2 * b + 1], R = Math.max(1e-3, rOf(x0, y0));
    sR[i + 1] = sR[i] + Math.hypot(x1 - x0, y1 - y0) / R; ok[i] = R > 0.8 * rmax ? 1 : 0;
  }
  for (let i = 0; i < N; i++) {                                    // turning angle at each point, per R of length
    const a = (i + N - 1) % N, b = (i + 1) % N, ux = pos[2 * i] - pos[2 * a], uy = pos[2 * i + 1] - pos[2 * a + 1], vx = pos[2 * b] - pos[2 * i], vy = pos[2 * b + 1] - pos[2 * i + 1];
    const ang = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy), ds = Math.max(1e-3, (sR[i + 1] - sR[(i + N - 1) % N]) * 0.5 + 0);
    const R = Math.max(1e-3, rOf(pos[2 * i], pos[2 * i + 1])), dl = (Math.hypot(ux, uy) + Math.hypot(vx, vy)) * 0.5 / R;
    kR[i] = clamp(ang / Math.max(1e-3, dl), -6, 6); void ds;
  }
  const STEP = 0.1, Ltot = sR[N], M = Math.floor(Ltot / STEP); if (M < 400) return null;
  const K = new Float32Array(M), good = new Uint8Array(M);         // bend on an even grid along the line, light regions only
  { let j = 0; for (let m = 0; m < M; m++) { const s = m * STEP; while (j < N - 1 && sR[j + 1] < s) j++; K[m] = kR[j]; good[m] = ok[j]; } }
  const sm = new Float32Array(M), W = 2;                           // smooth over 0.5 R
  for (let m = 0; m < M; m++) { let q = 0, c = 0; for (let d = -W; d <= W; d++) { const k = m + d; if (k >= 0 && k < M && good[k]) { q += K[k]; c++; } } sm[m] = c > 2 && good[m] ? q / c : 0; }
  let e = 0, ec = 0; for (let m = 0; m < M; m++) if (good[m]) { e += sm[m] * sm[m]; ec++; } if (ec < 300) return null;
  const lags = []; let best = null;                                // the repeat length: the first strong positive peak of the autocorrelation after its first dip
  const ac = (lag) => { let q = 0, c = 0; for (let m = 0; m + lag < M; m += 2) if (good[m] && good[m + lag]) { q += sm[m] * sm[m + lag]; c++; } return c > 100 ? q / c : 0; };
  const L0 = Math.round(3 / STEP), L1 = Math.round(30 / STEP); for (let l = L0; l <= L1; l += 2) lags.push(ac(l));
  let dip = -1; for (let i = 1; i < lags.length - 1; i++) if (lags[i] < lags[i - 1] && lags[i] <= lags[i + 1] && lags[i] < 0) { dip = i; break; }
  if (dip >= 0) for (let i = dip + 1; i < lags.length - 1; i++) if (lags[i] > lags[i - 1] && lags[i] >= lags[i + 1] && lags[i] > 0) { best = (L0 + 2 * i) * STEP; break; }
  const P = best || 19.2, half = P / 2;
  // windows round the strongest bends
  const thr = (() => { const v = []; for (let m = 0; m < M; m += 3) if (good[m]) v.push(Math.abs(sm[m])); v.sort((a, b) => a - b); return v[Math.floor(v.length * 0.9)] || 0.5; })();
  const Wn = Math.round(half / STEP), acc = new Float64Array(Wn), cnt = new Float64Array(Wn); let nWin = 0;   // window = from -P/4 to +P/4 round a peak
  for (let m = Wn; m < M - Wn; m++) {
    const v = sm[m]; if (!good[m] || Math.abs(v) < thr || Math.abs(v) < Math.abs(sm[m - 1]) || Math.abs(v) < Math.abs(sm[m + 1])) continue;
    let sup = false; for (let d = -Math.round(0.4 * P / STEP); d < 0; d++) if (m + d >= 0 && Math.abs(sm[m + d]) > Math.abs(v) && good[m + d]) { sup = true; break; }
    if (sup) continue;
    const sg = v > 0 ? 1 : -1; let all = true; for (let d = -Wn / 2; d < Wn / 2; d++) if (!good[m + Math.round(d)]) { all = false; break; } if (!all) continue;
    for (let d = 0; d < Wn; d++) { const k = m - Math.round(Wn / 2) + d; acc[d] += sg * sm[k]; cnt[d]++; } nWin++;
    m += Math.round(0.4 * P / STEP);
  }
  if (nWin < 3) return null;
  const km = new Float32Array(Wn); for (let d = 0; d < Wn; d++) km[d] = clamp(acc[d] / Math.max(1, cnt[d]), -KMAX, KMAX);
  // integrate the bend into a path (start heading down), then pick the points evenly along it
  const path = [[0, 0]]; let h = Math.PI / 2, x = 0, y = 0;
  for (let d = 0; d < Wn; d++) { h += km[d] * STEP; x += Math.cos(h) * STEP; y += Math.sin(h) * STEP; path.push([x, y]); }
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const L = cum[cum.length - 1], pts = []; let j = 1;
  for (let i = 0; i < nPts; i++) { const t = L * i / (nPts - 1); while (j < cum.length - 1 && cum[j] < t) j++; const f = cum[j] > cum[j - 1] ? (t - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0; pts.push([path[j - 1][0] + (path[j][0] - path[j - 1][0]) * f, path[j - 1][1] + (path[j][1] - path[j - 1][1]) * f]); }
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9; for (const [px, py] of pts) { mnx = Math.min(mnx, px); mny = Math.min(mny, py); mxx = Math.max(mxx, px); mxy = Math.max(mxy, py); }
  const ox = BOX / 2 - (mnx + mxx) / 2, oy = BOX / 2 - (mny + mxy) / 2, st = newState(pts.map(([px, py]) => [px + ox, py + oy]), 'bezier', true);
  return { state: st, period: P, windows: nWin };
}

// mountCurveEditor(host, onChange, getLearn): builds the controls inside host. onChange(table) fires on every edit and on a restore.
// getLearn(): async () => { pos, rOf, rmax } supplied by the line engine for "Read from the result".
export function mountCurveEditor(host, onChange, getLearn) {
  host.innerHTML = `
    <canvas id="cvcanvas" width="560" height="560" style="width:100%;max-width:300px;height:auto;aspect-ratio:1;touch-action:none;background:#111;border:1px solid #444;border-radius:4px;cursor:crosshair"></canvas>
    <div class="note" style="margin:2px 0 4px">The repeating shape of the line, one hairpin. Drag the dots (x and y) and the small squares (handles). Grid = 1 line gap (R). The line makes this shape, then its mirror image, again and again.</div>
    <canvas id="cvprev" width="560" height="200" style="width:100%;max-width:300px;height:auto;aspect-ratio:2.8;background:#111;border:1px solid #333;border-radius:4px"></canvas>
    <div class="note" style="margin:2px 0 4px">What the line will do with it (a few repeats).</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
      <button type="button" id="cvlearn" title="Find the repeating pattern in the line as it is now and show it here">Read from the result</button>
      <label class="note">Line type <select id="cvtype" data-save><option value="bezier">Bezier</option><option value="linear">Linear</option></select></label>
      <label class="note">Points <input id="cvn" data-save type="number" min="2" max="12" step="1" value="6" style="width:46px"></label>
      <label class="note"><input id="cvalt" data-save type="checkbox" checked> mirror every repeat</label>
      <button type="button" id="cvsmooth" title="Smooth handles from the neighbouring points">Smooth</button>
      <button type="button" id="cvreset" title="Back to the first hairpin">Reset</button>
    </div>
    <div class="note" id="cvinfo" style="margin-top:3px"></div>
    <input id="cvdata" data-save type="text" style="display:none">`;
  const cv = host.querySelector('#cvcanvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height, PAD = 14, pv = host.querySelector('#cvprev'), pg = pv.getContext('2d');
  const selType = host.querySelector('#cvtype'), inN = host.querySelector('#cvn'), chkAlt = host.querySelector('#cvalt'), data = host.querySelector('#cvdata'), info = host.querySelector('#cvinfo');
  let S = newState(DEFAULT_PTS), drag = null;
  const sc = (W - 2 * PAD) / BOX, px = (x) => PAD + x * sc, py = (y) => PAD + y * sc, ux = (X) => (X - PAD) / sc, uy = (Y) => (Y - PAD) / sc;
  function preview(t) {                                             // integrate the bend table: the line the generator will draw
    pg.clearRect(0, 0, pv.width, pv.height);
    const Lp = t[256], reps = 4, n = 700, ds = Lp * reps / n; let x = 0, y = 0, h = 0; const pts = [[0, 0]];
    for (let i = 0; i < n; i++) { const u = ((i * ds) / Lp) % 1; h += t[Math.min(255, Math.floor(u * 256))] * ds; x += Math.cos(h) * ds; y += Math.sin(h) * ds; pts.push([x, y]); }
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [X, Y] of pts) { a = Math.min(a, X); b = Math.min(b, Y); c = Math.max(c, X); d = Math.max(d, Y); }
    const k = Math.min((pv.width - 20) / Math.max(0.5, c - a), (pv.height - 20) / Math.max(0.5, d - b));
    pg.strokeStyle = '#e8d37a'; pg.lineWidth = 2; pg.beginPath(); pts.forEach(([X, Y], i) => { const qx = 10 + (X - a) * k, qy = 10 + (Y - b) * k; if (i) pg.lineTo(qx, qy); else pg.moveTo(qx, qy); }); pg.stroke();
  }
  const fire = () => { data.value = JSON.stringify(S); const t = tableOf(S); onChange(t); preview(t); info.textContent = 'one hairpin = ' + (t[256] / (S.alt ? 2 : 1)).toFixed(1) + ' R long, repeats every ' + t[256].toFixed(1) + ' R'; };
  function draw() {
    g.clearRect(0, 0, W, H); g.lineWidth = 1; g.strokeStyle = '#262626';
    for (let i = 0; i <= BOX; i++) { g.beginPath(); g.moveTo(px(i), py(0)); g.lineTo(px(i), py(BOX)); g.moveTo(px(0), py(i)); g.lineTo(px(BOX), py(i)); g.stroke(); }
    g.strokeStyle = '#e8d37a'; g.lineWidth = 3; g.beginPath(); polyline(S).forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)))); g.stroke();
    if (S.type === 'bezier') {
      g.lineWidth = 1; g.strokeStyle = '#7aa8e8'; g.fillStyle = '#7aa8e8';
      S.pts.forEach((p, i) => { for (const [dx, dy, on] of [[p.ax, p.ay, i > 0], [p.bx, p.by, i < S.pts.length - 1]]) if (on) { const hx = px(p.x + dx), hy = py(p.y + dy); g.beginPath(); g.moveTo(px(p.x), py(p.y)); g.lineTo(hx, hy); g.stroke(); g.fillRect(hx - 5, hy - 5, 10, 10); } });
    }
    S.pts.forEach((p, i) => { g.fillStyle = i === 0 ? '#7fe08a' : '#fff'; g.beginPath(); g.arc(px(p.x), py(p.y), 8, 0, 7); g.fill(); });   // green = where the shape starts
  }
  function hit(mx, my) {
    let best = null, bd = 18;
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
    const [mx, my] = pos(e), p = S.pts[drag.i], X = clamp(ux(mx), -1, BOX + 1), Y = clamp(uy(my), -1, BOX + 1);
    if (drag.k === 'p') { p.x = clamp(X, 0, BOX); p.y = clamp(Y, 0, BOX); } else if (drag.k === 'a') { p.ax = X - p.x; p.ay = Y - p.y; } else { p.bx = X - p.x; p.by = Y - p.y; }
    draw(); fire();
  });
  const up = () => { drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  selType.onchange = () => { S.type = selType.value; draw(); fire(); };
  chkAlt.onchange = () => { S.alt = chkAlt.checked; fire(); };
  inN.oninput = () => { const n = clamp(Math.round(+inN.value) || 6, 2, 12); if (n !== S.pts.length) { S = resample(S, n); draw(); fire(); } };
  host.querySelector('#cvsmooth').onclick = () => { smooth(S); draw(); fire(); };
  host.querySelector('#cvreset').onclick = () => { S = newState(DEFAULT_PTS, S.type, S.alt); inN.value = 6; draw(); fire(); };
  host.querySelector('#cvlearn').onclick = async () => {
    const btn = host.querySelector('#cvlearn'); btn.disabled = true; info.textContent = 'Reading the line...';
    try {
      const L = await getLearn(), r = recogniseMotif(L.pos, L.rOf, L.rmax, clamp(Math.round(+inN.value) || 6, 2, 12));
      if (!r) info.textContent = 'No clear repeating pattern in the line yet. Let it grow a few seconds and try again.';
      else { S = r.state; S.type = selType.value; selType.value = S.type; chkAlt.checked = true; draw(); fire(); info.textContent = 'Found a repeat of ' + r.period.toFixed(1) + ' R (' + r.windows + ' samples). ' + info.textContent; }
    } catch (err) { info.textContent = 'Could not read the line: ' + err.message; }
    btn.disabled = false;
  };
  // a restored setting (autosave, defaults, a settings file): the whole state arrives as JSON
  data.oninput = () => {
    try {
      const o = JSON.parse(data.value);
      if (o && o.v === 2 && Array.isArray(o.pts) && o.pts.length >= 2) { S = { v: 2, type: o.type === 'linear' ? 'linear' : 'bezier', alt: o.alt !== false, pts: o.pts.map((q) => ({ x: +q.x, y: +q.y, ax: +q.ax || 0, ay: +q.ay || 0, bx: +q.bx || 0, by: +q.by || 0 })) }; selType.value = S.type; chkAlt.checked = S.alt; inN.value = S.pts.length; draw(); const t = tableOf(S); onChange(t); preview(t); }
    } catch {}
  };
  draw(); fire();
  return { state: () => S };
}
