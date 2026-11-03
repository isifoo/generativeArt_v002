const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const serve = (root, port) => http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(port);
const s1 = serve(SP + '/old', 8761), s2 = serve('/home/user/generativeart_v002', 8762);
(async () => {
  const b = await chromium.launch();
  for (const [port, name] of [[8761, 'old'], [8762, 'new']]) {
    const pg = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(`http://localhost:${port}/?view=flines&nocam`); await pg.waitForSelector('.addlvl', { state: 'attached' });
    await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
    await pg.waitForTimeout(800); await pg.click('.addlvl'); await pg.waitForTimeout(300);
    await pg.evaluate(() => { const c = document.getElementById('l2ch'); c.value = '4,5'; c.dispatchEvent(new Event('input')); document.getElementById('l2w').dispatchEvent(new Event('input', { bubbles: true })); });
    await pg.waitForTimeout(2500);
    await pg.locator('#stage').screenshot({ path: `${SP}/cmp_${name}.png` });
    await pg.locator('#nodes').screenshot({ path: `${SP}/nodes_${name}.png` });
    console.log(name, 'canvas', await pg.evaluate(() => document.querySelector('#cv').width + 'x' + document.querySelector('#cv').height), 'errors:', errs.join('|') || 'none');
    await pg.close();
  }
  await b.close(); s1.close(); s2.close();
})();
