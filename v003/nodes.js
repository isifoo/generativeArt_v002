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
    title: 'Ease (time smooth)', family: 'Time', info: 'Makes the picture follow its input slowly instead of jumping: every change glides. This is what keeps animation free of flicker.',
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


const LUMA = 'vec3(0.2126, 0.7152, 0.0722)';
const IO = (ins, outs = ['out']) => ({ inputs: ins.map((id) => ({ id, type: 'image' })), outputs: outs.map((id) => ({ id, type: 'image' })) });
Object.assign(NODES, {
  noise: {
    title: 'Noise', family: 'Source', info: 'Moving cloudy noise (grey). Use it as a map for Displace, as a matte, or as a texture. Scale is the size of the clouds, Detail adds finer layers.',
    ...IO([]),
    params: [
      { id: 'scale', label: 'Scale (clouds across)', min: 0.5, max: 40, step: 0.1, val: 5, prog: 'low2' },
      { id: 'speed', label: 'Speed', min: 0, max: 2, step: 0.01, val: 0.25 },
      { id: 'detail', label: 'Detail (layers)', min: 1, max: 5, step: 1, val: 3 },
      { id: 'contrast', label: 'Contrast', min: 0.4, max: 4, step: 0.01, val: 1.4 },
    ],
    run(n, ins, c) {
      const out = c.state(n, 'out'); n.state.ph = (n.state.ph || 0) + c.dt * n.params.speed;
      c.g.pass(`uniform float sc, ph, dt, ct;
        float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float vn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main() { vec3 p = vec3(uv.x * sc * 0.5625, uv.y * sc, ph); float v = 0.0, a = 0.5, tot = 0.0;
          for (int i = 0; i < 5; i++) { if (float(i) >= dt) break; v += a * vn(p); tot += a; p *= 2.03; p.z += 3.1; a *= 0.5; }
          v = clamp((v / tot - 0.5) * ct + 0.5, 0.0, 1.0); o = vec4(vec3(v), 1.0); }`,
        {}, { sc: n.params.scale, ph: n.state.ph, dt: n.params.detail, ct: n.params.contrast }, out);
      return { out: out.tex };
    },
  },
  blur: {
    title: 'Blur', family: 'Image', info: 'Softens the picture. Radius is in pixels of the working size.',
    ...IO(['in']), params: [{ id: 'radius', label: 'Radius px', min: 0, max: 60, step: 0.5, val: 6, prog: 'low2' }],
    run(n, ins, c) {
      if (!ins.in) return {}; const r = n.params.radius; if (r < 0.3) return { out: ins.in };
      const tmp = c.state(n, 'tmp'), out = c.state(n, 'out'), F = `uniform sampler2D src; uniform vec2 d;
        void main() { vec3 s = vec3(0.0); float w = 0.0; for (int i = -6; i <= 6; i++) { float k = exp(-float(i * i) / 18.0); s += texture(src, uv + d * float(i)).rgb * k; w += k; } o = vec4(s / w, 1.0); }`;
      c.g.pass(F, { src: ins.in }, { d: [r / 6 / W, 0] }, tmp); c.g.pass(F, { src: tmp.tex }, { d: [0, r / 6 / H] }, out); return { out: out.tex };
    },
  },
  edges: {
    title: 'Edge detect', family: 'Image', info: 'Finds where the picture changes from light to dark and draws it as white lines on black. Threshold is how big a change counts, Softness fades the line edges.',
    ...IO(['in']),
    params: [
      { id: 'strength', label: 'Strength', min: 0.3, max: 8, step: 0.05, val: 3, prog: 'low2' },
      { id: 'threshold', label: 'Threshold (higher = fewer lines)', min: 0, max: 1, step: 0.005, val: 0.1 },
      { id: 'soft', label: 'Softness', min: 0.005, max: 0.6, step: 0.005, val: 0.1, prog: 'low2' },
    ],
    run(n, ins, c) {
      if (!ins.in) return {}; const out = c.state(n, 'out');
      c.g.pass(`uniform sampler2D src; uniform vec2 px; uniform float st, th, sf;
        float L(float x, float y) { return dot(texture(src, uv + vec2(x, y) * px).rgb, ${LUMA}); }
        void main() { float gx = -L(-1.,-1.) - 2. * L(-1.,0.) - L(-1.,1.) + L(1.,-1.) + 2. * L(1.,0.) + L(1.,1.);
          float gy = -L(-1.,-1.) - 2. * L(0.,-1.) - L(1.,-1.) + L(-1.,1.) + 2. * L(0.,1.) + L(1.,1.);
          o = vec4(vec3(smoothstep(th, th + sf, length(vec2(gx, gy)) * st * 0.25)), 1.0); }`,
        { src: ins.in }, { px: [1 / W, 1 / H], st: n.params.strength, th: n.params.threshold, sf: n.params.soft }, out);
      return { out: out.tex };
    },
  },
  threshold: {
    title: 'Threshold', family: 'Image', info: 'Turns the picture into pure black and white at a chosen brightness. Softness makes the cut gradual.',
    ...IO(['in']),
    params: [{ id: 'level', label: 'Level', min: 0, max: 1, step: 0.005, val: 0.5 }, { id: 'soft', label: 'Softness', min: 0.002, max: 0.5, step: 0.002, val: 0.02, prog: 'low2' }],
    run(n, ins, c) {
      if (!ins.in) return {}; const out = c.state(n, 'out');
      c.g.pass(`uniform sampler2D src; uniform float lv, sf; void main() { float l = dot(texture(src, uv).rgb, ${LUMA}); o = vec4(vec3(smoothstep(lv - sf, lv + sf, l)), 1.0); }`,
        { src: ins.in }, { lv: n.params.level, sf: n.params.soft }, out);
      return { out: out.tex };
    },
  },
  mosaic: {
    title: 'Mosaic', family: 'Distort', info: 'Splits the picture into square cells, each one flat. The basis for letters and dots later.',
    ...IO(['in']), params: [{ id: 'cells', label: 'Cells across', min: 8, max: 270, step: 1, val: 60, prog: 'high2' }],
    run(n, ins, c) {
      if (!ins.in) return {}; const out = c.state(n, 'out');
      c.g.pass('uniform sampler2D src; uniform vec2 cs; void main() { o = vec4(texture(src, (floor(uv / cs) + 0.5) * cs).rgb, 1.0); }',
        { src: ins.in }, { cs: [1 / n.params.cells, (1 / n.params.cells) * W / H] }, out);
      return { out: out.tex };
    },
  },
  displace: {
    title: 'Displace', family: 'Distort', info: 'Pushes the picture around using a second picture, like the Displacement Map in After Effects. Light parts of the map push one way, dark parts the other. Needs the Image and a Map (for example Noise or a Blur of the picture).',
    ...IO(['image', 'map']),
    params: [
      { id: 'mode', kind: 'choice', label: 'Map is read as', options: [['luma', 'Brightness (one value)'], ['rg', 'Red = across, green = up']], val: 'luma' },
      { id: 'ax', label: 'Across px', min: -120, max: 120, step: 0.5, val: 20 },
      { id: 'ay', label: 'Up and down px', min: -120, max: 120, step: 0.5, val: 20 },
    ],
    run(n, ins, c) {
      if (!ins.image) return {}; if (!ins.map) return { out: ins.image }; const out = c.state(n, 'out');
      c.g.pass(`uniform sampler2D src, map; uniform vec2 amt; uniform float rg;
        void main() { vec3 m = texture(map, uv).rgb; vec2 d = rg > 0.5 ? m.rg - 0.5 : vec2(dot(m, ${LUMA}) - 0.5);
          o = vec4(texture(src, uv + d * amt).rgb, 1.0); }`,
        { src: ins.image, map: ins.map }, { amt: [n.params.ax / W, n.params.ay / H], rg: n.params.mode === 'rg' ? 1 : 0 }, out);
      return { out: out.tex };
    },
  },
  matte: {
    title: 'Track matte', family: 'Composite', info: 'Shows the Image only where the Matte is light (or where it is dark, with Inverted). The rest takes the background colour. Feed the matte from Threshold, Edge detect, Noise or any picture.',
    ...IO(['image', 'matte']),
    params: [
      { id: 'mode', kind: 'choice', label: 'Matte', options: [['luma', 'Light shows'], ['inv', 'Dark shows (inverted)']], val: 'luma' },
      { id: 'bg', kind: 'choice', label: 'Elsewhere', options: [['black', 'Black'], ['white', 'White'], ['paper', 'Palette paper']], val: 'black' },
      { id: 'cont', label: 'Matte contrast', min: 0.5, max: 6, step: 0.05, val: 1, prog: 'low2' },
    ],
    run(n, ins, c) {
      if (!ins.image) return {}; const out = c.state(n, 'out'), paper = c.pal.paper.map((v) => v / 255), bgc = n.params.bg === 'white' ? [1, 1, 1] : n.params.bg === 'paper' ? paper : [0, 0, 0];
      c.g.pass(`uniform sampler2D src, mt; uniform vec3 bgc; uniform float inv, ct, has;
        void main() { float m = has > 0.5 ? clamp((dot(texture(mt, uv).rgb, ${LUMA}) - 0.5) * ct + 0.5, 0.0, 1.0) : 1.0; if (inv > 0.5) m = 1.0 - m;
          o = vec4(mix(bgc, texture(src, uv).rgb, m), 1.0); }`,
        { src: ins.image, mt: ins.matte || c.black }, { bgc, inv: n.params.mode === 'inv' ? 1 : 0, ct: n.params.cont, has: ins.matte ? 1 : 0 }, out);
      return { out: out.tex };
    },
  },
  mix: {
    title: 'Mix', family: 'Composite', info: 'Combines two pictures. Mix blends, Add brightens, Multiply darkens, Screen lightens softly, Difference shows what changed, Max keeps the lighter one.',
    ...IO(['a', 'b']),
    params: [
      { id: 'mode', kind: 'choice', label: 'How', options: [['mix', 'Mix'], ['add', 'Add'], ['mul', 'Multiply'], ['screen', 'Screen'], ['diff', 'Difference'], ['max', 'Max']], val: 'mix' },
      { id: 'amount', label: 'Amount (of B)', min: 0, max: 1, step: 0.01, val: 0.5 },
    ],
    run(n, ins, c) {
      if (!ins.a && !ins.b) return {}; const out = c.state(n, 'out'), m = ['mix', 'add', 'mul', 'screen', 'diff', 'max'].indexOf(n.params.mode);
      c.g.pass(`uniform sampler2D a, b; uniform float am, md;
        void main() { vec3 x = texture(a, uv).rgb, y = texture(b, uv).rgb, r;
          if (md < 0.5) r = mix(x, y, am); else if (md < 1.5) r = x + y * am; else if (md < 2.5) r = mix(x, x * y, am);
          else if (md < 3.5) r = mix(x, 1.0 - (1.0 - x) * (1.0 - y), am); else if (md < 4.5) r = mix(x, abs(x - y), am); else r = mix(x, max(x, y), am);
          o = vec4(clamp(r, 0.0, 1.0), 1.0); }`,
        { a: ins.a || c.black, b: ins.b || c.black }, { am: n.params.amount, md: m }, out);
      return { out: out.tex };
    },
  },
  echo: {
    title: 'Echo (trails)', family: 'Time', info: 'Leaves a fading ghost of earlier frames behind moving light parts, like the Echo effect in After Effects. Higher Trail = longer ghosts.',
    ...IO(['in']), params: [{ id: 'trail', label: 'Trail (higher = longer)', min: 0, max: 0.98, step: 0.005, val: 0.85, prog: 'high2' }],
    run(n, ins, c) {
      if (!ins.in) return {}; const a = c.state(n, 'a'), b = c.state(n, 'b'), first = !n.state.has; n.state.has = true;
      const k = first ? 0 : Math.pow(n.params.trail, c.dt * 30);
      c.g.pass('uniform sampler2D prev, cur; uniform float k; void main() { o = vec4(max(texture(cur, uv).rgb, texture(prev, uv).rgb * k), 1.0); }', { prev: a.tex, cur: ins.in }, { k }, b);
      n.state.a = b; n.state.b = a; return { out: b.tex };
    },
  },
});

export const FAMILIES = ['Source', 'Image', 'Distort', 'Composite', 'Time', 'Colour', 'Output'];
export const paramSpecs = (type) => (NODES[type] ? NODES[type].params : []);
export const defaults = (type) => Object.fromEntries(paramSpecs(type).map((p) => [p.id, p.val]));
