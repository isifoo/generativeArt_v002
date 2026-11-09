// NODE CANVAS (v3.0). Drag nodes, drag from a port to another port to link, pan and zoom (wheel, or two fingers), tap a node or a link to select it.
// Pointer events with capture and touch-action:none everywhere, so a finger works on the first touch on the iPad.
import { NODES, FAMILIES, TYPES } from './nodes.js';

const NW = 172, HH = 30, RH = 26, PADB = 8;                    // node width, header height, row height, bottom padding (graph units)
const nodeH = (n) => { const d = NODES[n.type]; return HH + Math.max(d.inputs.length, d.outputs.length, 1) * RH + PADB; };
const portXY = (n, side, i) => ({ x: n.x + (side === 'out' ? NW : 0), y: n.y + HH + i * RH + RH / 2 });

export function createEditor(root, graph, cb) {
  // cb: { onSelect(node|null), onChange() }
  root.innerHTML = `<div class="g-tools"><button type="button" class="g-add">+ Add node</button><button type="button" class="g-del" disabled>Delete</button><button type="button" class="g-fit">Fit</button><span class="g-hint">Drag from a dot to another dot to link. Tap a link, then Delete, to remove it.</span></div>
<div class="g-surface"><div class="g-layer"><svg class="g-links"></svg><div class="g-nodes"></div></div></div>
<div class="g-menu" hidden><input type="search" placeholder="Find a node..." aria-label="Find a node"><div class="g-list"></div></div>`;
  const $ = (s) => root.querySelector(s);
  const surface = $('.g-surface'), layer = $('.g-layer'), svg = $('.g-links'), nodesEl = $('.g-nodes'), menu = $('.g-menu'), delBtn = $('.g-del');
  const view = { x: 20, y: 20, s: 1 };
  let sel = null;                                               // { kind: 'node' | 'link', id }
  let G = graph;
  const NS = 'http://www.w3.org/2000/svg';

  const applyView = () => { layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; };
  const toGraph = (cx, cy) => { const r = surface.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s }; };
  const changed = () => cb.onChange && cb.onChange();

  // ---------------------------------------------------------------- drawing
  function linkPath(a, b) { const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }
  let temp = null;                                              // a link being dragged: { a: {x,y}, b: {x,y}, ok }
  function drawLinks() {
    svg.textContent = '';
    for (const l of G.links) {
      const A = G.node(l.from), B = G.node(l.to); if (!A || !B) continue;
      const ai = NODES[A.type].outputs.findIndex((p) => p.id === l.fromPort), bi = NODES[B.type].inputs.findIndex((p) => p.id === l.toPort);
      const d = linkPath(portXY(A, 'out', ai), portXY(B, 'in', bi));
      const hit = document.createElementNS(NS, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 'g-hit'); hit.dataset.link = l.id; svg.append(hit);
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'g-link' + (sel && sel.kind === 'link' && sel.id === l.id ? ' sel' : '')); svg.append(p);
    }
    if (temp) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', linkPath(temp.a, temp.b)); p.setAttribute('class', 'g-link temp'); svg.append(p); }
  }
  function drawNodes() {
    nodesEl.textContent = '';
    for (const n of G.nodes) {
      const d = NODES[n.type], el = document.createElement('div');
      el.className = 'g-node fam-' + d.family.toLowerCase() + (sel && sel.kind === 'node' && sel.id === n.id ? ' sel' : ''); el.dataset.id = n.id;
      el.style.cssText = `left:${n.x}px;top:${n.y}px;width:${NW}px;height:${nodeH(n)}px`;
      el.innerHTML = `<div class="g-head"><b>${d.title}</b><i>${d.family}</i></div>`;
      d.inputs.forEach((p, i) => { const r = document.createElement('div'); r.className = 'g-row in'; r.style.top = (HH + i * RH) + 'px'; r.innerHTML = `<span class="port" data-node="${n.id}" data-side="in" data-port="${p.id}" style="--c:${TYPES[p.type].color}"></span><em>${p.id === 'in' ? 'In' : p.id}</em>`; el.append(r); });
      d.outputs.forEach((p, i) => { const r = document.createElement('div'); r.className = 'g-row out'; r.style.top = (HH + i * RH) + 'px'; r.innerHTML = `<em>${p.id === 'out' ? 'Out' : p.id}</em><span class="port" data-node="${n.id}" data-side="out" data-port="${p.id}" style="--c:${TYPES[p.type].color}"></span>`; el.append(r); });
      nodesEl.append(el);
    }
    markPorts();
  }
  function markPorts() {
    for (const p of nodesEl.querySelectorAll('.port')) {
      const n = p.dataset.node, on = G.links.some((l) => (p.dataset.side === 'in' ? l.to === n && l.toPort === p.dataset.port : l.from === n && l.fromPort === p.dataset.port));
      p.classList.toggle('on', on);
    }
  }
  function render() { applyView(); drawNodes(); drawLinks(); delBtn.disabled = !sel; }
  function select(s) { sel = s; render(); cb.onSelect && cb.onSelect(s && s.kind === 'node' ? G.node(s.id) : null); }

  // ---------------------------------------------------------------- pointers on the canvas: pan, pinch, drag node, drag link
  let touched = false;                                          // after the user pans or zooms, the view is theirs: no automatic fit
  const ptrs = new Map(); let pinch = null, nodeDrag = null, linkDrag = null, moved = false;
  surface.addEventListener('pointerdown', (e) => {
    if (e.button > 0 && e.pointerType === 'mouse') return;
    const port = e.target.closest('.port'), nodeEl = e.target.closest('.g-node'), hit = e.target.closest('.g-hit');
    surface.setPointerCapture(e.pointerId); moved = false; touched = true;
    if (port) { startLink(e, port); e.preventDefault(); return; }
    if (nodeEl && !ptrs.size) { const n = G.node(nodeEl.dataset.id), g0 = toGraph(e.clientX, e.clientY); nodeDrag = { n, dx: g0.x - n.x, dy: g0.y - n.y, id: e.pointerId }; select({ kind: 'node', id: n.id }); e.preventDefault(); return; }
    if (hit) { select({ kind: 'link', id: hit.dataset.link }); return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s }; }
  });
  surface.addEventListener('pointermove', (e) => {
    if (linkDrag && e.pointerId === linkDrag.id) { const g = toGraph(e.clientX, e.clientY); temp.b = g; drawLinks(); highlightTargets(e); return; }
    if (nodeDrag && e.pointerId === nodeDrag.id) { const g = toGraph(e.clientX, e.clientY); nodeDrag.n.x = g.x - nodeDrag.dx; nodeDrag.n.y = g.y - nodeDrag.dy; moved = true;
      const el = nodesEl.querySelector(`[data-id="${nodeDrag.n.id}"]`); if (el) { el.style.left = nodeDrag.n.x + 'px'; el.style.top = nodeDrag.n.y + 'px'; } drawLinks(); return; }
    const p = ptrs.get(e.pointerId); if (!p) return;
    const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY; moved = true;
    if (ptrs.size === 1) { view.x += e.clientX - px; view.y += e.clientY - py; applyView(); }
    else if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = surface.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      zoomAt(mx, my, clamp(pinch.s * d / Math.max(1, pinch.d), 0.3, 2.5)); view.x += (e.clientX - px) / 2; view.y += (e.clientY - py) / 2; applyView();
    }
  });
  const up = (e) => {
    if (linkDrag && e.pointerId === linkDrag.id) finishLink(e);
    if (nodeDrag && e.pointerId === nodeDrag.id) { nodeDrag = null; if (moved) changed(); }
    if (ptrs.has(e.pointerId)) { const wasTap = ptrs.size === 1 && !moved; ptrs.delete(e.pointerId); pinch = null; if (wasTap) select(null); }
    try { surface.releasePointerCapture(e.pointerId); } catch { /* released */ }
  };
  surface.addEventListener('pointerup', up); surface.addEventListener('pointercancel', up);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function zoomAt(mx, my, s) { const k = s / view.s; view.x = mx - (mx - view.x) * k; view.y = my - (my - view.y) * k; view.s = s; }
  surface.addEventListener('wheel', (e) => { e.preventDefault(); const r = surface.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, clamp(view.s * Math.exp(-e.deltaY * 0.0015), 0.3, 2.5)); applyView(); }, { passive: false });

  // ---- links
  function startLink(e, port) {
    const n = G.node(port.dataset.node), side = port.dataset.side, pid = port.dataset.port;
    if (side === 'in') {                                        // pulling from a connected input takes the link off and carries its source end
      const l = G.links.find((q) => q.to === n.id && q.toPort === pid);
      if (!l) { linkDrag = { id: e.pointerId, from: null, to: { node: n.id, port: pid } }; const g = toGraph(e.clientX, e.clientY); const i = NODES[n.type].inputs.findIndex((q) => q.id === pid); temp = { a: portXY(n, 'in', i), b: g }; temp.rev = true; drawLinks(); return; }
      G.disconnect(l.id); const src = G.node(l.from), i = NODES[src.type].outputs.findIndex((q) => q.id === l.fromPort);
      linkDrag = { id: e.pointerId, from: { node: src.id, port: l.fromPort } }; temp = { a: portXY(src, 'out', i), b: toGraph(e.clientX, e.clientY) }; markPorts(); drawLinks(); return;
    }
    const i = NODES[n.type].outputs.findIndex((q) => q.id === pid);
    linkDrag = { id: e.pointerId, from: { node: n.id, port: pid } }; temp = { a: portXY(n, 'out', i), b: toGraph(e.clientX, e.clientY) }; drawLinks();
  }
  function portAt(e) { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest('.port') : null; }
  function highlightTargets(e) {
    nodesEl.querySelectorAll('.port.hot').forEach((p) => p.classList.remove('hot'));
    const p = portAt(e); if (!p || !linkDrag.from) return;
    if (p.dataset.side === 'in' && G.canConnect(linkDrag.from.node, linkDrag.from.port, p.dataset.node, p.dataset.port)) p.classList.add('hot');
  }
  function finishLink(e) {
    const p = portAt(e), d = linkDrag; linkDrag = null; temp = null; nodesEl.querySelectorAll('.port.hot').forEach((x) => x.classList.remove('hot'));
    let did = false;
    if (p && d.from && p.dataset.side === 'in') did = G.connect(d.from.node, d.from.port, p.dataset.node, p.dataset.port);
    else if (p && d.to && p.dataset.side === 'out') did = G.connect(p.dataset.node, p.dataset.port, d.to.node, d.to.port);
    markPorts(); drawLinks(); if (did || d.from) changed();
  }

  // ---------------------------------------------------------------- toolbar
  window.addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); del(); } });
  function del() {
    if (!sel) return;
    if (sel.kind === 'node') { const n = G.node(sel.id); if (n && n.type === 'output' && G.nodes.filter((x) => x.type === 'output').length === 1) { /* keep the last Output: it is the picture */ } else G.removeNode(sel.id); }
    else G.disconnect(sel.id);
    select(null); changed();
  }
  delBtn.addEventListener('click', del);
  $('.g-fit').addEventListener('click', fit);
  function fit() {
    if (!G.nodes.length) return; const r = surface.getBoundingClientRect();
    const x0 = Math.min(...G.nodes.map((n) => n.x)), y0 = Math.min(...G.nodes.map((n) => n.y)), x1 = Math.max(...G.nodes.map((n) => n.x + NW)), y1 = Math.max(...G.nodes.map((n) => n.y + nodeH(n)));
    const s = clamp(Math.min((r.width - 40) / (x1 - x0), (r.height - 40) / (y1 - y0)), 0.3, 1.2);
    view.s = s; view.x = (r.width - (x1 - x0) * s) / 2 - x0 * s; view.y = (r.height - (y1 - y0) * s) / 2 - y0 * s; applyView();
  }
  // add menu: grouped by family, with a search field
  const list = $('.g-list'), search = menu.querySelector('input');
  function fillMenu() {
    const q = search.value.trim().toLowerCase(); list.textContent = '';
    for (const f of FAMILIES) {
      const items = Object.entries(NODES).filter(([, d]) => d.family === f && (!q || (d.title + ' ' + d.info).toLowerCase().includes(q)));
      if (!items.length) continue;
      const h = document.createElement('div'); h.className = 'g-fam'; h.textContent = f; list.append(h);
      for (const [type, d] of items) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<b>${d.title}</b><span>${d.info}</span>`; b.addEventListener('click', () => addAtCenter(type)); list.append(b); }
    }
  }
  function addAtCenter(type) {
    const r = surface.getBoundingClientRect(), g = toGraph(r.left + r.width / 2, r.top + r.height / 2);
    const n = G.addNode(type, Math.round(g.x - NW / 2 + (G.nodes.length % 5) * 18), Math.round(g.y - 30 + (G.nodes.length % 5) * 18)); menu.hidden = true; select({ kind: 'node', id: n.id }); changed();
  }
  $('.g-add').addEventListener('click', () => { menu.hidden = !menu.hidden; if (!menu.hidden) { search.value = ''; fillMenu(); if (!matchMedia('(pointer: coarse)').matches) search.focus(); } });
  search.addEventListener('input', fillMenu);
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.g-add')) menu.hidden = true; });

  render(); requestAnimationFrame(fit);
  new ResizeObserver(() => { if (!touched) fit(); }).observe(surface);
  return {
    render, fit, select, selected: () => (sel && sel.kind === 'node' ? G.node(sel.id) : null),
    setGraph(g) { G = g; sel = null; render(); fit(); cb.onSelect && cb.onSelect(null); },
    view,
  };
}
