// Playback/import probes require scripts/with-private-null-audio.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/graph-runtime-review.html`);
  await page.waitForFunction(() => document.querySelectorAll('#captured audio').length === 8
    && document.querySelectorAll('#earlier audio').length === 2);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  const retained = await page.evaluate(async () => {
    const players = [...document.querySelectorAll('#captured audio')];
    await Promise.all(players.map(player => new Promise((resolve, reject) => {
      player.addEventListener('loadedmetadata', resolve, { once: true });
      player.addEventListener('error', () => reject(new Error('Retained recording failed to load')), { once: true });
      player.preload = 'metadata'; player.load();
    })));
    return players.map(player => ({ src: player.src, seconds: player.duration, paused: player.paused }));
  });
  assert.ok(retained.every(player => player.paused && player.seconds > 4));
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/worker-owned-retained-review.png', import.meta.url).pathname, fullPage: true });
  await page.locator('img[alt="Recorded sine wave with a shaded 128-frame silence block"]').screenshot({
    path: new URL('../docs/rearchitecture/evidence/worker-owned-recorded-gap.png', import.meta.url).pathname,
  });
  const imports = [];
  for (const run of ['2026-09-30-retired-owned-workers', '2026-09-30-retired-profiling-off']) {
   for (const example of ['dsp-live-scripting', 'fx-slot-swap']) {
    await page.goto(`${site}/package-project.html`);
    const bytes = await readFile(new URL(`../web/public/runtime-graph-proof/${run}/${example}.manifold.json`, import.meta.url));
    await page.locator('#import').setInputFiles({ name: `${example}.manifold.json`, mimeType: 'application/json', buffer: bytes });
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Running manifold.'));
    await page.waitForFunction(() => Number.parseFloat(document.querySelector('#audio-level').textContent) > .001);
    const graph = await page.evaluate(() => window.manifoldProject.controller.toProject());
    assert.deepEqual(graph, JSON.parse(bytes).state);
    const gain = graph.signal.initialParameters.find(parameter => parameter.nodeId === 4 && parameter.id === 0).value;
    assert.equal(gain, .375);
    imports.push({ run, example, nodes: graph.signal.nodes.length, hostGain: gain, exactSavedGraphRestored: true });
    await page.locator('#stop').click();
   }
  }
  assert.deepEqual(errors, []);
  const report = { recordedAt: new Date().toISOString(), site, retained, imports, pageErrors: errors };
  await writeFile(new URL('../docs/rearchitecture/evidence/2026-09-30-worker-owned-deliverables.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
