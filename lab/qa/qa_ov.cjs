const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8811);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1700, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('http://localhost:8811/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'portrait.mp4'; v.muted = true; v.loop = true; v.play(); });
  pg.setDefaultTimeout(120000); await pg.waitForTimeout(40000); await pg.evaluate(() => document.querySelector('#vid').pause()); await pg.waitForTimeout(3000);
  await pg.evaluate(() => { if (!document.body.classList.contains('editing')) document.getElementById('setbtn').click(); });
  await pg.evaluate(() => document.querySelector('.node[data-grp="Overlay"]').click()); await pg.waitForTimeout(800);
  console.log('panel sliders shown:', await pg.evaluate(() => [...document.querySelectorAll('#sliders .grpbody:not([hidden]) input[type=range], #sliders h2.grp + *:not([hidden]) input[type=range]')].map((r) => r.id).join(' ')));
  console.log('overlay opacity', await pg.evaluate(() => document.querySelector('#cv').nextElementSibling.style.opacity));
  await pg.evaluate(() => document.getElementById('dpq').dispatchEvent(new Event('input', { bubbles: true }))); await pg.waitForTimeout(2000); await pg.locator('#nodes').screenshot({ path: SP + '/ov_nodes.png', timeout: 90000 });
  // off: no work
  await pg.evaluate(() => { const cb = document.getElementById('ovs').parentElement.querySelector('.onoff input'); cb.click(); });
  await pg.waitForTimeout(500);
  console.log('after off, opacity', await pg.evaluate(() => document.querySelector('#cv').nextElementSibling.style.opacity));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
