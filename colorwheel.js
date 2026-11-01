// Colour wheel editor, after color.adobe.com: an artist's (RYB) wheel, 2 or 3 draggable colours,
// harmony rules, a brightness slider for the selected colour, hex fields and a paper colour.
// State: { n, rule, base, cols: [{ a, s, v }], paper }  a = wheel angle (deg, 0 = right, counter-clockwise), s = saturation, v = brightness.

// ---------------------------------------------------------------- RYB wheel <-> HSV hue
// wheel angle -> HSV hue, Itten RYB spacing: red 0, orange 60, yellow 120, green 180, blue 240, violet 300 (complements as painters expect)
const MAP = [[0, 0], [60, 30], [120, 60], [180, 120], [240, 220], [300, 280], [360, 360]];
const lerpMap = (x, from, to) => {
  x = ((x % 360) + 360) % 360;
  for (let i = 1; i < MAP.length; i++) {
    const a = MAP[i - 1], b = MAP[i];
    if (x <= b[from]) return a[to] + (b[to] - a[to]) * (x - a[from]) / (b[from] - a[from]);
  }
  return x;
};
export const wheelToHue = (a) => lerpMap(a, 0, 1);
export const hueToWheel = (h) => lerpMap(h, 1, 0);

export function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx > 0 ? d / mx : 0, mx];
}
const toHex = (rgb) => '#' + rgb.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
const fromHex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
export const colRGB = (c) => hsv2rgb(wheelToHue(c.a), c.s, c.v);
export const colHex = (c) => toHex(colRGB(c));
export const hexToCol = (hex) => { const rgb = fromHex(hex); if (!rgb) return null; const [h, s, v] = rgb2hsv(...rgb); return { a: hueToWheel(h), s, v }; };

// ---------------------------------------------------------------- harmony rules (angle offsets from the base colour)
// For Monochromatic / Shades the angle stays and saturation / brightness spread instead.
export const RULES = {
  analogous: { label: 'Analogous', off: [0, 30, -30] },
  mono: { label: 'Monochromatic', off: [0, 0, 0], mono: true },
  triad: { label: 'Triad', off: [0, 120, -120] },
  complementary: { label: 'Complementary', off: [0, 180, 0], third: 'lighter' },
  split: { label: 'Split complementary', off: [0, 150, -150] },
  square: { label: 'Square', off: [0, 90, 180] },
  compound: { label: 'Compound', off: [0, 30, 195] },
  shades: { label: 'Shades', off: [0, 0, 0], shades: true },
  custom: { label: 'Custom' },
};
function applyRule(st) {
  const R = RULES[st.rule]; if (!R || !R.off) return;
  const b = st.cols[st.base];
  for (let k = 0; k < st.cols.length; k++) {
    if (k === st.base) continue;
    const slot = (k - st.base + 3) % 3, c = st.cols[k];
    c.a = b.a + R.off[slot];
    if (R.mono) { c.s = Math.max(0.08, b.s * (slot === 1 ? 0.55 : 0.3)); c.v = Math.min(1, b.v * (slot === 1 ? 1.1 : 1.25)); }
    else if (R.shades) { c.s = b.s; c.v = Math.max(0.12, b.v * (slot === 1 ? 0.62 : 0.35)); }
    else if (R.third === 'lighter' && slot === 2) { c.s = b.s * 0.45; c.v = Math.min(1, b.v * 1.15); }
    else { c.s = b.s; c.v = b.v; }
  }
}

// ---------------------------------------------------------------- the editor
// root: element to build into. onChange(state) fires on every edit.
export function createWheel(root, state, onChange) {
  const st = state;
  const SIZE = 220, R = SIZE / 2 - 8;
  root.innerHTML = `
    <div class="cw-top">
      <span class="cw-n"><button type="button" data-n="2">2 colours</button><button type="button" data-n="3">3 colours</button></span>
      <select class="cw-rule">${Object.entries(RULES).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('')}</select>
    </div>
    <div class="cw-body">
      <canvas class="cw-wheel" width="${SIZE * 2}" height="${SIZE * 2}" style="width:${SIZE}px;height:${SIZE}px"></canvas>
      <div class="cw-side">
        <div class="cw-sw"></div>
        <label class="cw-bri">brightness <input type="range" min="0" max="1" step="0.005"></label>
        <label class="cw-paper">paper <input type="color"></label>
      </div>
    </div>`;
  const cv = root.querySelector('.cw-wheel'), cx = cv.getContext('2d'), ruleSel = root.querySelector('.cw-rule');
  const bri = root.querySelector('.cw-bri input'), paper = root.querySelector('.cw-paper input'), swWrap = root.querySelector('.cw-sw');
  let sel = st.base, wheelV = -1, wheelImg = null;

  const names = () => (st.n === 2 ? ['dark areas', 'light areas'] : ['dark areas', 'middle', 'light areas']);
  const active = () => st.cols.slice(0, st.n);
  function wheelImage(v) {                                    // the wheel at the selected colour's brightness
    if (wheelImg && Math.abs(v - wheelV) < 0.004) return wheelImg;
    const W = SIZE * 2, img = cx.createImageData(W, W), c = W / 2, rr = R * 2;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const dx = x - c, dy = c - y, d = Math.hypot(dx, dy), i = (y * W + x) * 4;
      if (d > rr + 1) { img.data[i + 3] = 0; continue; }
      const a = Math.atan2(dy, dx) * 180 / Math.PI, rgb = hsv2rgb(wheelToHue(a), Math.min(1, d / rr), v);
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = d > rr ? 255 * (rr + 1 - d) : 255;
    }
    wheelV = v; wheelImg = img; return img;
  }
  const pos = (c) => { const t = c.a * Math.PI / 180; return [SIZE + Math.cos(t) * c.s * R * 2, SIZE - Math.sin(t) * c.s * R * 2]; };
  function draw() {
    cx.putImageData(wheelImage(st.cols[sel].v), 0, 0);
    cx.lineWidth = 2; cx.strokeStyle = '#fff';
    for (const c of active()) { const [x, y] = pos(c); cx.beginPath(); cx.moveTo(SIZE, SIZE); cx.lineTo(x, y); cx.stroke(); }
    active().forEach((c, k) => {
      const [x, y] = pos(c), r = k === st.base ? 17 : 13;
      cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fillStyle = colHex(c); cx.fill();
      cx.lineWidth = k === sel ? 4 : 2.5; cx.strokeStyle = '#fff'; cx.stroke();
      if (k === st.base) { cx.beginPath(); cx.arc(x, y, 6, 0, Math.PI * 2); cx.lineWidth = 2.5; cx.stroke(); }
    });
  }
  function swatches() {
    swWrap.innerHTML = '';
    active().forEach((c, k) => {
      const row = document.createElement('div'); row.className = 'cw-row' + (k === sel ? ' sel' : '');
      row.innerHTML = `<i style="background:${colHex(c)}"></i><input type="text" value="${colHex(c)}" maxlength="7"><span>${names()[k]}${k === st.base ? ' (base)' : ''}</span>`;
      row.querySelector('i').onclick = () => { sel = k; refresh(false); };
      const inp = row.querySelector('input');
      inp.onfocus = () => { if (sel !== k) { sel = k; refresh(false); inp.focus(); } };
      inp.onchange = () => { const n = hexToCol(inp.value); if (n) { Object.assign(st.cols[k], n); if (k === st.base) applyRule(st); else st.rule = 'custom'; } refresh(true); };
      swWrap.append(row);
    });
  }
  function refresh(changed) {
    root.querySelectorAll('[data-n]').forEach((b) => b.classList.toggle('on', +b.dataset.n === st.n));
    ruleSel.value = st.rule; bri.value = st.cols[sel].v; paper.value = st.paper;
    draw(); swatches();
    if (changed) onChange(st);
  }
  // drag: the base (or any colour in Custom) moves freely; another colour in a rule turns the whole set and sets its own saturation
  let drag = -1, lastA = 0;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * 2, (e.clientY - b.top) * 2]; };
  const toCol = ([x, y]) => ({ a: Math.atan2(SIZE - y, x - SIZE) * 180 / Math.PI, s: Math.min(1, Math.hypot(x - SIZE, y - SIZE) / (R * 2)) });
  cv.addEventListener('pointerdown', (e) => {
    const p = at(e); let best = -1, bd = 40;
    active().forEach((c, k) => { const [x, y] = pos(c), d = Math.hypot(x - p[0], y - p[1]); if (d < bd) { bd = d; best = k; } });
    if (best < 0) return;
    drag = sel = best; lastA = toCol(p).a; cv.setPointerCapture(e.pointerId); e.preventDefault(); refresh(false);
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const n = toCol(at(e)), c = st.cols[drag];
    if (st.rule === 'custom' || drag === st.base) { c.a = n.a; c.s = n.s; applyRule(st); }
    else { const d = n.a - lastA; for (const k of active()) k.a += d; c.s = n.s; lastA = n.a; }
    refresh(true);
  });
  const end = () => { drag = -1; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  // 3 -> 2 drops the middle colour (kept aside as the spare), 2 -> 3 brings it back between dark and light
  root.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => {
    const n = +b.dataset.n; if (n === st.n) return;
    st.cols = [st.cols[0], st.cols[2], st.cols[1]]; st.n = n;
    if (sel >= st.n) sel = 0; if (st.base >= st.n) st.base = 0; applyRule(st); refresh(true);
  }; });
  ruleSel.onchange = () => { st.rule = ruleSel.value; applyRule(st); refresh(true); };
  bri.oninput = () => { st.cols[sel].v = +bri.value; if (sel === st.base) applyRule(st); else if (RULES[st.rule].mono || RULES[st.rule].shades) st.rule = 'custom'; refresh(true); };
  paper.oninput = () => { st.paper = paper.value; onChange(st); };
  refresh(false);
  return { refresh: () => { if (sel >= st.n) sel = 0; refresh(false); } };
}
