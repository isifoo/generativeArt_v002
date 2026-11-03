const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8911);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8911/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  await pg.waitForTimeout(3000);
  ok(await pg.evaluate(() => document.getElementById('mmot').value) === '0', 'Motion speed defaults to 0');
  const a = await pg.locator('#cv').screenshot(); await pg.waitForTimeout(1500); const b2 = await pg.locator('#cv').screenshot();
  ok(a.equals(b2), 'speed 0: the picture stays still');
  await pg.waitForTimeout(1200); const fps0 = await pg.evaluate(() => +[...document.querySelectorAll('#stats td')].find((t, i, all) => all[i - 1]?.textContent === 'frames / s')?.textContent);
  ok(fps0 === 0, 'speed 0 and paused video: ' + fps0 + ' redraws per second (idle)');
  await pg.evaluate(() => { const e = document.getElementById('mmot'); e.value = 0.2; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForTimeout(800); const c = await pg.locator('#cv').screenshot(); await pg.waitForTimeout(800); const d = await pg.locator('#cv').screenshot();
  ok(!c.equals(d), 'speed 0.2: the waves move');
  ok(await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion').trim()) === '0.2', 'universal: written as the CSS variable --motion');
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1000);
  ok(await pg.evaluate(() => document.getElementById('mmot').value) === '0.2', 'saved with the setup');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close();
})();
