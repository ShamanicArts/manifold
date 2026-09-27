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
  await page.locator('#sine-target-mode').selectOption('2');
  await page.locator('#sine-waveform').selectOption('6');
  await page.locator('#sine-pulse-width').fill('0.18');
  await page.locator('[data-parameter-id="6"] select').selectOption('4');
  await page.locator('#sine-use-frame').click();
  await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('source frames interpolate'));
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#keyboard button').first().click();
  await page.waitForTimeout(350);
  assert.ok((await page.locator('#status').textContent()).startsWith('Audio running'));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main-state-export').click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  const bundle = JSON.parse(bytes.toString());
  assert.equal(bundle.format, 'manifold.project');
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.projectId, 'manifold.main-voice-bank-study');
  assert.ok(bundle.signal.nodes.length > 0);
  const state = bundle.snapshot;
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.parameters['blend-mode'], 4);
  assert.equal(state.targetControls.followPlayback, true);
  assert.equal(state.targetControls.speed, 1.5);
  assert.equal(state.targetControls.pulseWidth, .18);
  await page.locator('#audio-toggle').click();
  await page.locator('#main-state-file').setInputFiles([{
    name: 'main-temporal-state.json', mimeType: 'application/json', buffer: bytes,
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
  await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('source frames interpolate'));
  assert.equal(await page.locator('#sine-follow-playback').isChecked(), true);
  assert.equal(await page.locator('#sine-temporal-speed').inputValue(), '1.5');
  assert.equal(await page.locator('#sine-pulse-width').inputValue(), '0.18');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#keyboard button').first().click();
  await page.waitForTimeout(350);
  await page.locator('[data-parameter-id="6"] select').selectOption('5');
  await page.locator('#sine-target-mode').selectOption('3');
  await page.locator('#sine-waveform').selectOption('1');
  await page.locator('#sine-morph-amount').fill('0.25');
  await page.locator('#sine-morph-depth').fill('0.25');
  await page.locator('#sine-morph-curve').selectOption('0');
  await page.locator('#sine-use-frame').click();
  await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('source frames interpolate'));
  await page.waitForTimeout(250);
  const morphDownloadPromise = page.waitForEvent('download');
  await page.locator('#main-state-export').click();
  const morphDownload = await morphDownloadPromise;
  const morphBytes = await readFile(await morphDownload.path());
  const morphBundle = JSON.parse(morphBytes.toString());
  const morphState = morphBundle.snapshot;
  assert.equal(morphState.targetControls.morphAmount, .25);
  assert.equal(morphState.targetControls.morphDepth, .25);
  assert.equal(morphState.targetControls.morphCurve, 0);
  await page.locator('#audio-toggle').click();
  await page.locator('#main-state-file').setInputFiles([{
    name: 'main-morph-state.json', mimeType: 'application/json', buffer: morphBytes,
  }]);
  await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('#sine-morph-depth').inputValue(), '0.25');
  assert.equal(await page.locator('#sine-morph-curve').inputValue(), '0');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  assert.deepEqual(errors, []);
  assert.ok((await page.locator('#status').textContent()).startsWith('Audio running'));
  console.log('Main temporal browser: raw Add pulse width and Morph depth/curve, worklet note, project bundle save/reopen passed');
} finally {
  await browser.close();
}
