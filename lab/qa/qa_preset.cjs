const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8841);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const st = (pg) => pg.evaluate(() => ({ levels: window.__state.nLevels(), l1w: document.getElementById('l1w').value, l1ch: document.getElementById('l1ch').value, l5half: document.getElementById('l5half').value, ovs: document.getElementById('ovs').value, ovhide: document.getElementById('ovhide').value }));
  let pg = await b.newPage(); pg.setDefaultTimeout(120000); pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8841/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1000);
  console.log('fresh browser (new default)', JSON.stringify(await st(pg)));
  await pg.evaluate(() => { document.querySelector('.nb[data-id="OV"] .hd').click(); const e = document.getElementById('ovs'); e.value = 0.35; e.dispatchEvent(new Event('input', { bubbles: true })); window.__state.addLevel(); });
  await pg.waitForTimeout(300); const before = await st(pg); console.log('my own setup', JSON.stringify(before));
  console.log('menu options', await pg.evaluate(() => [...document.querySelectorAll('#preset option')].map((o) => o.textContent).join(' / ')));
  await pg.evaluate(() => { const s = document.getElementById('preset'); s.value = 'flines-five-levels.json'; s.dispatchEvent(new Event('change')); });
  await pg.waitForTimeout(1000); console.log('after preset', JSON.stringify(await st(pg)));
  await pg.goto('http://localhost:8841/?view=dollar&nocam'); await pg.waitForTimeout(1500);
  console.log('dollar shows preset menu:', await pg.evaluate(() => !document.getElementById('preset').hidden));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
