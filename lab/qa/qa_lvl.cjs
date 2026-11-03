const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8759);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8759/?view=flines&nocam'); await pg.waitForSelector('#xlvl', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await pg.waitForTimeout(3000);
  console.log('Show level box on at start:', await pg.evaluate(() => document.querySelector('#xlvl').parentElement.querySelector('.onoff input').checked));
  for (const k of [5, 3, 1]) {
    await pg.evaluate((k) => { const cb = document.querySelector('#xlvl').parentElement.querySelector('.onoff input'); if (!cb.checked) cb.click(); const el = document.getElementById('xlvl'); el.value = k; el.dispatchEvent(new Event('input', { bubbles: true })); }, k);
    await pg.waitForTimeout(700); await pg.screenshot({ path: `${OUT}/lvl_${k}.png` });
  }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
