// Exercise the original ATV face and its typed output cable with muted Wasm audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-atv-rack-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.equal(await page.locator('.rack-atv-primary').evaluate(element => element.style.top), '465px');
  assert.equal(await page.locator('.rack-atv-primary .main-patch-face').count(), 1);
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 360; });
  await page.screenshot({ path: new URL('../web/public/main-atv-rack-face.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 8);
  assert.equal(await page.locator('.main-rack-wire').count(), 8);
  const output = page.locator('.rack-atv-primary .main-patch-port[data-port="out"][data-direction="output"]');
  const cutoff = page.locator('.rack-filter .main-patch-port[data-port="cutoff"][data-direction="input"]');
  assert.equal(await output.isEnabled(), true);
  await output.click();
  await cutoff.click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 9);
  assert.equal(await page.locator('#mod-source').inputValue(), '4');
  assert.equal(await page.locator('#mod-target').inputValue(), '22');
  assert.equal(await page.locator('#mod-enabled').isChecked(), true);
  await page.screenshot({ path: new URL('../web/public/main-atv-rack-filter-port.png', import.meta.url).pathname });
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 300; });
  await page.screenshot({ path: new URL('../web/public/main-atv-rack-patch.png', import.meta.url).pathname });
  const download = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const saved = await download;
  const bytes = await readFile(await saved.path());
  const session = JSON.parse(bytes);
  assert.equal(session.rackDocument.modules.length, 8);
  assert.ok(session.rackDocument.connections.some(edge => edge.from.moduleId === 'atv1'
    && edge.to.moduleId === 'filter' && edge.to.portId === 'cutoff'));
  assert.ok(session.rackDocument.connections.some(edge => edge.from.moduleId === 'lfo1'
    && edge.to.moduleId === 'atv1' && edge.to.portId === 'in'));
  assert.deepEqual([session.rack.lfos[0].route.source, session.rack.lfos[0].route.target,
    session.rack.lfos[0].route.enabled], [4, 22, true]);
  await writeFile(new URL('../web/public/main-atv-rack-saved-session.json', import.meta.url), bytes);
  await cutoff.click({ button: 'right' });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 8);
  await page.locator('#open-session').setInputFiles({ name: 'atv-rack.json',
    mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 9);
  assert.equal(await page.locator('#mod-source').inputValue(), '4');
  await page.locator('#atv-port').selectOption('1');
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 8);
  const inverseDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const inverse = JSON.parse(await readFile(await (await inverseDownload).path()));
  assert.equal(inverse.rack.atv.port, 1);
  assert.ok(inverse.rackDocument.connections.every(edge => edge.to.moduleId !== 'atv1'));
  await page.locator('#atv-port').selectOption('0');
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 9);
  const older = await readFile(new URL('../web/public/main-filter-compact-saved-session.json', import.meta.url));
  await page.locator('#open-session').setInputFiles({ name: 'older-six-shells.json',
    mimeType: 'application/json', buffer: older });
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.dataset.rackWidth === '1'
    && document.querySelector('#status')?.textContent.includes('Opened the four-layer Main session'));
  assert.equal(await page.locator('.rack-atv-primary .main-patch-face').count(), 1);
  assert.equal(await page.locator('.rack-atv-primary').evaluate(element => Number.parseInt(element.style.top)), 465);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  const head = await page.locator('.rack-atv-primary .rack-shell-head').boundingBox();
  assert.equal(await page.evaluate(({ x, y }) =>
    document.elementFromPoint(x, y)?.closest('.rack-atv-primary') !== null,
  { x: head.x + 115, y: head.y + 6 }), true);
  await page.mouse.move(head.x + 115, head.y + 6);
  await page.mouse.down();
  await page.mouse.move(head.x - 121, head.y + 6, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.rack-atv-primary')?.style.left === '0px'
    && document.querySelector('.rack-lfo-primary')?.style.left === '236px');
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 8);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  assert.match(await page.locator('.main-rack-wire-cv').getAttribute('d'), / L /);
  await page.screenshot({ path: new URL('../web/public/main-atv-rack-reflow.png', import.meta.url).pathname });
  const movedDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const movedBytes = await readFile(await (await movedDownload).path());
  const moved = JSON.parse(movedBytes);
  assert.deepEqual(moved.rackDocument.modules.filter(module => ['atv1', 'lfo1'].includes(module.id))
    .map(module => [module.id, module.row, module.col]), [['lfo1', 2, 1], ['atv1', 2, 0]]);
  await page.locator('#open-session').setInputFiles({ name: 'reflowed-atv.json',
    mimeType: 'application/json', buffer: movedBytes });
  await page.waitForFunction(() => document.querySelector('.rack-atv-primary')?.style.left === '0px'
    && document.querySelector('#status')?.textContent.includes('Opened the four-layer Main session'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ atvFace: true, liveCable: true, rustWorklet: true,
    savedRoute: true, reopenedCable: true, inputSelectorSync: true,
    oldSixShellImport: true, dragReflow: true, reflowReopened: true, pageErrors: 0 }));
} finally {
  await browser.close();
}
