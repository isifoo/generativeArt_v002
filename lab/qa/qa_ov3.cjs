const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9001);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const ink = (f) => +cp.execSync(`python3 -c "from PIL import Image; d=Image.open('${f}').convert('L').tobytes(); print(round((1-sum(d)/len(d)/255)*100,3))"`).toString();
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9001/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { window.__state.LOOK.drift = 0; const o = document.getElementById('ovhide'); o.value = '0'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  await pg.waitForTimeout(2500);
  const shot = async (n) => { await pg.waitForTimeout(600); const f = `${SP}/o3_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  ok(await pg.evaluate(() => !document.querySelector('#stage canvas + canvas') && !window.__dollarOverlay), 'old overlay engine gone (no second canvas, no engraving import)');
  await pg.click('.node[data-grp="Overlay"]'); const ov = await shot('ov'); const oi = ink(ov);
  ok(oi > 2 && oi < 40, 'overlay alone: delicate black features on white (' + oi + '% ink)');
  await pg.click('.node[data-grp="Overlay"]'); const all = await shot('all');
  await pg.click('.nb[data-id="OV"] .hd'); const lines = await shot('lines'); await pg.click('.nb[data-id="OV"] .hd');
  const diff = JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json
A=Image.open('${all}').convert('L').tobytes(); B=Image.open('${ov}').convert('L').tobytes(); C=Image.open('${lines}').convert('L').tobytes()
d=[abs(A[i]-round(B[i]*C[i]/255)) for i in range(len(A))]; print(json.dumps([sum(1 for x in d if x>2), len(d)]))"`).toString());
  ok(diff[0] < 60, `full picture = lines x overlay (Multiply): ${diff[0]} of ${diff[1]} pixels off by more than 2 (corners)`);
  ok(ink(lines) < ink(all), 'Hide on the overlay removes it');
  await pg.evaluate(() => { const cb = document.getElementById('ovs').parentElement.querySelector('.onoff input'); cb.click(); }); const off = await shot('off');
  ok(Buffer.compare(fs.readFileSync(off), fs.readFileSync(lines)) === 0, 'Strength off = no overlay (identical to hidden)');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close();
})();
