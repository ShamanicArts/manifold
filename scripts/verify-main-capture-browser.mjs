import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/main-looper.html`);
  assert.ok(page.url().endsWith('/main-looper.html'));
  const root = await page.locator('#capture').boundingBox();
  const strips = await page.locator('#capture .segment').all();
  assert.equal(strips.length, 9);
  assert.equal(Math.round(root.height), 130);
  for (const [index, strip] of strips.entries()) {
    const box = await strip.boundingBox();
    assert.equal(Math.round(box.x - root.x), 142 * index);
    assert.equal(Math.round(box.y - root.y), 4);
    assert.equal(Math.round(box.width), 142);
    assert.equal(Math.round(box.height), 122);
    assert.equal(Math.round(root.y + root.height - box.y - box.height), 4);
  }
  await page.locator('#source').selectOption('oscillator');
  await page.locator('#audio-button').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Running'), { timeout: 25_000 });
  await page.waitForTimeout(1200);
  const cyanPixels = await page.evaluate(() => {
    const pixels = document.querySelector('#capture .segment:nth-child(9) canvas')?.getContext('2d').getImageData(0, 0, 142, 122).data;
    if (!pixels) return 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 50 && pixels[index + 1] > 85 && pixels[index + 2] > 105) count++;
    }
    return count;
  });
  await page.locator('#capture').screenshot({ path: new URL('../web/public/main-capture-direction.png', import.meta.url).pathname });
  assert.ok(cyanPixels > 0, `expected capture waveform, found ${cyanPixels} cyan pixels`);
  console.log('Main capture browser: original 130×122 geometry, nine aligned strips, and live waveform');
} finally {
  await browser.close();
}
