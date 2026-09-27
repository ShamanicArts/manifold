// Check the blend workbench's bundle download, fixed-graph guard, and older state import.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=main-sample-blend`);
  await page.locator('#sine-target-mode').selectOption('2');
  await page.locator('#sine-waveform').selectOption('6');
  await page.locator('#sine-pulse-width').fill('0.32');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main-state-export').click();
  const bundle = JSON.parse((await readFile(await (await downloadPromise).path())).toString());
  assert.equal(bundle.format, 'manifold.project');
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.projectId, 'manifold.main-sample-blend-study');
  assert.equal(bundle.snapshot.schemaVersion, 11);
  assert.equal(bundle.snapshot.target.pulseWidth, .32);

  await page.locator('#sine-pulse-width').fill('0.5');
  await page.locator('#main-state-file').setInputFiles([{
    name: 'main-blend-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('#sine-pulse-width').inputValue(), '0.32');

  const changed = structuredClone(bundle);
  changed.signal.nodes[0].type = 'unknown-node';
  await page.locator('#main-state-file').setInputFiles([{
    name: 'changed-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)),
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.includes('Project graph does not match'));
  assert.equal(await page.locator('#sine-pulse-width').inputValue(), '0.32');

  await page.locator('#sine-pulse-width').fill('0.5');
  await page.locator('#main-state-file').setInputFiles([{
    name: 'older-main-blend-state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle.snapshot)),
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('#sine-pulse-width').inputValue(), '0.32');
  assert.deepEqual(errors, []);
  console.log('Main blend project browser: bundle save/reopen, changed graph rejection, older bare state import passed');
} finally {
  await browser.close();
}
