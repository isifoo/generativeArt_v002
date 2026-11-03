const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8921);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const stat = (file) => JSON.parse(cp.execSync(`python3 -c "
from PIL import Image; import json; im=Image.open('${file}').convert('L'); d=im.tobytes(); n=len(d)
h=[0]*256
for x in d: h[x]+=1
peaks=sorted([v for v in range(256) if h[v]>n*0.01])
print(json.dumps({'mid': round(sum(1 for x in d if 25<x<230)/n*100,2), 'peaks': peaks, 'ink': round((1-sum(d)/n/255)*100,3)}))"`).toString());
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8921/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const S = window.__state; while (S.nLevels() > 1) S.removeLevel(); S.addLevel();
    for (const k of [1, 2]) { const h = document.getElementById('l' + k + 'hide'); h.value = '0'; h.dispatchEvent(new Event('input')); const c = document.getElementById('l' + k + 'ch'); c.value = '4,5'; c.dispatchEvent(new Event('input')); }
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input'));
    const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  await pg.waitForTimeout(2500);
  const set = (id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const box = (id, on) => pg.evaluate(([id, on]) => { const cb = document.getElementById(id).parentElement.querySelector('.onoff input'); if (cb.checked !== on) cb.click(); }, [id, on]);
  const shot = async (n) => { await pg.waitForTimeout(600); const f = `${SP}/map_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return stat(f); };
  await pg.click('.node.map'); await pg.waitForTimeout(200);
  ok((await pg.evaluate(() => document.getElementById('setHead').textContent)).includes('Map'), 'click Map: Map settings (' + await pg.evaluate(() => [...document.querySelectorAll('#sliders h2.grp + *:not([hidden]) input[type=range]')].map((r) => r.id).join(' ')) + ')');
  let m = await shot('view'); ok(m.peaks.length >= 5 && m.peaks.length <= 7, 'Map soloed shows its six greys (grey values covering >1%: ' + m.peaks.join(',') + ')');
  await set('mbp', 90); await set('mwp', 170); const m2 = await shot('bw'); ok(JSON.stringify(m2.peaks) !== JSON.stringify(m.peaks) || m2.ink !== m.ink, `Black / White point change the map (ink ${m.ink}% -> ${m2.ink}%)`);
  await set('mbp', 0); await set('mwp', 255); await set('msm', 0); const m3 = await shot('raw'); await set('msm', 16); ok(m3.ink !== m.ink, 'Smoothness changes the map');
  await pg.click('.node[data-grp="Level01 Alpha"]'); let a = await shot('a1hard'); ok(a.mid < 1, 'softness 0: matte fully opaque (' + a.mid + '% in between)');
  await pg.click('.node.map'); await pg.click('.node.map'); await set('msf', 80); await pg.click('.node[data-grp="Level01 Alpha"]'); a = await shot('a1soft'); ok(a.mid > 3, 'Map softness 80: matte edges soft (' + a.mid + '% in between)');
  await pg.click('.node[data-grp="Level02 Alpha"]'); const a2 = await shot('a2soft'); ok(a2.mid > 3, 'Level02 follows the Map softness too (' + a2.mid + '%)');
  await box('l2soft', true); await set('l2soft', 0); const a2o = await shot('a2own'); ok(a2o.mid < 1, 'Level02 own softness (box on, 0) overrides the Map: hard (' + a2o.mid + '%)');
  await pg.click('.node[data-grp="Level01 Alpha"]'); a = await shot('a1still'); ok(a.mid > 3, 'Level01 (no override) keeps the Map softness (' + a.mid + '%)');
  await box('l2soft', false); await pg.click('.node[data-grp="Level02 Alpha"]'); const a2b = await shot('a2back'); ok(a2b.mid > 3, 'override box off: Level02 back on the Map softness (' + a2b.mid + '%)');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await pg.click('.node.master'); await pg.waitForTimeout(800); await pg.screenshot({ path: SP + '/map_page.png' }); await b.close(); srv.close();
})();
