// GenerativeArt v003 (v3.0): the frame. Node graph + parameters panel + preview. Sources: camera, a video file, or the built-in test picture.
import { makeGL, W, H } from './gl.js';
import { NODES } from './nodes.js';
import { Graph, defaultGraph } from './graph.js';
import { createEditor } from './editor.js';
import { createSlider } from './slider.js';
import { createBoard } from './board.js';
import { getPalette, mountPaletteEditor, serialize as serializePalette, restore as restorePalette } from '../palette.js';

const $ = (s) => document.querySelector(s);
const msg = (m) => { $('#msg').textContent = m || ''; };
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } } };

// ---------------------------------------------------------------- GL and source
const canvas = $('#cv'), G = makeGL(canvas);
if (!G) { msg('WebGL2 is not available in this browser.'); throw new Error('no webgl2'); }
const vid = $('#vid'), video = { ready: false, w: 1, h: 1, tex: G.texture(2, 2) };
let usingCam = false;
function setSourceButtons(which) { for (const [id, k] of [['#cam', 'cam'], ['#test', 'test']]) $(id).classList.toggle('on', which === k); }
async function startCamera() {
  try {
    stopStream();
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false });
    vid.srcObject = s; vid.loop = false; await vid.play(); usingCam = true; setSourceButtons('cam'); msg('');
  } catch (e) { msg('Camera: ' + (e.message || e)); }
}
function stopStream() { if (vid.srcObject) { vid.srcObject.getTracks().forEach((t) => t.stop()); vid.srcObject = null; } usingCam = false; }
$('#cam').onclick = startCamera;
$('#test').onclick = () => { stopStream(); vid.removeAttribute('src'); vid.load(); setSourceButtons('test'); };
$('#pick').onclick = () => $('#file').click();
$('#file').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return; stopStream(); vid.src = URL.createObjectURL(f); vid.loop = true;
  try { await vid.play(); setSourceButtons('file'); msg(''); } catch (er) { msg('Video: ' + er.message); }
};
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { $('#file').files = e.dataTransfer.files; $('#file').onchange({ target: { files: [f] } }); } });

// ---------------------------------------------------------------- graph, saved in the browser
const KEY = 'v3.graph.v1';
let graph = Graph.fromJSON(ls.get(KEY)) || defaultGraph();
if (!graph.nodes.some((n) => n.type === 'output')) graph = defaultGraph();
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => ls.set(KEY, graph.toJSON()), 250); };

// ---------------------------------------------------------------- folds (After Effects style, open state remembered)
const FK = 'v3.folds', folds = new Set(ls.get(FK) || []);          // the set holds CLOSED folds
function fold(title, key, open = true) {
  const el = document.createElement('div'), isOpen = open && !folds.has(key) || (!open && folds.has('+' + key));
  el.className = 'fold3' + (isOpen ? ' open' : ''); el.innerHTML = '<div class="fh" role="button" tabindex="0"></div><div class="fb"></div>';
  el.querySelector('.fh').textContent = title;
  const flip = () => {
    const o = el.classList.toggle('open');
    if (open) { if (o) folds.delete(key); else folds.add(key); } else if (o) folds.add('+' + key); else folds.delete('+' + key);
    ls.set(FK, [...folds]);
  };
  el.querySelector('.fh').addEventListener('click', flip);
  el.querySelector('.fh').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  return { el, body: el.querySelector('.fb') };
}

// ---------------------------------------------------------------- parameters panel
const params = $('#params');
function showParams(n) {
  params.textContent = '';
  if (!n) { const d = document.createElement('div'); d.className = 'pn-empty'; d.textContent = 'Tap a node to see its parameters.'; params.append(d); return; }
  const d = NODES[n.type], t = document.createElement('div'); t.className = 'pn-title'; t.textContent = d.title;
  const i = document.createElement('p'); i.className = 'pn-info'; i.textContent = d.info; params.append(t, i);
  if (!d.params.length) { const e = document.createElement('div'); e.className = 'pn-empty'; e.textContent = 'No parameters.'; params.append(e); return; }
  const groups = new Map();
  for (const p of d.params) { const gname = p.group || 'Settings'; if (!groups.has(gname)) groups.set(gname, []); groups.get(gname).push(p); }
  for (const [gname, list] of groups) {
    const f = fold(gname, d.title + '/' + gname); params.append(f.el);
    for (const p of list) {
      if (p.kind === 'toggle') {
        const l = document.createElement('label'); l.className = 'tg'; l.innerHTML = '<input type="checkbox"><span></span>'; l.querySelector('span').textContent = p.label;
        const c = l.querySelector('input'); c.checked = !!n.params[p.id]; c.onchange = () => { n.params[p.id] = c.checked ? 1 : 0; save(); }; f.body.append(l);
      } else if (p.kind === 'choice') {
        const l = document.createElement('label'); l.className = 'ch'; l.innerHTML = '<span></span><select></select>'; l.querySelector('span').textContent = p.label;
        const s = l.querySelector('select'); for (const [v, lab] of p.options) { const o = document.createElement('option'); o.value = v; o.textContent = lab; s.append(o); }
        s.value = n.params[p.id]; s.onchange = () => { n.params[p.id] = s.value; save(); }; f.body.append(l);
      } else {
        const st = { value: n.params[p.id], ui: n.ui[p.id] || null };
        createSlider(f.body, p, st, (v) => { n.params[p.id] = v; save(); }, (u) => { if (u) n.ui[p.id] = u; else delete n.ui[p.id]; save(); });
      }
    }
  }
  const r = document.createElement('button'); r.type = 'button'; r.textContent = 'Reset this node'; r.style.margin = '6px 4px 12px';
  r.onclick = () => { graph.resetNode(n); showParams(n); save(); }; params.append(r);
}
const editor = createEditor($('#gr'), graph, { onSelect: showParams, onChange: save });
showParams(null);

// ---------------------------------------------------------------- colours (the global palette, shared with every node)
{
  const f = fold('Colours (every node)', 'colours', true); $('#colours').append(f.el);
  const host = document.createElement('div'); host.id = 'palette'; f.body.append(host);
  mountPaletteEditor(host);
  const PK = 'v3.palette'; const sp = ls.get(PK) || ls.get('genArt002.palette'); if (sp) { try { restorePalette(sp); } catch { /* keep default */ } }
  setInterval(() => { const cur = JSON.stringify(serializePalette()); if (cur !== setInterval.last) { setInterval.last = cur; ls.set(PK, JSON.parse(cur)); } }, 1500);
}

// ---------------------------------------------------------------- node board (the chart Gerry and Claude both write in)
const board = createBoard($('#board'));
$('#boardbtn').onclick = () => board.toggle();

// ---------------------------------------------------------------- patch files and reset
$('#savep').onclick = () => { const b = new Blob([JSON.stringify({ app: 'GenerativeArt_v003', graph: graph.toJSON(), palette: serializePalette() }, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'patch.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
$('#loadp').onclick = () => $('#pfile').click();
$('#pfile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const o = JSON.parse(await f.text()), g = Graph.fromJSON(o.graph || o); if (!g) throw new Error('not a patch'); graph = g; if (o.palette) restorePalette(o.palette); editor.setGraph(graph); save(); msg(''); } catch (er) { msg('Patch: ' + er.message); }
  e.target.value = '';
};
$('#reset').onclick = () => { graph = defaultGraph(); editor.setGraph(graph); save(); };

// ---------------------------------------------------------------- frame loop
const black = G.texture(2, 2);
function stateOf(n, key) { n.state = n.state || {}; return n.state[key] || (n.state[key] = G.target()); }
let last = performance.now(), frames = 0, ms = 0, t0 = last, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.2, (now - last) / 1000); last = now;
  const a = performance.now();
  video.ready = vid.readyState >= 2 && vid.videoWidth > 0 && (usingCam || vid.currentSrc !== '' || vid.src !== '');
  if (video.ready) { video.w = vid.videoWidth; video.h = vid.videoHeight; G.upload(video.tex, vid); }
  const pal = getPalette();
  graph.nodes.forEach((n) => { n.state = n.state || {}; });
  const shown = graph.evaluate({ g: G, W, H, time: now / 1000, dt, pal, video, black, state: stateOf });
  if (shown) G.present(shown);
  G.gl.finish && 0;
  ms += performance.now() - a; frames++;
  if (now - t0 > 1000) { fps = frames * 1000 / (now - t0); $('#meter').textContent = `${fps.toFixed(0)} fps · ${(ms / frames).toFixed(1)} ms · ${graph.nodes.length} nodes`; frames = 0; ms = 0; t0 = now; }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- version stamp, new deploys are detected
{
  const build = document.querySelector('meta[name=build]').content;
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((v) => { $('#ver').textContent = `${v.version} (build ${v.build})`; }).catch(() => { $('#ver').textContent = 'build ' + build; });
  const nv = $('#newver'); nv.onclick = () => location.reload();
  setInterval(async () => { try { const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json(); if (v.build && v.build !== build) nv.hidden = false; } catch { /* offline */ } }, 30000);
}
window.__v3 = { graph: () => graph, editor, G, NODES };
