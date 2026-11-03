const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8901);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8901/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const S = window.__state; S.LOOK.drift = 0; while (S.nLevels() > 1) S.removeLevel(); S.addLevel(); S.addLevel();
    for (const k of [1, 2, 3]) { const h = document.getElementById('l' + k + 'hide'); h.value = '0'; h.dispatchEvent(new Event('input')); }
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input'));
    const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  await pg.waitForTimeout(2500);
  const soloSet = () => pg.evaluate(() => [...window.__state.solo].sort().join(',') || '-');
  const head = () => pg.evaluate(() => document.getElementById('setHead').textContent);
  const click = async (sel) => { await pg.click(sel); await pg.waitForTimeout(150); };
  await click('.node[data-grp="Level02 Alpha"]'); ok(await soloSet() === 'A2' && (await head()).includes('Level02 Alpha'), 'click Alpha02: solo Alpha02 + its settings (' + await soloSet() + ', ' + await head() + ')');
  await click('.node[data-grp="Level02 Alpha"]'); ok(await soloSet() === '-', 'click Alpha02 again: solo off');
  await click('.node[data-grp="Level01 Lines"]'); await click('[data-out="3"]'); ok(await soloSet() === 'O3', 'click Lines01 then Level03: Level03 solo instead (' + await soloSet() + ')');
  await click('.node.master'); ok(await soloSet() === '-' && (await head()).includes('Master'), 'click Master: full picture + Master settings');
  await click('.node[data-grp="Overlay"]'); ok(await soloSet() === 'OV', 'click Overlay: overlay solo');
  await click('.node.master');
  await pg.click('.nb[data-id="O1"] .so'); await pg.click('.nb[data-id="O2"] .so'); ok(await soloSet() === 'O1,O2', 'Solo buttons still solo several at once');
  ok(await pg.evaluate(() => document.querySelector('.nb[data-id="O1"] .so').classList.contains('on')), 'Solo button lights for the soloed node');
  await click('.node.master');
  // full opaque matte: no channel chosen = matte everywhere -> Level01 == Lines01
  await pg.evaluate(() => { const c = document.getElementById('l1ch'); c.value = ''; c.dispatchEvent(new Event('input')); });
  const shot = async () => { await pg.waitForTimeout(500); return pg.locator('#cv').screenshot(); };
  await click('[data-out="1"]'); const lv = await shot(); await click('.node[data-grp="Level01 Lines"]'); const ln = await shot();
  ok(lv.equals(ln), 'no channel chosen = fully opaque everywhere (Level01 identical to its Lines)');
  // binary matte: Alpha solo with two channels: only black or white (except the anti-aliased contour)
  await pg.evaluate(() => { const c = document.getElementById('l1ch'); c.value = '4,5'; c.dispatchEvent(new Event('input')); });
  await click('.node[data-grp="Level01 Alpha"]'); fs.writeFileSync(SP + '/cl_alpha.png', await shot());
  const mid = +require('child_process').execSync(`python3 -c "from PIL import Image; d=Image.open('${SP}/cl_alpha.png').convert('L').tobytes(); print(round(sum(1 for x in d if 25<x<230)/len(d)*100,2))"`).toString();
  ok(mid < 3, 'matte is fully opaque: only ' + mid + '% of pixels are in between (contour anti-aliasing)');
  console.log(`\n${pass} passed, ${fail} failed; errors: ${errs.join('|') || 'none'}`); await b.close(); srv.close();
})();
