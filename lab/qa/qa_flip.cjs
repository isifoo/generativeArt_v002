const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8951);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8951/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  const ev = (f, a) => pg.evaluate(f, a);
  const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const box = (id, on) => ev(([id, on]) => { const cb = document.getElementById(id).parentElement.querySelector('.onoff input'); if (cb.checked !== on) cb.click(); }, [id, on]);
  await ev(() => { const S = window.__state; while (S.nLevels() > 1) S.removeLevel(); const h = document.getElementById('l1hide'); h.value = '0'; h.dispatchEvent(new Event('input')); const c = document.getElementById('l1ch'); c.value = ''; c.dispatchEvent(new Event('input'));
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  for (const [id, v] of [['l1a', 0], ['l1w', 2.5], ['l1dg', 0]]) await set(id, v);
  await pg.waitForTimeout(2500);
  const shot = async (n) => { await pg.waitForTimeout(600); const f = `${SP}/fl_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  ok(await ev(() => !!document.querySelector('.node.flip')), 'Flip node in the graph');
  await pg.click('.node.flip'); const bands = await shot('bands');
  const bs = JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json; d=Image.open('${bands}').convert('L').tobytes(); n=len(d)
print(json.dumps({'black': round(sum(1 for x in d if x<30)/n*100,1), 'white': round(sum(1 for x in d if x>225)/n*100,1)}))"`).toString());
  ok(bs.black > 5 && bs.white > 5 && bs.black + bs.white > 97, `Flip soloed: bands one way (white ${bs.white}%) / flipped (black ${bs.black}%)`);
  await pg.click('.node.master'); await set('l1rg', 0);
  const on4 = await shot('on4'); await box('mfl', false); const off = await shot('off'); await box('mfl', true); await set('mfl', 6); const on6 = await shot('on6'); await set('mfl', 4);
  const differ = (a, b) => cp.execSync(`python3 -c "
from PIL import Image; a=Image.open('${a}').convert('L').tobytes(); b=Image.open('${b}').convert('L').tobytes(); print(round(sum(1 for x,y in zip(a,b) if abs(x-y)>40)/len(a)*100,2))"`).toString().trim();
  ok(+differ(on4, off) > 1, 'Flip on vs off changes the lines (' + differ(on4, off) + '% of pixels)');
  ok(+differ(on4, on6) > 1, '4 vs 6 bands differ (' + differ(on4, on6) + '%)');
  await set('l1rg', 2); const rough = await shot('rough');
  ok(+differ(on4, rough) > 0.5, 'Rough edges 2 px changes the strokes (' + differ(on4, rough) + '%)');
  const r08 = (await set('l1rg', 0.8), await shot('r08'));
  ok(await ev(() => { window.__state.addLevel(); return document.getElementById('l2rg').value; }) === '0.8', 'duplicate copies Rough edges');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await pg.screenshot({ path: SP + '/fl_page.png' }); await b.close(); srv.close();
})();
