const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8941);
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8941/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1000);
  const cnt = () => pg.evaluate(() => [document.querySelectorAll('#nodes .wires path').length, document.querySelectorAll('#nodes .wires path.dash').length]);
  console.log('start', await cnt());
  await pg.click('.nb[data-id="L1"] .hd'); for (const t of [100, 300, 600, 1200]) { await pg.waitForTimeout(t); console.log('after hide L1 +' + t, await cnt()); }
  console.log('errors', errs.join('|') || 'none'); await b.close(); srv.close(); })();
