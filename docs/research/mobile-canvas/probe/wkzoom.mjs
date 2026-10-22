// #221 research probe: frame viewport width under the board's CSS zoom, WebKit vs Chromium.
import { webkit, chromium, devices } from 'playwright';
import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
for (const [n, t, d] of [['webkit', webkit, devices['iPhone 13']], ['chromium', chromium, devices['Pixel 7']]]) {
  const b = await t.launch(); const p = await (await b.newContext({ ...d })).newPage();
  await p.goto(pathToFileURL(resolve('c223/prototypes/canvas/index.html')).href); await p.waitForTimeout(2500);
  const widths = async () => { const w = []; for (const f of p.frames().slice(1)) { try { w.push(await f.evaluate(() => location.href.includes('variants') ? innerWidth : null)); } catch {} } return w.filter((x) => x != null).slice(0, 3); };
  const zoom = await p.evaluate(() => getComputedStyle(document.getElementById('stage')).zoom);
  const at = await widths();
  await p.evaluate(() => { document.getElementById('stage').style.zoom = '1'; }); await p.waitForTimeout(1000);
  console.log(n, b.version(), 'stage zoom', zoom, 'frame innerWidth', at, '-> at zoom 1', await widths());
  await b.close();
}
