const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); if (q.method === 'HEAD') return r.end(); fs.createReadStream(f).pipe(r); }).listen(8761);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8761/?view=flines&nocam'); await pg.waitForSelector('#flmk', { state: 'attached', timeout: 60000 });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await pg.waitForTimeout(4000);
  await pg.screenshot({ path: `${OUT}/nodes_page.png` });
  const png = await pg.evaluate(() => document.querySelector('#cv').toDataURL('image/png')); fs.writeFileSync(`${OUT}/nodes_out.png`, Buffer.from(png.split(',')[1], 'base64'));
  await pg.evaluate(() => { const el = document.getElementById('pslv'); el.value = 4; el.dispatchEvent(new Event('input', { bubbles: true })); }); await pg.waitForTimeout(800);
  const png2 = await pg.evaluate(() => document.querySelector('#cv').toDataURL('image/png')); fs.writeFileSync(`${OUT}/nodes_out4.png`, Buffer.from(png2.split(',')[1], 'base64'));
  await pg.click('#nAlpha'); await pg.waitForTimeout(900);
  console.log('editing open:', await pg.evaluate(() => document.body.classList.contains('editing')), '| nodes visible:', await pg.isVisible('#nodes'));
  await pg.click('#nodebtn'); await pg.waitForTimeout(200); console.log('after Nodes button: visible', await pg.isVisible('#nodes'));
  const p2 = await b.newPage(); await p2.goto('http://localhost:8761/?view=ishihara&nocam'); await p2.waitForTimeout(1500);
  console.log('ishihara: nodes visible', await p2.isVisible('#nodes'), '| Nodes button visible', await p2.isVisible('#nodebtn'));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
