// Exercise the actual Main Rack/Patch face and its Wasm route acknowledgement.
// The Chromium process is headless, muted, and isolated from desktop audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-rack-browser-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  await page.locator('#rack-view-switch').click();
  assert.equal(await page.locator('.main-patch-face:visible').count(), 6);
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 7);
  assert.equal(await page.locator('.main-rack-wire').count(), 7);
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  const wires = () => page.locator('.main-rack-wire').evaluateAll(elements => elements.map(element => element.getAttribute('d')).sort());
  const initial = await wires();
  const from = await page.locator('.main-patch-port[data-module="oscillator"][data-port="out"]').boundingBox();
  const to = await page.locator('.main-patch-port[data-module="fx1"][data-port="in"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(previous => JSON.stringify([...document.querySelectorAll('.main-rack-wire')]
    .map(element => element.getAttribute('d')).sort()) !== JSON.stringify(previous), initial);
  await page.screenshot({ path: new URL('../web/public/main-audio-patch-browser.png', import.meta.url).pathname });
  await page.locator('#save-session').click();
  assert.match(await page.locator('#status').textContent(), /cable edits are not yet in the Main session format/);
  await page.locator('.main-patch-port[data-module="filter"][data-port="out"]').click();
  await page.locator('.main-patch-port[data-module="fx1"][data-port="in"]').click();
  await page.waitForFunction(previous => JSON.stringify([...document.querySelectorAll('.main-rack-wire')]
    .map(element => element.getAttribute('d')).sort()) === JSON.stringify(previous), initial);
  await page.locator('.main-patch-port[data-module="fx1"][data-port="in"]').click({ button: 'right' });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 6);
  await page.locator('#save-session').click();
  assert.match(await page.locator('#status').textContent(), /cable edits are not yet in the Main session format/);
  await page.locator('.main-patch-port[data-module="filter"][data-port="out"]').click();
  await page.locator('.main-patch-port[data-module="fx1"][data-port="in"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 7);
  const download = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const saved = await download;
  assert.match(saved.suggestedFilename(), /\.json$/);
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html?editor=1`);
  assert.equal(await page.locator('#rack-view-switch').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ patchFaces: 6, wires: 7, wasmRouteAccepted: true, unpatchAccepted: true,
    editBlocksIncompleteSession: true, defaultRouteSaves: true, pageErrors: errors.length }));
} finally {
  await browser.close();
}
