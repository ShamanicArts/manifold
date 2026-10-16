// Verify the independently installed tarball and retained recordings on private audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(new URL('../web/package.json', import.meta.url))('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_INSTALLED_MIDI_PROOF_LABEL ?? '2026-09-30-installed-midi-library';
assert.match(label, /^[a-z0-9-]+$/);
const reportPath = new URL(`../docs/rearchitecture/evidence/${label}.json`, import.meta.url);
try { await access(reportPath); throw new Error('Evidence destination already exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const tarball = await readFile(new URL('../web/public/importable-midi-library/manifold-author-0.1.0.tgz', import.meta.url));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const steps = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/importable-midi-library/`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('#start').click();
  await page.waitForFunction(() => window.manifoldPreparedMidi.host?.ready && !document.querySelector('#insert').disabled);
  await page.evaluate(() => {
    const { host, context } = window.manifoldPreparedMidi;
    const analyser = context.createAnalyser(); analyser.fftSize = 2048;
    const monitor = context.createGain(); monitor.gain.value = .3;
    analyser.connect(monitor); monitor.connect(context.destination); host.connect(null, analyser);
    window.consumerAnalyser = analyser;
  });
  await page.locator('[data-note="60"]').click();
  await page.waitForFunction(() => window.manifoldPreparedMidi.host.diagnostics.eventsConsumed === 1);
  const measure = () => page.evaluate(() => {
    const signal = new Float32Array(window.consumerAnalyser.fftSize); window.consumerAnalyser.getFloatTimeDomainData(signal);
    let peak = 0, sum = 0; for (const value of signal) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
    return { peak, rms: Math.sqrt(sum / signal.length), diagnostics: window.manifoldPreparedMidi.host.diagnostics,
      graph: window.manifoldPreparedMidi.project.toProject() };
  });
  await page.waitForTimeout(150); const onset = await measure(); assert.ok(onset.peak > .001); steps.push({ name: 'installed-note-on', ...onset });
  await page.locator('#insert').click(); await page.waitForFunction(() => !document.querySelector('#insert').disabled);
  await page.locator('#semitones').evaluate(element => { element.value = '7'; element.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => document.querySelector('#interval').textContent === '7');
  await page.locator('#bend').evaluate(element => { element.value = '10000'; element.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.manifoldPreparedMidi.host.diagnostics.eventsConsumed === 2);
  await page.waitForTimeout(100); const edited = await measure(); assert.ok(edited.peak > .001);
  assert.equal(edited.diagnostics.publications, 2); assert.equal(edited.diagnostics.lastTransferredNodes, 2);
  assert.equal(edited.graph.signal.initialParameters.find(p => p.nodeId === 5 && p.id === 0).value, 7);
  steps.push({ name: 'installed-insert-interval-bend', ...edited });
  await page.screenshot({ path: new URL(`../docs/rearchitecture/evidence/${label}.png`, import.meta.url).pathname, fullPage: true });
  await page.locator('[data-note="60"]').click(); await page.waitForFunction(() => window.manifoldPreparedMidi.host.diagnostics.eventsConsumed === 3);
  await page.waitForTimeout(800); const release = await measure(); assert.equal(release.peak, 0);
  for (const field of ['rustCallbackAllocations', 'rustCallbackDeallocations', 'rustProcessingFailures']) assert.equal(release.diagnostics[field], 0);
  steps.push({ name: 'installed-original-key-release', ...release });
  // Exercise the public MIDI route API: reconnecting changes ownership and
  // prepares a candidate instead of mutating stale held-note state.
  const route = await page.evaluate(async () => {
    const { host, project } = window.manifoldPreparedMidi;
    await project.sendEvents([{ kind: 0, note: 62, velocity: 90 }]);
    while (host.diagnostics.eventsConsumed < 4) await new Promise(resolve => setTimeout(resolve, 5));
    await project.session.route({ to: 6, input: 'midi', from: 4, output: 'out' });
    return { diagnostics: host.diagnostics, graph: project.toProject() };
  });
  steps.push({ name: 'installed-midi-route-publication', ...route });
  // The transpose and distortion retain state; the rewired voice does not.
  assert.equal(route.diagnostics.publications, 3); assert.equal(route.diagnostics.lastTransferredNodes, 2);
  assert.equal(route.graph.signal.connections.find(edge => edge.to === 6 && edge.inputPort === 0).from, 4);
  await page.waitForTimeout(100); const rewired = await measure(); assert.equal(rewired.peak, 0);
  steps.push({ name: 'installed-midi-route-resets-old-voice', ...rewired });
  // Playing retained evidence closes the live host and allows one player.
  await page.locator('audio').nth(0).evaluate(element => {
    // The page intentionally pauses this request while disposing the live host.
    element.play().catch(error => { if (error.name !== 'AbortError') throw error; });
  });
  await page.waitForFunction(() => !window.manifoldPreparedMidi.host && !document.querySelector('audio').paused);
  await page.locator('audio').nth(1).evaluate(element => element.play());
  await page.waitForFunction(() => document.querySelectorAll('audio')[0].paused && !document.querySelectorAll('audio')[1].paused);
  await page.locator('audio').nth(1).evaluate(element => element.pause());
  // Assert the actual served evidence remains identical and its capsule hashes
  // describe the retained recording sources, independent of later page edits.
  const recordings = await page.evaluate(async () => {
    const root = '/prepared-midi/2026-09-30-prepared-midi-v2/';
    const report = await (await fetch(`${root}report.json`)).json();
    const context = new AudioContext(), buffers = [];
    for (const name of ['edited.wav', 'reference.wav']) {
      const response = await fetch(root + name); if (!response.ok) throw new Error('Missing recording');
      const bytes = await response.arrayBuffer(), decoded = await context.decodeAudioData(bytes.slice(0));
      buffers.push({ name, byteLength: bytes.byteLength, frames: decoded.length, channels: decoded.numberOfChannels,
        sampleRate: decoded.sampleRate, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2,'0')).join('') });
    }
    const capsule = [];
    for (const [path, expected] of Object.entries(report.hashes)) {
      const response = await fetch(`${root}measured-source/${path.split('/').at(-1)}`);
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer())), value => value.toString(16).padStart(2,'0')).join('');
      capsule.push({ path, expected, actual, status: response.status });
    }
    await context.close(); return { buffers, capsule, players: Array.from(document.querySelectorAll('audio'), player => ({ autoplay: player.autoplay, paused: player.paused })) };
  });
  assert.equal(recordings.buffers[0].sha256, recordings.buffers[1].sha256);
  for (const recording of recordings.buffers) { assert.equal(recording.frames, 55808); assert.equal(recording.channels, 2); assert.equal(recording.sampleRate, 48000); }
  for (const source of recordings.capsule) { assert.equal(source.status, 200); assert.equal(source.actual, source.expected); }
  assert.ok(recordings.players.every(player => !player.autoplay && player.paused)); steps.push({ name: 'served-pcm-source-and-player-policy', ...recordings });
  await page.goto(`${site}/prepared-midi.html`);
  await page.screenshot({ path: new URL(`../docs/rearchitecture/evidence/${label}-review.png`, import.meta.url).pathname, fullPage: true });
  const cdp = await browser.newBrowserCDPSession();
  const workers = (await cdp.send('Target.getTargets')).targetInfos.filter(target => target.type === 'worker' && target.url.includes('prepared-compiler'));
  assert.deepEqual(workers, []); assert.deepEqual(errors, []);
  const report = { recordedAt: new Date().toISOString(), site, chromiumVersion: browser.version(),
    tarballSha256: createHash('sha256').update(tarball).digest('hex'), steps, workersAfterClose: workers, pageErrors: errors };
  await writeFile(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ steps: steps.map(step => step.name), tarballSha256: report.tarballSha256 }));
} catch (error) {
  await writeFile(new URL(`../docs/rearchitecture/evidence/${label}-failure.json`, import.meta.url), JSON.stringify({ recordedAt: new Date().toISOString(), error: error.stack, steps }, null, 2)); throw error;
} finally { await browser.close(); }
