// Live browser proof for off-callback package graph replacement.
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
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  const marks = [];
  const mark = async label => marks.push({ label, ...await page.evaluate(() => window.manifoldProject.host.diagnostics) });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.goto(`${site}/package-project.html`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('#load').click();
  try {
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.dsp-live-scripting'),
      null, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`Dsp package start: ${await page.locator('#status').textContent()} · ${errors.join('; ')}`, { cause: error });
  }
  assert.match(await page.locator('#identity').textContent(), /4 graph nodes/);
  try {
    await page.waitForFunction(() => Number.parseFloat(document.querySelector('#audio-level').textContent) > 0.001,
      null, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`Dsp audio: ${await page.locator('#status').textContent()} · ${JSON.stringify(await page.evaluate(() =>
      ({ diagnostics: window.manifoldProject.host.diagnostics, profile: window.manifoldProject.host.workerProfile })))} · ${errors.join('; ')}`,
    { cause: error });
  }
  const second = await page.evaluateHandle(async () => {
    const app = window.manifoldProject;
    const other = new app.Host(app.context, { execution: 'worker' });
    await other.prepare(app.controller.toProject());
    other.connect(app.source, app.context.destination);
    return other;
  });
  const dspBefore = Number.parseFloat(await page.locator('#audio-level').textContent());
  await page.locator('#distortion').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published distortion insertion'),
    null, { timeout: 15_000 });
  assert.match(await page.locator('#identity').textContent(), /5 graph nodes/);
  await page.waitForTimeout(200);
  const dspDistorted = Number.parseFloat(await page.locator('#audio-level').textContent());
  const download = page.waitForEvent('download');
  await page.locator('#download').click();
  const saved = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  assert.equal(saved.state.signal.nodes.length, 5);
  await page.locator('#import').setInputFiles([{ name: 'live-distortion.manifold.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) }]);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.dsp-live-scripting'),
    null, { timeout: 15_000 });
  assert.match(await page.locator('#identity').textContent(), /5 graph nodes/);
  await page.locator('#distortion').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published distortion removal'),
    null, { timeout: 15_000 });
  assert.match(await page.locator('#identity').textContent(), /4 graph nodes/);
  await page.waitForTimeout(200);
  const dspAfter = Number.parseFloat(await page.locator('#audio-level').textContent());
  const rejected = await page.evaluate(async () => {
    const before = window.manifoldProject.controller.toProject();
    const invalid = structuredClone(before);
    invalid.signal.nodes.push({ id: 99, type: 'not-a-primitive' });
    try { await window.manifoldProject.host.replaceGraph(invalid); return false; }
    catch { return JSON.stringify(before) === JSON.stringify(window.manifoldProject.controller.toProject()); }
  });
  assert.equal(rejected, true);
  assert.ok(dspDistorted > dspBefore * 2);
  assert.ok(dspAfter < dspDistorted * 0.5);
  const renamed = await page.evaluate(async () => {
    const host = window.manifoldProject.host;
    const original = window.manifoldProject.controller.toProject();
    const candidate = structuredClone(original);
    candidate.signal.nodes.find(node => node.id === 4).id = 44;
    for (const edge of candidate.signal.connections) {
      if (edge.from === 4) edge.from = 44;
      if (edge.to === 4) edge.to = 44;
    }
    for (const collection of [candidate.signal.initialParameters, candidate.endpoints,
      candidate.hostBindings, candidate.instances]) {
      for (const entry of collection ?? []) if (entry.nodeId === 4) entry.nodeId = 44;
    }
    await host.replaceGraph(candidate);
    const outward = host.diagnostics.lastTransferredNodes;
    await host.replaceGraph(original);
    return { outward, back: host.diagnostics.lastTransferredNodes,
      unchangedController: JSON.stringify(window.manifoldProject.controller.toProject())
        === JSON.stringify(original) };
  });
  assert.deepEqual(renamed, { outward: 2, back: 2, unchangedController: true });
  const secondInstance = await second.evaluate(other => ({ diagnostics: other.diagnostics,
    profile: other.workerProfile }));
  assert.ok(secondInstance.diagnostics.audioBlocks > 20);
  await second.evaluate(other => other.close());
  await page.locator('#example').selectOption('fx-slot-swap');
  await page.locator('#load').click();
  try {
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.fx-slot-swap'),
      null, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`package start: ${await page.locator('#status').textContent()} · ${errors.join('; ')}`, { cause: error });
  }
  assert.match(await page.locator('#identity').textContent(), /10 graph nodes/);
  await page.waitForTimeout(500);
  await mark('fx initial');
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('#audio-level').textContent) > 0.001,
    null, { timeout: 15_000 });
  const before = Number.parseFloat(await page.locator('#audio-level').textContent());
  await page.getByRole('button', { name: 'slotA: Gain' }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /test/fxslot/slotA/select'),
    { timeout: 15_000 });
  assert.match(await page.locator('#identity').textContent(), /12 graph nodes/);
  await page.waitForTimeout(200);
  await mark('fx width');
  const width = Number.parseFloat(await page.locator('#audio-level').textContent());
  await page.getByRole('button', { name: 'slotA: Width' }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /test/fxslot/slotA/select = 0'),
    { timeout: 15_000 });
  assert.match(await page.locator('#identity').textContent(), /12 graph nodes/);
  const state = JSON.parse(await page.locator('#document').textContent());
  assert.equal(state.state.controls.find(control => control.path === '/test/fxslot/slotA/select').value, 0);
  assert.ok(before > 0.001 && width > 0.001);
  await page.waitForTimeout(500);
  await mark('fx settled');
  const diagnostics = await page.evaluate(() => window.manifoldProject.host.diagnostics);
  const workerProfile = await page.evaluate(() => window.manifoldProject.host.workerProfile);
  assert.ok(diagnostics.audioBlocks > 20);
  assert.ok(workerProfile.blocks > 20);
  assert.deepEqual(errors, []);
  const evidence = { recordedAt: new Date().toISOString(), isolated: true,
    dspNodes: [4, 5, 4], graphNodes: [10, 12, 12],
    outputRms: { dspBefore, dspDistorted, dspAfter, before, width }, diagnostics,
    workerProfile, secondInstance, renamed, marks,
    pageErrors: errors };
  const evidenceDir = new URL('../docs/rearchitecture/evidence/', import.meta.url);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('web-live-structural-package.png', evidenceDir)),
    fullPage: true });
  await writeFile(new URL('web-live-structural-package.json', evidenceDir),
    `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
