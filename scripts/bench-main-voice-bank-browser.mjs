// Measure the actual Chromium AudioWorklet graph via the WebAudio DevTools domain.
// Render capacity is a browser rolling metric; it is not an underrun count.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const origin = process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173';
const executablePath = process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium';
const asset = readdirSync('web/dist/assets').find((name) => /^filter-processor-.*\.js$/.test(name));
assert.ok(asset, 'Build web/dist before benchmarking');
const project = JSON.parse(readFileSync('projects/main-voice-bank/project.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const scenarios = [
  ['Normal · 1 voice', 1, 0, 0], ['Normal · 4 voices', 4, 0, 0],
  ['Normal · 8 voices', 8, 0, 0], ['Ring · 8 voices', 8, 1, 0],
  ['FM · 8 voices', 8, 2, 0], ['Sync · 8 voices', 8, 3, 0],
  ['Add · 8 voices', 8, 4, 0], ['Morph · 8 voices', 8, 5, 0],
  ['Vocoder · 8 voices', 8, 0, 1],
];
const browser = await chromium.launch({ executablePath, headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('WebAudio.enable');
const contexts = [];
cdp.on('WebAudio.contextCreated', ({ context }) => contexts.push(context));
await page.goto(origin, { waitUntil: 'domcontentloaded' });
const results = [];
try {
  for (const [label, voices, mode, pitchMode] of scenarios) {
    const before = contexts.length;
    const setup = await page.evaluate(async ({ asset, signal, partials, voices, mode, pitchMode }) => {
      const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
      await context.resume();
      await context.audioWorklet.addModule(`/assets/${asset}`);
      const node = new AudioWorkletNode(context, 'manifold-project', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      const gain = context.createGain();
      gain.gain.value = 0;
      node.connect(gain).connect(context.destination);
      const rate = context.sampleRate;
      const sample = new Float32Array(rate * 4 * 2);
      for (let frame = 0; frame < sample.length / 2; frame++) {
        sample[frame * 2] = Math.sin(2 * Math.PI * 220 * frame / rate) * .3;
        sample[frame * 2 + 1] = Math.sin(2 * Math.PI * 330 * frame / rate) * .25;
      }
      const response = await fetch('/manifold_filter.wasm');
      if (!response.ok) throw new Error('Wasm build unavailable');
      const wasmBytes = await response.arrayBuffer();
      const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('AudioWorklet initialization timed out')), 10_000);
        node.port.onmessage = ({ data }) => {
          if (data.type === 'ready' || data.type === 'error') {
            clearTimeout(timeout);
            data.type === 'ready' ? resolve() : reject(new Error(data.message));
          }
        };
      });
      node.port.postMessage({ type: 'init', wasmBytes, graph: signal,
        sample: { nodeId: 2, sourceRate: rate, stereo: sample }, partials },
      [wasmBytes, sample.buffer]);
      await ready;
      for (const [id, value] of [[1, 0], [5, pitchMode], [6, mode], [7, .85], [17, .5]]) {
        node.port.postMessage({ type: 'parameter', nodeId: 2, id, value });
      }
      for (let index = 0; index < voices; index++) {
        node.port.postMessage({ type: 'event', nodeId: 2, kind: 0,
          channel: 0, note: 48 + index, velocity: 90 });
      }
      window.manifoldBrowserBench = { context, node, gain };
      return { rate, baseLatency: context.baseLatency, outputLatency: context.outputLatency };
    }, { asset, signal: project.signal,
      partials: [project.partials, ...project.extraPartials], voices, mode, pitchMode });
    assert.equal(contexts.length, before + 1, `${label}: missing AudioContext event`);
    const context = contexts.at(-1);
    assert.equal(context.contextType, 'realtime');
    await delay(500);
    const activeVoices = await page.evaluate(() => new Promise((resolve, reject) => {
      const { node } = window.manifoldBrowserBench;
      const timeout = setTimeout(() => reject(new Error('Meter response timed out')), 3_000);
      node.port.onmessage = ({ data }) => {
        if (data.type === 'meters') { clearTimeout(timeout); resolve(data.values[0]); }
        if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
      };
      node.port.postMessage({ type: 'meter-request', nodeId: 2, count: 1 });
    }));
    assert.equal(activeVoices, voices, `${label}: voice count differs`);
    const samples = [];
    for (let index = 0; index < 24; index++) {
      const { realtimeData } = await cdp.send('WebAudio.getRealtimeData', { contextId: context.contextId });
      assert.ok(Number.isFinite(realtimeData.renderCapacity), `${label}: no render capacity`);
      samples.push(realtimeData);
      await delay(100);
    }
    assert.ok(samples.at(-1).currentTime - samples[0].currentTime > 2,
      `${label}: context did not render continuously`);
    const capacities = samples.map((sample) => sample.renderCapacity).sort((a, b) => a - b);
    const at = (fraction) => capacities[Math.floor((capacities.length - 1) * fraction)];
    results.push({ label, voices, mode, pitchMode, activeVoices,
      sampleRate: setup.rate, callbackBufferFrames: context.callbackBufferSize,
      baseLatencySeconds: setup.baseLatency, outputLatencySeconds: setup.outputLatency,
      sampledRenderCapacity: { p50: at(.5), p95: at(.95), max: capacities.at(-1) },
      callbackIntervalMeanSeconds: samples.at(-1).callbackIntervalMean,
      callbackIntervalVariance: samples.at(-1).callbackIntervalVariance,
      contextTimeAdvancedSeconds: samples.at(-1).currentTime - samples[0].currentTime,
      samples: samples.map(({ currentTime, renderCapacity }) => ({ currentTime, renderCapacity })) });
    console.log(`${label.padEnd(23)} capacity p95 ${(at(.95) * 100).toFixed(2)}%, max ${(capacities.at(-1) * 100).toFixed(2)}%`);
    await page.evaluate(async () => {
      const { context, node, gain } = window.manifoldBrowserBench;
      node.disconnect(); gain.disconnect(); await context.close();
      delete window.manifoldBrowserBench;
    });
  }
  const report = { schemaVersion: 1,
    method: 'Headless Chromium actual AudioWorklet graph; WebAudio.getRealtimeData rolling render capacity samples',
    limitation: 'Headless virtual output; render capacity and callback interval do not count physical device underruns',
    capturedAt: new Date().toISOString(), browserVersion: browser.version(),
    platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    wasmSha256: createHash('sha256').update(wasmBytes).digest('hex'),
    processorAsset: asset, source: 'four-second deterministic stereo 220/330 Hz tone; notes 48..55 held',
    warmupMilliseconds: 500, sampledIntervals: 24, sampleIntervalMilliseconds: 100,
    results };
  if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
