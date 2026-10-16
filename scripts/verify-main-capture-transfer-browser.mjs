// Record through the Rust loop, move the take into both Main studies, analyze and save it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const authoredBank = JSON.parse(await readFile(new URL('../projects/main-voice-bank/project.json', import.meta.url), 'utf8'));
const results = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [destination, buttonId] of [
    ['main-voice-bank', 'capture-transfer-main-bank'],
    ['main-sample-blend', 'capture-transfer-main-blend'],
  ]) {
    if (destination === 'main-voice-bank') {
      await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=main-voice-bank`);
      await page.waitForFunction(() => !document.querySelector('#sine-use-frame').disabled);
      await page.locator('#sine-use-frame').click();
      await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('prepared'));
      const oldDownloadPromise = page.waitForEvent('download');
      await page.locator('#main-state-export').click();
      const oldBundle = JSON.parse((await readFile(await (await oldDownloadPromise).path())).toString());
      assert.notDeepEqual(oldBundle.snapshot.targets[1].values, authoredBank.extraPartials[0].values);
      await page.locator('[data-primitive="loop-capture"]').click();
      await page.waitForURL('**/?primitive=loop-capture');
    } else {
      await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=loop-capture`);
    }
    await page.locator('#audio-toggle').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
    await page.locator('#controls button[data-parameter-id="0"]').click();
    await page.waitForTimeout(450);
    await page.locator('#controls button[data-parameter-id="0"]').click();
    await page.locator(`#${buttonId}`).click();
    await page.waitForURL(`**/?primitive=${destination}`);
    await page.waitForFunction(() => !document.querySelector('#sine-use-frame').disabled);
    assert.match(await page.locator('#sine-source-status').textContent(), /Captured take/);
    if (destination === 'main-voice-bank') {
      const resetDownloadPromise = page.waitForEvent('download');
      await page.locator('#main-state-export').click();
      const resetBundle = JSON.parse((await readFile(await (await resetDownloadPromise).path())).toString());
      assert.deepEqual(resetBundle.snapshot.targets[0].values, authoredBank.partials.values);
      assert.deepEqual(resetBundle.snapshot.targets[1].values, authoredBank.extraPartials[0].values);
    }
    await page.locator('#sine-use-frame').click();
    await page.waitForFunction(() => document.querySelector('#sine-target-status').textContent.includes('prepared'));
    if (destination === 'main-voice-bank') {
      await page.locator('#audio-toggle').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
      await page.locator('#keyboard button').first().click();
    }
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#main-state-export').click();
    const download = await downloadPromise;
    const bundle = JSON.parse((await readFile(await download.path())).toString());
    assert.equal(bundle.format, 'manifold.project');
    assert.equal(bundle.snapshot.source.kind, 'embedded');
    assert.match(bundle.snapshot.source.label, /Captured take/);
    assert.ok(bundle.snapshot.source.frames >= 256);
    const pcm = Buffer.from(bundle.snapshot.source.pcmF32Base64, 'base64');
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    assert.ok(peak > .001);
    if (destination === 'main-voice-bank') await page.locator('#audio-toggle').click();
    await page.locator('#main-state-file').setInputFiles([{
      name: `${destination}-capture-project.json`, mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    }]);
    await page.waitForFunction(() => document.querySelector('#main-state-status').textContent.startsWith('Opened'));
    await page.waitForFunction(() => document.querySelector('#sine-source-status').textContent.includes('Captured take'));
    assert.match(await page.locator('#sine-source-status').textContent(), /Captured take/);
    results.push({ destination, frames: bundle.snapshot.source.frames,
      sourceRate: bundle.snapshot.source.sourceRate, peak: Number(peak.toFixed(4)) });
  }
  assert.deepEqual(errors, []);
  console.log(`Main capture transfer browser: ${JSON.stringify(results)}; analysis, playback, bundle reopen passed`);
} finally {
  await browser.close();
}
