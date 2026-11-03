// DEPTH 3D: the depth map as a real 3D surface (three.js). A dense grid is pushed toward the camera by depth, lit by a key light,
// a soft fill and room reflections, so it shades like a sculpted model. Where depth jumps (a person's outline against the
// background) the mesh is cut, so the subject stands as its own object instead of a rubber sheet stretched into the background.
// Looks: the video painted on the surface, white clay, or the palette by depth. Drag the picture to turn it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { $, vid, cam, buildSliders, initDefaults, versionCheck, startCamera, noCam, getPalette, onPalette } from './ui.js';
import { createDepthModel, MODELS, OW, OH } from './depthmodel.js';

// ---------------------------------------------------------------- sliders (-1 = off)
const SLIDERS = [
  { head: 'Depth model' },
  { id: 'dpq', label: 'Model detail', min: 12, max: 37, step: 1, val: 20, off: 'lowest (12 = 168 px)' },
  { id: 'dpw', label: 'Second model weight', min: 0, max: 1, step: 0.01, val: 0.5, off: 'first model only' },
  { id: 'dpn', label: 'Near clip %', min: 0, max: 20, step: 0.1, val: 0.5, off: 'no clip' },
  { id: 'dpf', label: 'Far clip %', min: 0, max: 40, step: 0.5, val: 4, off: 'no clip' },
  { id: 'dpl', label: 'Shape detail', min: 0, max: 6, step: 0.05, val: 0.8, off: 'flat: only the overall depth' },
  { id: 'dps', label: 'Time smoothing', min: 0, max: 0.97, step: 0.01, val: 0.8, off: 'none' },
  { id: 'dpm', label: 'Motion follow', min: 0, max: 1, step: 0.01, val: 0.7, off: 'same smoothing everywhere' },
  { head: '3D surface' },
  { id: 'd3z', label: 'Depth amount', min: 0, max: 3, step: 0.01, val: 0.9, off: 'flat' },
  { id: 'd3c', label: 'Depth curve', min: 0.3, max: 3, step: 0.01, val: 1.3, off: 'linear (1)' },
  { id: 'd3g', label: 'Mesh detail', min: 40, max: 260, step: 2, val: 160, off: '40' },
  { id: 'd3k', label: 'Cut edges (0 = no cut)', min: 0, max: 0.4, step: 0.005, val: 0, off: 'no cut: jumps become the sides of the objects' },
  { id: 'd3m', label: 'Surface smoothing', min: 0, max: 4, step: 1, val: 2, off: 'none' },
  { head: 'Camera' },
  { id: 'd3y', label: 'Turn deg', min: -70, max: 70, step: 0.5, val: 22, off: 'straight on' },
  { id: 'd3p', label: 'Tilt deg', min: -45, max: 45, step: 0.5, val: 8, off: 'level' },
  { id: 'd3f', label: 'Zoom', min: 0.5, max: 2.5, step: 0.01, val: 1.05, off: '1' },
  { id: 'd3a', label: 'Sway deg', min: 0, max: 30, step: 0.5, val: 6, off: 'still' },
  { id: 'd3as', label: 'Sway speed', min: 0, max: 1, step: 0.01, val: 0.12, off: 'still' },
  { head: 'Light' },
  { id: 'd3l', label: 'Light angle deg', min: 0, max: 360, step: 1, val: 135, off: '135' },
  { id: 'd3h', label: 'Light height deg', min: 5, max: 90, step: 1, val: 40, off: '40' },
  { id: 'd3i', label: 'Light strength', min: 0, max: 6, step: 0.05, val: 1.6, off: 'no key light' },
  { id: 'd3e', label: 'Reflections', min: 0, max: 2, step: 0.01, val: 0.35, off: 'none' },
  { id: 'd3x', label: 'Exposure', min: 0.2, max: 2, step: 0.01, val: 0.85, off: '1' },
  { id: 'd3r', label: 'Roughness', min: 0, max: 1, step: 0.01, val: 0.45, off: '0.45' },
];
const P = { look: 'video' };
const val = buildSliders(SLIDERS, P);
// cut edges starts off: the jumps become the sides of the objects (reads as solid 3D); tick it to cut the subject free
const num = (id, def) => (P.on[id] === undefined ? def : val(id) < 0 ? def : P[id]);

// ---------------------------------------------------------------- depth model (shared)
let fresh = false;
const DM = createDepthModel((id, def) => (P.on[id] === undefined ? def : val(id)), () => { fresh = true; });
const M = DM.M;

// ---------------------------------------------------------------- three.js scene
const canvas = $('#cv'); canvas.width = OW; canvas.height = OH;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(OW, OH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(30, OW / OH, 0.05, 50);
const key = new THREE.DirectionalLight(0xffffff, 2.4); scene.add(key);
const fill = new THREE.HemisphereLight(0xffffff, 0x404040, 0.35); scene.add(fill);
const SW = 1, SH = OH / OW;                                    // the surface is 1 wide, 16/9 tall

const vtex = new THREE.VideoTexture(vid); vtex.colorSpace = THREE.SRGBColorSpace;
vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
let mesh = null, geo = null, GX = 0, GY = 0, dz = null, dzPrev = null, dzNow = null, meshHas = false, tFresh = 0;
function buildMesh(gx) {
  GX = gx; GY = Math.round(gx * SH);
  if (mesh) { scene.remove(mesh); geo.dispose(); }
  geo = new THREE.BufferGeometry();
  const pos = new Float32Array(GX * GY * 3), uv = new Float32Array(GX * GY * 2), col = new Float32Array(GX * GY * 3);
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const k = j * GX + i, u = i / (GX - 1), v = j / (GY - 1);
    pos[k * 3] = (u - 0.5) * SW; pos[k * 3 + 1] = (0.5 - v) * SH; uv[k * 2] = u; uv[k * 2 + 1] = 1 - v;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array((GX - 1) * (GY - 1) * 6), 1));
  dz = new Float32Array(GX * GY); dzPrev = new Float32Array(GX * GY); dzNow = new Float32Array(GX * GY);
  mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
  if (M.have) { sampleDepth(true); meshHas = true; } else meshHas = false;
}
// depth map -> one depth per vertex (bilinear), with optional smoothing of the surface
function sampleDepth(snap) {
  const { out, w, h } = M;
  dzPrev.set(snap ? dzNow : dz);
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const fx = Math.min(w - 1.001, Math.max(0, i / (GX - 1) * (w - 1))), fy = Math.min(h - 1.001, Math.max(0, j / (GY - 1) * (h - 1)));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, q = y0 * w + x0;
    const v = (out[q] * (1 - tx) + out[q + 1] * tx) * (1 - ty) + (out[q + w] * (1 - tx) + out[q + w + 1] * tx) * ty;
    dzNow[j * GX + i] = Math.min(1, Math.max(0, v));
  }
  const passes = Math.max(0, Math.round(num('d3m', 0)));     // surface smoothing: small 3x3 passes, edges kept (big jumps not mixed)
  if (passes) {
    const tmp = new Float32Array(dzNow.length);
    for (let p = 0; p < passes; p++) {
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const k = j * GX + i, c = dzNow[k]; let acc = c, n = 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const ii = i + dx, jj = j + dy; if ((!dx && !dy) || ii < 0 || jj < 0 || ii >= GX || jj >= GY) continue;
          const v = dzNow[jj * GX + ii]; if (Math.abs(v - c) < 0.04) { acc += v; n++; }
        }
        tmp[k] = acc / n;
      }
      dzNow.set(tmp);
    }
  }
  if (snap) { dzPrev.set(dzNow); dz.set(dzNow); }
  tFresh = performance.now();
}

// per frame: blend toward the newest depth, place the vertices, cut the big jumps, normals, colours
let meshKey = '';
function updateMesh() {
  const t = Math.min(1, (performance.now() - tFresh) / Math.max(60, M.interval));     // blend between depth maps
  const key = [tFresh, t, val('d3z'), val('d3c'), val('d3k'), P.look, pal.hex.join()].join();
  if (key === meshKey) return;                                // nothing changed: keep the mesh as it is
  meshKey = key; const t0 = performance.now();
  const amt = num('d3z', 0) * SW, gam = num('d3c', 1), pos = geo.attributes.position.array;
  for (let k = 0; k < dz.length; k++) {
    dz[k] = dzPrev[k] + (dzNow[k] - dzPrev[k]) * t;
    pos[k * 3 + 2] = (Math.pow(dz[k], gam) - 0.5) * amt;
  }
  geo.attributes.position.needsUpdate = true;
  // cut edges: leave out the cells whose corners differ more than the threshold
  const cut = P.d3k > 0 ? P.d3k : 9, idx = geo.index.array; let n = 0;
  for (let j = 0; j < GY - 1; j++) for (let i = 0; i < GX - 1; i++) {
    const a = j * GX + i, b = a + 1, c = a + GX, d = c + 1;
    const lo = Math.min(dz[a], dz[b], dz[c], dz[d]), hi = Math.max(dz[a], dz[b], dz[c], dz[d]);
    if (hi - lo > cut) continue;
    idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
  }
  geo.index.needsUpdate = true; geo.setDrawRange(0, n);
  geo.computeVertexNormals();
  if (P.look === 'palette') {                                 // palette by depth: near = first colour .. far = last colour
    const p = getPalette(), cols = p.cols.map((c) => c.map((x) => Math.pow(x / 255, 2.2))), col = geo.attributes.color.array, last = cols.length - 1;
    for (let k = 0; k < dz.length; k++) {
      const x = (1 - dz[k]) * last, i = Math.min(last - 1, x | 0), f = x - i, A = cols[i], B = cols[i + 1];
      col[k * 3] = A[0] + (B[0] - A[0]) * f; col[k * 3 + 1] = A[1] + (B[1] - A[1]) * f; col[k * 3 + 2] = A[2] + (B[2] - A[2]) * f;
    }
    geo.attributes.color.needsUpdate = true;
  }
  meshMs += (performance.now() - t0 - meshMs) * 0.2;
}
let meshMs = 0;

// video on the surface: the same 9:16 cover crop as the depth model, mirrored for the camera
function mapVideo() {
  const c = DM.crop();
  vtex.wrapS = vtex.wrapT = THREE.ClampToEdgeWrapping;
  vtex.repeat.set((c.mir ? -1 : 1) * c.cw / c.vw, c.ch / c.vh);
  vtex.offset.set(c.mir ? (c.sx + c.cw) / c.vw : c.sx / c.vw, 1 - (c.sy + c.ch) / c.vh);
}

// ---------------------------------------------------------------- camera: angle + sway + drag
let dragYaw = 0, dragPitch = 0, drag = null;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, dragYaw, dragPitch]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; dragYaw = drag[2] + (e.clientX - drag[0]) * 0.3; dragPitch = Math.max(-60, Math.min(60, drag[3] + (e.clientY - drag[1]) * 0.3)); });
canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('dblclick', () => { dragYaw = 0; dragPitch = 0; });
function placeCamera(time) {
  const sw = num('d3a', 0) * Math.sin(time * num('d3as', 0) * Math.PI * 2);
  const yaw = (num('d3y', 0) + sw + dragYaw) * Math.PI / 180, pitch = (num('d3p', 0) + dragPitch) * Math.PI / 180;
  const dist = (SH / 2) / Math.tan(15 * Math.PI / 180) / num('d3f', 1) * 1.04;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(0, 0, 0);
}

// ---------------------------------------------------------------- loop
let lastMedia = -1, pal = getPalette();
onPalette((p) => { pal = p; });
function frame(time) {
  requestAnimationFrame(frame);
  if (vid.readyState >= 2 && vid.videoWidth) {
    const nf = vid.currentTime !== lastMedia; lastMedia = vid.currentTime;
    if (M.ready && !M.busy && (nf || !M.have)) DM.infer();
  }
  const gx = Math.max(40, Math.round(num('d3g', 40)));
  if (gx !== GX) buildMesh(gx);
  if (fresh && M.have) { sampleDepth(!meshHas); meshHas = true; fresh = false; }
  scene.background = new THREE.Color(pal.paperHex);
  const la = num('d3l', 135) * Math.PI / 180, lh = num('d3h', 40) * Math.PI / 180;
  key.position.set(Math.cos(la) * Math.cos(lh) * 5, Math.sin(lh) * 5, Math.sin(la) * Math.cos(lh) * 5 + 3);
  key.intensity = Math.max(0, val('d3i')); mat.envMapIntensity = Math.max(0, val('d3e'));
  mat.roughness = num('d3r', 0.45); renderer.toneMappingExposure = num('d3x', 1);
  const look = P.look;
  mat.map = look === 'video' && vid.readyState >= 2 ? vtex : null; mat.vertexColors = look === 'palette';
  mat.color.set(look === 'clay' ? 0xd8d2c8 : 0xffffff);
  const mk = look + (mat.map ? 'm' : '');                     // the shader must be rebuilt when the texture or colours switch on/off
  if (mat.userData.key !== mk) { mat.needsUpdate = true; mat.userData.key = mk; }
  if (look === 'video') mapVideo();
  mesh.visible = M.have;
  if (M.have) updateMesh();
  placeCamera(time / 1000);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#stats').innerHTML =
    row('models', M.sess.length > 1 && val('dpw') > 0 ? MODELS.slice(0, 2).map((m) => m.label).join(' + ') : MODELS[0].label) +
    row('runs on', M.ready ? (M.ep === 'webgpu' ? 'GPU (WebGPU)' : 'processor (WASM, slow)') : M.loading ? 'loading...' : '-') +
    row('model time per frame', M.ms.toFixed(1) + ' ms') + row('depth maps per second', M.fps.toFixed(1)) +
    row('mesh', GX + ' x ' + GY + ' points, ' + (geo ? Math.round(geo.drawRange.count / 3).toLocaleString() : 0) + ' triangles') +
    row('mesh update (when depth changes)', meshMs.toFixed(1) + ' ms');
  $('#budget').style.width = Math.min(100, M.ms / 33.3 * 100) + '%';
}
setInterval(renderStats, 250);

// ---------------------------------------------------------------- UI
$('#d3look').onchange = (e) => { P.look = e.target.value; };
$('#restart').onclick = () => { M.sm = null; M.have = false; dragYaw = dragPitch = 0; };
cam.onStart = () => { lastMedia = -1; };
initDefaults('.r1');

window.__state = { M, P, val, camera, scene, get geo() { return geo; }, get meshMs() { return meshMs; } };
DM.load();
requestAnimationFrame(frame);
versionCheck();
if (!noCam) await startCamera();
