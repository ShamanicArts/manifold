// Exercise real DSP readback when an endpoint range changes during preparation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_ENDPOINT_PROOF_LABEL ?? '2026-09-30-prepared-endpoint-inheritance';
assert.match(label, /^[a-z0-9-]+$/);
const path = new URL(`../docs/rearchitecture/evidence/${label}.json`, import.meta.url);
try { await access(path); throw new Error('Evidence destination exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.prepareDelay = 0; window.submissions = 0;
    window.Worker = class extends Original {
      postMessage(data, ...rest) {
        if (data.type === 'prepare') {
          window.submissions++;
          if (window.prepareDelay) { setTimeout(() => super.postMessage(data, ...rest), window.prepareDelay); return; }
        }
        super.postMessage(data, ...rest);
      }
    };
  });
  await page.goto(`${site}/package-project.html?execution=prepared`);
  const result = await page.evaluate(async () => {
    const context = new AudioContext({ sampleRate: 48000 }); await context.resume();
    const host = new window.manifoldProject.Host(context, { execution: 'prepared' });
    const state = (await (await fetch('/packages/dsp-live-scripting.manifold.json')).json()).state;
    await host.prepare(state); await host.setParameter({ nodeId: 4, id: 0, value: .25 });
    const next = structuredClone(state);
    next.signal.initialParameters.find(p => p.nodeId === 4 && p.id === 0).value = .25;
    const endpoint = next.endpoints.find(p => p.nodeId === 4 && p.id === 0);
    endpoint.max = .5; endpoint.default = .25;
    window.prepareDelay = 100;
    const pending = host.replaceGraph(next);
    await host.setParameter({ nodeId: 4, id: 0, value: .75 });
    await pending; window.prepareDelay = 0;
    const parameters = host.readPublishedParameters(), diagnostics = host.diagnostics;
    let rejected = null;
    try { await host.setParameter({ nodeId: 4, id: 0, value: .75 }); } catch (error) { rejected = error.message; }
    await host.close(); await context.close();
    return { endpoint, parameters, diagnostics, rejected, concurrentOldTarget: .75, expectedCandidateTarget: .25 };
  });
  const source = await readFile(new URL('../packages/manifold-author/prepared-runtime.js', import.meta.url));
  await writeFile(path, JSON.stringify({ recordedAt: new Date().toISOString(), site,
    chromiumVersion: browser.version(), runtimeSha256: createHash('sha256').update(source).digest('hex'),
    ...result, pageErrors: errors }, null, 2));
  console.log(JSON.stringify(result));
  assert.equal(result.parameters.find(p => p.nodeId === 4 && p.id === 0).value, .25);
  assert.ok(result.rejected); assert.deepEqual(errors, []);
} finally { await browser.close(); }
