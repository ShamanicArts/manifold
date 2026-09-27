// Headless browser workflow: prepare, play, save and reopen per-voice motion.
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
  await page.waitForFunction(() => !document.querySelector('#sine-use-frame').disabled);
  await page.locator('#sine-follow-playback').check();
  await page.locator('#sine-temporal-speed').fill('1.5');
  await page.locator('#sine-target-mode').selectOption('1');
  await page.locator('[data-parameter-id="6"] select').selectOption('4');
  await page.locator('#sine-use-frame').click();
  await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('256 prepared'));
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#keyboard button').first().click();
  await page.waitForTimeout(350);
  assert.ok((await page.locator('#status').textContent()).startsWith('Audio running'));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main-state-export').click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  const state = JSON.parse(bytes.toString());
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.parameters['blend-mode'], 4);
  assert.equal(state.targetControls.followPlayback, true);
  assert.equal(state.targetControls.speed, 1.5);
  await page.locator('#audio-toggle').click();
  await page.locator('#main-state-file').setInputFiles([{
    name: 'main-temporal-state.json', mimeType: 'application/json', buffer: bytes,
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
  await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('256 prepared'));
  assert.equal(await page.locator('#sine-follow-playback').isChecked(), true);
  assert.equal(await page.locator('#sine-temporal-speed').inputValue(), '1.5');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#keyboard button').first().click();
  await page.waitForTimeout(350);
  assert.deepEqual(errors, []);
  assert.ok((await page.locator('#status').textContent()).startsWith('Audio running'));
  console.log('Main temporal browser: Add mode, prepared follow table, worklet note, v3 state save/reopen, automatic table restore passed');
} finally {
  await browser.close();
}
