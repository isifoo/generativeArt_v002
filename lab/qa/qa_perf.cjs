// perf + save test for Fractal Lines. usage: node qa_perf.cjs OUT [save]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8755);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8755/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await pg.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) { await pg.click('.addlvl'); await pg.waitForTimeout(200); }
  const measure = (label) => pg.evaluate(async (label) => {
    let n = 0, worst = 0, last = performance.now(); const t0 = last;
    await new Promise((res) => { const f = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; n++; if (now - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return `${label}: ${(n / 5).toFixed(1)} fps, worst frame ${worst.toFixed(0)} ms`;
  }, label);
  console.log(await measure('4 levels, nodes shown'));
  await pg.click('#nodebtn'); await pg.waitForTimeout(300);
  console.log(await measure('4 levels, nodes hidden'));
  await pg.click('#nodebtn');
  if (process.argv[3] === 'save') {
    await pg.evaluate(() => { const el = document.getElementById('l3a'); el.value = 70; el.dispatchEvent(new Event('input', { bubbles: true })); const c = document.getElementById('l2ch'); c.value = '4'; c.dispatchEvent(new Event('input')); const m = document.getElementById('mspc'); m.value = 21; m.dispatchEvent(new Event('input', { bubbles: true })); });
    await pg.click('#setbtn'); await pg.waitForTimeout(700); await pg.click('#ownerbtn'); await pg.fill('#pinbox2 input', process.env.OWNER_PIN || ''); await pg.waitForTimeout(200);
    await pg.click('#setdef'); await pg.waitForTimeout(300);
    await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1500);
    console.log('after Set default + reload:', JSON.stringify(await pg.evaluate(() => ({ levels: window.__state.nLevels(), l3angle: document.getElementById('l3a').value, l2ch: document.getElementById('l2ch').value, spacing: document.getElementById('mspc').value, nodes: document.querySelectorAll('[data-out]').length }))));
  }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
