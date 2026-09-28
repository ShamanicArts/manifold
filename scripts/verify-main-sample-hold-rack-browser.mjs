// Exercise the original Sample Hold face and its prepared Rust cables with muted Wasm audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-sample-hold-rack-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.equal(await page.locator('.rack-sample-hold-primary').evaluate(element => element.style.top), '465px');
  assert.equal(await page.locator('.rack-sample-hold-primary .main-patch-face').count(), 1);
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 370; });
  await page.screenshot({ path: new URL('../web/public/main-sample-hold-rack-face.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 11);
  const cutoff = page.locator('.rack-filter .main-patch-port[data-port="cutoff"][data-direction="input"]');
  const output = page.locator('.rack-sample-hold-primary .main-patch-port[data-port="out"][data-direction="output"]');
  const inverse = page.locator('.rack-sample-hold-primary .main-patch-port[data-port="inv"][data-direction="output"]');
  assert.equal(await output.isEnabled(), true);
  assert.equal(await inverse.isEnabled(), true);
  await output.click(); await cutoff.click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  assert.deepEqual([await page.locator('#mod-source').inputValue(), await page.locator('#mod-target').inputValue()], ['6', '22']);
  await inverse.click(); await cutoff.click();
  await page.waitForFunction(() => document.querySelector('#mod-source')?.value === '7');
  assert.equal(await page.locator('.main-rack-wire').count(), 12);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 330; });
  await page.screenshot({ path: new URL('../web/public/main-sample-hold-rack-patch.png', import.meta.url).pathname });
  const firstDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const first = await readFile(await (await firstDownload).path());
  const routed = JSON.parse(first);
  assert.equal(routed.rackDocument.modules.length, 10);
  assert.ok(routed.rackDocument.connections.some(edge => edge.from.moduleId === 'sample_hold1'
    && edge.from.portId === 'inv' && edge.to.moduleId === 'filter' && edge.to.portId === 'cutoff'));
  assert.ok(routed.rackDocument.connections.some(edge => edge.from.moduleId === 'lfo1'
    && edge.from.portId === 'eoc' && edge.to.moduleId === 'sample_hold1' && edge.to.portId === 'trig'));
  await page.locator('#sample-hold-source').selectOption('17');
  await page.locator('#sample-hold-trigger-source').selectOption('4');
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 11);
  const secondDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const second = await readFile(await (await secondDownload).path());
  const selected = JSON.parse(second);
  assert.equal(selected.rack.sampleHold.source, 17);
  assert.equal(selected.rack.sampleHold.triggerSource, 4);
  assert.ok(selected.rackDocument.connections.some(edge => edge.from.moduleId === 'slew1'
    && edge.to.moduleId === 'sample_hold1' && edge.to.portId === 'in'));
  assert.ok(selected.rackDocument.connections.every(edge => edge.to.moduleId !== 'sample_hold1'
    || edge.to.portId !== 'trig'));
  await page.locator('#open-session').setInputFiles({ name: 'selected-sample-hold.json',
    mimeType: 'application/json', buffer: second });
  await page.waitForFunction(() => document.querySelector('#sample-hold-source')?.value === '17'
    && document.querySelector('#sample-hold-trigger-source')?.value === '4');
  await page.locator('#rack-view-switch').click();
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  const head = await page.locator('.rack-sample-hold-primary .rack-shell-head').boundingBox();
  await page.mouse.move(head.x + 115, head.y + 6); await page.mouse.down();
  await page.mouse.move(head.x - 593, head.y + 6, { steps: 12 });
  assert.equal(await page.locator('.rack-lfo-primary').evaluate(element => element.style.left), '236px');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.rack-sample-hold-primary')?.style.left === '0px');
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 11);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  await page.screenshot({ path: new URL('../web/public/main-sample-hold-rack-reflow.png', import.meta.url).pathname });
  const movedDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const movedBytes = await readFile(await (await movedDownload).path());
  const moved = JSON.parse(movedBytes);
  assert.deepEqual(moved.rackDocument.modules.filter(module =>
    ['lfo1', 'atv1', 'slew1', 'sample_hold1'].includes(module.id)).map(module => [module.id, module.row, module.col]),
  [['lfo1', 2, 1], ['atv1', 2, 2], ['slew1', 2, 3], ['sample_hold1', 2, 0]]);
  await writeFile(new URL('../web/public/main-sample-hold-rack-saved-session.json', import.meta.url), movedBytes);
  await page.locator('#open-session').setInputFiles({ name: 'moved-sample-hold.json',
    mimeType: 'application/json', buffer: movedBytes });
  await page.waitForFunction(() => document.querySelector('.rack-sample-hold-primary')?.style.left === '0px'
    && document.querySelector('#status')?.textContent.includes('Opened the four-layer Main session'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ sampleHoldFace: true, rustWorklet: true, outAndInv: true,
    triggerCable: true, inputSelectorSync: true, dragReflow: true, reflowReopened: true, pageErrors: 0 }));
} finally { await browser.close(); }
