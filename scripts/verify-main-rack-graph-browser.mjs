// Open the generated Main rack project in the actual browser graph editor.
// Chromium is headless, muted, and isolated from the user's audio server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const project = JSON.parse(readFileSync(new URL('../web/public/main-rack-audio-project.json', import.meta.url)));
const cvProject = JSON.parse(readFileSync(new URL('../web/public/main-rack-cv-project.json', import.meta.url)));
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-rack-browser-no-audio' },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=graph-workspace`);
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'main-rack-audio-project.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status')?.textContent.startsWith('Opened'));
  assert.equal(await page.locator('.graph-node').count(), 8);
  // The Graph host's required raw input is unused by this MIDI instrument.
  assert.equal(await page.locator('.graph-node-parked').count(), 1);
  assert.match(await page.locator('.graph-node-parked').textContent(), /Live input/);
  assert.equal(await page.locator('select[data-to="7"][data-port="0"]').inputValue(), '6');
  await page.locator('#audio-toggle').click();
  await page.waitForTimeout(1500);
  assert.match(await page.locator('#status').textContent(), /Audio running/);
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'main-rack-cv-project.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(cvProject)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status')?.textContent.startsWith('Opened'));
  assert.equal(await page.locator('.graph-node').count(), 9);
  assert.equal(await page.locator('select[data-to="6"][data-port="1"]').inputValue(), '11');
  await page.locator('#audio-toggle').click();
  await page.waitForTimeout(1500);
  assert.match(await page.locator('#status').textContent(), /Audio running/);
  await page.locator('#audio-toggle').click();
  const download = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const saved = JSON.parse(readFileSync(await (await download).path()));
  assert.ok(saved.signal.connections.some(edge => edge.from === 11 && edge.to === 6 && edge.inputPort === 1));
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'saved-main-rack-cv.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status')?.textContent.startsWith('Opened'));
  assert.equal(await page.locator('select[data-to="6"][data-port="1"]').inputValue(), '11');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ importedNodes: [8, 9], importedEdges: [project.signal.connections.length,
    cvProject.signal.connections.length],
    browserAudio: 'running in muted isolated Chromium', cvSaveReopen: true, pageErrors: errors.length }));
} finally {
  await browser.close();
}
