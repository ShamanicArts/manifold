// Exercise the selectable original Add wavetable in the served AudioWorklet.
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
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=main-voice-bank`);
  await page.locator('[data-parameter-id="0"] select').selectOption('2');
  await page.locator('[data-parameter-id="6"] select').selectOption('4');
  await page.locator('[data-parameter-id="19"] select').selectOption('1');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#keyboard button').first().click();
  await page.waitForTimeout(300);
  assert.ok((await page.locator('#status').textContent()).startsWith('Audio running'));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main-state-export').click();
  const bundle = JSON.parse((await readFile(await (await downloadPromise).path())).toString());
  assert.equal(bundle.format, 'manifold.project');
  const state = bundle.snapshot;
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.parameters['add-wave-source'], 1);
  await page.locator('#audio-toggle').click();
  await page.locator('#main-state-file').setInputFiles([{
    name: 'main-add-wave-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('[data-parameter-id="19"] select').inputValue(), '1');
  assert.deepEqual(errors, []);
  console.log('Main Add wave browser: square original wavetable, live worklet, project bundle save/reopen passed');
} finally {
  await browser.close();
}
