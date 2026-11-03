const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2], CLIP = process.argv[3] || 'portrait', TAG = process.argv[4] || 'a';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); if (q.method === 'HEAD') return r.end(); fs.createReadStream(f).pipe(r); }).listen(8771);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/404|onnxruntime|MIME|ArrayBuffer/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await pg.goto('http://localhost:8771/?view=dollar2&nocam'); await pg.waitForSelector('#e2sp', { state: 'attached', timeout: 60000 });
  const extra = JSON.parse(process.argv[5] || '{}');
  await pg.evaluate(([clip, extra]) => { for (const [k, v] of Object.entries(extra)) { const el = document.getElementById(k); if (v === null) { el.parentElement.querySelector('.onoff input').click(); continue; } el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    const v = document.querySelector('#vid'); v.src = clip + '.mp4'; v.loop = true; v.play(); }, [CLIP, extra]);
  await pg.waitForFunction(() => window.__state && window.__state.M.have, null, { timeout: 180000 });
  await pg.evaluate(() => document.querySelector('#vid').pause()); await pg.waitForTimeout(5000);
  await pg.locator('#stage').screenshot({ path: `${OUT}/e2_${CLIP}_${TAG}.png` });
  console.log(CLIP, TAG, 'build ms', await pg.evaluate(() => window.__state.buildMs.toFixed(0)), 'lines', await pg.evaluate(() => window.__state.nLines), 'errors:', errs.join(' | ') || 'none');
  await b.close(); srv.close();
})();
