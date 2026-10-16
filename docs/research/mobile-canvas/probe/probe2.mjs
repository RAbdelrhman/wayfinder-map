// #221 research probe. Run from a scratch folder with `npm i playwright`; fetch.mjs <branch> <dir> first.
import { chromium, webkit, devices } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = [];
for (const [ename, type, dev] of [['ios', webkit, devices['iPhone 13']], ['android', chromium, devices['Pixel 7']]]) {
  const browser = await type.launch();
  for (const c of ['c223', 'c207']) {
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(resolve(`${c}/prototypes/canvas/index.html`)).href);
    await page.waitForTimeout(2000);
    await page.locator('button.hit').first().click();
    await page.waitForTimeout(1500);
    const notes = page.getByRole('button', { name: /notes/i }).first();
    const notesOpen = await page.evaluate(() => [...document.querySelectorAll('.side-note')].some((n) => n.getClientRects().length && !n.hidden));
    let notesTappable = null; if (notesOpen) { try { await notes.click({ timeout: 3000 }); notesTappable = true; } catch { notesTappable = false; await page.keyboard.press('n'); } }
    await page.waitForTimeout(800);
    await page.screenshot({ path: `shots/${c}-${ename}-present-nonotes.png` });
    const info = await page.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => x.getClientRects().length && !x.dataset.frame);
      if (!f) return null;
      const r = f.getBoundingClientRect();
      return { frameCssWidth: Math.round(r.width), frameStyleWidth: f.style.width, transform: f.style.transform || getComputedStyle(f).transform, parentScroll: [f.parentElement.scrollWidth, f.parentElement.clientWidth] };
    });
    let pinch = null;
    if (ename === 'android') {
      const cdp = await ctx.newCDPSession(page);
      const before = await page.evaluate(() => visualViewport.scale);
      await cdp.send('Input.synthesizePinchGesture', { x: 200, y: 400, scaleFactor: 2, relativeSpeed: 800 });
      await page.waitForTimeout(500);
      pinch = { before, after: await page.evaluate(() => visualViewport.scale), canvasZoom: await page.evaluate(() => document.getElementById('zoom-fit')?.textContent) };
    }
    out.push({ c, ename, notesOpenByDefault: notesOpen, notesTappable, info, pinch });
    await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(out, null, 1));
