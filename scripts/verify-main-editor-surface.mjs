import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const session = JSON.parse(await readFile(new URL('../web/public/main-native-saved-session.json', import.meta.url)));
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__nativeActions = [];
    window.ipc = { postMessage: text => window.__nativeActions.push(JSON.parse(text)) };
    window.AudioContext = class {
      constructor() { throw new Error('Native editor must not open WebAudio'); }
    };
  });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html?editor=1`);
  await page.waitForFunction(() => window.__nativeActions?.some(action => action.kind === 'editor-ready'));
  await page.evaluate(document => window.manifoldEditorReceive(document), session);
  assert.match(await page.locator('#status').textContent(), /Main CLAP session/);
  assert.equal(await page.locator('.layer[data-layer="0"] .state').textContent(), 'Playing');
  assert.equal(await page.locator('#sample-length').textContent(), '125ms');
  await page.locator('[data-main-tab="midisynth"]').click();
  assert.ok(Math.abs(Number(await page.locator('#source-output').getAttribute('aria-valuenow')) - 0.6) < 1e-5);
  assert.equal(await page.locator('#lfo-shape-slot-1').inputValue(), '3');
  if (process.argv.includes('--screenshot')) {
    await page.locator('#midisynth-panel').screenshot({
      path: new URL('../web/public/main-clap-editor-rack.png', import.meta.url).pathname,
    });
  }
  await page.locator('[data-main-tab="looper"]').click();
  if (process.argv.includes('--screenshot')) {
    await page.locator('#instrument-frame').screenshot({
      path: new URL('../web/public/main-clap-editor-surface.png', import.meta.url).pathname,
    });
  }
  await page.locator('#mode').selectOption('1');
  await page.locator('#donuts button').nth(2).click();
  await page.locator('#rec').click();
  const actions = await page.evaluate(() => window.__nativeActions);
  assert.ok(actions.some(action => action.kind === 'parameter' && action.id === 1 && action.value === 1));
  assert.ok(actions.some(action => action.kind === 'parameter' && action.id === 0 && action.value === 2));
  assert.ok(actions.some(action => action.kind === 'command' && action.id === 0));
  assert.equal(await page.locator('#audio-button').isDisabled(), true);
  assert.equal(await page.locator('#sample-cap').isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Original Main surface restored the native session and routed mode, layer, and Record gestures to host IDs without WebAudio.');
} finally {
  await browser.close();
}
