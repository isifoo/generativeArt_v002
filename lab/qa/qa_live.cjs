const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => { const b = await chromium.launch();
  for (const [name, opt] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opt); const pg = await ctx.newPage(); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('https://isifoo.github.io/generativeArt_v002/?view=flines&nocam&t=' + Date.now()); await pg.waitForTimeout(6000);
    await pg.screenshot({ path: `${SP}/live_${name}.png` });
    console.log(name, await pg.evaluate(() => ({ ver: document.getElementById('ver').textContent, nb: document.querySelectorAll('#nodes .nb').length, nodesHidden: document.getElementById('nodes').hidden, firstNb: (() => { const e = document.querySelector('#nodes .nb'); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() })), errs.join('|') || 'no errors');
    await ctx.close(); }
  await b.close(); })();
