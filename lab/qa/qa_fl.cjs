const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/generativeart_v002', OUT = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = /\.mp4$/.test(p) ? '/tmp/clip' + p : path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); if (q.method === 'HEAD') return r.end(); fs.createReadStream(f).pipe(r); }).listen(8768);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  for (const clip of ['franklin', 'portrait']) {
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8768/?view=flines&nocam'); await pg.waitForSelector('#flsp', { state: 'attached' });
    await pg.evaluate((c) => { const v = document.querySelector('#vid'); v.src = c + '.mp4'; v.loop = true; v.play(); }, clip);
    await pg.waitForTimeout(4000);
    const png = await pg.evaluate(() => document.querySelector('#cv').toDataURL('image/png')); fs.writeFileSync(`${OUT}/fl_${clip}.png`, Buffer.from(png.split(',')[1], 'base64'));
    console.log(clip, 'errors:', errs.join(' | ') || 'none'); await pg.close();
  }
  // folding
  const pg = await ctx.newPage(); await pg.goto('http://localhost:8768/?view=flines&nocam'); await pg.waitForSelector('#flsp', { state: 'attached' });
  await pg.click('#setbtn'); await pg.waitForTimeout(700);
  const visible = () => pg.evaluate(() => ['flsp', 'flam', 'flc'].map((id) => document.getElementById(id).offsetParent !== null));
  console.log('before fold (Lines, Curves, Tone sliders visible):', JSON.stringify(await visible()));
  await pg.click('#sliders h2.grp >> text=Curves (fractal noise)'); await pg.waitForTimeout(200);
  console.log('after folding Curves:', JSON.stringify(await visible()));
  await pg.reload(); await pg.waitForSelector('#flsp', { state: 'attached' }); await pg.waitForTimeout(800);
  console.log('after reload:', JSON.stringify(await visible()));
  await pg.click('#sliders h2.grp >> text=Curves (fractal noise)'); await pg.waitForTimeout(200);
  console.log('unfolded again:', JSON.stringify(await visible()));
  await pg.screenshot({ path: `${OUT}/fl_panel.png`, clip: { x: 960, y: 0, width: 480, height: 700 } });
  for (const v of ['ishihara', 'dollar2']) {
    const p2 = await ctx.newPage(); const e2 = []; p2.on('pageerror', (e) => e2.push(e.message));
    await p2.goto(`http://localhost:8768/?view=${v}&nocam`); await p2.waitForTimeout(2500);
    console.log(v, 'groups:', await p2.$$eval('#sliders h2.grp', (a) => a.length), 'sliders:', await p2.$$eval('#sliders .sl', (a) => a.length), 'errors:', e2.join(' | ') || 'none'); await p2.close();
  }
  await b.close(); srv.close();
})();
