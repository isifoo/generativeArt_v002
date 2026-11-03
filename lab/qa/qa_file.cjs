const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8771);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  const state = () => pg.evaluate(() => ({ levels: window.__state.nLevels(), l3w: document.getElementById('l3w').value, l3ch: document.getElementById('l3ch').value, spacing: document.getElementById('mspc').value, nodes: document.querySelectorAll('[data-out]').length }));
  await pg.goto('http://localhost:8771/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
  await pg.click('.addlvl'); await pg.click('.addlvl');
  await pg.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('l3w', 7.5); set('mspc', 24); set('l3ch', '1,3'); });
  const before = await state(); console.log('before', JSON.stringify(before));
  await pg.click('#setbtn'); await pg.waitForTimeout(600);
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#savefile')]); const file = SP + '/' + dl.suggestedFilename(); await dl.saveAs(file);
  console.log('file', dl.suggestedFilename(), fs.statSync(file).size, 'bytes');
  await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(500);
  console.log('fresh ', JSON.stringify(await state()));
  await pg.click('#setbtn'); await pg.waitForTimeout(600);
  await pg.setInputFiles('#loadin', file); await pg.waitForTimeout(800);
  const after = await state(); console.log('loaded', JSON.stringify(after), JSON.stringify(after) === JSON.stringify(before) ? 'MATCH' : 'DIFF');
  console.log('chan buttons on (level 3):', await pg.evaluate(() => [...document.querySelectorAll('.chanrow')][2].querySelectorAll('button.on').length));
  console.log('errors:', errs.join('|') || 'none'); await b.close(); srv.close();
})();
