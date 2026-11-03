const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8772);
(async () => { const b = await chromium.launch();
  for (const v of ['ishihara', 'depthdots', 'depth', 'depth3d', 'dollar5', 'linesv2']) {
    const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8772/?view=' + v + '&nocam'); await pg.waitForTimeout(2500);
    console.log(v.padEnd(10), 'savefile:', await pg.$('#savefile') ? 'yes' : 'no', 'errors:', errs.join('|') || 'none'); await pg.close(); }
  await b.close(); srv.close(); })();
