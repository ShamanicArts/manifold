// Exercise the packaged graph editor gesture without opening a DAW window.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__captureMessages = [];
    window.ipc = { postMessage(message) { window.__captureMessages.push(JSON.parse(message)); } };
  });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/graph-module.html?editor`);
  await page.evaluate(() => window.manifoldEditorReceive({
    schemaVersion: 1,
    id: 'manifold.graph',
    captureGesture: true,
    nodes: [
      { id: 5, type: 'sample-instrument' },
      { id: 6, type: 'retrospective-capture' },
      { id: 10, type: 'retrospective-capture' },
    ],
    controls: [],
  }));
  assert.equal(await page.locator('#graph-capture').isVisible(), true);
  assert.equal(await page.locator('#graph-capture-source option').count(), 2);
  await page.locator('#graph-capture-source').selectOption('10');
  await page.locator('#graph-capture-seconds').fill('0.2');
  await page.locator('#graph-capture-go').click();
  assert.equal(await page.locator('#graph-capture-go').isDisabled(), true);
  const start = await page.evaluate(() => window.__captureMessages.find((message) => message.kind === 'capture-start'));
  assert.deepEqual(start, { version: 1, kind: 'capture-start', nodeId: 10, seconds: 0.2 });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__captureMessages.some((message) => message.kind === 'capture-finish')), false);
  await page.evaluate(() => window.manifoldEditorStatus('Freezing the selected source…'));
  await page.waitForFunction(() => window.__captureMessages.some((message) => message.kind === 'capture-finish'));
  const finish = await page.evaluate(() => window.__captureMessages.find((message) => message.kind === 'capture-finish'));
  assert.deepEqual(finish, { version: 1, kind: 'capture-finish', instrumentId: 5 });
  await page.evaluate(() => window.manifoldCaptureResult(true, 'Captured source published.'));
  assert.equal(await page.locator('#graph-capture-go').isEnabled(), true);
  assert.match(await page.locator('#graph-status').textContent(), /Captured source published/);
  await page.locator('#graph-capture-mode').selectOption('bars');
  await page.locator('#graph-capture-seconds').fill('0.5');
  await page.locator('#graph-capture-go').click();
  const barStart = await page.evaluate(() => window.__captureMessages.filter((message) => message.kind === 'capture-start').at(-1));
  assert.deepEqual(barStart, { version: 1, kind: 'capture-start', nodeId: 10, bars: 0.5 });
  await page.evaluate(() => window.manifoldCaptureResult(false, 'Host tempo unavailable.'));
  assert.deepEqual(errors, []);
  console.log('Graph editor capture: seconds and bars requests, result poll, and completion passed');
} finally {
  await browser.close();
}
