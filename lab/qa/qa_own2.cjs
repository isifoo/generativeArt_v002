const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8765);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const pg = await ctx.newPage();
  await pg.goto('http://localhost:8765/?view=flines&nocam'); await pg.waitForSelector('#flsp', { state: 'attached' });
  await pg.click('#setbtn'); await pg.waitForTimeout(700);
  const info = await pg.evaluate(() => { const s = document.querySelector('#settings'), o = document.querySelector('#ownerbtn'), r = o.getBoundingClientRect();
    return { panelScrollH: s.scrollHeight, panelH: s.clientHeight, ownerTop: Math.round(r.top + s.scrollTop), ownerVisibleAfterScroll: null, lockHidden: document.querySelector('#ownerlock').hidden }; });
  console.log(JSON.stringify(info));
  await pg.evaluate(() => { document.querySelector('#settings').scrollTop = 1e6; }); await pg.waitForTimeout(300);
  await pg.screenshot({ path: process.argv[2] + '/own_phone.png' });
  await b.close(); srv.close();
})();
