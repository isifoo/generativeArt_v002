const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9041);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
// y of the dark line centres down a column (screen px), from the top third
const prof = (f, fx) => JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json
im=Image.open('${f}').convert('L'); w,h=im.size; px=im.load(); x=int(${fx}*(w-1))
ys=[y for y in range(h//3, h//3+200) if px[x,y]<128]; runs=[]
for y in ys:
  if runs and y==runs[-1][-1]+1: runs[-1].append(y)
  else: runs.append([y])
print(json.dumps([round(sum(r)/len(r),2) for r in runs][:4]))"`).toString());
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9041/?view=linesv2'); await pg.waitForTimeout(1500);
  const labels = await pg.evaluate(() => [...document.querySelectorAll('#versions button')].map((b) => b.textContent).join(', '));
  ok(labels === 'V1 Line, Ishihara, Depth, Depth Dots, Depth 3D, Dollar 5, Lines V2', 'buttons: ' + labels);
  ok(await pg.evaluate(() => [...document.querySelectorAll('#sliders input[type=range]')].map((r) => r.id).join(' ')) === 'v2f v2a v2s v2w v2m', 'sliders: Frequency, Amplitude, Spacing, Width, Motion speed');
  const set = (id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const shot = async (n) => { await pg.waitForTimeout(300); const f = `${SP}/v2_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  const scale = await pg.evaluate(() => document.querySelector('#cv').getBoundingClientRect().height / 1920);
  await set('v2a', 0); const fl = await shot('flat'); const L = prof(fl, 0.1), M = prof(fl, 0.5), R = prof(fl, 0.9);
  ok(JSON.stringify(L) === JSON.stringify(M) && JSON.stringify(M) === JSON.stringify(R), 'Amplitude 0: straight horizontal lines (same heights at left, middle, right)');
  const gap = (M[1] - M[0]) / scale; ok(Math.abs(gap - 15) < 1, `even spacing: ${gap.toFixed(2)} px apart (15 set)`);
  await set('v2a', 5); await set('v2f', 1);   // small amplitude (less than half a spacing) so the same line can be followed
  const wv = await shot('wave'); const q1 = prof(wv, 0.25)[0], q3 = prof(wv, 0.75)[0];
  ok(Math.abs(Math.abs(q3 - q1) / scale / 2 - 5) < 1.2, `Amplitude 5, Frequency 1: the line rises and falls by ${(Math.abs(q3 - q1) / scale / 2).toFixed(2)} px (5 set)`);
  await set('v2f', 4); const f4 = await shot('f4'); ok(!fs.readFileSync(f4).equals(fs.readFileSync(wv)), 'Frequency changes the wave');
  await set('v2f', 3); await set('v2a', 30); const a1 = await shot('still1'); await pg.waitForTimeout(800); const a2 = await shot('still2'); ok(fs.readFileSync(a1).equals(fs.readFileSync(a2)), 'Motion 0: still');
  await set('v2m', 0.5); const m1 = await shot('mv1'); await pg.waitForTimeout(500); const m2 = await shot('mv2'); ok(!fs.readFileSync(m1).equals(fs.readFileSync(m2)), 'Motion 0.5: the wave travels'); await set('v2m', 0);
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForTimeout(1200); ok(await pg.evaluate(() => document.getElementById('v2a').value) === '30', 'autosaved');
  await pg.goto('http://localhost:9041/?view=flines'); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => document.querySelector('#versions .on').textContent) === 'V1 Line', 'old Dollar links fall back to V1 Line');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.filter((e) => !/WebGPU/.test(e)).join('|') || 'none'}`); await b.close(); srv.close(); })();
