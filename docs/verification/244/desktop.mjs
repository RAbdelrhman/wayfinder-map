import { _electron as electron } from 'playwright-core';
import { exercise } from './flow.mjs';
import { copyFile, mkdir } from 'node:fs/promises';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['docs/verification/244/desktop-fixture.cjs'], env });
const page = await app.firstWindow();
try {
  await page.waitForURL('http://127.0.0.1:*/', { timeout: 30000 });
  const base = new URL(page.url()).origin;
  console.log('DESKTOP', base);
  await exercise(page, base, 'desktop');
} catch (error) { console.error(error); console.log(await page.locator('body').innerText()); await page.screenshot({ path: '.shots/244/desktop-failure.png' }); process.exitCode = 1; }
finally { await app.close(); }
