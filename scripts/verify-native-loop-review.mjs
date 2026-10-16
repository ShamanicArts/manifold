import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(new URL('../web/package.json', import.meta.url))('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_NATIVE_LOOP_REVIEW_LABEL ?? '2026-09-30-native-loop-review';
assert.match(label, /^[a-z0-9-]+$/);
const reportPath = new URL(`../docs/rearchitecture/evidence/${label}.json`, import.meta.url);
try { await access(reportPath); throw new Error('Evidence destination exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const root = '/native-loop-publication/2026-09-30-native-owned-loops-final/';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(site + root);
  assert.equal(await page.locator('audio').count(), 6);
  const served = await page.evaluate(async root => {
    const manifest = await (await fetch(root + 'manifest.json')).json(), sources = [], recordings = [];
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    for (const [path, expected] of Object.entries(manifest.sourceHashes)) {
      const response = await fetch(root + 'measured-source/' + path);
      sources.push({ path, expected, actual: await hash(await response.arrayBuffer()), status: response.status });
    }
    for (const host of manifest.hosts) for (const [name, expected] of Object.entries(host.files)) {
      const response = await fetch(root + host.host + '/' + name);
      recordings.push({ path: host.host + '/' + name, expected, actual: await hash(await response.arrayBuffer()), status: response.status });
    }
    return { manifest, sources, recordings };
  }, root);
  for (const file of [...served.sources, ...served.recordings]) { assert.equal(file.status, 200); assert.equal(file.actual, file.expected); }
  await page.screenshot({ path: new URL(`../docs/rearchitecture/evidence/${label}.png`, import.meta.url).pathname, fullPage: true });
  await page.locator('audio').nth(0).evaluate(player => player.play());
  await page.waitForFunction(() => !document.querySelectorAll('audio')[0].paused);
  await page.locator('audio').nth(1).evaluate(player => player.play());
  await page.waitForFunction(() => document.querySelectorAll('audio')[0].paused && !document.querySelectorAll('audio')[1].paused);
  await page.locator('audio').nth(1).evaluate(player => player.pause());
  const players = await page.locator('audio').evaluateAll(players => players.map(player => ({ paused: player.paused, autoplay: player.autoplay, error: player.error?.message ?? null })));
  assert.ok(players.every(player => player.paused && !player.autoplay && !player.error));
  assert.deepEqual(errors, []);
  const report = { recordedAt: new Date().toISOString(), site: site + root, chromiumVersion: browser.version(), ...served, players, pageErrors: errors };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ sources: served.sources.length, artifacts: served.recordings.length, players, pageErrors: errors }));
} finally { await browser.close(); }
