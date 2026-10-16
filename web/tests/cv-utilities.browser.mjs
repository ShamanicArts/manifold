import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const url = process.env.MANIFOLD_REVIEW_URL ?? 'http://127.0.0.1:4173/?primitive=graph-workspace';
const evidence = new URL('../../docs/rearchitecture/evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#graph-load-cv-utilities').click();
  assert.match(await page.locator('#graph-status').innerText(), /JS-authored CV chain/);
  assert.equal(await page.locator('#graph-nodes article').count(), 9);
  assert.equal(await page.locator('.graph-route[data-to="9"][data-port="1"]').inputValue(), '5:1');
  await page.locator('#audio-toggle').click();
  try {
    await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Audio running'), { timeout: 15000 });
  } catch (error) {
    console.error(JSON.stringify({ status: await page.locator('#status').innerText(), graphStatus: await page.locator('#graph-status').innerText(), errors }));
    throw error;
  }
  const sinks = execFileSync('pactl', ['list', 'short', 'sinks'], { encoding: 'utf8' });
  const sink = sinks.split('\n').find(line => line.includes('manifold_review'))?.split('\t')[0];
  assert.ok(sink, 'private null sink exists');
  const inputs = execFileSync('pactl', ['list', 'short', 'sink-inputs'], { encoding: 'utf8' });
  assert.ok(inputs.split('\n').some(line => line.split('\t')[1] === sink),
    `browser audio must be routed to private sink ${sink}: ${inputs}`);
  await page.locator('.graph-route[data-to="9"][data-port="1"]').selectOption('5:2');
  await page.waitForFunction(() => document.querySelector('#graph-status')?.textContent?.includes('Updated CV mixer 9 input 2 in the prepared Rust graph'));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#graph-project-export').click(),
  ]);
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.ok(saved.signal.connections.some(edge =>
    edge.from === 5 && edge.outputPort === 2 && edge.to === 9 && edge.inputPort === 1));
  await page.locator('#graph-workspace-section').screenshot({ path: new URL('web-cv-utilities-live.png', evidence).pathname });
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Audio idle'));
  await page.locator('#graph-project-file').setInputFiles(await download.path());
  assert.equal(await page.locator('.graph-route[data-to="9"][data-port="1"]').inputValue(), '5:2');
  await page.locator('#graph-load-cv-decisions').click();
  assert.equal(await page.locator('#graph-nodes article').count(), 8);
  assert.equal(await page.locator('.graph-route[data-to="8"][data-port="1"]').inputValue(), '6:1');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Audio running'));
  await page.locator('.graph-route[data-to="8"][data-port="1"]').selectOption('6:0');
  await page.waitForFunction(() => document.querySelector('#graph-status')?.textContent?.includes('Updated CV mixer 8 input 2 in the prepared Rust graph'));
  const [decisionDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('#graph-project-export').click(),
  ]);
  const decisionSaved = JSON.parse(await readFile(await decisionDownload.path(), 'utf8'));
  assert.ok(decisionSaved.signal.connections.some(edge =>
    edge.from === 6 && (edge.outputPort ?? 0) === 0 && edge.to === 8 && edge.inputPort === 1));
  await page.locator('#graph-workspace-section').screenshot({ path: new URL('web-cv-decisions-live.png', evidence).pathname });
  await page.locator('#audio-toggle').click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, nodes: [9, 8], liveRoutes: ['5:2 → 9:1', '6:0 → 8:1'],
    sink, savedRoutes: true, reopened: true,
    screenshots: ['docs/rearchitecture/evidence/web-cv-utilities-live.png', 'docs/rearchitecture/evidence/web-cv-decisions-live.png'] }));
} finally {
  await browser.close();
}
