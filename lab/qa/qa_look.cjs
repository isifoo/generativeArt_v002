const { chromium, devices } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8881);
(async () => { const b = await chromium.launch();
  for (const [name, opt] of [['lap', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 13']]]) {
    const pg = await (await b.newContext(opt)).newPage(); pg.setDefaultTimeout(120000);
    await pg.goto('http://localhost:8881/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
    await pg.evaluate(() => { const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
    await pg.waitForTimeout(2500); await pg.evaluate(() => document.querySelector('.nb[data-id="O3"] .hd').click()); await pg.waitForTimeout(1500);
    await pg.screenshot({ path: `${SP}/look_${name}.png`, fullPage: name === 'phone' }); }
  await b.close(); srv.close(); })();
