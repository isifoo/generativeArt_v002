const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8766);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8766/?view=flines&nocam'); await pg.waitForSelector('#flsp', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'portrait.mp4'; v.loop = true; v.play(); }); await pg.waitForTimeout(3000);
  const set = (o) => pg.evaluate((o) => { for (const [k, v] of Object.entries(o)) { const el = document.getElementById(k); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }, o);
  for (const [tag, o] of [['def', {}], ['soft', { flfs: 160 }], ['noflip', { flfl: 0 }]]) {
    await set(o); await pg.waitForTimeout(800);
    const png = await pg.evaluate(() => document.querySelector('#cv').toDataURL('image/png')); fs.writeFileSync(`${OUT}/fl3_portrait_${tag}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
