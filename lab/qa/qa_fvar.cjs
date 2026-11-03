const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8961);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); pg.setDefaultTimeout(120000);
  await pg.goto('http://localhost:8961/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  const ev = (f, a) => pg.evaluate(f, a);
  const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await ev(() => { const S = window.__state; while (S.nLevels() > 1) S.removeLevel(); const h = document.getElementById('l1hide'); h.value = '0'; h.dispatchEvent(new Event('input')); const c = document.getElementById('l1ch'); c.value = ''; c.dispatchEvent(new Event('input'));
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  for (const [id, v] of [['l1a', 0], ['l1w', 2.5], ['l1dg', 0], ['l1rg', 0.8]]) await set(id, v);
  await pg.waitForTimeout(2500);
  for (const [sz, g, t] of JSON.parse(process.argv[3])) { await set('mfd', sz); await set('mfg', g); await set('mft', t); await pg.waitForTimeout(700); await pg.locator('#cv').screenshot({ path: `${SP}/fv_${sz}_${g}_${t}.png` }); }
  await b.close(); srv.close();
})();
