const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9051);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const firstLine = (f, fx) => +cp.execSync(`python3 -c "
from PIL import Image
im=Image.open('${f}').convert('L'); w,h=im.size; px=im.load(); x=int(${fx}*(w-1)); y0=h//3
ys=[y for y in range(y0, y0+60) if px[x,y]<128]; r=[ys[0]]
for y in ys[1:]:
  if y==r[-1]+1: r.append(y)
  else: break
print(sum(r)/len(r))"`).toString();
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  for (const v of ['linesv2', 'dollar5', 'ishihara', 'depthdots', 'depth', 'depth3d', 'line']) { await pg.goto('http://localhost:9051/?view=' + v + '&nocam'); await pg.waitForTimeout(1200);
    const r = await pg.evaluate(() => ({ boxes: document.querySelectorAll('#sliders .onoff input').length, on: document.querySelectorAll('#sliders .onoff input:checked').length, disabled: document.querySelectorAll('#sliders input[type=range]:disabled').length }));
    ok(r.boxes > 0 && r.on === 0 && r.disabled === 0, `${v}: all ${r.boxes} -1 boxes off by default, every slider live`); }
  await pg.goto('http://localhost:9051/?view=linesv2'); await pg.waitForTimeout(1200);
  const st = () => pg.evaluate(() => { const r = document.getElementById('v2a'); return [r.min, r.max, r.value]; });
  ok(JSON.stringify(await st()) === '["0","300","30"]', 'Amplitude, box off: range 0 .. 300');
  await pg.evaluate(() => document.getElementById('v2a').parentElement.querySelector('.onoff input').click());
  ok(JSON.stringify(await st()) === '["-300","300","30"]', 'box on: range -300 .. 300');
  await pg.evaluate(() => { const m = document.getElementById('v2a').parentElement.querySelector('.mx'); m.value = 1000; m.dispatchEvent(new Event('change')); });
  ok(JSON.stringify(await st()) === '["-1000","1000","30"]', 'max 1000: range -1000 .. 1000');
  const set = (id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const shot = async (n) => { await pg.waitForTimeout(300); const f = `${SP}/neg_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  await set('v2f', 1); await set('v2a', 5); const p = await shot('pos'); await set('v2a', -5); const n = await shot('neg');
  const dp = firstLine(p, 0.25) - firstLine(p, 0.75), dn = firstLine(n, 0.25) - firstLine(n, 0.75);
  ok(dp * dn < 0 && Math.abs(Math.abs(dp) - Math.abs(dn)) < 1, `Amplitude -5 turns the wave the other way (left-right difference ${dp.toFixed(1)} -> ${dn.toFixed(1)} px)`);
  ok(await pg.evaluate(() => document.getElementById('v2a').value) === '-5', 'negative value kept');
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForTimeout(1200);
  ok(JSON.stringify(await st()) === '["-1000","1000","-5"]' && await pg.evaluate(() => document.getElementById('v2a').parentElement.querySelector('.onoff input').checked), 'saved: box, range and -5 survive a refresh');
  await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('genArt002.autosave.linesv2')) localStorage.setItem(k, JSON.stringify({ settings: { s: { v2a: { v: '40', max: '300', on: true } }, c: {} } })); });
  await pg.reload(); await pg.waitForTimeout(1200);
  ok(JSON.stringify(await st()) === '["0","300","40"]' && !await pg.evaluate(() => document.getElementById('v2a').parentElement.querySelector('.onoff input').checked), 'an old saved setup (on: true) does not turn the mirror on');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.filter((e) => !/WebGPU|adapter/.test(e)).join('|') || 'none'}`); await b.close(); srv.close(); })();
