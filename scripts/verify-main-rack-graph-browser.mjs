// Open the generated Main rack project in the actual browser graph editor.
// Chromium is headless, muted, and isolated from the user's audio server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const project = JSON.parse(readFileSync(new URL('../web/public/main-rack-audio-project.json', import.meta.url)));
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
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ importedNodes: 8, importedEdges: project.signal.connections.length,
    browserAudio: 'running in muted isolated Chromium', pageErrors: errors.length }));
} finally {
  await browser.close();
}
