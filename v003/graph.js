// GRAPH (v3.0): the nodes, the typed links, evaluation and saving.
import { NODES, defaults, paramSpecs } from './nodes.js';

let uid = 1;
export class Graph {
  constructor() { this.nodes = []; this.links = []; this.frame = 0; }
  node(id) { return this.nodes.find((n) => n.id === id); }
  addNode(type, x, y, id) {
    if (!NODES[type]) return null;
    const n = { id: id || 'n' + uid++, type, x, y, params: defaults(type), ui: {}, state: {} };
    if (id) { const k = +String(id).replace(/\D/g, ''); if (k >= uid) uid = k + 1; }
    this.nodes.push(n); return n;
  }
  // The links through a node are kept: its first input's source is joined to everything its outputs fed (as in Houdini).
  bridgeAround(id) {
    const ins = this.links.filter((l) => l.to === id), outs = this.links.filter((l) => l.from === id); if (!ins.length || !outs.length) return;
    const n = this.node(id), order = NODES[n.type].inputs.map((p) => p.id); ins.sort((a, b) => order.indexOf(a.toPort) - order.indexOf(b.toPort));
    const src = ins[0]; for (const o of outs) this.connect(src.from, src.fromPort, o.to, o.toPort);
  }
  removeNode(id, bridge = true) { if (bridge) this.bridgeAround(id); this.nodes = this.nodes.filter((n) => n.id !== id); this.links = this.links.filter((l) => l.from !== id && l.to !== id); }
  detachNode(id) { this.bridgeAround(id); this.links = this.links.filter((l) => l.from !== id && l.to !== id); }
  // can this unconnected node be put into the middle of a link? returns the two ports to use
  insertPorts(nodeId, linkId) {
    const n = this.node(nodeId), l = this.links.find((q) => q.id === linkId); if (!n || !l || l.from === nodeId || l.to === nodeId) return null;
    if (this.links.some((q) => q.from === nodeId || q.to === nodeId)) return null;
    const A = this.node(l.from), B = this.node(l.to), tIn = this.portType(A, 'out', l.fromPort), tOut = this.portType(B, 'in', l.toPort), d = NODES[n.type];
    const pin = d.inputs.find((p) => p.type === tIn), pout = d.outputs.find((p) => p.type === tOut); return pin && pout ? { pin: pin.id, pout: pout.id } : null;
  }
  insertOnLink(nodeId, linkId) {
    const ports = this.insertPorts(nodeId, linkId); if (!ports) return false; const l = this.links.find((q) => q.id === linkId), old = { ...l };
    this.disconnect(linkId);
    if (this.connect(old.from, old.fromPort, nodeId, ports.pin) && this.connect(nodeId, ports.pout, old.to, old.toPort)) return true;
    this.links = this.links.filter((q) => q.from !== nodeId && q.to !== nodeId); this.connect(old.from, old.fromPort, old.to, old.toPort); return false;
  }
  portType(n, side, id) { const d = NODES[n.type]; const p = (side === 'out' ? d.outputs : d.inputs).find((q) => q.id === id); return p ? p.type : null; }
  reaches(a, b, seen = new Set()) {                        // can a reach b by following links forward?
    if (a === b) return true; if (seen.has(a)) return false; seen.add(a);
    return this.links.some((l) => l.from === a && this.reaches(l.to, b, seen));
  }
  canConnect(from, fp, to, tp) {
    const a = this.node(from), b = this.node(to); if (!a || !b || from === to) return false;
    const t1 = this.portType(a, 'out', fp), t2 = this.portType(b, 'in', tp);
    return !!t1 && t1 === t2 && !this.reaches(to, from);       // same type, and no loop
  }
  connect(from, fp, to, tp) {
    if (!this.canConnect(from, fp, to, tp)) return false;
    this.links = this.links.filter((l) => !(l.to === to && l.toPort === tp));     // an input takes one link
    this.links.push({ id: 'l' + uid++, from, fromPort: fp, to, toPort: tp }); return true;
  }
  disconnect(id) { this.links = this.links.filter((l) => l.id !== id); }
  // evaluate: walk back from every Output node, each node once per frame
  evaluate(c) {
    this.frame++; const memo = new Map(), busy = new Set(); let shown = null;
    const get = (n) => {
      if (memo.has(n.id)) return memo.get(n.id);
      if (busy.has(n.id)) return {}; busy.add(n.id);
      const ins = {};
      for (const l of this.links) if (l.to === n.id) { const src = this.node(l.from), r = src && get(src); if (r && r[l.fromPort]) ins[l.toPort] = r[l.fromPort]; }
      n.state = n.state || {}; const out = NODES[n.type].run(n, ins, c) || {}; busy.delete(n.id); memo.set(n.id, out);
      if (n.type === 'output') shown = ins.in || null;
      return out;
    };
    for (const n of this.nodes) if (n.type === 'output') get(n);
    return shown;
  }
  toJSON() {
    return { v: 1, nodes: this.nodes.map((n) => ({ id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), params: n.params, ui: n.ui })),
      links: this.links.map((l) => ({ from: l.from, fromPort: l.fromPort, to: l.to, toPort: l.toPort })) };
  }
  static fromJSON(o) {
    const g = new Graph(); if (!o || !Array.isArray(o.nodes)) return null;
    for (const d of o.nodes) { const n = g.addNode(d.type, d.x, d.y, d.id); if (n) { Object.assign(n.params, d.params || {}); n.ui = d.ui || {}; } }
    for (const l of o.links || []) g.connect(l.from, l.fromPort, l.to, l.toPort);
    return g;
  }
  resetNode(n) { n.params = defaults(n.type); n.ui = {}; }
  specs(n) { return paramSpecs(n.type); }
}
export function defaultGraph() {
  const g = new Graph(), a = g.addNode('camera', 10, 10), b = g.addNode('levels', 195, 70), c = g.addNode('palette', 380, 10), d = g.addNode('output', 565, 70);
  g.connect(a.id, 'out', b.id, 'in'); g.connect(b.id, 'out', c.id, 'in'); g.connect(c.id, 'out', d.id, 'in'); return g;
}
