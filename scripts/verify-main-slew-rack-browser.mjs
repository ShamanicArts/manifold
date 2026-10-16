// Verify Slew's original face, prepared Rust route, saved cables, and occupied-drop reflow.
// Chromium is headless, muted, and disconnected from physical audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-slew-rack-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.equal(await page.locator('.rack-slew-primary').evaluate(element => element.style.top), '465px');
  assert.equal(await page.locator('.rack-slew-primary .main-patch-face').count(), 1);
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 360; });
  await page.screenshot({ path: new URL('../web/public/main-slew-rack-face.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  const output = page.locator('.rack-slew-primary .main-patch-port[data-port="out"][data-direction="output"]');
  const cutoff = page.locator('.rack-filter .main-patch-port[data-port="cutoff"][data-direction="input"]');
  assert.equal(await output.isEnabled(), true);
  await output.click();
  await cutoff.click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  assert.equal(await page.locator('#mod-source').inputValue(), '5');
  assert.equal(await page.locator('#mod-target').inputValue(), '22');
  assert.equal(await page.locator('#mod-enabled').isChecked(), true);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 330; });
  await page.screenshot({ path: new URL('../web/public/main-slew-rack-patch.png', import.meta.url).pathname });

  const firstDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const first = await readFile(await (await firstDownload).path());
  const routed = JSON.parse(first);
  assert.equal(routed.rackDocument.modules.length, 11);
  assert.ok(routed.rackDocument.connections.some(edge => edge.from.moduleId === 'slew1'
    && edge.to.moduleId === 'filter' && edge.to.portId === 'cutoff'));
  assert.ok(routed.rackDocument.connections.some(edge => edge.from.moduleId === 'lfo1'
    && edge.to.moduleId === 'slew1' && edge.to.portId === 'in'));
  assert.deepEqual([routed.rack.lfos[0].route.source, routed.rack.lfos[0].route.target,
    routed.rack.lfos[0].route.enabled], [5, 22, true]);
  await cutoff.click({ button: 'right' });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  await page.locator('#open-session').setInputFiles({ name: 'routed-slew.json',
    mimeType: 'application/json', buffer: first });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);

  await page.locator('#slew-source').selectOption('16');
  await page.waitForFunction(() => {
    const wires = [...document.querySelectorAll('.main-rack-wire')];
    return wires.length === 13 && document.querySelector('#slew-source')?.value === '16';
  });
  const secondDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const second = await readFile(await (await secondDownload).path());
  const selected = JSON.parse(second);
  assert.equal(selected.rack.slew.source, 16);
  assert.ok(selected.rackDocument.connections.some(edge => edge.from.moduleId === 'atv1'
    && edge.to.moduleId === 'slew1' && edge.to.portId === 'in'));
  assert.ok(selected.rackDocument.connections.every(edge => edge.from.moduleId !== 'lfo1'
    || edge.to.moduleId !== 'slew1'));
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 750; });
  await page.screenshot({ path: new URL('../web/public/main-slew-rack-source.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  const head = await page.locator('.rack-slew-primary .rack-shell-head').boundingBox();
  await page.mouse.move(head.x + 115, head.y + 6);
  await page.mouse.down();
  await page.mouse.move(head.x - 357, head.y + 6, { steps: 12 });
  assert.equal(await page.locator('.rack-lfo-primary').evaluate(element => element.style.left), '236px');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.rack-slew-primary')?.style.left === '0px');
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 430; });
  await page.screenshot({ path: new URL('../web/public/main-slew-rack-reflow.png', import.meta.url).pathname });
  const movedDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const movedBytes = await readFile(await (await movedDownload).path());
  const moved = JSON.parse(movedBytes);
  assert.deepEqual(moved.rackDocument.modules.filter(module => ['lfo1', 'atv1', 'slew1'].includes(module.id))
    .map(module => [module.id, module.row, module.col]),
  [['lfo1', 2, 1], ['atv1', 2, 2], ['slew1', 2, 0]]);
  await writeFile(new URL('../web/public/main-slew-rack-saved-session.json', import.meta.url), movedBytes);
  await page.locator('#open-session').setInputFiles({ name: 'reflowed-slew.json',
    mimeType: 'application/json', buffer: movedBytes });
  await page.waitForFunction(() => document.querySelector('.rack-slew-primary')?.style.left === '0px'
    && document.querySelector('#status')?.textContent.includes('Opened the four-layer Main session'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ slewFace: true, rustWorklet: true, savedRoute: true,
    reopenedCable: true, inputSelectorSync: true, dragReflow: true, reflowReopened: true,
    pageErrors: 0 }));
} finally {
  await browser.close();
}
