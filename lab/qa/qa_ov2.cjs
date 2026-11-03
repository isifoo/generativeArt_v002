const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8991);
(async () => { const b = await chromium.launch(); const errs = [];
  for (const clip of ['franklin.mp4', 'portrait.mp4']) {
    const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); pg.setDefaultTimeout(120000); pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8991/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
    const set = (id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
    await pg.evaluate((clip) => { const o = document.getElementById('ovhide'); o.value = '0'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = clip; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); }, clip);
    await pg.waitForTimeout(2500); await pg.click('.node[data-grp="Overlay"]');
    for (const [d, c, t, f, k] of JSON.parse(process.argv[3])) { await set('ovd', d); await set('ovc', c); await set('ovt', t); await set('ovf', f); await set('ovk', k); await pg.waitForTimeout(700);
      await pg.locator('#cv').screenshot({ path: `${SP}/o2_${clip[0]}_${d}_${c}_${t}_${f}_${k}.png` }); }
    await pg.click('.node.master'); await pg.waitForTimeout(800); await pg.locator('#cv').screenshot({ path: `${SP}/o2_${clip[0]}_master.png` });
    await pg.close(); }
  console.log('errors:', errs.join('|') || 'none'); await b.close(); srv.close(); })();
