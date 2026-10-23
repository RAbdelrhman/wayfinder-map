import { _electron as electron } from 'playwright-core';
import { exercise } from './flow.mjs';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['docs/verification/244/desktop-fixture.cjs'], env });
let page;
try {
  page = await app.firstWindow();
  await page.waitForURL('http://127.0.0.1:*/', { timeout: 30000 });
  const base = new URL(page.url()).origin;
  console.log('DESKTOP', base);
  await exercise(page, base, 'desktop');
} catch (error) { console.error(error); process.exitCode = 1; if (page !== undefined) { console.log(await page.locator('body').innerText()); await page.screenshot({ path: '.shots/244/desktop-failure.png' }); } }
finally { await app.close(); }
