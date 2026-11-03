const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9101);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9101/?view=linesv2&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.loop = true; v.play(); });
  await pg.waitForTimeout(1500);
  // 2 per second: sample the crossfade every frame for 1.6 s
  const r2 = await pg.evaluate(async () => { const i = document.getElementById('hupd'); i.value = '1'; i.dispatchEvent(new Event('input'));
    const out = []; const t0 = performance.now(); await new Promise((res) => { const f = () => { out.push(window.__state.hopeMix()); if (performance.now() - t0 < 1600) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return out; });
  const mid = r2.filter((m) => m > 0.05 && m < 0.95).length, restarts = r2.filter((m, k) => k && m < r2[k - 1] - 0.5).length;
  ok(mid >= 5 && restarts >= 2, `2 per second: ${mid} in-between frames, a new map ${restarts + 1} times in 1.6 s (crossfades of half a second)`);
  const r1 = await pg.evaluate(async () => { const i = document.getElementById('hupd'); i.value = '0'; i.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 300)); return window.__state.hopeMix(); });
  ok(r1 === 1, 'Realtime: no crossfade (follows every frame, smoothed in time)');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close(); })();
