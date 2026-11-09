// LINE_v03 LAB: the page. Builds one card per candidate module, runs them all on the same eased tone field, and handles the delete / replace loop.
import * as S from './shared.js';
import { CANDIDATES } from './candidates.js';
const { $, lsGet, lsSet, msg } = S;
const W = 540, H = 960, BUILD = document.querySelector('meta[name=build]').content;
const DROPKEY = 'line3lab.dropped';

// ---------------------------------------------------------------- colours: restore the main app's palette, remember changes
{
  const pal = S.lsGet('line3lab.palette') || S.lsGet('genArt002.palette');
  if (pal) S.restorePalette(pal);
  S.mountPaletteEditor($('#palette'));
  S.onPalette(() => S.lsSet('line3lab.palette', S.serializePalette()));
}

// ---------------------------------------------------------------- global input controls
const gdefs = [
  { id: 'ease', label: 'Ease s (how slowly the lines follow the picture)', min: 0.02, max: 4, step: 0.02, val: 0.3 },
  { id: 'clip', label: 'Levels clip %', min: 0, max: 20, step: 0.5, val: 2 },
  { id: 'bright', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, val: 0 },
  { id: 'invert', label: 'Invert (1 = swap bright and dark)', min: 0, max: 1, step: 1, val: 0 },
];
S.mountSliders($('#gsl'), gdefs, S.G, 'global');
$('#mirror').onchange = (e) => { S.G.mirror = e.target.checked; };
$('#setbtn').onclick = () => document.body.classList.toggle('editing');
$('#setclose').onclick = () => document.body.classList.remove('editing');

// ---------------------------------------------------------------- the source buttons
const setSrcUi = () => {
  $('#cam').classList.toggle('on', !!S.cam.stream); $('#test').classList.toggle('on', S.src.kind === 'test');
  $('#srcname').textContent = 'input: ' + S.src.name;
};
$('#cam').onclick = async () => { if (S.cam.stream) S.useTest(); else await S.startCamera(); setSrcUi(); };
$('#test').onclick = () => { S.useTest(); setSrcUi(); };
$('#pick').onclick = () => $('#file').click();
$('#file').onchange = async (e) => { const f = e.target.files[0]; if (f) { try { await S.loadVideo(URL.createObjectURL(f), f.name); } catch (err) { msg(err.message); } setSrcUi(); } };
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { await S.loadVideo(URL.createObjectURL(f), f.name); setSrcUi(); } });

// ---------------------------------------------------------------- version stamp + auto-detected deploys (same idea as ui.js versionCheck, with this folder's version.json)
(async () => {
  const show = async () => {
    try {
      const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      $('#ver').textContent = `${v.version} · build ${v.build}`;
      if (v.build !== BUILD) { $('#newver').hidden = false; $('#newver').onclick = () => location.reload(); }
    } catch { $('#ver').textContent = 'build ' + BUILD; }
  };
  show(); setInterval(show, 30000);
})();

// ---------------------------------------------------------------- the cards
const cards = [], grid = $('#grid');
const dropped = () => lsGet(DROPKEY, []) || [];
const paramsText = (c) => { const o = {}; for (const d of c.mod.sliders) o[d.id] = +(+c.P[d.id]).toFixed(3); for (const k of Object.keys(c.curves)) o[k + '_curve'] = c.curves[k].pts().map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]); return JSON.stringify(o); };

function makeCard(mod) {
  const el = document.createElement('article'); el.className = 'card'; el.dataset.id = mod.id;
  el.innerHTML = `<div class="chead"><b></b><span class="id"></span><button type="button" class="x" title="Delete this candidate: it goes to the Dropped list">x</button></div>
    <div class="cvwrap"><canvas width="${W}" height="${H}"></canvas></div><div class="meter"><span class="ms"></span><span class="mv"></span></div>
    <p class="pr"></p><p class="ct"></p><p class="mo"></p>
    <details open><summary>Sliders</summary><div class="sh"></div><button type="button" class="rs">Reset sliders</button></details>
    <textarea class="note" rows="2" placeholder="Why bad / what to keep"></textarea>`;
  $('b', el).textContent = mod.name; $('.id', el).textContent = mod.id;
  $('.pr', el).textContent = mod.principle; $('.ct', el).textContent = 'Shape control: ' + mod.control; $('.mo', el).textContent = 'Motion: ' + mod.motion;
  const c = { mod, el, P: {}, curves: {}, curveFns: {}, canvas: $('canvas', el), lastT: 0, ms: 0, visible: true, prev: null, hist: [], msEma: 0, errored: false };
  const sh = S.mountSliders($('.sh', el), mod.sliders, c.P, mod.id);
  $('.rs', el).onclick = () => sh.reset();
  for (const cd of mod.curves || []) { c.curves[cd.id] = S.mountCurve($('.sh', el), cd, mod.id); c.curveFns[cd.id] = (x) => c.curves[cd.id].fn(x); }
  const note = $('textarea', el); note.value = lsGet('line3lab.note.' + mod.id, '') || '';
  note.addEventListener('input', () => lsSet('line3lab.note.' + mod.id, note.value));
  $('.x', el).onclick = () => dropCard(c);
  $('.cvwrap', el).onclick = (e) => { e.currentTarget.classList.toggle('big'); c.big = e.currentTarget.classList.contains('big'); };
  try { c.inst = mod.create({ W, H, canvas: c.canvas }); } catch (e) { c.errored = true; $('.mv', el).textContent = 'error: ' + e.message; console.error(mod.id, e); }
  const mc = document.createElement('canvas'); mc.width = 90; mc.height = 160; c.mctx = mc.getContext('2d', { willReadFrequently: true }); c.mctx.imageSmoothingQuality = 'high';
  new IntersectionObserver((es) => { c.visible = es[es.length - 1].isIntersecting; }, { rootMargin: '200px' }).observe(el);
  return c;
}
function slotEl(entry) {
  const s = document.createElement('div'); s.className = 'slot'; s.dataset.id = entry.id;
  s.innerHTML = `<div><b>Waiting for a new candidate</b><br><span class="note"></span></div>`;
  $('.note', s).textContent = 'replaces ' + entry.id + (entry.note ? ' (' + entry.note.slice(0, 80) + ')' : '');
  return s;
}
function dropCard(c) {
  const list = dropped().filter((d) => d.id !== c.mod.id);
  list.push({ id: c.mod.id, name: c.mod.name, principle: c.mod.principle, control: c.mod.control, note: $('textarea', c.el).value.trim(), params: paramsText(c), at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  lsSet(DROPKEY, list);
  c.el.replaceWith(slotEl(list[list.length - 1])); cards.splice(cards.indexOf(c), 1); renderDropped();
}
function restore(id) { lsSet(DROPKEY, dropped().filter((d) => d.id !== id)); location.reload(); }
function dropText() {
  const d = dropped(), live = cards.filter((c) => $('textarea', c.el).value.trim());
  let t = `LINE_v03 LAB: dropped candidates (page build ${BUILD}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')})\n`;
  t += `Please make REPLACEMENT candidates with a different principle (see lab-work/v002/line3lab/CANDIDATES.md for ideas already tried / not tried).\n\n`;
  if (!d.length) t += '(nothing dropped yet)\n';
  for (const e of d) t += `[${e.id}] ${e.name}\n  principle: ${e.principle}\n  why dropped / what to keep: ${e.note || '(no note)'}\n  settings at drop: ${e.params}\n\n`;
  if (live.length) { t += 'NOTES ON CANDIDATES THAT ARE STILL LIVE\n'; for (const c of live) t += `[${c.mod.id}] ${c.mod.name}: ${$('textarea', c.el).value.trim()}\n`; }
  return t;
}
function renderDropped() {
  const d = dropped(), box = $('#droplist'); box.textContent = '';
  if (!d.length) box.textContent = 'Nothing dropped yet.';
  for (const e of d) {
    const row = document.createElement('div'); row.className = 'drop';
    row.innerHTML = `<b></b> <span class="note"></span><button type="button">Restore</button><div class="note"></div>`;
    $('b', row).textContent = `${e.id} · ${e.name}`; $('span.note', row).textContent = e.at;
    $('div.note', row).textContent = (e.note ? 'Note: ' + e.note + '. ' : '') + 'Principle: ' + e.principle;
    $('button', row).onclick = () => restore(e.id); box.append(row);
  }
  $('#droptext').value = dropText();
}
$('#copydrop').onclick = async () => {
  const t = dropText(), b = $('#copydrop'), o = b.textContent; $('#droptext').value = t;
  try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; }
  catch { const ta = $('#droptext'); ta.parentElement.open = true; ta.select(); try { document.execCommand('copy'); b.textContent = 'Copied'; } catch { b.textContent = 'Select the text below and copy it'; } }
  setTimeout(() => { b.textContent = o; }, 1800);
};
document.addEventListener('input', (e) => { if (e.target.matches('.card textarea')) $('#droptext').value = dropText(); });

(async () => {
  const gone = new Set(dropped().map((d) => d.id));
  for (const file of CANDIDATES) {
    try {
      const mod = (await import('./' + file + '?b=' + BUILD)).default;
      if (gone.has(mod.id)) { grid.append(slotEl(dropped().find((d) => d.id === mod.id))); continue; }
      const c = makeCard(mod); cards.push(c); grid.append(c.el);
    } catch (e) { console.error(file, e); msg('Could not load ' + file + ': ' + e.message); }
  }
  renderDropped(); setSrcUi();
})();

// ---------------------------------------------------------------- the loop: tone once per frame, then as many cards as fit the time budget (the one waiting longest first)
let last = performance.now(), thumbT = 0;
const tctx = $('#thumb').getContext('2d');
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.2, (now - last) / 1000); last = now;
  S.updateTone(dt, now);
  if (now - thumbT > 100) { thumbT = now; S.thumbDraw(tctx, 54, 96); }
  const ink = S.inkPaper(), fr = { paper: ink.paper, ink: ink.ink, paperCss: ink.paperCss, inkCss: ink.inkCss };
  const order = cards.filter((c) => (c.visible || c.big) && !c.errored).sort((a, b) => a.lastT - b.lastT), t0 = performance.now();
  let n = 0;
  for (const c of order) {
    if (n > 0 && performance.now() - t0 > 13) break;
    const a = performance.now();
    fr.P = c.P; fr.curve = c.curveFns;
    try { c.inst.draw(fr); } catch (e) { c.errored = true; $('.mv', c.el).textContent = 'error: ' + e.message; console.error(c.mod.id, e); continue; }
    c.ms = performance.now() - a; c.msEma += (c.ms - c.msEma) * 0.1; c.lastT = now; n++;
    measure(c, now);
  }
}
// motion check: the mean change between two consecutive frames of a card (small picture), kept for the last 120 frames
function measure(c, now) {
  c.mctx.drawImage(c.canvas, 0, 0, 90, 160);
  const d = c.mctx.getImageData(0, 0, 90, 160).data, cur = new Uint8Array(90 * 160);
  for (let i = 0; i < cur.length; i++) cur[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11);
  if (c.prev) { let s = 0; for (let i = 0; i < cur.length; i++) s += Math.abs(cur[i] - c.prev[i]); c.hist.push({ d: s / cur.length, t: now }); if (c.hist.length > 120) c.hist.shift(); }
  c.prev = cur;
}
function stats(c) {
  const h = c.hist.map((x) => x.d).sort((a, b) => a - b); if (h.length < 5) return null;
  const med = h[h.length >> 1], max = h[h.length - 1];
  return { id: c.mod.id, med: +med.toFixed(3), max: +max.toFixed(3), ratio: +(max / Math.max(0.01, med)).toFixed(2), ms: +c.msEma.toFixed(1), n: h.length };
}
setInterval(() => {
  for (const c of cards) {
    const s = stats(c); if (!s) continue;
    $('.ms', c.el).textContent = s.ms + ' ms'; const mv = $('.mv', c.el);
    mv.textContent = `change ${s.med} / max ${s.max} (x${s.ratio})`; mv.classList.toggle('bad', s.ratio > 3 && s.max > 0.6);
  }
}, 700);
// continuity test: blend between two tone fields in small steps and measure the change between consecutive pictures (a pop shows as a spike)
async function popTest(A, B, steps = 40) {
  const saved = Float32Array.from(S.tone), out = {}, fr = { ...S.inkPaper() };
  for (const c of cards) {
    const ds = []; let prev = null;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps; for (let i = 0; i < S.tone.length; i++) S.tone[i] = A[i] + (B[i] - A[i]) * f;
      S.refreshSAT(); fr.P = c.P; fr.curve = c.curveFns; c.inst.draw(fr);
      c.mctx.drawImage(c.canvas, 0, 0, 90, 160); const d = c.mctx.getImageData(0, 0, 90, 160).data, cur = new Float32Array(14400);
      for (let i = 0; i < 14400; i++) cur[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      if (prev) { let s = 0; for (let i = 0; i < 14400; i++) s += Math.abs(cur[i] - prev[i]); ds.push(s / 14400); }
      prev = cur;
    }
    const sorted = ds.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1], mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    out[c.mod.id] = { med: +med.toFixed(2), max: +sorted[sorted.length - 1].toFixed(2), ratio: +(sorted[sorted.length - 1] / Math.max(0.05, med)).toFixed(2), mean: +mean.toFixed(2) };
  }
  S.tone.set(saved); S.refreshSAT(); return out;
}
window.__lab = { popTest, cards, S, stats: () => cards.map(stats), clearHist: () => cards.forEach((c) => { c.hist = []; }), setSliders: (id, o) => { const c = cards.find((x) => x.mod.id === id); Object.assign(c.P, o); } };
requestAnimationFrame(frame);
if (!new URLSearchParams(location.search).has('nocam')) { S.startCamera().then(setSrcUi); }
