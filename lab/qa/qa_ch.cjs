const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8891);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8891/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  const set = (id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await pg.evaluate(() => { const S = window.__state; S.LOOK.drift = 0; while (S.nLevels() > 1) S.removeLevel(); S.addLevel(); S.addLevel();
    for (const k of [1, 2, 3]) { const h = document.getElementById('l' + k + 'hide'); h.value = '0'; h.dispatchEvent(new Event('input')); }
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input'));
    const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  for (const [id, v] of [['l1w', 3], ['l1a', 0], ['l1dg', 0], ['l2w', 2], ['l2a', 60], ['l2dg', 0], ['l3w', 2], ['l3a', -60], ['l3dg', 0]]) await set(id, v);
  await pg.waitForTimeout(2500);
  const shot = async (n) => { await pg.waitForTimeout(500); await pg.locator('#cv').screenshot({ path: `${SP}/ch_${n}.png` }); };
  const solo = (ids) => pg.evaluate((ids) => { for (const b of document.querySelectorAll('#nodes .nb .so.on')) b.click(); for (const id of ids) document.querySelector(`.nb[data-id="${id}"] .so`).click(); }, ids);
  // A: one channel at a time on level 1 (level 1 soloed). Label j = internal k = 5 - j
  await solo(['O1']);
  const area = await pg.evaluate(() => { const s = window.__state.shape, n = [0, 0, 0, 0, 0, 0]; for (const v of s) n[Math.min(5, Math.max(0, Math.floor((1 - v) * 6)))]++; return n.map((x) => x / s.length); });
  for (let j = 0; j <= 5; j++) { await pg.evaluate((k) => { const c = document.getElementById('l1ch'); c.value = String(k); c.dispatchEvent(new Event('input')); }, 5 - j); await shot('c' + j); }
  // B: multiply: three levels with different channel sets, then each soloed
  await pg.evaluate(() => { const vals = ['5,4,3', '4,3,2,1', '2,1,0']; [1, 2, 3].forEach((k, i) => { const c = document.getElementById('l' + k + 'ch'); c.value = vals[i]; c.dispatchEvent(new Event('input')); }); });
  await solo([]); await shot('all'); for (const k of [1, 2, 3]) { await solo(['O' + k]); await shot('o' + k); }
  fs.writeFileSync(`${SP}/ch_area.json`, JSON.stringify(area));
  console.log('errors:', errs.join('|') || 'none'); await b.close(); srv.close();
})();
