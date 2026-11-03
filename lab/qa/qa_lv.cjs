const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8756);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await pg.goto('http://localhost:8756/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await pg.waitForTimeout(2500);
  const vis = () => pg.evaluate(() => [...document.querySelectorAll('#sliders .sl')].filter((r) => r.offsetParent !== null).map((r) => r.querySelector('.lab').textContent).join(', '));
  console.log('levels at start:', await pg.evaluate(() => window.__state.nLevels()));
  for (let i = 0; i < 3; i++) { await pg.click('.addlvl'); await pg.waitForTimeout(300); }
  console.log('after 3 duplicates:', await pg.evaluate(() => window.__state.nLevels()), '| out nodes:', await pg.$$eval('[data-out] b', (a) => a.map((x) => x.textContent.trim())));
  // make level 2..4 differ: angle and one matte channel each
  await pg.evaluate(() => { for (const [k, a, ch] of [[2, 40, '4'], [3, 85, '3'], [4, -50, '5']]) { const el = document.getElementById('l' + k + 'a'); el.value = a; el.dispatchEvent(new Event('input', { bubbles: true })); const c = document.getElementById('l' + k + 'ch'); c.value = ch; c.dispatchEvent(new Event('input')); } });
  await pg.click('[data-grp="Level02 Alpha"]'); await pg.waitForTimeout(800);
  console.log('Level02 Alpha ->', await vis(), '| buttons on:', await pg.$$eval('.chans button.on', (a) => a.filter((x) => x.offsetParent).map((x) => x.textContent)));
  await pg.click('[data-grp="Master"]'); await pg.waitForTimeout(500); console.log('Master ->', await vis());
  await pg.click('[data-grp="Level03 Lines"]'); await pg.waitForTimeout(500); console.log('Level03 Lines ->', await vis());
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${OUT}/lv_page.png` });
  await pg.click('.rm'); await pg.waitForTimeout(300); console.log('after remove:', await pg.evaluate(() => window.__state.nLevels()));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
