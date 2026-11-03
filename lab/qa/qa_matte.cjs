const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(9031);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const check = (A, B, C, expr) => +cp.execSync(`python3 -c "
from PIL import Image
L=lambda f: Image.open(f).convert('L').tobytes()
A=L('${A}'); B=L('${B}'); C=L('${C}')
print(sum(1 for i in range(len(A)) if abs(A[i]/255-(lambda a,b,c: ${expr})(A[i]/255,B[i]/255,C[i]/255))*255>3))"`).toString();
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:9031/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  const ev = (f, a) => pg.evaluate(f, a);
  const set = (id, v) => ev(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await ev(() => { const S = window.__state; S.LOOK.drift = 0; while (S.nLevels() > 1) S.removeLevel(); S.addLevel(); S.addLevel();
    for (const k of [1, 2, 3]) for (const [id, v] of [['hide', '0'], ['ch', '4,5'], ['src', '']]) { const e = document.getElementById('l' + k + id); e.value = v; e.dispatchEvent(new Event('input')); }
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input'));
    const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  for (const [id, v] of [['ovs', 1], ['l2a', 60], ['l2dg', 0], ['l2rg', 0]]) await set(id, v);
  await pg.waitForTimeout(2500);
  const soloShot = async (ids, n) => { await ev((ids) => { const S = window.__state.solo; S.clear(); for (const i of ids) S.add(i); document.getElementById('l1hide').dispatchEvent(new Event('input')); }, ids); await pg.waitForTimeout(700); const f = `${SP}/mt_${n}.png`; await pg.locator('#cv').screenshot({ path: f }); return f; };
  ok(await ev(() => [...[...document.querySelectorAll('.trkrow')][1].querySelectorAll('option')].map((o) => o.textContent).join(',')) === 'Map,Flip,Overlay', 'each Alpha: one Matte menu with Map, Flip, Overlay');
  const map2 = await soloShot(['O2'], 'map'), lines2 = await soloShot(['L2'], 'lines'), ov = await soloShot(['OV'], 'ov'), fl = await soloShot(['FL'], 'flip');
  await set('l2src', 'OV'); const o2 = await soloShot(['O2'], 'o2ov');
  let n = check(o2, lines2, ov, '1-(1-b)*(1-c)'); ok(n < 60, `Matte = Overlay: Level02 = its lines where the overlay has ink (${n} px off)`);
  await set('l2src', 'FL'); const f2 = await soloShot(['O2'], 'o2fl');
  n = check(f2, lines2, fl, '1-(1-b)*(1-c)'); ok(n < 60, `Matte = Flip: Level02 = its lines in the Flip's darker details (${n} px off)`);
  await set('l2src', ''); const back = await soloShot(['O2'], 'back'); ok(fs.readFileSync(back).equals(fs.readFileSync(map2)), 'Matte = Map: back to the channels (identical)');
  await set('l2src', 'L1'); const old = await soloShot(['O2'], 'old'); ok(fs.readFileSync(old).equals(fs.readFileSync(map2)), 'an old saved level-matte reads as Map');
  await set('l2src', 'OV'); await pg.waitForTimeout(500);
  ok(await ev(() => [...document.querySelectorAll('.trkrow')][1].parentElement.querySelector('.chanrow:not(.trkrow)').classList.contains('mapOnly')), 'the channel buttons dim when another matte is chosen');
  await set('l2src', '');
  const drag = async (from, to) => { const a = await pg.locator(from).boundingBox(), c = await pg.locator(to).boundingBox();
    await pg.mouse.move(a.x + a.width / 2, a.y + a.height * 0.7); await pg.mouse.down(); await pg.mouse.move(a.x + a.width / 2 - 20, a.y + a.height * 0.7, { steps: 3 });
    await pg.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(400); };
  await drag('.node.flip', '[data-grp="Level03 Alpha"]'); ok(await ev(() => document.getElementById('l3src').value) === 'FL', 'drag Flip -> Alpha03: matte = Flip');
  await drag('[data-grp="Overlay"]', '[data-grp="Level01 Alpha"]'); ok(await ev(() => document.getElementById('l1src').value) === 'OV', 'drag Overlay -> Alpha01: matte = Overlay');
  await pg.waitForTimeout(800); ok(await ev(() => document.querySelectorAll('#nodes .wires path.trk').length) === 2, 'green wires for the two mattes');
  await drag('.node.flip', '[data-grp="Level03 Alpha"]'); ok(await ev(() => document.getElementById('l3src').value) === '', 'same drag again: back to Map');
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1000);
  ok(await ev(() => [...document.querySelectorAll('.trkrow')][0].querySelector('select').value) === 'OV', 'saved: survives a refresh');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close();
})();
