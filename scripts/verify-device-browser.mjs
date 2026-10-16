// Requires a private BB automation-tab lease and running Vite server.
// Every AudioContext is verified against the browser’s silent sink before use.
import { connect } from '../web/review-browser-cdp.mjs';
import { strict as assert } from 'node:assert';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const origin = new URL(process.env.MANIFOLD_REVIEW_URL ?? 'http://127.0.0.1:4174/').origin;
const c = await connect();
const original = await c.evaluate(() => location.href);
const evidence = resolve(process.argv[2] ?? '/tmp/manifold-device-browser');
await mkdir(evidence, { recursive: true });
const override = await c.call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
const NativeAudioContext = window.AudioContext;
window.__testContexts = [];
window.AudioContext = class extends NativeAudioContext {
  constructor(options = {}) {
    if (!('sinkId' in NativeAudioContext.prototype)) throw Error('Silent audio sink unavailable');
    super({...options, sinkId: {type:'none'}});
    if (this.sinkId?.type !== 'none') { this.close(); throw Error('Silent sink was not accepted'); }
    window.__testContexts.push(this);
  }
};`,
});
try {
  await c.call('Page.navigate', { url: origin + '/learn/embed-a-gain-stage/' });
  for (let i = 0; i < 120; i++) {
    if (
      await c.evaluate(
        () =>
          !!document.querySelector('[data-action="audio"]') &&
          !document.querySelector('[data-action="audio"]').disabled,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(
    await c.evaluate(() => ({
      url: location.href,
      isolated: crossOriginIsolated,
      audioButton: document.querySelector('[data-action=audio]')?.textContent,
      status: document.querySelector('[data-example-status]')?.textContent,
    })),
  );
  const result = await c.evaluate(async (root) => {
    const { BrowserDeviceHost } = await import('/@fs' + root + '/packages/manifold/browser.js');
    const { default: effect, volume } = await import('/handbook/examples/gain.mjs');
    const { createEffect, gain } = await import('/@fs' + root + '/packages/manifold/index.js');
    const context = new AudioContext({ sampleRate: 48000 });
    const host = new BrowserDeviceHost(context);
    const second = new BrowserDeviceHost(context);
    const source = context.createConstantSource();
    source.offset.value = 0.2;
    const alternative = context.createConstantSource();
    alternative.offset.value = 0.4;
    const meter = context.createAnalyser();
    meter.fftSize = 2048;
    const meter2 = context.createAnalyser();
    meter2.fftSize = 2048;
    const samples = new Float32Array(2048);
    const read = async (meter) => {
      await new Promise((r) => setTimeout(r, 180));
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length);
    };
    try {
      await context.resume();
      await host.prepare(effect);
      await second.prepare(effect);
      host.connectInput('audio', source);
      host.connectOutput('audio', meter);
      meter.connect(context.destination);
      second.connectInput('audio', source);
      second.connectOutput('audio', meter2);
      meter2.connect(context.destination);
      source.start();
      alternative.start();
      const initial = await read(meter),
        independent = await read(meter2);
      const accepted = await host.setControl(volume, 0.25),
        quiet = await read(meter);
      await host.setControl(volume, 0);
      const silent = await read(meter);
      await host.setControl(volume, 0.65);
      const restored = await read(meter);
      host.connectInput('audio', alternative);
      const switched = await read(meter);
      host.connectInput('audio', null);
      const disconnected = await read(meter);
      host.connectInput('audio', source);
      const returned = await read(meter);
      const other = createEffect({ id: 'other', name: 'Other' });
      const level = other.add('level', gain);
      const foreign = other.control('level', level.parameters.level, {
        label: 'Other',
        min: 0,
        max: 1,
        default: 0.65,
      });
      const failures = [];
      for (const [control, value] of [
        [foreign, 0.2],
        [volume, 2],
        [{ ...volume }, 0.2],
      ]) {
        try {
          await host.setControl(control, value);
          failures.push(null);
        } catch (e) {
          failures.push(e.message);
        }
      }
      const afterRejected = await read(meter);
      const beforeClose = host.diagnostics;
      await host.close();
      await host.close();
      let closedRejection;
      try {
        await host.setControl(volume, 0.3);
      } catch (e) {
        closedRejection = e.message;
      }
      const survivor = await read(meter2);
      return {
        sink: { type: context.sinkId.type },
        initial,
        independent,
        accepted,
        quiet,
        silent,
        restored,
        switched,
        disconnected,
        returned,
        failures,
        afterRejected,
        survivor,
        contextAfterClose: context.state,
        closedRejection,
        diagnostics: beforeClose,
      };
    } finally {
      source.stop();
      source.disconnect();
      alternative.stop();
      alternative.disconnect();
      meter.disconnect();
      meter2.disconnect();
      await host.close();
      await second.close();
      await context.close();
    }
  }, root);
  console.log(JSON.stringify(result));
  assert.equal(result.sink.type, 'none');
  assert.equal(result.accepted, 0.25);
  for (const key of ['initial', 'independent', 'restored', 'returned', 'afterRejected', 'survivor'])
    assert(Math.abs(result[key] - 0.13) < 0.0001, key);
  assert(Math.abs(result.quiet - 0.05) < 0.0001);
  assert(result.silent < 1e-6);
  assert(result.disconnected < 1e-6);
  assert(Math.abs(result.switched - 0.26) < 0.0001);
  assert(result.failures.every(Boolean));
  assert(result.closedRejection);
  assert.equal(result.contextAfterClose, 'running');
  assert.equal(result.diagnostics.rustCallbackAllocations, 0);
  assert.equal(result.diagnostics.rustCallbackDeallocations, 0);
  assert.equal(result.diagnostics.rustProcessingFailures, 0);
  await writeFile(evidence + '/browser-host.json', JSON.stringify(result, null, 2));
} finally {
  await c.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: override.identifier });
  await c.call('Page.navigate', { url: original });
  c.close();
}
