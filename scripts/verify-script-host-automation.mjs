// Run only under scripts/with-private-null-audio.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const gain = graph => graph.signal.initialParameters.find(entry => entry.nodeId === 4 && entry.id === 0).value;
try {
  const page = await browser.newPage({ viewport: { width: 1150, height: 1150 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function load(name) {
    await page.goto(`${site}/package-project.html?example=${name}`);
    await page.locator('#load').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Running manifold.'));
    await page.waitForFunction(() => Number.parseFloat(document.querySelector('#audio-level').textContent) > 0.001);
  }
  await load('dsp-live-scripting');
  await page.locator('#automate').click();
  await page.waitForFunction(() => document.querySelector('#automation-status').textContent.includes('Host accepted 0.375'));
  await page.locator('#distortion').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published distortion insertion'));
  let dsp = await page.evaluate(() => window.manifoldProject.controller.toProject());
  assert.equal(gain(dsp), 0.375);
  assert.equal(dsp.signal.nodes.length, 5);
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/script-host-automation-browser.png', import.meta.url).pathname, fullPage: true });
  // This edit deliberately bypasses the controller and its explicit sync method.
  await page.evaluate(() => window.manifoldProject.host.setParameter({ nodeId: 4, id: 0, value: 0.625 }));
  assert.equal(gain(await page.evaluate(() => window.manifoldProject.controller.toProject())), 0.375);
  await page.locator('#distortion').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published distortion removal'));
  dsp = await page.evaluate(() => window.manifoldProject.controller.toProject());
  assert.equal(gain(dsp), 0.625);
  const dspDiagnostics = await page.evaluate(() => window.manifoldProject.host.diagnostics);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(gain(downloaded.state), 0.625);
  await page.locator('#stop').click();
  await page.locator('#import').setInputFiles({ name: 'host-automated.manifold.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(downloaded)) });
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Running manifold.'));
  assert.equal(gain(await page.evaluate(() => window.manifoldProject.controller.toProject())), 0.625);
  await page.locator('#distortion').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published distortion insertion'));
  assert.equal(gain(await page.evaluate(() => window.manifoldProject.controller.toProject())), 0.625);
  // Verify the older direct-worklet host also reports only acknowledged targets.
  const worklet = await page.evaluate(async () => {
    const { Host, context, source } = window.manifoldProject;
    const project = (await (await fetch('/packages/dsp-live-scripting.manifold.json')).json()).state;
    const host = new Host(context, { execution: 'worklet' });
    try {
      await host.prepare(project);
      host.connect(source);
      await host.setParameter({ nodeId: 4, id: 0, value: 0.25 });
      const before = host.readPublishedParameters();
      let rejection = '';
      try { await host.setParameter({ nodeId: 99, id: 0, value: 0.2 }); } catch (error) { rejection = error.message; }
      let endpointRejection = '';
      try { await host.setParameter({ nodeId: 5, id: 0, value: 1.5 }); } catch (error) { endpointRejection = error.message; }
      const after = host.readPublishedParameters();
      return { before, after, rejection, endpointRejection };
    } finally { host.close(); }
  });
  assert.equal(worklet.before.find(parameter => parameter.nodeId === 4).value, 0.25);
  assert.deepEqual(worklet.after, worklet.before);
  assert.match(worklet.rejection, /rejected/i);
  assert.match(worklet.endpointRejection, /published range/);
  await page.locator('#stop').click();
  await load('fx-slot-swap');
  await page.evaluate(() => window.manifoldProject.host.setParameter({ nodeId: 4, id: 0, value: 0.375 }));
  await page.getByRole('button', { name: 'slotA: Gain', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /test/fxslot/slotA/select = 1'));
  const fx = await page.evaluate(() => ({ graph: window.manifoldProject.controller.toProject(), diagnostics: window.manifoldProject.host.diagnostics }));
  assert.equal(gain(fx.graph), 0.375);
  assert.equal(fx.graph.signal.nodes.length, 12);
  assert.equal(fx.graph.controls.find(control => control.path === '/test/fxslot/slotA/select').value, 1);
  assert.equal(fx.graph.controls.find(control => control.path === '/test/fxslot/slotB/select').value, 0);
  await page.locator('#stop').click();
  await load('vst3-automated-fx');
  assert.equal(gain(await page.evaluate(() => window.manifoldProject.controller.toProject())), 0.375);
  await page.evaluate(() => window.manifoldProject.host.setParameter({ nodeId: 4, id: 0, value: 0.625 }));
  await page.getByRole('button', { name: 'slotB: Width', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /test/fxslot/slotB/select = 0'));
  const vst3Reopened = await page.evaluate(() => window.manifoldProject.controller.toProject());
  assert.equal(gain(vst3Reopened), 0.625);
  // The historical slot controller retains inactive effect instances and gates
  // them; returning to Gain preserves the previously authored Width state.
  assert.equal(vst3Reopened.signal.nodes.length, 14);
  assert.equal(vst3Reopened.controls.find(control => control.path === '/test/fxslot/slotB/select').value, 0);
  assert.equal(vst3Reopened.controls.find(control => control.path === '/test/fxslot/slotA/select').value, 1);
  const gateValue = path => {
    const nodeId = vst3Reopened.instances.find(instance => instance.path === path).nodeId;
    return vst3Reopened.signal.initialParameters.find(parameter => parameter.nodeId === nodeId && parameter.id === 0).value;
  };
  assert.equal(gateValue('/test/fxslot/slotB/nodes/gain_gate'), 1);
  assert.equal(gateValue('/test/fxslot/slotB/nodes/width_gate'), 0);
  await page.locator('#stop').click();
  await page.goto(`${site}/vst3-script-package-review.html`);
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].length === 6 &&
    [...document.querySelectorAll('audio')].every(audio => audio.duration === 2) &&
    [...document.querySelectorAll('canvas')].every(canvas => canvas.width === 900));
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/script-host-automation-review.png', import.meta.url).pathname, fullPage: true });
  assert.deepEqual(errors, []);
  const evidence = { recordedAt: new Date().toISOString(), site, pageErrors: errors,
    dsp: { initialHostGain: 0.375, externalGainBeforeScriptRemoval: 0.625,
      finalGain: gain(dsp), downloadedGain: gain(downloaded.state), reopenedGain: 0.625,
      insertNodes: 5, removeNodes: 4, diagnostics: dspDiagnostics },
    vst3Reopened: { initialGain: 0.375, editedHostGain: gain(vst3Reopened), nodesAfterSlotChange: vst3Reopened.signal.nodes.length },
    fx: { retainedHostGain: gain(fx.graph), nodes: fx.graph.signal.nodes.length, diagnostics: fx.diagnostics },
    directWorklet: { acceptedGain: 0.25, rejectedEditLeftSnapshotUnchanged: true, rejection: worklet.rejection, endpointRangeRejection: worklet.endpointRejection } };
  await writeFile(new URL('../docs/rearchitecture/evidence/2026-09-30-script-host-automation-browser.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
