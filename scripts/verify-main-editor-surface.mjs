import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const session = JSON.parse(await readFile(new URL('../web/public/main-editor-presentation.json', import.meta.url)));
assert.equal(session.layers[0].pcmF32Base64, undefined);
assert.equal(session.layers[0].peaks.length, 128);
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
  assert.ok((await page.evaluate(() => window.__nativeActions)).some(action => action.kind === 'state-applied'));
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
  const emptyVisuals = await page.evaluate(() => ({
    layer: document.querySelector('.layer[data-layer="2"] canvas.wave').toDataURL(),
    capture: document.querySelector('#capture .segment:nth-child(9) canvas').toDataURL(),
  }));
  await page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll('.layer'), (_, index) => ({
      state: index === 2 ? 2 : 0, length: 0, position: 0, bars: 0,
      pending: 0, volume: 1, speed: 1, muted: false, playing: false,
      peaks: index === 2 ? Array(128).fill(0.6) : [],
    }));
    window.manifoldEditorLiveStatus({
      tempo: 127, targetBpm: 120, active: 2, mode: 0,
      recording: true, overdub: false, forwardBars: 0,
      captured: 128, sampleRate: 48000, layers,
      segments: Array.from({ length: 9 }, (_, index) => Array(128).fill(index === 8 ? 0.5 : 0)),
    });
  });
  const liveVisuals = await page.evaluate(() => ({
    layer: document.querySelector('.layer[data-layer="2"] canvas.wave').toDataURL(),
    capture: document.querySelector('#capture .segment:nth-child(9) canvas').toDataURL(),
  }));
  assert.notEqual(liveVisuals.layer, emptyVisuals.layer);
  assert.notEqual(liveVisuals.capture, emptyVisuals.capture);
  assert.match(await page.locator('#rec').textContent(), /REC\*/);
  assert.equal(await page.locator('.layer[data-layer="2"] .state').textContent(), 'Recording');
  assert.equal(await page.locator('#tempo').inputValue(), '127');
  assert.equal(await page.locator('#audio-button').isDisabled(), true);
  assert.equal(await page.locator('#sample-cap').isDisabled(), false);
  await page.evaluate(() => document.getElementById('sample-cap').click());
  assert.ok((await page.evaluate(() => window.__nativeActions)).some(action =>
    action.kind === 'sample' && action.action === 'retro' && action.source === 0));
  await page.evaluate(() => window.manifoldEditorSampleUpdate({ phase: 'published', frames: 24000 }));
  assert.equal(await page.locator('#sample-length').textContent(), '500ms');
  assert.equal(await page.locator('#sample-cap').isDisabled(), false);
  await page.locator('[data-main-tab="midisynth"]').click();
  await page.locator('[data-source-tab="sample"]').click();
  const sampleBefore = await page.locator('#source-graph').evaluate(canvas => canvas.toDataURL());
  await page.evaluate(() => window.manifoldEditorLiveStatus({
    tempo: 127, targetBpm: 120, active: 2, mode: 0,
    recording: false, overdub: false, forwardBars: 0,
    captured: 128, sampleRate: 48000, sampleFrames: 24000,
    samplePeaks: Array.from({ length: 128 }, (_, bin) => bin < 64 ? 0.7 : 0.2),
    layers: Array.from({ length: 4 }, () => ({
      state: 0, length: 0, position: 0, bars: 0,
      pending: 0, volume: 1, speed: 1, muted: false, playing: false,
    })),
  }));
  assert.notEqual(await page.locator('#source-graph').evaluate(canvas => canvas.toDataURL()), sampleBefore);
  assert.equal(await page.locator('#open-session').isDisabled(), false);
  const imported = await readFile(new URL('../projects/main-looper/default-session-v15.json', import.meta.url));
  await page.locator('#open-session').setInputFiles({
    name: 'main-session.json', mimeType: 'application/json', buffer: imported,
  });
  await page.waitForFunction(() => window.__nativeActions.some(action => action.kind === 'session-import-end'));
  const importActions = (await page.evaluate(() => window.__nativeActions))
    .filter(action => action.kind.startsWith('session-import-'));
  assert.equal(importActions[0].size, imported.length);
  assert.deepEqual(Buffer.concat(importActions.filter(action => action.kind === 'session-import-chunk')
    .map(action => Buffer.from(action.data, 'base64'))), imported);
  await page.evaluate(() => window.manifoldEditorImportResult({ ok: true, message: 'Main session opened in the native host.' }));
  assert.equal(await page.locator('#open-session').isDisabled(), false);
  assert.equal(await page.locator('#save-session').isDisabled(), false);
  await page.locator('#save-session').click();
  assert.ok((await page.evaluate(() => window.__nativeActions)).some(action => action.kind === 'session-export'));
  assert.equal(await page.locator('#save-session').isDisabled(), true);
  await page.evaluate(() => window.manifoldEditorExportResult({ ok: true, message: 'Main session saved as JSON.' }));
  assert.equal(await page.locator('#save-session').isDisabled(), false);
  assert.deepEqual(errors, []);
  console.log('Original Main surface restored Rust presentation, repainted live layer/capture peaks, and routed controls without WebAudio.');
} finally {
  await browser.close();
}
