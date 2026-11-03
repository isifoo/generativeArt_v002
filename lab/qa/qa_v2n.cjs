const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002'; const log = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { log.push(q.url); let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9071);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const lines = (f, fx) => JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json
im=Image.open('${f}').convert('L'); w,h=im.size; px=im.load(); x=int(${fx}*(w-1)); y0=h//3
ys=[y for y in range(y0, y0+120) if px[x,y]<128]; runs=[]
for y in ys:
  if runs and y==runs[-1][-1]+1: runs[-1].append(y)
  else: runs.append([y])
print(json.dumps([round(sum(r)/len(r),2) for r in runs][:4]))"`).toString());
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9071/?view=linesv2&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1500);
  const ev = (f, a) => pg.evaluate(f, a);
  const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  ok(await ev(() => ['Lines', 'Alpha', 'Level01', 'Depth map', 'Flip', 'Overlay', 'Master'].every((t) => [...document.querySelectorAll('#nodes .node b')].some((b) => b.textContent.startsWith(t)))), 'nodes: Lines > Alpha > Level01 > Master, plus Depth map, Flip, Overlay');
  await pg.click('.node[data-grp="Level01 Lines"]'); await pg.click('.node.master');
  ok(await ev(() => { document.querySelector('.node[data-grp="Level01 Lines"]').click(); return [...document.querySelectorAll('#sliders h2.grp + *:not([hidden]) input[type=range]')].map((r) => r.id).join(' '); }) === 'l1fr l1am l1w l1a l1dl l1dg l1rg', 'Lines node: Frequency, Amplitude, Width, Angle, Dash length, Dash gap, Rough edges');
  await pg.click('.node.master');
  const shot = async (n) => { await pg.waitForTimeout(500); const f = `${SP}/v2n_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  const scale = await ev(() => document.querySelector('#cv').getBoundingClientRect().height / 1920);
  const f0 = await shot('default'); ok((await lines(f0, 0.5)).length >= 3, 'draws at once, without a camera (sine lines on the stage)');
  await set('l1am', 0); const fl = await shot('flat'); const L = await lines(fl, 0.1), M = await lines(fl, 0.5), R = await lines(fl, 0.9);
  ok(JSON.stringify(L) === JSON.stringify(M) && JSON.stringify(M) === JSON.stringify(R), 'Amplitude 0: straight horizontal lines');
  ok(Math.abs((M[1] - M[0]) / scale - 15) < 1, `Master spacing: ${((M[1] - M[0]) / scale).toFixed(2)} px (15)`);
  await set('l1am', 5); await set('l1fr', 1); const wv = await shot('wave'); const d1 = ((await lines(wv, 0.25))[0] - (await lines(wv, 0.75))[0]) / scale;
  ok(Math.abs(Math.abs(d1) / 2 - 5) < 1.2, `Amplitude 5, Frequency 1: rises and falls ${(Math.abs(d1) / 2).toFixed(2)} px`);
  await ev(() => document.getElementById('l1am').parentElement.querySelector('.onoff input').click()); await set('l1am', -5); const ng = await shot('neg');
  const d2 = ((await lines(ng, 0.25))[0] - (await lines(ng, 0.75))[0]) / scale; ok(d1 * d2 < 0, 'mirror box: Amplitude -5 turns it the other way');
  ok(!log.some((u) => /\.onnx/.test(u)), 'no depth model downloaded while every level shows everywhere');
  await ev(() => window.__state.addLevel()); await pg.waitForTimeout(300);
  ok(await ev(() => [document.getElementById('l2fr').value, document.getElementById('l2am').value, document.getElementById('l2am').min].join()) === '1,-5,-300', 'Duplicate level copies Frequency, Amplitude and the mirror');
  const two = await shot('two'); await set('l2am', 40); await set('l2fr', 4); const two2 = await shot('two2'); ok(!fs.readFileSync(two).equals(fs.readFileSync(two2)), 'Level02 has its own wave');
  await pg.click('[data-out="1"]'); const s1 = await shot('solo1'); await pg.click('[data-out="1"]'); const all = await shot('all');
  ok(!fs.readFileSync(s1).equals(fs.readFileSync(all)), 'click Level01: solo; click again: both levels');
  await set('l1bp', 120); await pg.waitForTimeout(1500); ok(log.some((u) => /\.onnx/.test(u)), 'narrowing an Extract loads the depth model');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close(); })();
