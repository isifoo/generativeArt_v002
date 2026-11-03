const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8821);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1700, height: 1000 } }); pg.setDefaultTimeout(120000);
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8821/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' });
  const ev = (f, a) => pg.evaluate(f, a);
  await ev(() => document.querySelector('.nb[data-id="OV"] .hd').click());     // overlay hidden (keeps this test fast)
  await ev(() => { const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1200)); });
  await pg.waitForTimeout(2500);
  await ev(() => document.querySelector('.addlvl').click()); await pg.waitForTimeout(300);
  await ev(() => { const e = document.getElementById('l2a'); e.value = 60; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const shot = async (name, c) => { if (c) await ev((a) => document.querySelector('.nb[data-id="' + a[0] + '"] .' + a[1]).click(), c); await pg.waitForTimeout(700); await pg.locator('#cv').screenshot({ path: SP + '/solo_' + name.replace(/ /g, '_') + '.png' }); console.log('shot', name); };
  const click = (id, cls) => [id, cls];
  // grab right after a render: draw in the same frame
  await ev(() => { const s = document.querySelector('#cv'); s.getContext('webgl2'); });
  await shot('all');
  await shot('solo L1', click('L1', 'so'));
  await shot('solo A1', click('A1', 'so'));
  await shot('solo O2', click('O2', 'so'));
  await shot('solo off', click('O2', 'so'));
  await shot('hide O2', click('O2', 'hd'));
  await shot('hide A1 too', click('A1', 'hd'));
  console.log('flags', JSON.stringify(await ev(() => ({ l1: document.getElementById('l1hide').value, l2: document.getElementById('l2hide').value, ov: document.getElementById('ovhide').value, hidNodes: document.querySelectorAll('#nodes .node.hid').length }))));
  await ev(() => document.querySelector('.nb[data-id="L1"] .so').click()); await pg.waitForTimeout(1500);
  await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1500);
  console.log('after refresh', JSON.stringify(await ev(() => ({ l1: document.getElementById('l1hide').value, l2: document.getElementById('l2hide').value, ov: document.getElementById('ovhide').value, hidNodes: document.querySelectorAll('#nodes .node.hid').length, solo: document.querySelectorAll('#nodes .nb .so.on').length }))));
  await pg.locator('#nodes').screenshot({ path: SP + '/solo_nodes.png' });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
})();
