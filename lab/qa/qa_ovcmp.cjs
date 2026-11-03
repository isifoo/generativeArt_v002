const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const serve = (root, port) => http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(port);
(async () => { const b = await chromium.launch();
  for (const [name, root, port] of [['v217', SP + '/v217', 8971], ['now', '/home/user/generativeart_v002', 8972]]) {
    const s = serve(root, port); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(180000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(`http://localhost:${port}/?view=flines&nocam`); await pg.waitForTimeout(2000);
    await pg.evaluate(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play(); });
    await pg.waitForTimeout(1500); await pg.evaluate(() => { const v = document.querySelector('#vid'); v.pause(); v.currentTime = 1.0; });
    await pg.waitForTimeout(45000);
    const o = await pg.evaluate(() => { const c = document.querySelector('#cv').nextElementSibling; return { url: c.toDataURL('image/png'), op: c.style.opacity, en: [...document.querySelectorAll('#sliders input[type=range]')].filter((r) => /^en|^dp|^ovs/.test(r.id)).map((r) => r.id + '=' + r.value).join(' ') }; });
    fs.writeFileSync(`${SP}/ov_${name}.png`, Buffer.from(o.url.split(',')[1], 'base64')); console.log(name, 'opacity', o.op, o.en, errs.join('|') || 'no errors');
    await pg.close(); s.close(); }
  await b.close(); })();
