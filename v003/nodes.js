// NODE LIBRARY (v3.0). One entry per node type. Only parameters that visibly change the picture are kept.
// A node: { title, family, info, inputs: [{id,type}], outputs: [{id,type}], params: [...], run(node, ins, c) -> { outId: texture } }
//   param kinds: slider (default: id, label, min, max, step, val, prog, group) | toggle (id, label, val 0/1) | choice (id, label, options [[value,label]], val)
//   c = { g (gl helper), W, H, time, dt, pal, video: { ready, w, h, tex }, state(node, key) -> a render target kept for this node }
import { W, H } from './gl.js';

export const TYPES = { image: { label: 'Image', color: '#7ab8ff' } };     // v3.1 adds Mask, Field, Path, Points, Curve

const TEST = `uniform float t;
float blob(vec2 p, vec2 c, float r) { return smoothstep(r, r * 0.35, length(p - c)); }
void main() {
  vec2 p = vec2(uv.x * 0.5625, uv.y);
  float a = blob(p, vec2(0.28 + 0.08 * sin(t * 0.7), 0.62 + 0.05 * cos(t * 0.5)), 0.2);
  a += 0.8 * blob(p, vec2(0.18 + 0.1 * cos(t * 0.4), 0.30 + 0.06 * sin(t * 0.9)), 0.16);
  a += 0.5 * blob(p, vec2(0.40, 0.84 + 0.04 * sin(t * 0.6)), 0.12);
  float g = 0.12 + 0.2 * uv.y + 0.6 * clamp(a, 0.0, 1.0);
  o = vec4(vec3(g), 1.0);
}`;

export const NODES = {
  camera: {
    title: 'Camera / Video', family: 'Source', info: 'The camera or the loaded video, cropped to fill the picture. A moving test picture shows until a source is chosen (buttons at the top).',
    inputs: [], outputs: [{ id: 'out', type: 'image' }],
    params: [{ id: 'mirror', kind: 'toggle', label: 'Mirror', val: 1 }],
    run(n, ins, c) {
      const out = c.state(n, 'out');
      if (!c.video.ready) { c.g.pass(TEST, {}, { t: c.time }, out); return { out: out.tex }; }
      const va = c.video.w / c.video.h, ta = W / H, sx = va > ta ? ta / va : 1, sy = va > ta ? 1 : va / ta;
      c.g.pass(`uniform sampler2D src; uniform vec4 crop; uniform float mir;
        void main() { vec2 q = vec2(mir > 0.5 ? 1.0 - uv.x : uv.x, uv.y); o = vec4(texture(src, crop.xy + q * crop.zw).rgb, 1.0); }`,
        { src: c.video.tex }, { crop: [(1 - sx) / 2, (1 - sy) / 2, sx, sy], mir: n.params.mirror ? 1 : 0 }, out);
      return { out: out.tex };
    },
  },
  levels: {
    title: 'Levels / Contrast', family: 'Image', info: 'Sets the black and white points and the contrast curve. Raise Black to crush the darks, lower White to blow out the lights, Gamma brightens or darkens the middle.',
    inputs: [{ id: 'in', type: 'image' }], outputs: [{ id: 'out', type: 'image' }],
    params: [
      { id: 'black', label: 'Black point', min: 0, max: 0.95, step: 0.005, val: 0, prog: 'low2' },
      { id: 'white', label: 'White point', min: 0.05, max: 1, step: 0.005, val: 1, prog: 'high2' },
      { id: 'gamma', label: 'Gamma (above 1 = brighter middle)', min: 0.2, max: 3, step: 0.01, val: 1 },
    ],
    run(n, ins, c) {
      const out = c.state(n, 'out'); if (!ins.in) return {};
      c.g.pass(`uniform sampler2D src; uniform float b, w, gm;
        void main() { vec3 v = texture(src, uv).rgb; v = pow(clamp((v - b) / max(0.01, w - b), 0.0, 1.0), vec3(1.0 / gm)); o = vec4(v, 1.0); }`,
        { src: ins.in }, { b: n.params.black, w: n.params.white, gm: n.params.gamma }, out);
      return { out: out.tex };
    },
  },
  invert: {
    title: 'Invert', family: 'Image', info: 'Light becomes dark and dark becomes light. Amount blends between the picture and its negative.',
    inputs: [{ id: 'in', type: 'image' }], outputs: [{ id: 'out', type: 'image' }],
    params: [{ id: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, val: 1 }],
    run(n, ins, c) {
      const out = c.state(n, 'out'); if (!ins.in) return {};
      c.g.pass('uniform sampler2D src; uniform float a; void main() { vec3 v = texture(src, uv).rgb; o = vec4(mix(v, 1.0 - v, a), 1.0); }', { src: ins.in }, { a: n.params.amount }, out);
      return { out: out.tex };
    },
  },
  ease: {
    title: 'Ease (time smooth)', family: 'Image', info: 'Makes the picture follow its input slowly instead of jumping: every change glides. This is what keeps animation free of flicker.',
    inputs: [{ id: 'in', type: 'image' }], outputs: [{ id: 'out', type: 'image' }],
    params: [{ id: 'sec', label: 'Ease seconds', min: 0.02, max: 4, step: 0.01, val: 0.3, prog: 'low2' }],
    run(n, ins, c) {
      if (!ins.in) return {};
      const a = c.state(n, 'a'), b = c.state(n, 'b'), first = !n.state.has; n.state.has = true;
      const k = first ? 1 : 1 - Math.exp(-c.dt / Math.max(0.02, n.params.sec));
      c.g.pass('uniform sampler2D prev, cur; uniform float k; void main() { o = vec4(mix(texture(prev, uv).rgb, texture(cur, uv).rgb, k), 1.0); }', { prev: a.tex, cur: ins.in }, { k }, b);
      n.state.a = b; n.state.b = a;                            // swap: what was just written is next frame's previous picture
      return { out: b.tex };
    },
  },
  palette: {
    title: 'Palette map', family: 'Colour', info: 'Colours the picture with the global palette (Colours panel): dark tones take the first colour, light tones the last. The palette is shared by every node.',
    inputs: [{ id: 'in', type: 'image' }], outputs: [{ id: 'out', type: 'image' }],
    params: [
      { id: 'mix', label: 'Mix with the original', min: 0, max: 1, step: 0.01, val: 1 },
      { id: 'steps', label: 'Colour steps (0 = smooth)', min: 0, max: 12, step: 1, val: 0 },
    ],
    run(n, ins, c) {
      const out = c.state(n, 'out'); if (!ins.in) return {};
      const cs = c.pal.cols.map((x) => x.map((v) => v / 255)), c0 = cs[0], c2 = cs[cs.length - 1], c1 = cs.length === 3 ? cs[1] : c0.map((v, i) => (v + c2[i]) / 2);
      c.g.pass(`uniform sampler2D src; uniform vec3 c0, c1, c2; uniform float mx, st;
        void main() {
          vec3 s = texture(src, uv).rgb; float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
          if (st > 0.5) l = floor(l * st + 0.5) / st;
          vec3 col = l < 0.5 ? mix(c0, c1, l * 2.0) : mix(c1, c2, l * 2.0 - 1.0);
          o = vec4(mix(s, col, mx), 1.0);
        }`, { src: ins.in }, { c0, c1, c2, mx: n.params.mix, st: n.params.steps }, out);
      return { out: out.tex };
    },
  },
  output: {
    title: 'Output', family: 'Output', info: 'What you see in the preview. Connect the last node here.',
    inputs: [{ id: 'in', type: 'image' }], outputs: [], params: [],
    run() { return {}; },
  },
};

export const FAMILIES = ['Source', 'Image', 'Colour', 'Output'];
export const paramSpecs = (type) => (NODES[type] ? NODES[type].params : []);
export const defaults = (type) => Object.fromEntries(paramSpecs(type).map((p) => [p.id, p.val]));
