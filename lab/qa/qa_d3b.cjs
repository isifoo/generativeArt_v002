const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.R, OUT = process.argv[2], CLIP = process.argv[3] || 'franklin', VIEW = process.argv[4] || 'dollar3';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8769);
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader', '--disable-gpu-watchdog', '--disable-gpu-process-crash-limit', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1000, height: 900 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await pg.addInitScript(() => { try { localStorage.setItem('genArt002.defaults.' + new URLSearchParams(location.search).get('view') + '.r1', JSON.stringify({ c: { subject: '0' } })); localStorage.setItem('genArt002.defaults.line', JSON.stringify({ c: { subject: '0' } })); } catch {} });
  await pg.goto(`http://localhost:8769/?view=${VIEW}&nocam`); await pg.waitForTimeout(3000);
  console.log('adapter / msg:', await pg.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return (a ? 'adapter ok' : 'no adapter') + ' | ' + document.querySelector('#msg').textContent; }));
  await pg.evaluate((c) => { const v = document.querySelector('#vid'); v.src = c + '.mp4'; v.loop = true; v.play(); }, CLIP);
  for (let t = 0; t < 12; t++) { await pg.waitForTimeout(10000); const f = await pg.evaluate(() => window.__state && window.__state.sim.frame); console.log('t', (t + 1) * 10, 's frame', f, '| msg', await pg.textContent('#msg')); if (f > 12) break; }
  await pg.screenshot({ path: `${OUT}/d3_${CLIP}_${VIEW}.png`, clip: { x: 0, y: 0, width: 520, height: 900 } });
  console.log('errors:', errs.slice(0, 5).join(' | ') || 'none');
  await b.close(); srv.close();
})();
