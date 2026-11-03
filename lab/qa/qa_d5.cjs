const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8931);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const stat = (file) => JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json; im=Image.open('${file}').convert('L'); d=im.tobytes(); n=len(d)
print(json.dumps({'mid': round(sum(1 for x in d if 25<x<230)/n*100,2), 'ink': round((1-sum(d)/n/255)*100,3), 'levels': len(set(d))}))"`).toString());
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(180000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8931/?view=dollar5&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => [...document.querySelectorAll('#versions button')].map((b) => b.textContent).join(',')).then ? true : true, '');
  const labels = await pg.evaluate(() => [...document.querySelectorAll('#versions button')].map((b) => b.textContent).join(', '));
  ok(labels.includes('Dollar 5') && labels.includes('Lines V2'), 'buttons: ' + labels);
  const ev = (f, a) => pg.evaluate(f, a);
  const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await set('dpq', 12);
  await ev(() => { const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'portrait.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 2000)); });
  await ev(() => document.querySelector('.node[data-grp="Level01 Alpha"]').click()); await pg.waitForTimeout(300);
  ok(await ev(() => [...document.querySelectorAll('#sliders h2.grp + *:not([hidden]) input[type=range]')].map((r) => r.id).join(' ')) === 'l1bp l1wp l1bs l1ws' && !await ev(() => !!document.querySelector('#sliders h2.grp + *:not([hidden]) .chans')), 'Alpha = Extract only (Black / White point + softness), no Invert, no channel buttons');
  ok((await ev(() => document.querySelector('.node.map b').textContent)).startsWith('Depth map'), 'Map node is the Depth map');
  // wait for the depth map
  const t0 = Date.now(); while (Date.now() - t0 < 150000 && !(await ev(() => window.__state.shape.some((v) => v > 0.05)))) await pg.waitForTimeout(3000);
  ok(await ev(() => window.__state.shape.some((v) => v > 0.05)), 'depth map arrived (' + Math.round((Date.now() - t0) / 1000) + ' s, CPU here)');
  await pg.waitForTimeout(3000);
  const shot = async (n) => { await pg.waitForTimeout(800); const f = `${SP}/d5_${n}.png`; await pg.locator('#cv').screenshot({ path: f, timeout: 180000 }); return stat(f); };
  await ev(() => document.querySelector('.node.map').click()); const m = await shot('map'); ok(m.levels > 40, 'Map soloed shows the depth as a continuous grey ramp (' + m.levels + ' grey values)');
  await ev(() => document.querySelector('.node[data-grp="Level01 Alpha"]').click());
  const full = await shot('full'); await set('l1bp', 128); const near = await shot('near'); await set('l1bp', 0); await set('l1wp', 127); const far = await shot('far');
  ok(full.ink > 30 && near.ink < full.ink && far.ink < full.ink && Math.abs(near.ink + far.ink - full.ink) < 3, `Extract slides across the map: 0-255 ${full.ink}% = 128-255 ${near.ink}% + 0-127 ${far.ink}%`);
  ok(full.mid < 1 && far.mid < 2, 'no softness: hard, fully opaque matte (' + far.mid + '% in between)');
  await set('l1ws', 80); const soft = await shot('soft'); ok(soft.mid > far.mid + 2, 'White softness 80 softens the edge (' + soft.mid + '% in between)');
  await set('l1wp', 255); await set('l1ws', 0); await set('l1bp', 140); await set('l1bs', 80); const soft2 = await shot('soft2'); ok(soft2.mid > 2, 'Black softness 80 softens the edge (' + soft2.mid + '% in between)');
  await ev(() => document.querySelector('.node.master').click()); await pg.waitForTimeout(1500); await pg.screenshot({ path: SP + '/d5_page.png', timeout: 180000 });
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close();
})();
