const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); if (q.method === 'HEAD') return r.end(); fs.createReadStream(f).pipe(r); }).listen(8763);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/404|onnxruntime|MIME|ArrayBuffer/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await pg.goto('http://localhost:8763/?view=flines&nocam'); await pg.waitForSelector('#flmk', { state: 'attached', timeout: 60000 });
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.loop = true; v.play(); });
  await new Promise((r) => setTimeout(r, 4000));
  const shot = async (n) => { const png = await pg.evaluate(() => document.querySelector('#cv').toDataURL('image/png')); fs.writeFileSync(`${OUT}/mk_${n}.png`, Buffer.from(png.split(',')[1], 'base64')); };
  const set = (o) => pg.evaluate((o) => { for (const [k, v] of Object.entries(o)) { const el = document.getElementById(k); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }, o);
  await pg.waitForFunction(() => document.querySelectorAll('#sliders .sl').length > 20, null, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 40000));                       // depth model on the processor here
  await shot('def'); await set({ flwp: 180 }); await pg.waitForTimeout(500); await shot('wp180'); await set({ flwp: 235, flmi: 1 }); await pg.waitForTimeout(500); await shot('inv');
  console.log('sliders:', await pg.$$eval('#sliders .sl', (a) => a.length), '| errors:', errs.join(' | ') || 'none');
  await b.close(); srv.close();
})();
