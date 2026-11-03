const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8760);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8760/?view=flines&nocam'); await pg.waitForSelector('#flsp', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await pg.waitForTimeout(3000);
  const vis = () => pg.evaluate(() => [...document.querySelectorAll('#sliders .sl')].filter((r) => r.offsetParent !== null).map((r) => r.querySelector('.lab').textContent));
  await pg.click('#nLines'); await pg.waitForTimeout(800);
  console.log('Lines node ->', JSON.stringify(await vis()));
  await pg.screenshot({ path: `${OUT}/min_lines.png` });
  await pg.click('#nAlpha'); await pg.waitForTimeout(500);
  console.log('Alpha node ->', JSON.stringify(await vis()));
  await pg.screenshot({ path: `${OUT}/min_alpha.png` });
  console.log('other visible panel text:', await pg.evaluate(() => [...document.querySelectorAll('#settings > *')].filter((e) => e.offsetParent !== null && !e.closest('#sliders')).map((e) => e.textContent.trim().slice(0, 30))));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
