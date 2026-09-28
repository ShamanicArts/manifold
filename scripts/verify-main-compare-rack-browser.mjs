// Exercise Compare's real gate/trigger outputs and saved rack placement in muted Chromium.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-compare-rack-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.equal(await page.locator('.rack-compare-primary').evaluate(element => element.style.top), '465px');
  assert.equal(await page.locator('.rack-compare-primary .main-patch-face').count(), 1);
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 370; });
  await page.screenshot({ path: new URL('../web/public/main-compare-rack-face.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  const cutoff = page.locator('.rack-filter .main-patch-port[data-port="cutoff"][data-direction="input"]');
  const gate = page.locator('.rack-compare-primary .main-patch-port[data-port="gate"][data-direction="output"]');
  const trig = page.locator('.rack-compare-primary .main-patch-port[data-port="trig"][data-direction="output"]');
  assert.equal(await gate.isEnabled(), true);
  assert.equal(await trig.isEnabled(), true);
  await gate.click(); await cutoff.click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  assert.deepEqual([await page.locator('#mod-source').inputValue(), await page.locator('#mod-target').inputValue()], ['8', '22']);
  await trig.click(); await cutoff.click();
  await page.waitForFunction(() => document.querySelector('#mod-source')?.value === '9');
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 330; });
  await page.screenshot({ path: new URL('../web/public/main-compare-rack-patch.png', import.meta.url).pathname });
  const firstDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const first = await readFile(await (await firstDownload).path());
  const routed = JSON.parse(first);
  assert.equal(routed.rackDocument.modules.length, 11);
  assert.ok(routed.rackDocument.connections.some(edge => edge.from.moduleId === 'compare1'
    && edge.from.portId === 'trig' && edge.to.moduleId === 'filter' && edge.to.portId === 'cutoff'));
  assert.ok(routed.rackDocument.connections.some(edge => edge.from.moduleId === 'lfo1'
    && edge.to.moduleId === 'compare1' && edge.to.portId === 'in'));
  await page.locator('#compare-source').selectOption('18');
  const secondDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const second = await readFile(await (await secondDownload).path());
  const selected = JSON.parse(second);
  assert.equal(selected.rack.compare.source, 18);
  assert.ok(selected.rackDocument.connections.some(edge => edge.from.moduleId === 'sample_hold1'
    && edge.from.portId === 'out' && edge.to.moduleId === 'compare1' && edge.to.portId === 'in'));
  await page.locator('#open-session').setInputFiles({ name: 'selected-compare.json',
    mimeType: 'application/json', buffer: second });
  await page.waitForFunction(() => document.querySelector('#compare-source')?.value === '18');
  await page.locator('#rack-view-switch').click();
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  const head = await page.locator('.rack-compare-primary .rack-shell-head').boundingBox();
  await page.mouse.move(head.x + 115, head.y + 6); await page.mouse.down();
  await page.mouse.move(head.x - 829, head.y + 6, { steps: 14 });
  assert.equal(await page.locator('.rack-lfo-primary').evaluate(element => element.style.left), '236px');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.rack-compare-primary')?.style.left === '0px');
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  await page.screenshot({ path: new URL('../web/public/main-compare-rack-reflow.png', import.meta.url).pathname });
  const movedDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const movedBytes = await readFile(await (await movedDownload).path());
  const moved = JSON.parse(movedBytes);
  assert.deepEqual(moved.rackDocument.modules.filter(module =>
    ['lfo1', 'atv1', 'slew1', 'sample_hold1', 'compare1'].includes(module.id))
    .map(module => [module.id, module.row, module.col]),
  [['lfo1', 2, 1], ['atv1', 2, 2], ['slew1', 2, 3], ['sample_hold1', 2, 4], ['compare1', 2, 0]]);
  await writeFile(new URL('../web/public/main-compare-rack-saved-session.json', import.meta.url), movedBytes);
  await page.locator('#open-session').setInputFiles({ name: 'moved-compare.json',
    mimeType: 'application/json', buffer: movedBytes });
  await page.waitForFunction(() => document.querySelector('.rack-compare-primary')?.style.left === '0px'
    && document.querySelector('#status')?.textContent.includes('Opened the four-layer Main session'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ compareFace: true, gateAndTrig: true, rustWorklet: true,
    inputSelectorSync: true, dragReflow: true, savedAndReopened: true, pageErrors: 0 }));
} finally { await browser.close(); }
