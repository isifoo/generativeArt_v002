const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8757);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8757/?view=flines&nocam'); await pg.waitForSelector('#mspc', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await pg.waitForTimeout(3000);
  const vis = () => pg.evaluate(() => [...document.querySelectorAll('#sliders .sl')].filter((r) => r.offsetParent !== null).map((r) => r.querySelector('.lab').textContent));
  for (const n of ['nMaster', 'nLines', 'nAlpha']) { await pg.click('#' + n); await pg.waitForTimeout(700); console.log(n, '->', JSON.stringify(await vis())); }
  await pg.click('#nMaster'); await pg.waitForTimeout(500);
  await pg.evaluate(() => { const el = document.getElementById('mspc'); el.value = 24; el.dispatchEvent(new Event('input', { bubbles: true })); }); await pg.waitForTimeout(600);
  console.log('css --spacing:', await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--spacing')));
  await pg.screenshot({ path: `${OUT}/master.png` });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
