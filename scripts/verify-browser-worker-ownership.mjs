// Run automated audio only through scripts/with-private-null-audio.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Withhold forced termination. The real Worker loop must stop and relinquish
  // its slot through the cooperative protocol, including on host.close().
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.ignoredWorkerTerminations = 0;
    window.Worker = class extends OriginalWorker {
      terminate() { window.ignoredWorkerTerminations++; }
    };
  });
  const cdp = await browser.newBrowserCDPSession();
  const targets = async () => (await cdp.send('Target.getTargets')).targetInfos
    .filter(target => target.type === 'worker' && target.url.includes('graph-worker'))
    .map(target => ({ id: target.targetId, url: target.url }));
  await page.goto(`${site}/package-project.html`);
  await page.evaluate(async () => {
    const context = new AudioContext({ sampleRate: 48000 });
    await context.resume();
    const host = new window.manifoldProject.Host(context, { execution: 'worker', profiling: true });
    const graph = (gain, factor) => ({ format: 'manifold.project', schemaVersion: 1,
      projectId: 'manifold.graph-workspace', signal: {
        inputs: 2, outputs: 2, inputSource: 'external',
        nodes: [{ id: 1, type: 'input.raw' }, { id: 3, type: 'output' },
          { id: 4, type: 'gain', a: 0.7 }, ...(factor === 1 ? [] : [{ id: 6, type: 'fixed-gain', a: factor }])],
        connections: [{ from: 1, outputPort: 0, to: 4, inputPort: 0 },
          ...(factor === 1 ? [{ from: 4, outputPort: 0, to: 3, inputPort: 0 }]
            : [{ from: 4, outputPort: 0, to: 6, inputPort: 0 }, { from: 6, outputPort: 0, to: 3, inputPort: 0 }])],
        initialParameters: [{ nodeId: 4, id: 0, value: gain }],
      }, instances: [{ path: '/ownership/gain', nodeId: 4 }] });
    await host.prepare(graph(.125, 1));
    const source = context.createConstantSource(); source.offset.value = .2;
    const analyser = context.createAnalyser(); analyser.fftSize = 256;
    host.connect(source, analyser); analyser.connect(context.destination); source.start();
    window.ownershipProbe = { context, host, source, analyser, graph };
  });
  const gains = [.25, .75, .5, 1, .875, .625, .375, .9375];
  const steps = [];
  for (let index = 0; index < gains.length; index++) {
    const gain = gains[index], factor = index % 2 ? 4 : 1;
    const state = await page.evaluate(async ({ gain, factor }) => {
      const { host, analyser, graph } = window.ownershipProbe;
      await host.replaceGraph(graph(gain, factor));
      await new Promise(resolve => setTimeout(resolve, 250));
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      return { expected: .2 * gain * factor, mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        min: Math.min(...samples), max: Math.max(...samples), diagnostics: host.diagnostics, profile: host.workerProfile };
    }, { gain, factor });
    assert.ok(Math.abs(state.mean - state.expected) < .0001, `edit ${index + 1} sounded the wrong gain`);
    assert.ok(state.max - state.min < .0001, `edit ${index + 1} has competing output versions`);
    assert.equal(state.diagnostics.pendingRetirements, 0);
    const workers = await targets(); assert.equal(workers.length, 1);
    steps.push({ index: index + 1, gain, factor, ...state, workers });
  }
  async function settled() {
    return page.evaluate(async () => {
      const { context, host } = window.ownershipProbe;
      await context.suspend(); await new Promise(resolve => setTimeout(resolve, 35));
      return { diagnostics: host.diagnostics, profile: host.workerProfile };
    });
  }
  const before = await settled();
  await page.evaluate(async () => { await window.ownershipProbe.context.resume(); });
  await page.waitForTimeout(750);
  const after = await settled();
  const audioAdvance = after.diagnostics.audioBlocks - before.diagnostics.audioBlocks;
  const processed = after.profile.blocks - before.profile.blocks;
  assert.ok(audioAdvance > 200); assert.equal(processed, audioAdvance);
  await page.evaluate(async () => {
    const { context, source, host } = window.ownershipProbe;
    source.stop(); host.close(); await context.close();
  });
  await page.waitForTimeout(100);
  const afterClose = await targets(); assert.deepEqual(afterClose, []);
  assert.deepEqual(errors, []);
  const report = { recordedAt: new Date().toISOString(), site, chromiumVersion: browser.version(),
    forcedTerminationWithheld: true, ignoredTerminationCalls: await page.evaluate(() => window.ignoredWorkerTerminations),
    steps, tail: { before, after, audioAdvance, processed }, afterClose, pageErrors: errors };
  await writeFile(new URL('../docs/rearchitecture/evidence/2026-09-30-worker-owned-audio.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, steps: steps.map(step => ({ index: step.index, expected: step.expected, mean: step.mean, workerCount: step.workers.length })) }));
} finally { await browser.close(); }
