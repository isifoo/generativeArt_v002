const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8767);
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader'] }); const pg = await b.newPage();
  await pg.goto('http://localhost:8767/?view=flines&nocam'); await pg.waitForTimeout(2000);
  console.log(JSON.stringify(await pg.evaluate(() => ({ groups: [...document.querySelectorAll('#sliders h2.grp')].map((h) => h.textContent), sliders: [...document.querySelectorAll('#sliders .sl .lab')].map((l) => l.textContent), active: document.querySelector('#versions .on')?.textContent, subjectRow: !document.querySelector('#subject').closest('[hidden]') }))));
  await b.close(); srv.close();
})();
