const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002'; const log = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { log.push(q.url); let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9061);
(async () => { const b = await chromium.launch(); let bad = 0;
  for (const v of ['linesv2', 'dollar5', 'depth', 'ishihara', 'depth3d']) { log.length = 0; const pg = await b.newPage(); await pg.goto('http://localhost:9061/?view=' + v + '&nocam'); await pg.waitForTimeout(1500);
    const mods = log.filter((u) => /\/(ui|palette|colorwheel|depthmodel)\.js/.test(u)), unstamped = mods.filter((u) => !u.includes('?b=20261103140000'));
    const sl = await pg.evaluate(() => [document.querySelectorAll('#sliders .sl').length, new Set([...document.querySelectorAll('#sliders input[type=range]')].map((r) => r.id)).size]);
    const okv = unstamped.length === 0 && sl[0] === sl[1]; if (!okv) bad++;
    console.log((okv ? 'PASS ' : 'FAIL ') + `${v}: ${mods.map((u) => u.split('?')[0].slice(1)).join(', ')} all stamped, each once; ${sl[0]} sliders, no duplicates`); await pg.close(); }
  console.log(bad ? bad + ' failed' : 'all passed'); await b.close(); srv.close(); })();
