// Automated playback must run under scripts/with-private-null-audio.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const profiling = process.env.MANIFOLD_RUNTIME_PROFILING !== '0';
const root = new URL('../', import.meta.url);
const label = process.env.MANIFOLD_RUNTIME_PROOF_LABEL ?? '';
assert.match(label, /^[a-zA-Z0-9_-]{0,80}$/);
const publicPath = `/runtime-graph-proof/${label ? `${label}/` : ''}`;
const output = new URL(`web/public${publicPath}`, root);
const evidence = new URL('docs/rearchitecture/evidence/', root);
// Never replace a recorded run, including one with scheduling failures.
try { if ((await readdir(output)).length) throw new Error('Evidence already exists; set a fresh MANIFOLD_RUNTIME_PROOF_LABEL'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {};
for (const path of ['packages/manifold-author/browser.js', 'packages/manifold-author/shared-graph-processor.js',
  'packages/manifold-author/worker-transport.js', 'packages/manifold-author/graph-worker.js',
  'web/src/graph-runtime-review.js', 'web/src/runtime-review-recorder.js', 'packages/manifold-author/runtime/manifold_filter.wasm']) {
  hashes[path] = sha256(await readFile(new URL(path, root)));
}
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const cdp = await browser.newBrowserCDPSession();
  const graphWorkers = async () => (await cdp.send('Target.getTargets')).targetInfos
    .filter(target => target.type === 'worker' && target.url.includes('graph-worker'))
    .map(target => ({ id: target.targetId, url: target.url }));
  const runs = [];
  for (const example of ['dsp-live-scripting', 'fx-slot-swap']) {
    await page.goto(`${site}/graph-runtime-review.html`);
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
    await page.locator('#example').selectOption(example);
    await page.locator('#profile').setChecked(profiling);
    await page.locator('#run').click();
    try {
      await page.waitForFunction(() => !window.manifoldRuntimeReview.busy, null, { timeout: 60_000 });
    } catch (error) {
      await writeFile(new URL(`${example}-failure.json`, output), JSON.stringify({ error: error.message,
        status: await page.locator('#status').textContent(), pageErrors: errors, workers: await graphWorkers() }, null, 2));
      throw error;
    }
    const report = await page.evaluate(() => window.manifoldRuntimeReview.report);
    if (!report || report.editCount !== 24) {
      await writeFile(new URL(`${example}-failure.json`, output), JSON.stringify({ report,
        status: await page.locator('#status').textContent(), pageErrors: errors, workers: await graphWorkers() }, null, 2));
      throw new Error(`Review failed: ${await page.locator('#status').textContent()}`);
    }
    assert.equal(report.tapeOverflow, false);
    assert.equal(report.secondaryRecording.tapeOverflow, false);
    assert.equal(report.cadence.overflow, false);
    assert.equal(report.secondaryRecording.cadence.overflow, false);
    assert.equal(report.edits.length, 24);
    assert.ok(report.signal.rms > .001);
    assert.ok(report.secondaryRecording.signal.rms > .001);
    for (const [profile, cadence, first, last, signal] of [
      [report.finalWorkerProfiles.primary, report.cadence, report.recordingFirstContextFrame, report.recordingLastContextFrame, report.signal],
      [report.finalWorkerProfiles.secondary, report.secondaryRecording.cadence, report.secondaryRecording.firstContextFrame, report.secondaryRecording.lastContextFrame, report.secondaryRecording.signal],
    ]) {
      assert.equal(last - first, signal.frames);
      assert.equal(cadence.callbacks * 128, signal.frames);
      assert.equal(cadence.clock, 'Date.now');
      assert.ok(profiling ? profile.service.blocks > 0 : profile.service === null);
    }
    assert.ok(report.signal.seconds > 3);
    assert.ok(report.after.secondary.audioBlocks > report.before.secondary.audioBlocks + 100);
    assert.equal(report.after.primary.publications, 24);
    assert.equal(report.after.primary.pendingRetirements, 0);
    const workersAfterClose = await graphWorkers();
    assert.deepEqual(workersAfterClose, []);
    assert.equal(report.finalGraph.signal.initialParameters.find(parameter => parameter.nodeId === 4 && parameter.id === 0).value, .375);
    for (const [id, suffix] of [['wav', '.wav'], ['wav-secondary', '-secondary.wav'], ['json', '.json'], ['package', '.manifold.json']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator(`#${id}`).click()]);
      await copyFile(await download.path(), new URL(`${example}${suffix}`, output));
    }
    const audio = await readFile(new URL(`${example}.wav`, output));
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.readUInt16LE(20), 3); // stereo float32 WAV
    assert.equal(audio.readUInt32LE(40) / 8, report.signal.frames);
    const secondAudio = await readFile(new URL(`${example}-secondary.wav`, output));
    assert.equal(secondAudio.readUInt32LE(40) / 8, report.secondaryRecording.signal.frames);
    await page.screenshot({ path: new URL(`${label ? `${label}-` : ''}runtime-graph-${example}.png`, evidence).pathname, fullPage: true });
    const cadenceSummary = ({ rows, ...summary }) => summary;
    runs.push({ example, profiling, signal: report.signal, secondarySignal: report.secondaryRecording.signal, latency: report.latency,
      cadence: cadenceSummary(report.cadence), secondaryCadence: cadenceSummary(report.secondaryRecording.cadence),
      finalWorkerProfiles: report.finalWorkerProfiles,
      before: report.before, after: report.after, workersAfterClose, audioSha256: sha256(audio),
      secondaryAudioSha256: sha256(secondAudio), secondaryAudio: `${publicPath}${example}-secondary.wav`,
      report: `${publicPath}${example}.json`, audio: `${publicPath}${example}.wav`,
      package: `${publicPath}${example}.manifold.json` });
    console.log(JSON.stringify(runs.at(-1)));
    await writeFile(new URL('summary.json', output), JSON.stringify({ recordedAt: new Date().toISOString(),
      status: 'partial', site, chromiumVersion: browser.version(), hashes, pageErrors: errors, runs }, null, 2));
  }
  assert.deepEqual(errors, []);
  const summary = { recordedAt: new Date().toISOString(), status: 'complete', site, chromiumVersion: browser.version(),
    audioRouting: 'scripts/with-private-null-audio.py disposable null sink',
    hashes, pageErrors: errors, runs };
  await writeFile(new URL('summary.json', output), JSON.stringify(summary, null, 2));
  await writeFile(new URL(`${label || '2026-09-30-runtime-graph-review'}.json`, evidence), JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
