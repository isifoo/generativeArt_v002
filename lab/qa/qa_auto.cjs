const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8791);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('dialog', (d) => d.accept());
  const st = () => pg.evaluate(() => ({ levels: window.__state.nLevels(), l2a: document.getElementById('l2a').value, l2ch: document.getElementById('l2ch').value, l2half: document.getElementById('l2half').value, spacing: document.getElementById('mspc').value }));
  await pg.goto('http://localhost:8791/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.click('.addlvl'); await pg.click('.addlvl'); await pg.click('#setbtn'); await pg.waitForTimeout(600);
  await pg.click('.node[data-grp="Level02 Lines"]'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { const e = document.getElementById('l2a'); e.value = 45; e.dispatchEvent(new Event('input', { bubbles: true })); const m = document.getElementById('mspc'); m.value = 19; m.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.locator('.halfrow input').nth(1).click();
  await pg.click('.node[data-grp="Level02 Alpha"]'); await pg.locator('.chanrow:not(.halfrow)').nth(1).locator('button[data-k="3"]').click();
  await pg.waitForTimeout(1500); const before = await st(); console.log('before ', JSON.stringify(before));
  await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1000);
  const after = await st(); console.log('refresh', JSON.stringify(after), JSON.stringify(before) === JSON.stringify(after) ? 'MATCH' : 'DIFF');
  console.log('half checkbox ticked:', await pg.locator('.halfrow input').nth(1).isChecked());
  if (!await pg.evaluate(() => document.body.classList.contains('editing'))) { await pg.click('#setbtn'); await pg.waitForTimeout(600); } await pg.click('#startover'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1000);
  console.log('start over', JSON.stringify(await st()));
  await pg.goto('http://localhost:8791/?view=dollar&nocam'); await pg.waitForTimeout(1500);
  const id = await pg.evaluate(() => { const r = document.querySelector('#sliders input[type=range]'); r.value = +r.min + (r.max - r.min) * 0.37; r.dispatchEvent(new Event('input', { bubbles: true })); return [r.id, r.value]; });
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForTimeout(1500);
  console.log('dollar', id[0], id[1], '->', await pg.evaluate((i) => document.getElementById(i).value, id[0]));
  console.log('errors:', errs.join('|') || 'none'); await b.close(); srv.close();
})();
