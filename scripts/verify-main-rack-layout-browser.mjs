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

  async function dragHeader(from, to, preview) {
    const first = await page.locator(`${from} .rack-shell-head`).boundingBox();
    const second = await page.locator(`${to} .rack-shell-head`).boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 10 });
    if (preview) await preview();
    await page.mouse.up();
  }
  await dragHeader('.rack-adsr', '.rack-source', async () => {
    assert.equal(await page.locator('.rack-source').evaluate(element => element.style.left), '0px');
  });
  await page.waitForFunction(() => document.querySelector('.rack-adsr')?.style.left === '472px');
  await page.reload();
  await page.locator('[data-main-tab="midisynth"]').click();
  await dragHeader('.rack-source', '.rack-filter', async () => {
    assert.equal(await page.locator('.rack-filter').evaluate(element => element.style.left), '236px');
  });
  await page.waitForFunction(() => document.querySelector('.rack-source')?.style.left === '708px');
  await page.screenshot({ path: new URL('../web/public/main-rack-midpoint-reflow.png', import.meta.url).pathname,
    clip: { x: 110, y: 430, width: 1280, height: 460 } });
  await page.reload();
  await page.locator('[data-main-tab="midisynth"]').click();
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Running'));
  await dragHeader('.rack-fx1', '.rack-source', async () => {
    assert.equal(await page.locator('.rack-source').evaluate(element => element.style.left), '708px');
    assert.equal(await page.locator('.rack-filter').evaluate(element => element.style.top), '245px');
  });
  await page.waitForFunction(() => document.querySelector('.rack-filter')?.style.top === '245px');
  const layout = await page.locator('.rack-scroll-content').evaluate(content =>
    Object.fromEntries(['adsr', 'source', 'filter', 'fx1', 'fx2', 'eq'].map(id => {
      const element = content.querySelector(`.rack-${id}`);
      return [id, [element.style.left, element.style.top]];
    })));
  assert.deepEqual(layout, {
    adsr: ['0px', '25px'], source: ['708px', '25px'], filter: ['0px', '245px'],
    fx1: ['236px', '25px'], fx2: ['472px', '245px'], eq: ['944px', '245px'],
  });
  await page.screenshot({ path: new URL('../web/public/main-rack-reflow-top.png', import.meta.url).pathname });
  const download = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#save-session').click();
  const saved = await download;
  const bytes = await readFile(await saved.path());
  const session = JSON.parse(bytes);
  assert.equal(session.version, 16);
  assert.deepEqual(Object.fromEntries(session.rackDocument.modules.map(module =>
    [module.id, [module.row, module.col]])), {
    adsr: [0, 0], oscillator: [0, 3], filter: [1, 0],
    fx1: [0, 1], fx2: [1, 2], eq: [1, 4],
  });
  await writeFile(new URL('../web/public/main-rack-reflow-saved-session.json', import.meta.url), bytes);

  await dragHeader('.rack-fx1', '.rack-filter', async () => {
    assert.equal(await page.locator('.rack-fx2').evaluate(element => element.style.top), '465px');
    assert.equal(await page.locator('.rack-scroll-content').evaluate(element =>
      element.style.getPropertyValue('--rack-utility-shift')), '220px');
  });
  await page.waitForFunction(() => document.querySelector('.rack-fx2')?.style.top === '465px');
  const geometry = await page.locator('.rack-scroll-content').evaluate(content => {
    const box = selector => {
      const { top, bottom } = content.querySelector(selector).getBoundingClientRect();
      return { top, bottom };
    };
    return { fx2: box('.rack-fx2'), eq: box('.rack-eq'), lfo: box('.rack-lfo'),
      route: box('.rack-route'), atv: box('.rack-atv'), height: content.offsetHeight,
      shift: getComputedStyle(content).getPropertyValue('--rack-utility-shift').trim() };
  });
  assert.equal(geometry.shift, '220px');
  assert.equal(geometry.height, 2773);
  for (const utility of [geometry.lfo, geometry.route, geometry.atv]) {
    assert.ok(utility.top >= geometry.fx2.bottom - 1, 'utility overlaps reflowed FX2');
    assert.ok(utility.top >= geometry.eq.bottom - 1, 'utility overlaps reflowed EQ');
  }
  await page.locator('#add-lfo').click();
  const extraLfo = await page.locator('#lfo-status-slot-1').evaluate(element => {
    const content = element.closest('.rack-scroll-content');
    return element.closest('.rack-lfo').getBoundingClientRect().top
      - content.getBoundingClientRect().top;
  });
  assert.ok(Math.abs(extraLfo - 917) < 1);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 450; });
  await page.screenshot({ path: new URL('../web/public/main-rack-reflow-lower.png', import.meta.url).pathname });
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 0; });
  await page.locator('#patch-jump').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('#rack-scroll').scrollTop - 672) < 2);
  await page.locator('#rack-scroll').evaluate(element => { element.scrollTop = 0; });
  await page.locator('#open-session').setInputFiles({ name: 'moved-main.json',
    mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => document.querySelector('.rack-fx1')?.style.top === '25px');
  assert.match(await page.locator('#status').textContent(), /Opened the four-layer Main session/);
  await page.locator('#rack-view-switch').click();
  await page.waitForFunction(() => document.querySelectorAll('.main-rack-wire').length === 7);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ midpointDrops: 2, reflowedShells: 3, savedPlacement: true, reopenedPlacement: true,
    patchWiresRemain: 7, pageErrors: 0 }));
} finally {
  await browser.close();
}
