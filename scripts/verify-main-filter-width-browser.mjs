// Exercise the original Filter shell's compact width with real Main audio state.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-filter-width-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));

  const toggle = page.locator('.rack-filter .rack-width-toggle');
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.dataset.rackWidth === '1');
  assert.equal(await page.locator('.rack-filter').evaluate(element => element.style.width), '236px');
  assert.equal(await page.locator('#filter-graph').evaluate(element => element.getBoundingClientRect().width), 216);
  assert.equal(await page.locator('#filter-mode').isVisible(), false);
  assert.equal(await page.locator('#filter-cutoff').isVisible(), false);
  const graph = await page.locator('#filter-graph').boundingBox();
  await page.mouse.click(graph.x + graph.width * .15, graph.y + graph.height * .2);
  await page.screenshot({ path: new URL('../web/public/main-filter-compact-rack.png', import.meta.url).pathname });

  const download = page.waitForEvent('download');
  await page.locator('#save-session').click();
  const saved = await download;
  const bytes = await readFile(await saved.path());
  const session = JSON.parse(bytes);
  assert.equal(session.rackDocument.modules.find(module => module.id === 'filter').w, 1);
  assert.ok(session.rack.filter.cutoff < 1000);
  assert.ok(session.rack.filter.resonance > 1);
  await writeFile(new URL('../web/public/main-filter-compact-saved-session.json', import.meta.url), bytes);

  await toggle.click();
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.dataset.rackWidth === '2');
  assert.equal(await page.locator('#filter-mode').isVisible(), true);
  await page.locator('#open-session').setInputFiles({ name: 'compact-filter.json',
    mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.dataset.rackWidth === '1');
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 8);
  assert.equal(await page.locator('.rack-filter').evaluate(element => element.style.width), '236px');
  await page.screenshot({ path: new URL('../web/public/main-filter-compact-patch.png', import.meta.url).pathname });
  await page.locator('#rack-view-switch').click();
  const header = await page.locator('.rack-filter .rack-shell-head').boundingBox();
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + header.width / 2 + 236, header.y + header.height / 2,
    { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.style.left === '944px');
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.dataset.rackWidth === '2');
  assert.equal(await page.locator('.rack-filter').evaluate(element => element.style.left), '708px');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ compactWidth: 236, graphInteractive: true, savedAndReopened: true,
    compactDragAndExpansion: true, patchWires: 8, pageErrors: 0 }));
} finally {
  await browser.close();
}
