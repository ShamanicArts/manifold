// Run one self-contained project package through browser AudioWorklet and recall.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjectPackage } from '../packages/manifold-author/package.js';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173';
const root = new URL('..', import.meta.url).pathname;
const work = await mkdtemp(join(tmpdir(), 'manifold-package-proof-'));
const native = (...args) => JSON.parse(execFileSync('cargo',
  ['run', '-q', '-p', 'manifold-project-js', '--example', 'native_script', '--', ...args],
  { cwd: root, encoding: 'utf8' }));
const browser = await chromium.launch({ executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/package-project.html`);
  await page.locator('#load').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.dsp-live-scripting'));
  assert.match(await page.locator('#identity').textContent(), /4 graph nodes/);
  await page.locator('input[type="range"]').first().evaluate(input => {
    input.value = '0.4';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /dsp/live/input_gain'));
  await page.locator('#bypass').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('authored output route'));
  await page.screenshot({ path: new URL('../docs/rearchitecture/evidence/web-packaged-dsp-live.png', import.meta.url).pathname,
    fullPage: true });
  const download = page.waitForEvent('download');
  await page.locator('#download').click();
  const saved = await readProjectPackage(await readFile(await (await download).path(), 'utf8'));
  assert.equal(saved.packageId, 'manifold.dsp-live-scripting');
  assert.ok(saved.state.signal.connections.some(edge => edge.from === 4 && edge.to === 3));
  assert.equal(saved.state.signal.initialParameters.find(entry => entry.nodeId === 4 && entry.id === 0).value, 0.4);
  const browserSave = join(work, 'browser-saved-dsp.manifold.json');
  await writeFile(browserSave, JSON.stringify(saved));
  const nativeFromBrowser = native('web/public/packages/dsp-live-scripting.manifold.json',
    '/dsp/live/input_gain', '0.8', join(work, 'native-reopened-dsp.manifold.json'), browserSave);
  assert.equal(nativeFromBrowser.nodes, 4);
  assert.equal(nativeFromBrowser.package, 'manifold.dsp-live-scripting');

  await page.locator('#import').setInputFiles([{ name: 'reopened.manifold.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)) }]);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.dsp-live-scripting'));
  assert.match(await page.locator('#document').textContent(), /"value": 0.4/);
  assert.match(await page.locator('#identity').textContent(), /4 graph nodes/);

  await page.locator('#example').selectOption('fx-slot-swap');
  await page.locator('#load').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.fx-slot-swap'));
  assert.match(await page.locator('#identity').textContent(), /10 graph nodes/);
  await page.locator('input[type="range"]').evaluate(input => {
    input.value = '0.5';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Published /test/fxslot/input_gain'));
  const nativeFxSave = join(work, 'native-fx.manifold.json');
  const nativeFx = native('web/public/packages/fx-slot-swap.manifold.json',
    '/test/fxslot/slotA/select', '1', nativeFxSave);
  assert.equal(nativeFx.nodes, 12);
  await page.locator('#import').setInputFiles([{ name: 'native-fx.manifold.json', mimeType: 'application/json',
    buffer: await readFile(nativeFxSave) }]);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running manifold.fx-slot-swap'));
  assert.match(await page.locator('#identity').textContent(), /12 graph nodes/);
  const sinks = execFileSync('pactl', ['list', 'short', 'sinks'], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(sinks.length, 1);
  assert.match(sinks[0], /manifold_null/);
  const sinkId = sinks[0].split('\t')[0];
  const inputs = execFileSync('pactl', ['list', 'short', 'sink-inputs'], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(inputs.length > 0 && inputs.every(line => line.split('\t')[1] === sinkId));
  assert.deepEqual(errors, []);
  const result = { site: page.url(), dspBundleSha256: saved.control.sha256,
    dspSavedGain: 0.4, dspSavedRoute: 'input_trim → output',
    fxNodes: 10, fxGain: 0.5, nativeToBrowserFxNodes: 12,
    browserToNativeDspNodes: nativeFromBrowser.nodes,
    privateSink: 'manifold_null', pageErrors: errors,
    screenshot: 'docs/rearchitecture/evidence/web-packaged-dsp-live.png' };
  await writeFile(new URL('../docs/rearchitecture/evidence/web-project-package-browser.json', import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally { await browser.close(); await rm(work, { recursive: true, force: true }); }
