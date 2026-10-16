// Muted browser proof for Main's explicit hardware MIDI connection surface.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-midi-browser-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const first = { id: 'keyboard-a', name: 'Studio Keyboard', state: 'connected', onmidimessage: null };
    const second = { id: 'keyboard-b', name: 'Pad Controller', state: 'connected', onmidimessage: null };
    window.fakeMidi = { inputs: new Map([[first.id, first], [second.id, second]]), requests: 0, notes: [] };
    const WorkletNode = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends WorkletNode {
      constructor(...args) {
        super(...args);
        const send = this.port.postMessage.bind(this.port);
        this.port.postMessage = (message, ...rest) => {
          if (message.type === 'synth-note') window.fakeMidi.notes.push(message);
          return send(message, ...rest);
        };
      }
    };
    window.fakeMidi.send = (id, bytes) => window.fakeMidi.inputs.get(id)?.onmidimessage?.({
      data: Uint8Array.from(bytes), timeStamp: performance.now(),
    });
    Object.defineProperty(document, 'permissionsPolicy', { value: { allowsFeature: () => true } });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true,
      value: async () => { window.fakeMidi.requests++; return window.fakeMidi; } });
  });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  assert.equal(await page.locator('#main-midi-connect').isVisible(), true);
  assert.equal(await page.evaluate(() => window.fakeMidi.requests), 0);
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await page.locator('#main-midi-connect').click();
  assert.equal(await page.evaluate(() => window.fakeMidi.requests), 1);
  await page.waitForFunction(() => document.querySelector('#main-midi-input').options.length === 2);
  assert.equal(await page.locator('#main-midi-input').inputValue(), 'keyboard-a');
  await page.evaluate(() => window.fakeMidi.send('keyboard-b', [0x90, 64, 96]));
  assert.doesNotMatch(await page.locator('#main-midi-status').textContent(), /Note on 64/);
  assert.equal(await page.evaluate(() => window.fakeMidi.notes.length), 0);
  await page.evaluate(() => window.fakeMidi.send('keyboard-a', [0x90, 60, 96]));
  assert.match(await page.locator('#main-midi-status').textContent(), /Studio Keyboard · Note on 60/);
  assert.deepEqual(await page.evaluate(() => window.fakeMidi.notes.at(-1)),
    { type: 'synth-note', kind: 0, note: 60, velocity: 96 });
  await page.locator('#main-midi-input').selectOption('keyboard-b');
  await page.evaluate(() => window.fakeMidi.send('keyboard-b', [0x90, 64, 96]));
  assert.match(await page.locator('#main-midi-status').textContent(), /Pad Controller · Note on 64/);
  await page.screenshot({ path: new URL('../web/public/main-midi-browser.png', import.meta.url).pathname });
  await page.evaluate(() => window.fakeMidi.send('keyboard-b', [0xb0, 64, 127]));
  await page.evaluate(() => window.fakeMidi.send('keyboard-b', [0x80, 64, 0]));
  assert.match(await page.locator('#main-midi-status').textContent(), /Note off 64/);
  assert.equal(await page.evaluate(() => window.fakeMidi.notes.at(-1).kind), 0);
  await page.evaluate(() => window.fakeMidi.send('keyboard-b', [0xb0, 64, 0]));
  assert.deepEqual(await page.evaluate(() => window.fakeMidi.notes.at(-1)),
    { type: 'synth-note', kind: 1, note: 64, velocity: 0 });
  await page.locator('#main-midi-connect').click();
  assert.equal(await page.locator('#main-midi-input').isDisabled(), true);
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => Object.defineProperty(navigator, 'requestMIDIAccess',
    { configurable: true, value: undefined }));
  await blocked.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  assert.equal(await blocked.locator('#main-midi-connect').isDisabled(), true);
  assert.equal(await blocked.locator('#main-midi-copy').isVisible(), true);
  assert.match(await blocked.locator('#main-midi-status').textContent(), /unavailable in this browser/);
  const denied = await browser.newPage();
  await denied.addInitScript(() => {
    Object.defineProperty(document, 'permissionsPolicy', { value: { allowsFeature: () => true } });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true,
      value: async () => { throw new DOMException('Blocked', 'NotAllowedError'); } });
  });
  await denied.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await denied.locator('#main-midi-connect').click();
  assert.equal(await denied.locator('#main-midi-copy').isVisible(), true);
  assert.match(await denied.locator('#main-midi-status').textContent(), /denied or blocked/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ explicitPermissionRequest: true, selectedDeviceOnly: true,
    noteOnOffAndSustain: true, disconnect: true, blockedViewGuidance: true, pageErrors: 0 }));
} finally {
  await browser.close();
}
