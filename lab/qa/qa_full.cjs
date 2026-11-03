const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const serve = (root, port) => http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(port);
(async () => { const b = await chromium.launch();
  for (const [name, root, port] of JSON.parse(process.argv[3])) {
    const s = serve(root, port); const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); pg.setDefaultTimeout(180000);
    await pg.goto(`http://localhost:${port}/?view=flines&nocam`); await pg.waitForTimeout(2000);
    await pg.evaluate(() => { if (window.__state && window.__state.LOOK) window.__state.LOOK.drift = 0; const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play(); });
    await pg.waitForTimeout(1500); await pg.evaluate(() => { const v = document.querySelector('#vid'); v.pause(); v.currentTime = 1.0; });
    await pg.waitForTimeout(+(process.argv[4] || 45000));
    await pg.locator('#stage').screenshot({ path: `${SP}/full_${name}.png`, timeout: 180000 }); console.log(name, 'done');
    await pg.close(); s.close(); }
  await b.close(); })();
