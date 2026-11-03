const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8781);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8781/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 800)); });
  await pg.waitForTimeout(1500);
  // freeze the drift so the two shots differ only by the shift; continuous lines, no matte
  await pg.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('l1dg', 0); set('l1w', 4); });
  await pg.click('#setbtn'); await pg.waitForTimeout(700);
  const shot = async (n) => { await pg.waitForTimeout(400); await pg.locator('#stage').screenshot({ path: `${SP}/half_${n}.png`, clip: undefined }); };
  await shot('off'); await pg.click('.halfrow input'); await shot('on');
  await pg.locator('#settings').screenshot({ path: `${SP}/half_panel.png` });
  console.log('hidden value', await pg.evaluate(() => document.getElementById('l1half').value));
  await pg.click('.addlvl'); await pg.waitForTimeout(300);
  console.log('copied to level 2:', await pg.evaluate(() => document.getElementById('l2half').value), [...await pg.$$eval('.halfrow input', (a) => a.map((x) => x.checked))].slice(0, 2));
  console.log('errors:', errs.join('|') || 'none'); await b.close(); srv.close();
})();
