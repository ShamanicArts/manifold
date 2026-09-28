// Exercise Main's native editor layout message/ack flow without WebAudio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const session = JSON.parse(await readFile(new URL('../web/public/main-editor-presentation.json', import.meta.url)));
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-editor-layout-no-audio' },
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.layoutActions = [];
    window.acceptLayout = true;
    window.injectStalePresentation = false;
    window.ipc = { postMessage: text => {
      const action = JSON.parse(text);
      if (action.kind !== 'rack-layout') return;
      window.layoutActions.push(action);
      if (window.injectStalePresentation) {
        window.injectStalePresentation = false;
        window.manifoldEditorReceive(window.nativePresentation);
      }
      const ok = window.acceptLayout;
      setTimeout(() => window.manifoldEditorLayoutResult({ requestId: action.requestId, ok }), 0);
    } };
    window.AudioContext = class { constructor() { throw new Error('Native editor opened WebAudio'); } };
  });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html?editor=1`);
  await page.evaluate(document => {
    window.nativePresentation = document;
    window.manifoldEditorReceive(document);
    window.injectStalePresentation = true;
  }, session);
  await page.locator('[data-main-tab="midisynth"]').click();
  async function drag(fromModule, toModule) {
    const from = await page.locator(`${fromModule} .rack-shell-head`).boundingBox();
    const to = await page.locator(`${toModule} .rack-shell-head`).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await drag('.rack-fx1', '.rack-source');
  await page.waitForFunction(() => document.querySelector('.rack-source')?.style.left === '708px');
  assert.equal(await page.evaluate(() => window.layoutActions.at(-1).document.modules
    .find(module => module.id === 'oscillator').col), 3);
  assert.doesNotMatch(await page.locator('#status').textContent(), /cable edit is still pending/);
  assert.equal(await page.locator('.main-patch-port[data-module="filter"][data-port="in"]').isDisabled(), true);
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelector('#rack-view-switch')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.evaluate(() => window.layoutActions.at(-1).document.viewMode), 'patch');
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelector('#rack-view-switch')?.getAttribute('aria-pressed') === 'false');
  await page.evaluate(() => { window.acceptLayout = false; });
  await drag('.rack-fx1', '.rack-filter');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('rejected this rack layout'));
  assert.equal(await page.locator('.rack-source').evaluate(element => element.style.left), '708px');
  assert.equal(await page.evaluate(() => window.layoutActions.length), 4);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ acceptedPlacement: true, stalePresentationIgnored: true,
    rejectedPlacementRollsBack: true,
    audioContextOpened: false, pageErrors: 0 }));
} finally {
  await browser.close();
}
