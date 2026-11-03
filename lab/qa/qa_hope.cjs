const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9081);
(async () => { const b = await chromium.launch(); const errs = [];
  for (const clip of JSON.parse(process.argv[3])) {
    const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(180000); pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:9081/?view=dollar5&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
    const ev = (f, a) => pg.evaluate(f, a);
    const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
    await set('dpq', 18);
    await ev((clip) => { const v = document.querySelector('#vid'); v.src = clip; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); }, clip);
    const t0 = Date.now(); while (Date.now() - t0 < 120000 && !(await ev(() => window.__state.shape.some((v) => v > 0.05)))) await pg.waitForTimeout(2000);
    await pg.waitForTimeout(6000);
    await ev(() => { const S = window.__state.solo; S.clear(); S.add('HP'); document.getElementById('l1hide').dispatchEvent(new Event('input')); });
    for (const [az, el, rl, pm, lv] of JSON.parse(process.argv[4])) { await set('haz', az); await set('hel', el); await set('hrl', rl); await set('hph', pm); await set('hlv', lv); await pg.waitForTimeout(1500);
      await pg.locator('#cv').screenshot({ path: `${SP}/hp_${clip[0]}_${az}_${el}_${rl}_${pm}_${lv}.png`, timeout: 180000 }); }
    await ev(() => { const S = window.__state.solo; S.clear(); S.add('BL'); document.getElementById('l1hide').dispatchEvent(new Event('input')); }); await pg.waitForTimeout(1500);
    await pg.locator('#cv').screenshot({ path: `${SP}/hp_${clip[0]}_blend.png`, timeout: 180000 });
    await pg.close(); }
  console.log('errors:', errs.join('|') || 'none'); await b.close(); srv.close(); })();
