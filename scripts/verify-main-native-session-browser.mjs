import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const nativeSession = JSON.parse(await readFile(process.argv[2]
  ?? new URL('../web/public/main-native-saved-session.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  assert.ok(page.url().endsWith('/main-looper.html'));
  await page.locator('#source').selectOption('oscillator');
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running'),
    { timeout: 25000 });
  await page.locator('#open-session').setInputFiles({
    name: 'main-native-saved-session.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(nativeSession)),
  });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Opened the four-layer'),
    { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.layer[data-layer="0"] .state').textContent === 'Playing');
  assert.match(await page.locator('.layer[data-layer="0"] .bars').textContent(), /bar/);
  if (!process.argv[2]) {
    await page.locator('#instrument-frame').screenshot({
      path: new URL('../web/public/main-native-session-browser.png', import.meta.url).pathname,
    });
  }
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.equal(await page.locator('#sample-length').textContent(), '125ms');
  assert.equal(await page.locator('#lfo-shape').inputValue(), String(nativeSession.rack.lfos[0].shape));
  assert.ok(Math.abs(Number(await page.locator('#source-output').getAttribute('aria-valuenow')) - 0.6) < 1e-5);
  assert.equal(await page.locator('#fx1-module-mix').getAttribute('aria-valuenow'), '0.25');
  assert.equal(await page.locator('#scale-quantizer-root').getAttribute('data-value'), '2');
  assert.equal(await page.locator('#scale-quantizer-connected').isChecked(), true);
  assert.equal(await page.locator('#transpose-semitones').getAttribute('aria-valuenow'), '7');
  assert.equal(await page.locator('#transpose-connected').isChecked(), true);
  assert.equal(await page.locator('#note-filter-low').getAttribute('aria-valuenow'), '68');
  assert.equal(await page.locator('#note-filter-connected').isChecked(), true);
  assert.equal(await page.locator('#velocity-mapper-curve').getAttribute('data-value'), '2');
  assert.equal(await page.locator('#velocity-mapper-connected').isChecked(), true);
  if (!process.argv[2]) {
    for (const name of ['scale-quantizer', 'transpose', 'note-filter', 'velocity-mapper']) {
      await page.locator(`#${name}`).screenshot({
        path: new URL(`../web/public/main-native-${name}.png`, import.meta.url).pathname,
      });
    }
  }
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-session').click();
  const download = await downloadPromise;
  const browserSession = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(browserSession.version, nativeSession.version);
  assert.equal(browserSession.layers[0].frames, nativeSession.layers[0].frames);
  assert.equal(browserSession.sample.frames, nativeSession.sample.frames);
  assert.equal(browserSession.layers[0].pcmF32Base64, nativeSession.layers[0].pcmF32Base64);
  assert.equal(browserSession.sample.pcmF32Base64, nativeSession.sample.pcmF32Base64);
  assert.ok(Math.abs(browserSession.rack.source.output - 0.6) < 1e-5);
  assert.ok(Math.abs(browserSession.rack.eq.output + 2) < 1e-5);
  assert.ok(Math.abs(browserSession.rack.eq.mix - 0.8) < 1e-5);
  assert.ok(Math.abs(browserSession.rack.fx1.parameters[0][3] - 0.6) < 1e-5);
  assert.equal(browserSession.rack.scaleQuantizer.root, 2);
  assert.equal(browserSession.rack.transpose.semitones, 7);
  assert.equal(browserSession.rack.noteFilter.low, 68);
  assert.equal(browserSession.rack.velocityMapper.curve, 2);
  assert.deepEqual(errors, []);
  console.log('Native Main v15 save opened and re-saved by the actual browser looper with identical loop/sample PCM and rack controls.');
} finally {
  await browser.close();
}
