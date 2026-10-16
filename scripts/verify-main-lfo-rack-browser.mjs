// Exercise the original LFO face, typed CV cable, and saved Main state against
// the actual Rust/Wasm AudioWorklet with browser audio disconnected.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-lfo-rack-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.equal(await page.locator('.rack-lfo-primary').evaluate(element => element.style.top), '465px');
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await page.locator('#rack-view-switch').click();
  const lfoOut = page.locator('.rack-lfo-primary .main-patch-port[data-port="out"][data-direction="output"]');
  const cutoff = page.locator('.rack-filter .main-patch-port[data-port="cutoff"][data-direction="input"]');
  assert.equal(await lfoOut.isEnabled(), true);
  assert.equal(await cutoff.isEnabled(), true);
  await lfoOut.click();
  await cutoff.click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  assert.equal(await page.locator('#mod-target').inputValue(), '22');
  assert.equal(await page.locator('#mod-enabled').isChecked(), true);
  await page.screenshot({ path: new URL('../web/public/main-lfo-rack-filter-port.png', import.meta.url).pathname });
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 300; });
  await page.screenshot({ path: new URL('../web/public/main-lfo-rack-patch.png', import.meta.url).pathname });

  const download = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const saved = await download;
  const bytes = await readFile(await saved.path());
  const session = JSON.parse(bytes);
  assert.equal(session.version, 16);
  assert.equal(session.rackDocument.modules.length, 11);
  assert.ok(session.rackDocument.connections.some(edge => edge.from.moduleId === 'lfo1'
    && edge.from.portId === 'out' && edge.to.moduleId === 'filter' && edge.to.portId === 'cutoff'));
  const route = session.rack.lfos.find(lfo => lfo.slot === 0).route;
  assert.deepEqual([route.source, route.target, route.enabled], [0, 22, true]);
  await writeFile(new URL('../web/public/main-lfo-rack-saved-session.json', import.meta.url), bytes);

  await page.locator('#rack-view-switch').click();
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 360; });
  await page.screenshot({ path: new URL('../web/public/main-lfo-rack-face.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();

  await cutoff.click({ button: 'right' });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  assert.equal(await page.locator('#mod-target').inputValue(), '0');
  await page.locator('#mod-target').selectOption('22');
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  await page.locator('#mod-target').selectOption('0');
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  await page.locator('#open-session').setInputFiles({ name: 'lfo-rack.json',
    mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 13);
  assert.equal(await page.locator('#mod-target').inputValue(), '22');
  assert.equal(await page.locator('#mod-enabled').isChecked(), true);
  assert.match(await page.locator('#status').textContent(), /Opened the four-layer Main session/);
  const older = await readFile(new URL('../web/public/main-filter-compact-six-shell-session.json', import.meta.url));
  assert.equal(JSON.parse(older).rackDocument.modules.length, 6);
  await page.locator('#open-session').setInputFiles({ name: 'older-six-shells.json',
    mimeType: 'application/json', buffer: older });
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.dataset.rackWidth === '1'
    && document.querySelector('#status')?.textContent.includes('Opened the four-layer Main session'));
  assert.equal(await page.locator('.rack-lfo-primary .main-patch-face').count(), 1);
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 12);
  assert.match(await page.locator('#status').textContent(), /Opened the four-layer Main session/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ liveCvCable: true, routeSelectorSync: true, savedRoute: true, reopenedCable: true,
    oldSixShellImport: true,
    rustWorklet: true, pageErrors: 0 }));
} finally {
  await browser.close();
}
