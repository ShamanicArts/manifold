// Run through scripts/with-private-null-audio.py; never a visible browser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(new URL('../web/package.json', import.meta.url))('playwright-core');
const site = 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_REVIEW_LABEL ?? '2026-09-30-2110';
assert.match(label, /^[a-z0-9-]+$/);
const destination = new URL(`../web/public/main-wave-review/${label}/`, import.meta.url);
await mkdir(destination, { recursive: false });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1180 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/main-wave-author.html`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  const click = async (id, status) => {
    await page.locator(`#${id}`).click();
    await page.waitForFunction(text => document.querySelector('#status').textContent === text, status);
  };
  await click('start', 'Running.');
  await page.locator('[data-note="60"]').click();
  await page.waitForFunction(() => window.manifoldMainWave.project.voiceSnapshot()[0].currentAmp > .1);
  await click('apply', 'Accepted graph script.');
  await click('insert', 'Accepted topology edit.');
  await page.waitForTimeout(1200);
  const result = await page.evaluate(async () => {
    const api = window.manifoldMainWave;
    const pcm = new Float32Array(api.analyser.fftSize);
    api.analyser.getFloatTimeDomainData(pcm);
    const clip = await api.host.captureWindow(90, 1);
    return {
      capturedAt: new Date().toISOString(),
      status: document.querySelector('#status').textContent,
      peak: pcm.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
      voices: api.project.voiceSnapshot(),
      mixerInputs: api.project.toProject().signal.nodes.find(node => node.id === 60).a,
      insertPresent: api.project.toProject().signal.nodes.some(node => node.id === 100),
      diagnostics: api.host.diagnostics,
      sampleRate: clip.sourceRate, stereo: Array.from(clip.stereo),
    };
  });
  assert.equal(result.mixerInputs, 13);
  assert.equal(result.insertPresent, true);
  assert.ok(result.peak > .001);
  assert.deepEqual(errors, []);
  for (const key of ['rustCallbackAllocations', 'rustCallbackDeallocations', 'rustProcessingFailures']) assert.equal(result.diagnostics[key], 0);
  await page.screenshot({ path: new URL('playing.png', destination).pathname, fullPage: true });
  const wav = Buffer.alloc(44 + result.stereo.length * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(3, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(result.sampleRate, 24); wav.writeUInt32LE(result.sampleRate * 8, 28);
  wav.writeUInt16LE(8, 32); wav.writeUInt16LE(32, 34); wav.write('data', 36);
  wav.writeUInt32LE(result.stereo.length * 4, 40);
  result.stereo.forEach((value, index) => wav.writeFloatLE(value, 44 + index * 4));
  result.frames = result.stereo.length / 2; delete result.stereo;
  await writeFile(new URL('sounding-graph.wav', destination), wav);
  await writeFile(new URL('report.json', destination), JSON.stringify({ site, chromium: browser.version(), ...result }, null, 2));
  await click('stop', 'Stopped.');
  console.log(JSON.stringify({ destination: destination.pathname, peak: result.peak, mixerInputs: result.mixerInputs, frames: result.frames, diagnostics: result.diagnostics }));
} finally {
  await browser.close();
}
