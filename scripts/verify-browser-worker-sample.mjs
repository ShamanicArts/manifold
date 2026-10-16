// An imported Rack Sample voice through the off-callback graph Worker.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4174';
const browser = await chromium.launch({ executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.goto(`${site}/sample-voice-chain.html`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Running.'),
    null, { timeout: 20_000 });
  await page.waitForTimeout(200);
  const before = Number.parseFloat(await page.locator('#meter').textContent());
  const batchRollback = await page.evaluate(async () => {
    const host = window.manifoldSample.host;
    try {
      await host.setParameterBatch([
        { nodeId: 6, id: 0, value: 1 },
        { nodeId: 5, id: 4, value: 12 },
      ]);
      return false;
    } catch {
      host.sendEvent({ nodeId: 4, kind: 0, note: 60, velocity: 100 });
      return true;
    }
  });
  assert.equal(batchRollback, true);
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(() => window.manifoldSample.peakRms < 0.001),
    'Rejected parameter batch leaked the first gain edit into audio');
  await page.evaluate(() => window.manifoldSample.host.sendEvent({ nodeId: 4, kind: 2 }));
  await page.locator('#gate').evaluate(input => {
    input.value = '1';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Gate accepted'),
    null, { timeout: 10_000 });
  try {
    await page.waitForFunction(() => window.manifoldSample.peakRms > 0.002,
      null, { timeout: 10_000 });
  } catch (error) {
    throw new Error(`Sample did not sound: ${JSON.stringify(await page.evaluate(() => ({
      status: document.querySelector('#status').textContent,
      meter: document.querySelector('#meter').textContent,
      diagnostics: window.manifoldSample.host?.diagnostics,
      profile: window.manifoldSample.host?.workerProfile,
    })))} · ${errors.join('; ')}`, { cause: error });
  }
  const sounding = await page.evaluate(() => window.manifoldSample.peakRms);
  await page.locator('#mode').selectOption('2');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Mode accepted'),
    null, { timeout: 10_000 });
  await page.locator('#pitch').evaluate(input => {
    input.value = '67';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Pitch accepted'),
    null, { timeout: 10_000 });
  const saved = JSON.parse(await page.locator('#project').textContent());
  assert.equal(saved.controls.find(control => control.path.endsWith('/pitchMode')).value, 2);
  assert.equal(saved.controls.find(control => control.path.endsWith('/voice/1/vOct')).value, 67);
  const meter = await page.locator('#meter').textContent();
  assert.match(meter, /0 missed/);
  assert.ok(before < 0.001 && sounding > 0.002);
  const rackProject = JSON.parse(await readFile(new URL(
    '../projects/graph-workspace/authored-rack-sample-eight-voice.json', import.meta.url), 'utf8'));
  const rack = await page.evaluate(async project => {
    const context = new AudioContext();
    const host = new window.manifoldSample.Host(context, { execution: 'worker' });
    try {
      await host.prepare(project);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      host.connect(null, analyser);
      analyser.connect(context.destination);
      await context.resume();
      await host.setParameter({ nodeId: 6, id: 0, value: 1 });
      host.sendEvent({ nodeId: 4, kind: 0, note: 60, velocity: 100 });
      const samples = new Float32Array(1024);
      let maxRms = 0;
      for (let index = 0; index < 15; index++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        maxRms = Math.max(maxRms, Math.sqrt(energy / samples.length));
      }
      return { maxRms, diagnostics: host.diagnostics, profile: host.workerProfile };
    } finally {
      host.close();
      await context.close();
    }
  }, rackProject);
  assert.ok(rack.maxRms > 0.002, `Rack sample was silent: ${JSON.stringify(rack)}`);
  assert.ok(rack.diagnostics.audioBlocks > 20);
  assert.deepEqual(errors, []);
  const evidenceDir = new URL('../docs/rearchitecture/evidence/', import.meta.url);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('web-worker-sample-voice.png', evidenceDir)),
    fullPage: true });
  await page.goto(`${site}/rack-sample-eight-voice.html`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Running.'),
    null, { timeout: 20_000 });
  await page.locator('#gate-1').evaluate(input => {
    input.value = '1';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Voice 1 Gate accepted'),
    null, { timeout: 10_000 });
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await page.evaluate(() => window.manifoldRackSample.peakRms > 0.002)) break;
    await page.evaluate(() => window.manifoldRackSample.host.sendEvent(
      { nodeId: 4, kind: 0, note: 60, velocity: 100 }));
    await page.waitForTimeout(100);
  }
  assert.ok(await page.evaluate(() => window.manifoldRackSample.peakRms > 0.002),
    `Rack page did not sound: ${await page.locator('#meter').textContent()}`);
  await page.locator('#mode').selectOption('2');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Pitch mode accepted'),
    null, { timeout: 10_000 });
  const rackPage = await page.evaluate(() => ({
    peakRms: window.manifoldRackSample.peakRms,
    diagnostics: window.manifoldRackSample.host.diagnostics,
    mode: window.manifoldRackSample.controller.toProject().controls
      .find(control => control.path.endsWith('/pitchMode')).value,
  }));
  assert.equal(rackPage.mode, 2);
  assert.equal(rackPage.diagnostics.underruns, 0);
  await page.screenshot({ path: fileURLToPath(new URL('web-worker-rack-sample.png', evidenceDir)),
    fullPage: true });
  const evidence = { recordedAt: new Date().toISOString(), isolated: true,
    graphNodes: saved.signal.nodes.length, assetFrames: saved.assets[0].frames,
    beforeRms: before, soundingRms: sounding, meter, batchRollback, pitchMode: 2, pitchNote: 67,
    rack: { graphNodes: rackProject.signal.nodes.length, sharedBindings: rackProject.sampleBindings.length,
      ...rack }, rackPage, pageErrors: errors };
  await writeFile(new URL('web-worker-sample-voice.json', evidenceDir),
    `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
