const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9011);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
// mismatch of image A against a formula of images (python expression over a, b, c pixel values 0..1)
const check = (A, B, C, expr) => +cp.execSync(`python3 -c "
from PIL import Image
L=lambda f: Image.open(f).convert('L').tobytes()
A=L('${A}'); B=L('${B}'); C=L('${C}')
n=0
for i in range(len(A)):
  a=A[i]/255; b=B[i]/255; c=C[i]/255
  if abs(a-(${expr}))*255>3: n+=1
print(n)"`).toString();
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9011/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  const ev = (f, a) => pg.evaluate(f, a);
  const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(e.type === 'hidden' ? 'input' : 'input', { bubbles: true })); }, [id, v]);
  await ev(() => { const S = window.__state; S.LOOK.drift = 0; while (S.nLevels() > 1) S.removeLevel(); S.addLevel(); S.addLevel();
    for (const k of [1, 2, 3]) for (const [id, v] of [['hide', '0'], ['ch', ''], ['src', ''], ['srcw', '0']]) { const e = document.getElementById('l' + k + id); e.value = v; e.dispatchEvent(new Event('input')); }
    const o = document.getElementById('ovhide'); o.value = '0'; o.dispatchEvent(new Event('input'));
    const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  for (const [id, v] of [['ovs', 1], ['l1a', 0], ['l2a', 60], ['l3a', -60], ['l1dg', 0], ['l2dg', 0], ['l3dg', 0], ['l1rg', 0], ['l2rg', 0], ['l3rg', 0]]) await set(id, v);
  await ev(() => { const cb = document.getElementById('mfl').parentElement.querySelector('.onoff input'); if (cb.checked) cb.click(); });   // flip off: simpler maths
  await pg.waitForTimeout(2500);
  const soloShot = async (ids, n) => { await ev((ids) => { const S = window.__state.solo; S.clear(); for (const i of ids) S.add(i); document.getElementById('l1hide').dispatchEvent(new Event('input')); }, ids); await pg.waitForTimeout(700); const f = `${SP}/tk_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  const base2 = await soloShot(['O2'], 'base2'), ovr = await soloShot(['OV'], 'ov'), lv1 = await soloShot(['O1'], 'lv1');
  await set('l2src', 'OV'); const t2 = await soloShot(['O2'], 't2ov');
  ok(check(t2, base2, ovr, '1-(1-b)*(1-c)') < 60, 'Level02 track matte = Overlay, where it has ink: Level02 shows only on the overlay ink (' + check(t2, base2, ovr, '1-(1-b)*(1-c)') + ' px off)');
  await set('l2srcw', '1'); const t2w = await soloShot(['O2'], 't2ovw');
  ok(check(t2w, base2, ovr, '1-(1-b)*c') < 60, 'where it is white: Level02 only off the overlay ink (' + check(t2w, base2, ovr, '1-(1-b)*c') + ' px off)');
  await set('l2srcw', '0'); await set('l2src', 'L1'); const t21 = await soloShot(['O2'], 't2l1');
  ok(check(t21, base2, lv1, '1-(1-b)*(1-c)') < 60, 'Level02 track matte = Level01: Level02 only where Level01 has ink (' + check(t21, base2, lv1, '1-(1-b)*(1-c)') + ' px off)');
  await set('l2src', 'OV'); await ev(() => { const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); });
  const t2h = await soloShot(['O2'], 't2ovhid');
  ok(fs.readFileSync(t2h).equals(fs.readFileSync(t2)), 'the Overlay still works as a matte while hidden (identical)');
  ok(await ev(() => [...document.querySelectorAll('.trkrow')][1].querySelector('.tsrc').innerHTML.includes('Level01') && ![...document.querySelectorAll('.trkrow')][1].querySelector('.tsrc').innerHTML.includes('Level02')), 'a level cannot be its own track matte (Level02 is not offered for Level02)');
  await set('l3src', 'L2'); await pg.waitForTimeout(1500);
  ok(await ev(() => document.querySelectorAll('#nodes .wires path.trk').length) === 2, 'one green wire per track matte (2)');
  await set('l3src', 'L6'); await pg.waitForTimeout(400); const t3none = await soloShot(['O3'], 't3none'); await set('l3src', ''); const t3 = await soloShot(['O3'], 't3');
  ok(fs.readFileSync(t3none).equals(fs.readFileSync(t3)), 'a missing level as source (Level06 of 3) = no track matte');
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1200);
  ok(await ev(() => document.getElementById('l2src').value === 'OV' && [...document.querySelectorAll('.trkrow')][1].querySelector('.tsrc').value === 'OV'), 'track matte saved (survives a refresh, menu shows it)');
  ok(await ev(() => { window.__state.addLevel(); return document.getElementById('l4src').value; }) === '', 'duplicate copies the track matte of the level it copies (Level03: none)');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await pg.screenshot({ path: SP + '/tk_page.png' }); await b.close(); srv.close();
})();
