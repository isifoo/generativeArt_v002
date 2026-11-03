const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002'; const log = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { log.push(q.url); let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9091);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const levels = (f) => JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json
d=Image.open('${f}').convert('L').tobytes(); n=len(d); h=[0]*256
for x in d: h[x]+=1
print(json.dumps(sorted(v for v in range(256) if h[v]>n*0.02)))"`).toString());
const check = (A, B, C, expr) => +cp.execSync(`python3 -c "
from PIL import Image
L=lambda f: Image.open(f).convert('L').tobytes()
A=L('${A}'); B=L('${B}'); C=L('${C}')
print(sum(1 for i in range(len(A)) if abs(A[i]/255-(lambda a,b,c: ${expr})(A[i]/255,B[i]/255,C[i]/255))*255>3))"`).toString();
(async () => { const b = await chromium.launch(); const errs = [];
  // ---------- Dollar 5
  let pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(180000); pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9091/?view=dollar5&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  let ev = (f, a) => pg.evaluate(f, a);
  let set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  ok(await ev(() => ['Hope', 'Blend'].every((t) => [...document.querySelectorAll('#nodes .node b')].some((b) => b.textContent.startsWith(t)))), 'Hope and Blend nodes in the graph');
  ok(await ev(() => [...document.querySelector('.trkrow .tsrc').options].map((o) => o.textContent).join(',')) === 'Depth map,Flip,Overlay,Hope,Blend', 'Matte menu: Depth map, Flip, Overlay, Hope, Blend');
  await set('dpq', 14); for (const [id, v] of [['l1dg', 0], ['l1rg', 0], ['mfl', 0], ['ovs', 0]]) await set(id, v);
  await ev(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  const t0 = Date.now(); while (Date.now() - t0 < 150000 && !(await ev(() => window.__state.shape.some((v) => v > 0.05)))) await pg.waitForTimeout(2000);
  await pg.waitForTimeout(5000);
  const solo = async (ids, n) => { await ev((ids) => { const S = window.__state.solo; S.clear(); for (const i of ids) S.add(i); document.getElementById('l1hide').dispatchEvent(new Event('input')); }, ids); await pg.waitForTimeout(1500); const f = `${SP}/h2_${n}.png`; await pg.locator('#cv').screenshot({ path: f, timeout: 180000 }); return f; };
  await set('hlv', 4); const hp = await solo(['HP'], 'hope4'); const lv = await levels(hp);
  ok(lv.length === 4, 'Hope with 4 Levels: 4 flat tones (' + lv.join(', ') + ')');
  await set('hlv', 6); const hp6 = await solo(['HP'], 'hope6'); ok((await levels(hp6)).length >= 5, 'Hope with 6 Levels: ' + (await levels(hp6)).length + ' tones (one may be too small to count)');
  await set('hlv', 4); const hpv = await solo(['HP'], 'hope4b'); const lines1 = await solo(['L1'], 'lines1');
  await set('l1src', 'HP'); await set('l1bp', 0); await set('l1wp', 100); const o1 = await solo(['O1'], 'o1hope');
  // expected: lines where Hope value <= 100 (the two darkest of 4 tones: 0 and 85)
  let n = check(o1, lines1, hpv, '1-(1-b)*(1 if c*255<=100 else 0)'); ok(n < 400, `Matte Hope, Extract 0..100: the level shows only in the 2 darkest Hope tones (${n} px off, edges)`);
  // blend modes
  await set('l1src', ''); const bl = []; for (const m of [0, 1, 6]) { await ev((m) => { const i = document.getElementById('bmode'); i.value = String(m); i.dispatchEvent(new Event('input')); }, m); bl.push(await solo(['BL'], 'blend' + m)); }
  ok(!fs.readFileSync(bl[0]).equals(fs.readFileSync(bl[1])) && !fs.readFileSync(bl[1]).equals(fs.readFileSync(bl[2])), 'Blend: Multiply, Screen and Difference differ');
  // update modes: 2 per second crossfades
  await ev(() => { const i = document.getElementById('hupd'); i.value = '1'; i.dispatchEvent(new Event('input')); });
  await ev(() => { const S = window.__state.solo; S.clear(); S.add('HP'); });
  const mixes = []; for (let i = 0; i < 12; i++) { mixes.push(await ev(() => window.__state.hopeMix?.())); await pg.waitForTimeout(90); }
  ok(mixes.some((m) => m > 0.02 && m < 0.98), '2 per second: the Hope map crossfades (mix samples ' + mixes.map((m) => m?.toFixed(2)).join(' ') + ')');
  // drag Hope -> Alpha
  await ev(() => window.__state.solo.clear()); await pg.waitForTimeout(500);
  const a = await pg.locator('.node.hope').boundingBox(), c = await pg.locator('[data-grp="Level01 Alpha"]').boundingBox();
  await pg.mouse.move(a.x + a.width / 2, a.y + a.height * 0.7); await pg.mouse.down(); await pg.mouse.move(a.x + 10, a.y + a.height * 0.7, { steps: 3 }); await pg.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(400);
  ok(await ev(() => document.getElementById('l1src').value) === 'HP', 'drag Hope -> Alpha01: matte = Hope');
  await pg.screenshot({ path: SP + '/h2_page.png', timeout: 180000 }); await pg.close();
  // ---------- Lines V2: Hope needs the depth model
  log.length = 0; pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9091/?view=linesv2&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1500);
  ok(!log.some((u) => /\.onnx/.test(u)), 'Lines V2: no depth model at start');
  await pg.evaluate(() => { const e = document.getElementById('l1src'); e.value = 'HP'; e.dispatchEvent(new Event('input')); }); await pg.waitForTimeout(1500);
  ok(log.some((u) => /\.onnx/.test(u)), 'Lines V2: choosing Hope as a matte loads the depth model');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close(); })();
