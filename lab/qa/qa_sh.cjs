// Solo / hide matrix + studio layout. Pixel comparisons with the drift frozen.
const { chromium, devices } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const SP = process.argv[2], ROOT = '/home/user/generativeart_v002';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8871);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); pg.setDefaultTimeout(120000);
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8871/?view=flines&nocam'); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(800);
  // 3 distinct levels, overlay hidden (CPU depth is slow here; overlay checked by its opacity)
  await pg.evaluate(() => { const S = window.__state; S.LOOK.drift = 0; while (S.nLevels() > 1) S.removeLevel(); S.addLevel(); S.addLevel();
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('l1a', 0); set('l2a', 45); set('l3a', -45); set('l1w', 3); set('l2w', 2); set('l3w', 2);
    for (const k of [1, 2, 3]) { const c = document.getElementById('l' + k + 'ch'); c.value = ''; c.dispatchEvent(new Event('input')); const h = document.getElementById('l' + k + 'hide'); h.value = '0'; h.dispatchEvent(new Event('input')); }
    const o = document.getElementById('ovhide'); o.value = '1'; o.dispatchEvent(new Event('input')); const v = document.querySelector('#vid'); v.src = 'franklin.mp4'; v.muted = true; v.play().then(() => setTimeout(() => v.pause(), 1500)); });
  await pg.waitForTimeout(2500);
  const btn = (id, w) => pg.evaluate(([id, w]) => document.querySelector(`.nb[data-id="${id}"] .${w}`).click(), [id, w]);
  const reset = () => pg.evaluate(() => { for (const b of document.querySelectorAll('#nodes .nb i.on')) if (b.parentElement.dataset.id !== 'OV' || b.classList.contains('so')) b.click(); });
  const shot = async () => { await pg.waitForTimeout(500); return pg.locator('#cv').screenshot(); };
  const blank = async (buf) => { fs.writeFileSync(SP + '/sh_tmp.png', buf); return (await pg.evaluate(() => 0)) === 0 && require('child_process').execSync(`python3 -c "from PIL import Image; im=Image.open('${SP}/sh_tmp.png').convert('L'); print(min(im.getextrema()[0],255))"`).toString().trim(); };
  const ink = (buf) => { fs.writeFileSync(SP + '/sh_tmp.png', buf); return +require('child_process').execSync(`python3 -c "from PIL import Image; im=Image.open('${SP}/sh_tmp.png').convert('L'); d=im.tobytes(); print(round((1-sum(d)/len(d)/255)*100,3))"`).toString(); };
  const same = (a, b) => a.equals(b);
  const base = await shot(); ok(ink(base) > 1, 'all 3 levels draw ink: ' + ink(base) + '%');
  await btn('O1', 'so'); const soloO1 = await shot(); await reset();
  await btn('O2', 'hd'); await btn('O3', 'hd'); const hide23 = await shot(); await reset();
  ok(same(soloO1, hide23), 'solo Level01 == hide Level02 + Level03');
  await btn('O1', 'so'); await btn('O2', 'so'); const solo12 = await shot(); await reset();
  await btn('O3', 'hd'); const hide3 = await shot(); await reset();
  ok(same(solo12, hide3), 'solo Level01 + Level02 (two solos) == hide Level03');
  ok(!same(solo12, soloO1), 'second solo adds its level');
  await btn('O1', 'so'); await btn('O1', 'hd'); const sh1 = await shot(); await reset();
  fs.writeFileSync(SP + '/sh_blank.png', sh1); ok(ink(sh1) < 0.01, 'solo + hide on the same level = nothing (hide wins): ' + ink(sh1) + '%');
  await btn('L2', 'hd'); const hL2 = await shot(); await reset();
  await btn('O2', 'hd'); const hO2 = await shot(); await reset();
  ok(same(hL2, hO2), 'hide Lines02 == hide Level02 (the level is left out)');
  await pg.evaluate(() => { const c = document.getElementById('l1ch'); c.value = '4,5'; c.dispatchEvent(new Event('input')); });
  await btn('A1', 'hd'); const hA1 = await shot(); await reset();
  await btn('L1', 'so'); await btn('O2', 'so'); await btn('O3', 'so'); const soloL1O23 = await shot(); await reset();
  ok(same(hA1, soloL1O23), 'hide Alpha01 == level 1 without its matte (solo Lines01 + Level02 + Level03)');
  const base2 = await shot(); ok(!same(hA1, base2), 'hiding Alpha01 changes the picture (level 1 on channels 4,5)');
  await btn('A1', 'so'); const sA1 = await shot(); await btn('A1', 'hd'); const sA1h = await shot(); await reset();
  ok(ink(sA1) > 5 && ink(sA1h) < 0.01, `solo Alpha01 shows the matte (${ink(sA1)}%), hidden as well = nothing (${ink(sA1h)}%)`);
  await btn('L1', 'so'); const sL1 = await shot(); await btn('L1', 'so'); const off = await shot();
  ok(!same(sL1, base2) && same(off, base2), 'clicking Solo again goes back to the full picture');
  // overlay visibility
  const op = () => pg.evaluate(() => window.__state.ovOn() ? 1 : 0);
  await btn('OV', 'hd'); await pg.waitForTimeout(100); const ovShown = await op();   // overlay was hidden by default in this test? make it visible:
  ok(+ovShown > 0, 'overlay visible after un-hide');
  await btn('O1', 'so'); await pg.waitForTimeout(100); ok(+(await op()) === 0, 'overlay hidden while another node is soloed');
  await btn('OV', 'so'); await pg.waitForTimeout(100); ok(+(await op()) > 0, 'overlay shown when soloed too');
  await btn('OV', 'hd'); await pg.waitForTimeout(100); ok(+(await op()) === 0, 'overlay soloed + hidden = off');
  await reset(); await btn('OV', 'hd'); await pg.waitForTimeout(400);
  // wires
  await btn('L2', 'hd'); await pg.waitForTimeout(2500);
  ok(await pg.evaluate(() => document.querySelectorAll('#nodes .wires path.dash').length) >= 2, 'wires from hidden nodes are dashed');
  // remove a soloed level
  await reset(); await btn('O3', 'so'); await pg.evaluate(() => window.__state.removeLevel()); const afterRm = await shot();
  await pg.evaluate(() => window.__state.addLevel()); await pg.waitForTimeout(200);
  console.log('debug remove: solo', await pg.evaluate(() => [...window.__state.solo].join()), 'ink', ink(afterRm), 'levels', await pg.evaluate(() => window.__state.nLevels())); ok(await pg.evaluate(() => window.__state.solo.size) === 0 && ink(afterRm) > 0, 'removing a soloed level clears its solo (picture not blank)');
  ok(await pg.evaluate(() => document.getElementById('l3hide').value) === await pg.evaluate(() => document.getElementById('l2hide').value), 'duplicate copies the hides of the level it copies');
  // save: hides kept, solo not
  await reset(); await btn('A2', 'hd'); await btn('O1', 'so'); await pg.waitForTimeout(1500);
  await pg.reload(); await pg.waitForSelector('.addlvl', { state: 'attached' }); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => document.querySelector('.nb[data-id="A2"] .hd').classList.contains('on') && document.getElementById('l2hide').value === '2'), 'hides survive a refresh');
  ok(await pg.evaluate(() => document.querySelectorAll('#nodes .nb .so.on').length) === 0, 'solo does not survive a refresh');
  // layout
  for (const [w, h] of [[1440, 900], [1920, 1080], [1280, 800]]) {
    await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(500);
    await pg.waitForTimeout(600);
    const L = await pg.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { st: r('#stage'), no: r('#nodes'), se: r('#settings'), vw: innerWidth, g: r('#nodes .ngrid'), ma: r('#nodes .master'), side: r('#side .row') }; });
    ok(L.g.left >= L.no.left && L.ma.right <= L.no.right + 1, `${w}x${h}: whole node graph fits its column (Master right edge ${Math.round(L.ma.right)} <= ${Math.round(L.no.right)})`);
    ok(L.no.bottom <= L.side.top + 1 && L.se.bottom <= L.side.top + 1, `${w}x${h}: panels end above the style buttons`);
    const c = L.st.left + L.st.width / 2;
    ok(Math.abs(c - L.vw / 2) < 2 && L.no.right <= L.st.left + 1 && L.se.left >= L.st.right - 1, `${w}x${h}: picture centred (${Math.round(c)} of ${L.vw / 2}), nodes left of it, settings right of it`);
    if (w === 1440) await pg.screenshot({ path: SP + '/studio_1440.png' });
  }
  const ph = await b.newPage({ ...devices['iPhone 13'] }); await ph.goto('http://localhost:8871/?view=flines&nocam'); await ph.waitForSelector('.addlvl', { state: 'attached' }); await ph.waitForTimeout(1200);
  const P = await ph.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { st: r('#stage'), no: r('#nodes'), se: r('#settings') }; });
  ok(P.no.top >= P.st.bottom - 1 && P.se.top >= P.no.bottom - 1, 'phone: picture, then nodes, then settings (stacked)');
  await ph.screenshot({ path: SP + '/studio_phone.png', fullPage: true });
  console.log(`\n${pass} passed, ${fail} failed; page errors: ${errs.join(' | ') || 'none'}`); await b.close(); srv.close();
})();
