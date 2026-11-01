// The universal colour system. The palette lives as CSS variables on :root (defaults in css/main.css):
//   --colors (2 or 3), --c1 dark areas, --c2 middle tones, --c3 light areas, --paper background, --palette-rule.
// The colour wheel in Edit writes them; every style reads them through getPalette() and onPalette().
import { createWheel, colRGB, colHex, hexToCol } from './colorwheel.js';

const root = document.documentElement;
const cssVar = (k) => getComputedStyle(root).getPropertyValue(k).trim();
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export const PRESETS = {                                      // dark, middle, light, paper
  classic: { label: 'Classic (red-orange on green)', cols: ['#c4471f', '#e9953a', '#93b04e'], paper: '#f7f2e8' },
  pastel: { label: 'Pastel (pink on blue)', cols: ['#c9608a', '#e3a4bf', '#86a9d6'], paper: '#f8f5f1' },
  blueorange: { label: 'Orange on blue', cols: ['#e07a2c', '#e8c26a', '#3f7fc4'], paper: '#f6f3ee' },
  bw: { label: 'Black / white', cols: ['#1e1e1e', '#7a7a7a', '#cfcfcf'], paper: '#f7f6f4' },
  red: { label: 'Red tones', cols: ['#a8200f', '#e0573c', '#f3b2a2'], paper: '#fbf8f6' },
  ink: { label: 'Ink on paper (V1 Line)', cols: ['#d23219', '#e5866f', '#f2c9bd'], paper: '#f2f0ee' },
};

// ---------------------------------------------------------------- CSS variables <-> wheel state
// The wheel lists its colours dark, (middle,) light; with 2 colours the middle one is kept aside as the spare.
const W = { n: 2, rule: 'custom', base: 0, cols: [], paper: '#f7f2e8' };
function fromCSS() {
  const n = cssVar('--colors') === '3' ? 3 : 2, c1 = hexToCol(cssVar('--c1')), c2 = hexToCol(cssVar('--c2')), c3 = hexToCol(cssVar('--c3'));
  W.n = n; W.cols = n === 3 ? [c1, c2, c3] : [c1, c3, c2]; W.paper = cssVar('--paper'); W.rule = cssVar('--palette-rule') || 'custom';
}
function toCSS() {
  const [a, b, c] = W.cols.map(colHex), [dark, mid, light] = W.n === 3 ? [a, b, c] : [a, c, b];
  const set = (k, v) => root.style.setProperty(k, v);
  set('--colors', String(W.n)); set('--c1', dark); set('--c2', mid); set('--c3', light); set('--paper', W.paper); set('--palette-rule', W.rule);
}
fromCSS();

// ---------------------------------------------------------------- what the styles read
const listeners = [];
let cache = null;
// { n, cols: [[r,g,b] dark .. light] (n of them), hex: [...], paper: [r,g,b], paperHex }
export function getPalette() {
  if (cache) return cache;
  const n = cssVar('--colors') === '3' ? 3 : 2, keys = n === 3 ? ['--c1', '--c2', '--c3'] : ['--c1', '--c3'];
  const hex = keys.map(cssVar), paperHex = cssVar('--paper');
  return (cache = { n, hex, cols: hex.map(hexRGB), paper: hexRGB(paperHex), paperHex });
}
export function onPalette(cb) { listeners.push(cb); }
function changed() { toCSS(); cache = null; const p = getPalette(); listeners.forEach((cb) => cb(p)); }

// save / restore (for defaults)
export const serialize = () => ({ n: W.n, rule: W.rule, base: W.base, paper: W.paper, cols: W.cols.map(colHex) });
export function restore(o) {
  if (!o || !o.cols) return;
  Object.assign(W, { n: o.n === 3 ? 3 : 2, rule: o.rule || 'custom', base: o.base || 0, paper: o.paper || W.paper, cols: o.cols.map(hexToCol) });
  changed(); wheel && wheel.refresh();
}
export function loadPreset(name) {
  const pr = PRESETS[name]; if (!pr) return;
  const [d, m, l] = pr.cols.map(hexToCol);
  W.cols = W.n === 3 ? [d, m, l] : [d, l, m]; W.paper = pr.paper; W.rule = 'custom'; W.base = 0;
  changed(); wheel && wheel.refresh();
}

// ---------------------------------------------------------------- the editor (Edit > Colours, shared by every style)
let wheel = null;
export function mountPaletteEditor(el) {
  el.innerHTML = `<div class="ctl"><span>Preset</span><select class="pal-preset"><option value="">choose a preset...</option>${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('')}</select></div><div class="pal-wheel"></div>`;
  const sel = el.querySelector('.pal-preset');
  sel.onchange = () => { loadPreset(sel.value); sel.value = ''; };
  wheel = createWheel(el.querySelector('.pal-wheel'), W, () => changed());
}
export { colRGB };
