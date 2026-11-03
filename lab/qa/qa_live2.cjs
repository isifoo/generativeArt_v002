const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.goto('https://isifoo.github.io/generativeArt_v002/?view=linesv2&t=' + Date.now()); await pg.waitForTimeout(4000);
  const st = () => pg.evaluate(() => { const r = document.getElementById('v2a'); return { range: r.min + ' .. ' + r.max, box: r.parentElement.querySelector('.onoff input').checked, boxesOn: document.querySelectorAll('#sliders .onoff input:checked').length, ver: document.getElementById('ver').textContent }; });
  console.log('live, fresh:', JSON.stringify(await st()));
  await pg.evaluate(() => document.getElementById('v2a').parentElement.querySelector('.onoff input').click()); console.log('live, box ticked:', JSON.stringify(await st()));
  await b.close(); })();
