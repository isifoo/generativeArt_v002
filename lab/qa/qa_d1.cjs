const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], clip = process.argv[3] || 'portrait.mp4';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const serve = (root, port) => http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const runs = [['v2.02', SP + '/d_8886ec3', 'dollar1'], ['v2.04', SP + '/d_5e6d633', 'dollar1'], ['now', '/home/user/generativeart_v002', 'dollar1']];
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  let port = 8800;
  for (const [name, root, view] of runs) {
    const s = serve(root, ++port).listen(port);
    const pg = await b.newPage({ viewport: { width: 1200, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(`http://localhost:${port}/?view=${view}&nocam`); await pg.waitForTimeout(1500);
    await pg.evaluate((clip) => { const v = document.querySelector('#vid'); v.src = clip; v.muted = true; v.loop = true; v.play(); }, clip);
    await pg.waitForTimeout(40000);
    await pg.evaluate(() => document.querySelector('#vid').pause());
    const o = await pg.evaluate(() => { const c = document.querySelector('#cv').nextElementSibling; return { url: c.toDataURL('image/png'), op: c.style.opacity, vals: [...document.querySelectorAll('#sliders input[type=range]')].map((r) => r.id + '=' + r.value).join(' ') }; });
    fs.writeFileSync(`${SP}/d1_${name}.png`, Buffer.from(o.url.split(',')[1], 'base64')); console.log(name, 'opacity', o.op, o.vals);
    console.log(name, 'errors:', errs.join('|') || 'none', await pg.evaluate(() => document.getElementById('msg')?.textContent || ''));
    await pg.close(); s.close();
  }
  await b.close();
})();
