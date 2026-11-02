// Shared UI for every version: version buttons, Settings panel, slider rows (value, max field, -1 box),
// slider hold, camera / video source, colours (palette.js), owner PIN + defaults, version check.
import { mountPaletteEditor, serialize as serializePalette, restore as restorePalette } from './palette.js';
export { getPalette, onPalette } from './palette.js';
export const $ = (s) => document.querySelector(s);
export const msg = (m) => { $('#msg').textContent = m; };
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------------------------------------------------------------- versions (each one is a button)
export const VERSIONS = [
  { id: 'line', label: 'V1 Line' },
  { id: 'ishihara', label: 'Ishihara' },
  { id: 'depth', label: 'Depth' },
  { id: 'depthdots', label: 'Depth Dots' },
  { id: 'depth3d', label: 'Depth 3D' },
  { id: 'dollar', label: 'Dollar' },
  { id: 'dollar1', label: 'Dollar 1' },
  { id: 'dollar2', label: 'Dollar 2' },
  { id: 'dollar3', label: 'Dollar 3' },
  { id: 'flines', label: 'Fractal Lines' },
];
const qv = new URLSearchParams(location.search).get('view');
export const VIEW = VERSIONS.some((v) => v.id === qv) ? qv : 'line';
for (const v of VERSIONS) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = v.label;
  b.classList.toggle('on', v.id === VIEW);
  b.onclick = () => { if (v.id !== VIEW) location.search = '?view=' + v.id; };
  $('#versions').append(b);
}
document.querySelectorAll('[data-views]').forEach((el) => { el.hidden = !el.dataset.views.split(',').includes(VIEW); });
$('#setHead').textContent = 'Edit: ' + VERSIONS.find((v) => v.id === VIEW).label;

// ---------------------------------------------------------------- slider hold
// While a slider moves, a version can hold its heavy work so the slider stays smooth.
// It resumes HOLD_MS after the last move.
const HOLD_MS = 250;
export const hold = {
  drag: false, until: 0, redraw: false,
  active() { return this.drag || performance.now() < this.until; },
  poke() { this.until = performance.now() + HOLD_MS; this.redraw = true; },
};
addEventListener('pointerup', () => { if (hold.drag) { hold.drag = false; hold.poke(); } });
addEventListener('pointercancel', () => { if (hold.drag) { hold.drag = false; hold.poke(); } });

// ---------------------------------------------------------------- slider rows
// list entries: { id, label, min, max, step, val, off }, or { head } for a group heading. Off sends -1 (P.on[id] = false).
const fmt = (v, step) => { const d = (String(step).split('.')[1] || '').length; return Number(v).toFixed(d); };
export const rows = {};
// folded groups, remembered per style
const FOLDKEY = 'genArt002.fold.' + VIEW;
const folds = new Set((() => { try { return JSON.parse(localStorage.getItem(FOLDKEY) || '[]'); } catch { return []; } })());
const saveFolds = () => { try { localStorage.setItem(FOLDKEY, JSON.stringify([...folds])); } catch {} };
export function buildSliders(list, P) {
  P.on = P.on || {};
  let body = null;                                           // rows go into the current group (folds with its heading)
  for (const s of list) {
    if (s.head) {                                            // a group heading that folds (like an After Effects twirl-down)
      const h = document.createElement('h2'); h.className = 'grp'; h.textContent = s.head;
      body = document.createElement('div'); body.className = 'fold';
      const b = body, key = s.head;
      const set = (open) => { b.hidden = !open; h.classList.toggle('closed', !open); };
      set(!folds.has(key));
      h.onclick = () => { const open = b.hidden; set(open); if (open) folds.delete(key); else folds.add(key); saveFolds(); };
      $('#sliders').append(h, body); continue;
    }
    P[s.id] = s.val; P.on[s.id] = true;
    const row = document.createElement('div'); row.className = 'sl';
    row.innerHTML = `<span class="lab">${s.label}</span>` +
      `<input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.val}">` +
      `<output></output>` +
      `<input type="number" class="mx" step="any" value="${s.max}" title="Max of the range">` +
      `<label class="onoff" title="Off sends -1: ${s.off}"><input type="checkbox" checked><i>-1</i></label>`;
    (body || $('#sliders')).append(row);
    const [rng, mx, cb] = row.querySelectorAll('input'), out = row.querySelector('output');
    const show = () => { out.textContent = P.on[s.id] ? fmt(rng.value, s.step) : '-1'; };
    rng.addEventListener('pointerdown', () => { hold.drag = true; hold.poke(); });
    rng.addEventListener('input', () => { P[s.id] = parseFloat(rng.value); show(); hold.poke(); });
    mx.addEventListener('change', () => {
      let m = parseFloat(mx.value);
      if (!(m > parseFloat(rng.min))) m = parseFloat(rng.max);
      mx.value = m; rng.max = m;
      if (parseFloat(rng.value) > m) rng.value = m;
      P[s.id] = parseFloat(rng.value); show(); hold.poke();
    });
    cb.addEventListener('change', () => {
      P.on[s.id] = cb.checked; rng.disabled = !cb.checked; row.classList.toggle('off', !cb.checked);
      show(); hold.poke();
    });
    rows[s.id] = { rng, mx, cb };
    show();
  }
  return (id) => (P.on[id] ? P[id] : -1);              // val(id): the value, or -1 when off
}

// ---------------------------------------------------------------- Edit button (closed by default: clean for viewing; the panel slides in)
const UIKEY = 'genArt002.ui';
// when editing, the portrait glides to the left edge so the panel has room (on narrow screens the panel just covers it)
const shift = () => {
  const st = $('#stage'), w = st.offsetWidth, panel = $('#settings').offsetWidth;
  const left = (innerWidth - w) / 2, room = innerWidth - panel - 48;
  document.body.style.setProperty('--shift', (w <= room ? 16 - left : 0) + 'px');
};
addEventListener('resize', shift);
const setOpen = (open) => {
  shift(); document.body.classList.toggle('editing', open); $('#setbtn').classList.toggle('on', open);
  try { localStorage.setItem(UIKEY, open ? '1' : '0'); } catch {}
};
$('#setbtn').onclick = () => setOpen(!document.body.classList.contains('editing'));
$('#setclose').onclick = () => setOpen(false);
setOpen((() => { try { return localStorage.getItem(UIKEY) === '1'; } catch { return false; } })());

// ---------------------------------------------------------------- video source
export const vid = $('#vid');
export const cam = { stream: null, mirror: true, onStart: () => {}, onLoad: () => {} };
export async function loadVideo(url) {
  stopCamera();
  vid.src = url; vid.muted = true; vid.loop = true;
  await new Promise((res, rej) => { vid.onloadeddata = res; vid.onerror = () => rej(new Error('video failed to load')); });
  await vid.play().catch(() => {});
  cam.onLoad();
}
export function stopCamera() {
  if (!cam.stream) return;
  cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null;
  vid.srcObject = null; vid.style.transform = ''; $('#cam').classList.remove('on');
}
export async function startCamera() {
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
  } catch (e) {
    cam.stream = null;
    msg('Camera is not available here (' + (e.name || e.message) + '). Use "Load video" to pick a file.');
    return false;
  }
  msg(''); vid.removeAttribute('src'); vid.srcObject = cam.stream; vid.loop = false;
  await vid.play().catch(() => {});
  $('#cam').classList.add('on'); cam.onStart();
  return true;
}
$('#cam').onclick = async () => {
  if (cam.stream) { stopCamera(); vid.removeAttribute('src'); msg('Camera off. Turn it on again or use "Load video".'); return; }
  await startCamera();
};
$('#mirror').onchange = (e) => { cam.mirror = e.target.checked; };
$('#pick').onclick = () => $('#file').click();
$('#file').onchange = (e) => { const f = e.target.files[0]; if (f) loadVideo(URL.createObjectURL(f)); };
const drop = $('#drop');
addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.style.display = 'none'; });
addEventListener('drop', (e) => { e.preventDefault(); drop.style.display = 'none'; const f = e.dataTransfer.files[0]; if (f) loadVideo(URL.createObjectURL(f)); });

// draw the video cover-cropped into a w x h 2D context, mirrored for the camera; returns the crop
export function drawCover(c, w, h) {
  const vw = vid.videoWidth, vh = vid.videoHeight, ar = w / h;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (vw / vh > ar) { sw = vh * ar; sx = (vw - sw) / 2; } else { sh = vw / ar; sy = (vh - sh) / 2; }
  const mir = !!(cam.stream && cam.mirror);
  c.save();
  if (mir) { c.translate(w, 0); c.scale(-1, 1); }
  c.drawImage(vid, sx, sy, sw, sh, 0, 0, w, h);
  c.restore();
  return { sx, sy, sw, sh, vw, vh, mir };
}

// ---------------------------------------------------------------- colours (one palette for every style)
mountPaletteEditor($('#palette'));
{ // the Colours heading folds too (closed by default: the wheel is big)
  const h = $('#palette').previousElementSibling, b = $('#palette'), key = '#colours';
  if (!localStorage.getItem(FOLDKEY)) folds.add(key);
  h.classList.add('foldh');
  const set = (open) => { b.hidden = !open; h.classList.toggle('closed', !open); };
  set(!folds.has(key));
  h.onclick = () => { const open = b.hidden; set(open); if (open) folds.delete(key); else folds.add(key); saveFolds(); };
}

// ---------------------------------------------------------------- owner PIN
// Saving defaults is hidden behind a 4 digit PIN: the Owner button at the bottom of Edit, or a click on the version line (Lock / click again to lock).
// (A light lock for a static site: it keeps the save buttons out of sight, it is not real security.)
const PIN_HASH = 2522906;                                     // hash of the PIN, so the digits are not in the source as text
const hashPin = (s) => [...s].reduce((h, c) => (h * 131 + c.charCodeAt(0)) % 9999991, 7);
const PINKEY = 'genArt002.owner';
export const owner = { on: (() => { try { return localStorage.getItem(PINKEY) === '1'; } catch { return false; } })() };   // remembered on this device
function showOwner() {
  $('#ownerrow').hidden = !owner.on; $('#ownerlock').hidden = owner.on; $('#ver').classList.toggle('owner', owner.on);
}
const lock = () => { owner.on = false; try { localStorage.removeItem(PINKEY); } catch {} showOwner(); };
// two ways in: the version line under the buttons, or the Owner button at the bottom of Edit (on a phone the panel covers the line)
const openPin = (box) => { box.hidden = !box.hidden; if (!box.hidden) { const i = box.querySelector('input'); i.value = ''; i.focus(); } };
$('#ver').addEventListener('click', () => { if (owner.on) lock(); else openPin($('#pinbox')); });   // click again: lock
$('#ownerbtn').addEventListener('click', () => openPin($('#pinbox2')));
$('#lockbtn').addEventListener('click', lock);
for (const box of document.querySelectorAll('.pinbox')) box.querySelector('input').addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '').slice(0, 4); e.target.value = v;
  if (v.length < 4) return;
  if (hashPin(v) === PIN_HASH) {
    owner.on = true; try { localStorage.setItem(PINKEY, '1'); } catch {}
    document.querySelectorAll('.pinbox').forEach((b) => { b.hidden = true; }); showOwner();
  } else { e.target.value = ''; e.target.classList.add('bad'); setTimeout(() => e.target.classList.remove('bad'), 500); }
});
showOwner();

// ---------------------------------------------------------------- the palette: restored as the page loads, for every style
const PALKEY = 'genArt002.palette';
const SITE = fetch('site-defaults.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
(async () => {
  let pal = null; try { pal = JSON.parse(localStorage.getItem(PALKEY) || 'null'); } catch {}
  if (!pal) { const site = await SITE; pal = site && site[PALKEY]; }
  if (pal) restorePalette(pal);
})();

// ---------------------------------------------------------------- defaults (per version + the palette)
// Owner only: Set default saves every slider (value, max, on), every [data-save] control of this version, and the palette.
// Order of what applies on load: built-in values, then site-defaults.json (the site's defaults for every visitor), then this browser's saved defaults.
export function initDefaults(rev = '') {
  const STORE = 'genArt002.defaults.' + VIEW + rev;
  const saveEls = () => [...document.querySelectorAll('[data-save]')].filter((el) => !el.closest('[hidden]'));
  const snapshot = () => {
    const o = { s: {}, c: {} };
    for (const [id, r] of Object.entries(rows)) o.s[id] = { v: r.rng.value, max: r.rng.max, on: r.cb.checked };
    for (const el of saveEls()) o.c[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    return o;
  };
  const apply = (o) => {
    for (const [id, x] of Object.entries(o.s || {})) {
      const r = rows[id]; if (!r) continue;
      r.rng.max = x.max; r.mx.value = x.max; r.rng.value = x.v; r.rng.dispatchEvent(new Event('input'));
      r.cb.checked = x.on; r.cb.dispatchEvent(new Event('change'));
    }
    for (const [id, v] of Object.entries(o.c || {})) {
      const el = document.getElementById(id); if (!el) continue;
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
      el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input'));
    }
  };
  const local = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  // AUTOSAVE: every change is kept in this browser (per style) and comes back on refresh. Start over goes back to the defaults.
  const AUTO = 'genArt002.autosave.' + VIEW + rev;
  const state = () => JSON.stringify({ settings: snapshot(), palette: serializePalette() });
  let lastAuto = null;
  const autosave = () => { if (lastAuto === null) return; const j = state(); if (j === lastAuto) return; lastAuto = j; try { localStorage.setItem(AUTO, j); } catch {} };
  (async () => {
    const site = await SITE;
    const auto = local(AUTO);
    const v = (auto && auto.settings) || local(STORE) || (site && site[STORE]);
    if (v) apply(v);
    if (auto && auto.palette) restorePalette(auto.palette);
    setTimeout(() => { lastAuto = state(); setInterval(autosave, 1000); }, 300);   // start after the restore has settled
  })();
  addEventListener('pagehide', autosave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
  $('#startover').onclick = () => { if (!confirm('Go back to the default settings? Your current setup is lost unless you Save file first.')) return; lastAuto = null; try { localStorage.removeItem(AUTO); } catch {} location.reload(); };
  const flash = (el, t) => { const o = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = o; }, 1600); };
  $('#setdef').onclick = () => {
    if (!owner.on) return;
    try { localStorage.setItem(STORE, JSON.stringify(snapshot())); localStorage.setItem(PALKEY, JSON.stringify(serializePalette())); flash($('#setdef'), 'Saved as default'); }
    catch { flash($('#setdef'), 'Could not save'); }
  };
  $('#resetdef').onclick = () => { if (!owner.on) return; lastAuto = null; try { localStorage.removeItem(STORE); localStorage.removeItem(PALKEY); localStorage.removeItem(AUTO); } catch {} location.reload(); };
  // a settings file: this style's sliders, levels, nodes, channels and the palette. Anyone can save and load one.
  $('#savefile').onclick = () => {
    const o = { app: 'generativeArt_v002', view: VIEW, rev, saved: new Date().toISOString(), settings: snapshot(), palette: serializePalette() };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }));
    a.download = `${VIEW}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash($('#savefile'), 'Saved');
  };
  $('#loadfile').onclick = () => $('#loadin').click();
  $('#loadin').onchange = async () => {
    const f = $('#loadin').files[0]; $('#loadin').value = ''; if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (o.view && o.view !== VIEW) { flash($('#loadfile'), 'File is for ' + o.view); return; }
      apply(o.settings || o); if (o.palette) restorePalette(o.palette); flash($('#loadfile'), 'Loaded');
    } catch { flash($('#loadfile'), 'Not a settings file'); }
  };
  // PRESETS: ready-made looks in presets/ (presets/index.json lists them per style). Only the settings a preset names change.
  fetch('presets/index.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((ix) => {
    const list = ix && ix[VIEW]; if (!list || !list.length) return;
    const sel = $('#preset'); for (const p of list) sel.add(new Option(p.name, p.file)); sel.hidden = false;
    sel.onchange = async () => {
      const f = sel.value; sel.value = ''; if (!f) return;
      try { const o = await (await fetch('presets/' + f + '?t=' + Date.now(), { cache: 'no-store' })).json(); apply(o.settings); if (o.palette) restorePalette(o.palette); flash($('#loadfile'), 'Preset loaded'); }
      catch { flash($('#loadfile'), 'Preset failed'); }
    };
  }).catch(() => {});
  // everything saved in this browser, as one JSON: send it to make it the site's defaults for every visitor (site-defaults.json)
  $('#copydef').onclick = async () => {
    if (!owner.on) return;
    const all = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('genArt002.defaults.') || k === PALKEY) all[k] = JSON.parse(localStorage.getItem(k)); } } catch {}
    try { await navigator.clipboard.writeText(JSON.stringify(all, null, 1)); flash($('#copydef'), 'Copied'); } catch { flash($('#copydef'), 'Copy failed'); }
  };
}

// ---------------------------------------------------------------- version check
export function versionCheck() {
  const mine = document.querySelector('meta[name=build]')?.content || '';
  const check = async () => {
    try {
      const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      if (v.build !== mine) { $('#newver').hidden = false; $('#newver').onclick = () => location.reload(); }
    } catch {}
  };
  check(); setInterval(check, 30000);
}

export const noCam = new URLSearchParams(location.search).has('nocam');
