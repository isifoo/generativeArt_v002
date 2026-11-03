const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); if (q.method === 'HEAD') return r.end(); fs.createReadStream(f).pipe(r); }).listen(8762);
(async () => {
  const b = await chromium.launch();
  for (const v of ['dollar1', 'flines', 'dollar2', 'dollar']) {
    const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(`http://localhost:8762/?view=${v}&nocam`); await pg.waitForTimeout(3000);
    const ids = ['e2oo', 'dpq', 'dps', 'enlo', 'enl', 'enc', 'enb'];
    console.log(v.padEnd(8), JSON.stringify(await pg.evaluate((ids) => Object.fromEntries(ids.filter((i) => document.getElementById(i)).map((i) => [i, document.getElementById(i).value])), ids)), errs.join(' | ') || '');
    await pg.close();
  }
  await b.close(); srv.close();
})();
