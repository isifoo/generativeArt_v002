const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8831);
(async () => {
  const b = await chromium.launch();
  for (const name of process.argv.slice(3)) {
    const pg = await b.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8831/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
    await pg.evaluate(() => document.querySelector('.nb[data-id="OV"] .hd').click());    // lines only for this comparison
    await pg.setInputFiles('#loadin', `${SP}/pre/${name}.json`); await pg.waitForTimeout(500);
    await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
    await pg.waitForTimeout(3500);
    await pg.locator('#cv').screenshot({ path: `${SP}/pre_${name}.png` });
    console.log(name, 'levels', await pg.evaluate(() => window.__state.nLevels()), 'errors:', errs.join('|') || 'none'); await pg.close();
  }
  await b.close(); srv.close();
})();
