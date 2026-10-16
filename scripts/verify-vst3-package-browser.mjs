// Reopen actual VST3 host saves through the public browser package runtime.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const browser = await chromium.launch({ executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/vst3-script-package-review.html`);
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(canvas => canvas.width === 900));
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(audio => audio.duration === 2));
  const audioDurations = await page.locator('audio').evaluateAll(audios => audios.map(audio => audio.duration));
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/vst3-script-package-review.png', import.meta.url).pathname, fullPage: true });
  await page.goto(`${site}/package-project.html?example=vst3-fx-both`);
  assert.equal(await page.locator('#example').inputValue(), 'vst3-fx-both');
  await page.locator('#load').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.fx-slot-swap'));
  assert.match(await page.locator('#identity').textContent(), /14 graph nodes/);
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('#audio-level').textContent) > 0.001);
  await page.getByRole('button', { name: 'slotA: Width', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /test/fxslot/slotA/select = 0'));
  const fx = await page.evaluate(() => ({ graph: window.manifoldProject.controller.toProject(),
    rms: Number.parseFloat(document.querySelector('#audio-level').textContent), diagnostics: window.manifoldProject.host.diagnostics }));
  assert.equal(fx.graph.controls.find(control => control.path === '/test/fxslot/slotA/select').value, 0);
  assert.equal(fx.graph.controls.find(control => control.path === '/test/fxslot/slotB/select').value, 1);
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/vst3-saved-package-browser.png', import.meta.url).pathname, fullPage: true });
  await page.locator('#stop').click();
  await page.goto(`${site}/package-project.html?example=vst3-dsp-route`);
  await page.locator('#load').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.dsp-live-scripting'));
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('#audio-level').textContent) > 0.001);
  const dsp = await page.evaluate(() => ({ graph: window.manifoldProject.controller.toProject(),
    rms: Number.parseFloat(document.querySelector('#audio-level').textContent) }));
  assert.ok(dsp.graph.signal.connections.some(edge => edge.from === 4 && edge.to === 3));
  assert.ok(Math.abs(dsp.graph.signal.initialParameters.find(entry => entry.nodeId === 4 && entry.id === 0).value - 0.4) < 1e-6);
  await page.locator('#distortion').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published distortion insertion'));
  assert.match(await page.locator('#identity').textContent(), /5 graph nodes/);
  await page.locator('#stop').click();
  assert.deepEqual(errors, []);
  const evidence = { recordedAt: new Date().toISOString(), site, pageErrors: errors, audioDurations,
    vst3FxReopenedNodes: 14, browserFxEditNodes: fx.graph.signal.nodes.length,
    fxSelectionAfterEdit: [0, 1], fxRms: fx.rms, fxDiagnostics: fx.diagnostics,
    vst3DspGain: 0.4, vst3DspOutputFrom: 4, dspRms: dsp.rms, browserDspEditNodes: 5 };
  await writeFile(new URL('../docs/rearchitecture/evidence/2026-09-30-vst3-package-browser.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
