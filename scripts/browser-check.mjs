import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.env.KITCHEN_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('artifacts', { recursive: true });
const ready = () => page.waitForFunction(() => !!window.__kitchen, null, { timeout: 60000 });
const settled = () => page.waitForFunction(
  () => window.__kitchen.view.diagnostics().movers.every(m => m.progress === m.target), null, { timeout: 60000 });
const opened = () => page.evaluate(() => window.__kitchen.view.diagnostics().movers.filter(m => m.target === 1).map(m => m.id));

try {
  await page.goto(baseUrl);
  await ready();
  assert.equal(await page.locator('#notice').isVisible(), false, 'the default layout has no warnings');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/closed.png' });

  // A real click on one door opens only that door; clicking the open door closes it.
  const doorPoint = () => page.evaluate(() => window.__kitchen.view.screenPoint('B2-door-1'));
  await page.mouse.click(...await doorPoint());
  await settled();
  assert.deepEqual(await opened(), ['B2-door-1']);
  await page.screenshot({ path: 'artifacts/one-door.png' });
  await page.mouse.click(...await doorPoint());
  await settled();
  assert.deepEqual(await opened(), []);

  await page.click('#open-all');
  await settled();
  assert.equal((await opened()).length, (await page.evaluate(() => window.__kitchen.model.movers.length)));
  await page.screenshot({ path: 'artifacts/open.png' });

  await page.click('[data-tab=order]');
  assert.equal(await page.locator('#order table').count(), 3);
  await page.screenshot({ path: 'artifacts/order.png' });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  assert.equal(download.suggestedFilename(), 'kitchen-order.csv');

  // An angled wall and an island use the same layout and cabinet code.
  await page.goto(`${baseUrl}/?design=examples/angled-island.json`);
  await ready();
  await page.click('#open-all');
  await settled();
  await page.screenshot({ path: 'artifacts/angled-island.png' });
  // Drag down to orbit to a top view of the plan.
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(640, 750, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/angled-island-top.png' });
  assert.deepEqual(errors, []);
  console.log('Browser check passed; screenshots in artifacts/.');
} finally {
  await browser.close();
}
