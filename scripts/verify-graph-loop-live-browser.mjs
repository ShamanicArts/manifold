// Exercise the same authored LoopCapture route and saved PCM in Chromium.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');

const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function (...args) {
      const analyser = create.apply(this, args);
      window.manifoldProbeAnalyser = analyser;
      window.manifoldProbeContext = this;
      return analyser;
    };
    window.manifoldProbeRms = () => {
      const analyser = window.manifoldProbeAnalyser;
      if (!analyser) return 0;
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
  });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=graph-workspace`);
  await page.locator('#graph-load-authored-loop').click();
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('half-second take'));
  assert.equal(await page.locator('.graph-node').count(), 4);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.waitForFunction(() => window.manifoldProbeRms() > 0.05, null, { timeout: 5000 });
  const sinks = execFileSync('pactl', ['list', 'short', 'sinks'], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(sinks.length, 1);
  assert.match(sinks[0], /manifold_null/);
  const sinkId = sinks[0].split('\t')[0];
  const sinkInputs = execFileSync('pactl', ['list', 'short', 'sink-inputs'], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(sinkInputs.length > 0 && sinkInputs.every(line => line.split('\t')[1] === sinkId));
  const soundingRms = await page.evaluate(() => window.manifoldProbeRms());
  const route = page.locator('select[data-to="4"][data-port="0"]');
  assert.equal(await route.inputValue(), '2:0');
  await route.selectOption('');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('prepared Rust graph'));
  await page.waitForFunction(() => window.manifoldProbeRms() < 0.001);
  const unpluggedRms = await page.evaluate(() => window.manifoldProbeRms());
  assert.equal(await route.inputValue(), '');
  await route.selectOption('2:0');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('prepared Rust graph'));
  await page.waitForFunction(() => window.manifoldProbeRms() > 0.05);
  const reconnectedRms = await page.evaluate(() => window.manifoldProbeRms());
  assert.equal(await route.inputValue(), '2:0');
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/web-loop-live-route.png', import.meta.url).pathname,
    fullPage: true });
  const download = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const document = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  assert.equal(document.assets.length, 1);
  assert.equal(document.assets[0].nodeId, 2);
  assert.equal(document.assets[0].frames, 24_000);
  assert.ok(document.assets[0].pcmF32Base64.length > 100_000);
  assert.ok(document.signal.connections.some(edge => edge.from === 2 && edge.to === 4 && edge.inputPort === 0));
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{ name: 'authored-loop.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.waitForFunction(() => window.manifoldProbeRms() > 0.05, null, { timeout: 5000 });
  const reopenedRms = await page.evaluate(() => window.manifoldProbeRms());
  assert.deepEqual(errors, []);
  const result = { site: page.url(), route: '2:0', soundingRms, unpluggedRms,
    reconnectedRms,
    reopenedRms,
    assetFrames: document.assets[0].frames,
    privateSink: 'manifold_null', pageErrors: errors,
    screenshot: 'docs/rearchitecture/evidence/web-loop-live-route.png' };
  await writeFile(new URL('../docs/rearchitecture/evidence/web-loop-live-route.json', import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
