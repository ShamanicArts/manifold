// The native graph view uses the original widget renderer and sends one slot request.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.addInitScript(() => {
    window.messages = [];
    window.ipc = { postMessage: (raw) => window.messages.push(JSON.parse(raw)) };
  });
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/graph-module.html?editor`);
  const slot = page.locator('.graph-slot-edit').first();
  await slot.waitFor();
  assert.equal(await slot.inputValue(), '1');
  assert.ok(await page.locator('.graph-control canvas').count() > 0);
  await slot.fill('18');
  await slot.press('Tab');
  const messages = await page.evaluate(() => window.messages);
  assert.deepEqual(messages.filter((message) => message.kind === 'slot-assign'),
    [{ version: 1, kind: 'slot-assign', id: 0x01000000, slot: 17 }]);
  await page.evaluate(() => window.manifoldEditorReceive({
    schemaVersion: 1, id: 'manifold.graph',
    nodes: [{ id: 5, type: 'midi-transpose' }],
    controls: [{ id: 0x01000011, nodeId: 5, parameterId: 0,
      min: -24, max: 24, discrete: true, normalized: .5 }],
  }));
  assert.equal(await page.locator('.graph-slot-edit').inputValue(), '18');
  assert.equal(await page.locator('.graph-control canvas').count(), 1);
  console.log('Graph editor slot UI: original canvas widget retained; fixed slot request and accepted snapshot passed');
} finally {
  await browser.close();
}
