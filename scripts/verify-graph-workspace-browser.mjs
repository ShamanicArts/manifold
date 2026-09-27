// Build, save, reopen, and play an edited Audio/CV topology in Chromium.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=graph-workspace`);
  await page.waitForFunction(() => document.querySelector('#comparison-result').textContent === 'Match');
  assert.equal(await page.locator('#reference-case option').count(), 3);
  assert.match(await page.locator('#reference-title').textContent(), /Native Rust/);
  assert.ok(Number(await page.locator('#max-difference').textContent()) < 1e-5);
  await page.locator('#reference-case').selectOption('distortion');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Input → Gain → Distortion'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  await page.locator('#reference-case').selectOption('cv');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('CV gain'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  assert.equal(await page.locator('.graph-node').count(), 3);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  assert.equal(await page.locator('#graph-add-node').isDisabled(), true);
  const gain = page.locator('input[data-node="2"][data-parameter="0"]');
  assert.equal(await gain.isDisabled(), false);
  await gain.fill('0.35');
  await gain.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#audio-toggle').click();

  await page.locator('#graph-add-type').selectOption('distortion');
  await page.locator('#graph-add-node').click();
  assert.equal(await page.locator('.graph-node').count(), 4);
  await page.locator('select[data-to="4"][data-port="0"]').selectOption('2');
  await page.locator('select[data-to="3"][data-port="0"]').selectOption('4');
  await page.locator('input[data-node="4"][data-parameter="0"]').fill('9');
  await page.locator('input[data-node="4"][data-parameter="0"]').press('Tab');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#audio-toggle').click();

  await page.locator('#graph-add-type').selectOption('lfo');
  await page.locator('#graph-add-node').click();
  await page.locator('#graph-add-type').selectOption('modulated-gain');
  await page.locator('#graph-add-node').click();
  await page.locator('select[data-to="6"][data-port="0"]').selectOption('4');
  const cvInput = page.locator('select[data-to="6"][data-port="1"]');
  assert.equal(await cvInput.locator('option[value="2"]').count(), 0);
  await cvInput.selectOption('5');
  await page.locator('select[data-to="3"][data-port="0"]').selectOption('6');
  await page.locator('select[data-to="4"][data-port="0"]').selectOption('6');
  assert.match(await page.locator('#graph-status').textContent(), /cycle/);
  assert.equal(await page.locator('select[data-to="4"][data-port="0"]').inputValue(), '2');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const bundle = JSON.parse((await readFile(await (await downloadPromise).path())).toString());
  assert.equal(bundle.format, 'manifold.project');
  assert.equal(bundle.projectId, 'manifold.graph-workspace');
  assert.equal(bundle.signal.nodes.length, 6);
  assert.equal(bundle.signal.connections.length, 5);
  assert.equal(bundle.signal.initialParameters.find((entry) => entry.nodeId === 4 && entry.id === 0).value, 9);
  assert.equal(bundle.signal.initialParameters.find((entry) => entry.nodeId === 2 && entry.id === 0).value, .35);
  await page.locator('button[aria-label="Remove Distortion node 4"]').click();
  assert.equal(await page.locator('.graph-node').count(), 5);
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'edited-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('.graph-node').count(), 6);
  const invalid = structuredClone(bundle);
  invalid.signal.connections.find((edge) => edge.to === 6 && edge.inputPort === 1).from = 2;
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'invalid-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('port types do not match'));
  assert.equal(await page.locator('select[data-to="6"][data-port="1"]').inputValue(), '5');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-add-type').selectOption('noise');
  await page.locator('#graph-add-node').click();
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  const parkedLevel = page.locator('input[data-node="7"][data-parameter="0"]');
  await parkedLevel.fill('0.2');
  await parkedLevel.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('Rust rejected this node parameter'));
  assert.equal(await parkedLevel.inputValue(), '0.08');
  assert.deepEqual(errors, []);
  console.log('Graph workspace browser: stopped topology edits, acknowledged live parameter, parked-node rejection, Rust/Wasm starts, cycle rejection, project reopen passed');
} finally {
  await browser.close();
}
