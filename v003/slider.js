// SLIDER (v3.0). One component for every parameter.
// Built on pointer events with pointer capture and touch-action:none, so a finger drag works on the first touch on the iPad and does not scroll the page.
// The cogwheel opens a drawer below the slider: Min, Max, Step and Response (how the slider travels: even, or fine at one end).
// spec: { id, label, min, max, step, val, prog }   state: { value, ui: { min, max, step, prog } }
const PROGS = {
  linear: { label: 'Even', f: (t) => t, inv: (v) => v },
  low2: { label: 'Fine at the low end', f: (t) => t * t, inv: (v) => Math.sqrt(v) },
  low3: { label: 'Very fine at the low end', f: (t) => t * t * t, inv: (v) => Math.cbrt(v) },
  high2: { label: 'Fine at the high end', f: (t) => 1 - (1 - t) * (1 - t), inv: (v) => 1 - Math.sqrt(1 - v) },
  high3: { label: 'Very fine at the high end', f: (t) => 1 - (1 - t) ** 3, inv: (v) => 1 - Math.cbrt(1 - v) },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const decimals = (s) => { const t = String(s); const i = t.indexOf('.'); return i < 0 ? 0 : Math.min(6, t.length - i - 1); };
const fmt = (v, step) => (+v).toFixed(decimals(step));

export function createSlider(parent, spec, st, onChange, onUi) {
  const U = () => ({ min: spec.min, max: spec.max, step: spec.step, prog: spec.prog || 'linear', ...(st.ui || {}) });
  const root = document.createElement('div'); root.className = 'sl3';
  root.innerHTML = `<div class="sl3-top"><span class="sl3-lab"></span><input class="sl3-num" type="text" inputmode="decimal" aria-label="value"><button type="button" class="sl3-cog" title="Range, step and response" aria-expanded="false">&#9881;</button></div>
<div class="sl3-track" role="slider" tabindex="0"><div class="sl3-fill"></div><div class="sl3-knob"></div></div>
<div class="sl3-drawer" hidden>
  <label>Min<input type="text" inputmode="decimal" data-k="min"></label>
  <label>Max<input type="text" inputmode="decimal" data-k="max"></label>
  <label>Step<input type="text" inputmode="decimal" data-k="step"></label>
  <label>Response<select data-k="prog">${Object.entries(PROGS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('')}</select></label>
  <button type="button" class="sl3-reset">Reset range</button>
</div>`;
  parent.append(root);
  const $ = (s) => root.querySelector(s);
  const track = $('.sl3-track'), fill = $('.sl3-fill'), knob = $('.sl3-knob'), num = $('.sl3-num'), drawer = $('.sl3-drawer'), cog = $('.sl3-cog');
  $('.sl3-lab').textContent = spec.label;
  track.setAttribute('aria-label', spec.label);

  const snap = (v) => { const u = U(), s = u.step > 0 ? u.step : 0.01; return clamp(+(Math.round((v - u.min) / s) * s + u.min).toFixed(decimals(s) + 1), u.min, u.max); };
  const toT = (v) => { const u = U(), n = clamp((v - u.min) / (u.max - u.min || 1), 0, 1); return clamp((PROGS[u.prog] || PROGS.linear).inv(n), 0, 1); };
  const fromT = (t) => { const u = U(); return snap(u.min + (u.max - u.min) * (PROGS[u.prog] || PROGS.linear).f(clamp(t, 0, 1))); };
  function show() {
    const u = U(), t = toT(st.value);
    fill.style.width = (t * 100) + '%'; knob.style.left = (t * 100) + '%';
    if (document.activeElement !== num) num.value = fmt(st.value, u.step);
    track.setAttribute('aria-valuenow', st.value); track.setAttribute('aria-valuemin', u.min); track.setAttribute('aria-valuemax', u.max);
  }
  function set(v, quiet) { v = snap(v); if (v === st.value) { show(); return; } st.value = v; show(); if (!quiet) onChange(v); }

  // ---- dragging: pointer capture on the track, the knob follows the finger from the first touch
  let drag = false;
  const at = (e) => { const r = track.getBoundingClientRect(); set(fromT((e.clientX - r.left) / Math.max(1, r.width))); };
  track.addEventListener('pointerdown', (e) => { if (e.button > 0) return; drag = true; track.setPointerCapture(e.pointerId); track.classList.add('drag'); at(e); e.preventDefault(); });
  track.addEventListener('pointermove', (e) => { if (drag) { at(e); e.preventDefault(); } });
  const end = (e) => { if (!drag) return; drag = false; track.classList.remove('drag'); try { track.releasePointerCapture(e.pointerId); } catch { /* already released */ } };
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end); track.addEventListener('lostpointercapture', end);
  track.addEventListener('keydown', (e) => {
    const u = U(), s = u.step > 0 ? u.step : 0.01, k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') set(st.value + s * (e.shiftKey ? 10 : 1)); else if (k === 'ArrowLeft' || k === 'ArrowDown') set(st.value - s * (e.shiftKey ? 10 : 1));
    else if (k === 'Home') set(u.min); else if (k === 'End') set(u.max); else return;
    e.preventDefault();
  });
  $('.sl3-lab').addEventListener('dblclick', () => set(spec.val));            // double click on the name: back to the default
  num.addEventListener('focus', () => num.select());
  const commit = () => { const v = parseFloat(num.value.replace(',', '.')); if (Number.isFinite(v)) set(v); else show(); num.value = fmt(st.value, U().step); };
  num.addEventListener('change', commit); num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); num.blur(); } });

  // ---- the drawer
  const fields = () => root.querySelectorAll('[data-k]');
  function fillDrawer() { const u = U(); fields().forEach((el) => { el.value = el.dataset.k === 'prog' ? u.prog : String(u[el.dataset.k]); }); }
  cog.addEventListener('click', () => { const open = drawer.hidden; drawer.hidden = !open; cog.setAttribute('aria-expanded', String(open)); root.classList.toggle('open', open); if (open) fillDrawer(); });
  fields().forEach((el) => el.addEventListener('change', () => {
    const u = { ...U() }, k = el.dataset.k;
    if (k === 'prog') u.prog = el.value;
    else { const v = parseFloat(el.value.replace(',', '.')); if (Number.isFinite(v)) u[k] = v; }
    if (!(u.max > u.min)) { u.max = u.min + (spec.max - spec.min || 1) * 0.01; }
    if (!(u.step > 0)) u.step = spec.step;
    st.ui = u; const v = snap(st.value); st.value = v; fillDrawer(); show(); onUi(u); onChange(v);
  }));
  $('.sl3-reset').addEventListener('click', () => { st.ui = null; fillDrawer(); show(); onUi(null); });

  show();
  return { el: root, refresh: show };
}
