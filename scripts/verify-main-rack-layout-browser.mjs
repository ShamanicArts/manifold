// Exercise Main's saved rack placement through the real muted browser worklet.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-layout-browser-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  await page.locator('[data-main-tab="midisynth"]').click();
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));

  async function dragHeader(from, to) {
    const first = await page.locator(`${from} .rack-shell-head`).boundingBox();
    const second = await page.locator(`${to} .rack-shell-head`).boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await dragHeader('.rack-source', '.rack-filter');
  await page.waitForFunction(() => document.querySelector('.rack-source')?.style.left === '708px');
  assert.equal(await page.locator('.rack-filter').evaluate(element => element.style.left), '236px');
  await page.screenshot({ path: new URL('../web/public/main-rack-layout-browser.png', import.meta.url).pathname });
  const download = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const saved = await download;
  const bytes = await readFile(await saved.path());
  const session = JSON.parse(bytes);
  assert.equal(session.version, 16);
  assert.equal(session.rackDocument.modules.find(module => module.id === 'oscillator').col, 3);
  assert.equal(session.rackDocument.modules.find(module => module.id === 'filter').col, 1);
  await writeFile(new URL('../web/public/main-rack-layout-saved-session.json', import.meta.url), bytes);

  await dragHeader('.rack-source', '.rack-filter');
  await page.waitForFunction(() => document.querySelector('.rack-source')?.style.left === '236px');
  await page.locator('#open-session').setInputFiles({ name: 'moved-main.json',
    mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => document.querySelector('.rack-source')?.style.left === '708px');
  assert.match(await page.locator('#status').textContent(), /Opened the four-layer Main session/);
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 7);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ movedShells: 2, savedPlacement: true, reopenedPlacement: true,
    patchWiresRemain: 7, pageErrors: 0 }));
} finally {
  await browser.close();
}
