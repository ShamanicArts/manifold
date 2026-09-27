// Build, save, reopen, and play an edited Audio/CV topology in Chromium.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireFromWeb('playwright-core');
function wavSource(frames = 4800, invertRight = true) {
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(48000 * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame++) {
    const value = Math.round(Math.sin(frame * Math.PI * 2 * 330 / 48000) * 12000);
    wav.writeInt16LE(value, 44 + frame * 4);
    wav.writeInt16LE(invertRight ? -value : value, 46 + frame * 4);
  }
  return wav;
}
const browser = await chromium.launch({
  executablePath: process.env.MANIFOLD_CHROMIUM ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4173'}/?primitive=graph-workspace`);
  await page.waitForFunction(() => document.querySelector('#comparison-result').textContent === 'Match');
  assert.equal(await page.locator('#reference-case option').count(), 14);
  assert.match(await page.locator('#reference-title').textContent(), /Native Rust/);
  assert.ok(Number(await page.locator('#max-difference').textContent()) < 1e-5);
  await page.locator('#reference-case').selectOption('distortion');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Input → Gain → Distortion'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  await page.locator('#reference-case').selectOption('cv');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('CV gain'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  await page.locator('#reference-case').selectOption('texture');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Oscillator + noise'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  await page.locator('#reference-case').selectOption('note-voice');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('MIDI → +7 transpose'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  await page.locator('#reference-case').selectOption('sample-voice');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('MIDI → sample voice'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  assert.ok(Number(await page.locator('#max-difference').textContent()) < 1e-5);
  await page.locator('#reference-case').selectOption('region-voice');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('retriggered sample region'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  assert.ok(Number(await page.locator('#max-difference').textContent()) < 1e-5);
  await page.locator('#reference-case').selectOption('granular-source');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Prepared source → granulator'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  assert.ok(Number(await page.locator('#max-difference').textContent()) < 1e-5);
  await page.locator('#reference-case').selectOption('granular-capture');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Live input → capture granulator'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  assert.ok(Number(await page.locator('#max-difference').textContent()) < 1e-5);
  await page.locator('#reference-case').selectOption('main-bank');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Main voice bank'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  await page.locator('#reference-case').selectOption('main-bank-add');
  await page.waitForFunction(() => document.querySelector('#reference-status').textContent.includes('Add mode'));
  assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  for (const [id, label] of [['main-bank-follow-add', 'Main Add with source motion'],
    ['main-bank-follow-morph', 'Main Morph with source motion'],
    ['main-bank-follow-driven', 'Main driven Add with source motion']]) {
    await page.locator('#reference-case').selectOption(id);
    await page.waitForFunction((value) => document.querySelector('#reference-status').textContent.includes(value), label);
    assert.equal(await page.locator('#comparison-result').textContent(), 'Match');
  }
  assert.equal(await page.locator('.graph-node').count(), 3);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  assert.equal(await page.locator('#graph-add-node').isDisabled(), true);
  const gain = page.locator('input[data-node="2"][data-parameter="0"]');
  assert.equal(await gain.isDisabled(), false);
  await gain.fill('0.35');
  await gain.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#audio-toggle').click();

  await page.locator('#graph-add-type').selectOption('distortion');
  await page.locator('#graph-add-node').click();
  assert.equal(await page.locator('.graph-node').count(), 4);
  await page.locator('select[data-to="4"][data-port="0"]').selectOption('2');
  await page.locator('select[data-to="3"][data-port="0"]').selectOption('4');
  await page.locator('input[data-node="4"][data-parameter="0"]').fill('9');
  await page.locator('input[data-node="4"][data-parameter="0"]').press('Tab');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#audio-toggle').click();

  await page.locator('#graph-add-type').selectOption('lfo');
  await page.locator('#graph-add-node').click();
  await page.locator('#graph-add-type').selectOption('modulated-gain');
  await page.locator('#graph-add-node').click();
  await page.locator('select[data-to="6"][data-port="0"]').selectOption('4');
  const cvInput = page.locator('select[data-to="6"][data-port="1"]');
  assert.equal(await cvInput.locator('option[value="2"]').count(), 0);
  await cvInput.selectOption('5');
  await page.locator('select[data-to="3"][data-port="0"]').selectOption('6');
  await page.locator('select[data-to="4"][data-port="0"]').selectOption('6');
  assert.match(await page.locator('#graph-status').textContent(), /cycle/);
  assert.equal(await page.locator('select[data-to="4"][data-port="0"]').inputValue(), '2');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const bundle = JSON.parse((await readFile(await (await downloadPromise).path())).toString());
  assert.equal(bundle.format, 'manifold.project');
  assert.equal(bundle.projectId, 'manifold.graph-workspace');
  assert.equal(bundle.signal.nodes.length, 6);
  assert.equal(bundle.signal.connections.length, 5);
  assert.equal(bundle.signal.initialParameters.find((entry) => entry.nodeId === 4 && entry.id === 0).value, 9);
  assert.equal(bundle.signal.initialParameters.find((entry) => entry.nodeId === 2 && entry.id === 0).value, .35);
  await page.locator('button[aria-label="Remove Distortion node 4"]').click();
  assert.equal(await page.locator('.graph-node').count(), 5);
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'edited-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('.graph-node').count(), 6);
  const invalid = structuredClone(bundle);
  invalid.signal.connections.find((edge) => edge.to === 6 && edge.inputPort === 1).from = 2;
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'invalid-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('port types do not match'));
  assert.equal(await page.locator('select[data-to="6"][data-port="1"]').inputValue(), '5');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-add-type').selectOption('noise');
  await page.locator('#graph-add-node').click();
  assert.equal(await page.locator('.graph-node-parked').count(), 1);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running'));
  const parkedLevel = page.locator('input[data-node="7"][data-parameter="0"]');
  await parkedLevel.fill('0.2');
  await parkedLevel.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('Rust rejected this node parameter'));
  assert.equal(await parkedLevel.inputValue(), '0.08');
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-load-tone').click();
  assert.equal(await page.locator('.graph-node').count(), 8);
  assert.equal(await page.locator('.graph-node-parked').count(), 1);
  assert.equal(await page.locator('#graph-source-mode').inputValue(), 'none');
  assert.equal(await page.locator('#source').isDisabled(), true);
  assert.equal(await page.locator('#source').isHidden(), true);
  assert.equal(await page.locator('#audio-toggle').textContent(), 'Start instrument');
  await page.waitForFunction(() => document.querySelector('#reference-case').value === 'texture');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  const frequency = page.locator('input[data-node="4"][data-parameter="1"]');
  await frequency.fill('330');
  await frequency.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#audio-toggle').click();
  const toneDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const toneBundle = JSON.parse((await readFile(await (await toneDownload).path())).toString());
  assert.equal(toneBundle.signal.inputSource, 'none');
  assert.equal(toneBundle.signal.initialParameters.find((entry) => entry.nodeId === 4 && entry.id === 1).value, 330);
  await page.locator('#graph-source-mode').selectOption('external');
  assert.equal(await page.locator('#source').isDisabled(), false);
  assert.equal(await page.locator('#source').isVisible(), true);
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'tone-texture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(toneBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('#graph-source-mode').inputValue(), 'none');
  assert.equal(await page.locator('#source').isDisabled(), true);
  await page.locator('#graph-load-note').click();
  assert.equal(await page.locator('.graph-node').count(), 6);
  assert.equal(await page.locator('#keyboard-section').isVisible(), true);
  assert.equal(await page.locator('#midi-output-section').isVisible(), true);
  assert.equal(await page.locator('#graph-midi-permission-note').isVisible(), true);
  await page.waitForFunction(() => document.querySelector('#reference-case').value === 'note-voice');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#module-title').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => document.querySelector('#midi-events').textContent.includes('On · C4'));
  await page.waitForFunction(() => document.querySelector('#midi-output-events').textContent.includes('G4 (67)'));
  await page.keyboard.up('a');
  const transpose = page.locator('input[data-node="5"][data-parameter="0"]');
  await transpose.fill('12');
  await transpose.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#module-title').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => document.querySelector('#midi-output-events').textContent.includes('C5 (72)'));
  await page.keyboard.up('a');
  await page.locator('#audio-toggle').click();
  const noteDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const noteBundle = JSON.parse((await readFile(await (await noteDownload).path())).toString());
  assert.equal(noteBundle.signal.initialParameters.find((entry) => entry.nodeId === 5 && entry.id === 0).value, 12);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'note-voice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(noteBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('input[data-node="5"][data-parameter="0"]').inputValue(), '12');
  assert.equal(await page.locator('#keyboard-section').isVisible(), true);
  await page.locator('#graph-load-sample').click();
  assert.equal(await page.locator('.graph-node').count(), 5);
  assert.match(await page.locator('.graph-sample-file').textContent(), /Built-in two-tone source/);
  assert.equal(await page.locator('#keyboard-section').isVisible(), true);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#module-title').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => document.querySelector('#midi-events').textContent.includes('On · C4'));
  await page.keyboard.up('a');
  await page.locator('#audio-toggle').click();
  const sampleDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const sampleBundle = JSON.parse((await readFile(await (await sampleDownload).path())).toString());
  assert.equal(sampleBundle.assets.length, 1);
  assert.equal(sampleBundle.assets[0].nodeId, 5);
  assert.equal(sampleBundle.assets[0].frames, 24000);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'sample-voice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sampleBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.match(await page.locator('.graph-sample-file').textContent(), /Built-in two-tone source/);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  const corrupted = structuredClone(sampleBundle);
  corrupted.assets[0].nodeId = 6;
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'corrupt-sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupted)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('Invalid graph sample asset'));
  assert.match(await page.locator('.graph-sample-file').textContent(), /Built-in two-tone source/);
  const wav = wavSource();
  await page.locator('input[aria-label="Sample instrument 5 audio file"]').setInputFiles([{
    name: 'replacement.wav', mimeType: 'audio/wav', buffer: wav,
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('Loaded replacement.wav'));
  assert.match(await page.locator('.graph-sample-file').textContent(), /replacement.wav/);
  await page.locator('#graph-add-type').selectOption('sample-instrument');
  await page.locator('#graph-add-node').click();
  await page.locator('input[aria-label="Sample instrument 7 audio file"]').setInputFiles([{
    name: 'second.wav', mimeType: 'audio/wav', buffer: wav,
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('Loaded second.wav'));
  assert.equal(await page.locator('.graph-node-parked').count(), 2);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  await page.locator('select[data-to="7"][data-port="0"]').selectOption('4');
  await page.locator('#graph-add-type').selectOption('sum2');
  await page.locator('#graph-add-node').click();
  await page.locator('select[data-to="8"][data-port="0"]').selectOption('6');
  await page.locator('select[data-to="8"][data-port="1"]').selectOption('7');
  await page.locator('select[data-to="3"][data-port="0"]').selectOption('8');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  const multiDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const multiBundle = JSON.parse((await readFile(await (await multiDownload).path())).toString());
  assert.deepEqual(multiBundle.assets.map((asset) => asset.nodeId), [5, 7]);
  assert.deepEqual(multiBundle.assets.map((asset) => asset.frames), [4800, 4800]);
  await page.locator('#graph-load-region').click();
  assert.equal(await page.locator('.graph-node').count(), 5);
  assert.match(await page.locator('input[aria-label="Sample region 5 audio file"]').locator('..').textContent(), /Built-in two-tone source/);
  assert.equal(await page.locator('#keyboard-section').isVisible(), true);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#module-title').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => document.querySelector('#midi-events').textContent.includes('On · C4'));
  await page.keyboard.up('a');
  const regionSpeed = page.locator('input[data-node="5"][data-parameter="0"]');
  await regionSpeed.fill('1.5');
  await regionSpeed.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#audio-toggle').click();
  const regionDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const regionBundle = JSON.parse((await readFile(await (await regionDownload).path())).toString());
  assert.equal(regionBundle.signal.nodes.find((node) => node.id === 5).type, 'sample-region');
  assert.equal(regionBundle.signal.initialParameters.find((entry) => entry.nodeId === 5 && entry.id === 0).value, 1.5);
  assert.equal(regionBundle.assets[0].nodeId, 5);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'region-voice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(regionBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('input[data-node="5"][data-parameter="0"]').inputValue(), '1.5');
  assert.match(await page.locator('input[aria-label="Sample region 5 audio file"]').locator('..').textContent(), /Built-in two-tone source/);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  const mixed = structuredClone(multiBundle);
  mixed.signal.nodes.find((node) => node.id === 7).type = 'sample-region';
  mixed.signal.initialParameters = mixed.signal.initialParameters.filter((entry) => entry.nodeId !== 7);
  const regionTemplate = JSON.parse((await readFile(new URL('../projects/graph-workspace/region-voice.json', import.meta.url))).toString());
  mixed.signal.initialParameters.push(...regionTemplate.signal.initialParameters
    .filter((entry) => entry.nodeId === 5).map((entry) => ({ ...entry, nodeId: 7 })));
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'mixed-sample-nodes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mixed)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('input[aria-label="Sample region 7 audio file"]').count(), 1);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-load-granular').click();
  assert.equal(await page.locator('.graph-node').count(), 4);
  assert.match(await page.locator('input[aria-label="Granulator 5 audio file"]').locator('..').textContent(), /Built-in two-tone source/);
  assert.equal(await page.locator('#keyboard-section').isHidden(), true);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  const density = page.locator('input[data-node="5"][data-parameter="1"]');
  await density.fill('35');
  await density.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#audio-toggle').click();
  const granularDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const granularBundle = JSON.parse((await readFile(await (await granularDownload).path())).toString());
  assert.equal(granularBundle.signal.nodes.find((node) => node.id === 5).type, 'granulator');
  assert.equal(granularBundle.signal.initialParameters.find((entry) => entry.nodeId === 5 && entry.id === 1).value, 35);
  assert.equal(granularBundle.assets[0].nodeId, 5);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'granular-source.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(granularBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('input[data-node="5"][data-parameter="1"]').inputValue(), '35');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  await page.locator('button[aria-label="Remove source from Granulator 5"]').click();
  assert.match(await page.locator('input[aria-label="Granulator 5 audio file"]').locator('..').textContent(), /Live input capture/);
  await page.locator('select[data-to="5"][data-port="0"]').selectOption('1');
  await page.locator('#graph-source-mode').selectOption('external');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · test oscillator'));
  await page.locator('#audio-toggle').click();
  const liveDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const liveBundle = JSON.parse((await readFile(await (await liveDownload).path())).toString());
  assert.equal(liveBundle.assets, undefined);
  assert.equal(liveBundle.signal.connections.find((edge) => edge.to === 5 && edge.inputPort === 0).from, 1);
  await page.locator('#graph-load-main').click();
  assert.equal(await page.locator('.graph-node').count(), 5);
  assert.equal(await page.locator('#keyboard-section').isVisible(), true);
  assert.match(await page.locator('input[aria-label="Main voice bank 5 audio file"]').locator('..').textContent(), /Built-in two-tone source/);
  assert.equal(await page.locator('.graph-target').count(), 2);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#module-title').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => document.querySelector('#midi-events').textContent.includes('On · C4'));
  await page.keyboard.up('a');
  await page.locator('select[data-node="5"][data-parameter="6"]').selectOption('4');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('#audio-toggle').click();
  const mainDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const mainSaved = JSON.parse((await readFile(await (await mainDownload).path())).toString());
  assert.equal(mainSaved.targets.length, 2);
  assert.equal(mainSaved.assets[0].nodeId, 5);
  assert.equal(mainSaved.signal.initialParameters.find((entry) => entry.nodeId === 5 && entry.id === 6).value, 4);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'main-bank-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mainSaved)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('select[data-node="5"][data-parameter="6"]').inputValue(), '4');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  const sourceProject = JSON.parse((await readFile(new URL('../projects/main-voice-bank/project.json', import.meta.url))).toString());
  const standalone = { schemaVersion: 3, projectId: sourceProject.id,
    parameters: Object.fromEntries(sourceProject.parameters.map((parameter) => [parameter.hostId, parameter.default])),
    targetControls: { active: true, mode: 3, waveform: 0, position: .5, morphAmount: .5,
      tiltMode: 0, stretch: 0, smooth: 0, contrast: 1, followPlayback: true, speed: 1.5 },
    targets: [sourceProject.partials, ...sourceProject.extraPartials], source: { kind: 'builtin' } };
  standalone.parameters.blend = .72;
  standalone.parameters['blend-mode'] = 5;
  await page.locator('input[aria-label="Main voice bank 5 state"]').setInputFiles([{
    name: 'standalone-main.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(standalone)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Imported'));
  assert.equal(await page.locator('input[data-node="5"][data-parameter="1"]').inputValue(), '0.72');
  assert.equal(await page.locator('input[aria-label="Main voice bank 5 follow source position"]').isChecked(), true);
  assert.equal(await page.locator('input[aria-label="Main voice bank 5 motion speed"]').inputValue(), '1.5');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#module-title').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => document.querySelector('#midi-events').textContent.includes('On · C4'));
  await page.keyboard.up('a');
  const speed = page.locator('input[aria-label="Main voice bank 5 motion speed"]');
  await speed.fill('0.5');
  await speed.press('Tab');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('source motion to 0.5×'));
  await page.locator('#audio-toggle').click();
  const motionDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const motionBundle = JSON.parse((await readFile(await (await motionDownload).path())).toString());
  assert.equal(motionBundle.temporal[0].speed, .5);
  assert.equal(motionBundle.temporal[0].mode, 2);
  assert.equal(motionBundle.temporal[0].recipe[6], .5);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'main-motion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(motionBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('input[aria-label="Main voice bank 5 motion speed"]').inputValue(), '0.5');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  await page.locator('.graph-motion summary').click();
  await page.locator('select[aria-label="Main voice bank 5 Add source"]').selectOption('1');
  await page.locator('select[aria-label="Main voice bank 5 Driven wave"]').selectOption('6');
  await page.locator('select[aria-label="Main voice bank 5 Spectral tilt"]').selectOption('2');
  await page.locator('input[aria-label="Main voice bank 5 Pulse width"]').evaluate((input) => {
    input.value = '.35';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.locator('.graph-motion').getAttribute('open'), '');
  const shapedDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const shaped = JSON.parse((await readFile(await (await shapedDownload).path())).toString());
  assert.equal(shaped.temporal[0].recipe[5], 1);
  assert.equal(shaped.temporal[0].recipe[0], 6);
  assert.equal(shaped.temporal[0].recipe[10], 2);
  assert.equal(shaped.temporal[0].recipe[4], .35);
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'main-shaped.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(shaped)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  await page.locator('.graph-motion summary').click();
  assert.equal(await page.locator('select[aria-label="Main voice bank 5 Add source"]').inputValue(), '1');
  assert.equal(await page.locator('select[aria-label="Main voice bank 5 Driven wave"]').inputValue(), '6');
  assert.equal(await page.locator('input[aria-label="Main voice bank 5 Pulse width"]').inputValue(), '0.35');
  await page.locator('select[data-node="5"][data-parameter="6"]').selectOption('4');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  await page.locator('.graph-target').first().locator('summary').click();
  const targetEdit = page.locator('textarea[aria-label="Main voice bank 5 wave target JSON"]');
  await targetEdit.fill(JSON.stringify({ fundamental: 1, values: [1, .8, 0, 0] }));
  await page.locator('.graph-target').first().getByRole('button', { name: 'Apply target' }).click();
  assert.match(await page.locator('#graph-status').textContent(), /Updated wave target/);
  const editedDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const editedMain = JSON.parse((await readFile(await (await editedDownload).path())).toString());
  assert.deepEqual(editedMain.targets[0].values, [1, .8, 0, 0]);
  await page.locator('input[aria-label="Main voice bank 5 audio file"]').setInputFiles([{
    name: 'new-main-source.wav', mimeType: 'audio/wav', buffer: wavSource(12000, false),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('new prepared source target'), null, { timeout: 45000 });
  const replacementDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const replacedMain = JSON.parse((await readFile(await (await replacementDownload).path())).toString());
  assert.deepEqual(replacedMain.targets[0].values, [1, .8, 0, 0], 'wave target remains authored');
  assert.notDeepEqual(replacedMain.targets[1].values, editedMain.targets[1].values, 'source target follows the new file');
  assert.match(replacedMain.assets[0].label, /new-main-source.wav/);
  await page.locator('input[aria-label="Main voice bank 5 audio file"]').setInputFiles([{
    name: 'cancelled-source.wav', mimeType: 'audio/wav', buffer: wavSource(12000),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('no usable prepared partials'));
  const failedDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const afterFailure = JSON.parse((await readFile(await (await failedDownload).path())).toString());
  assert.deepEqual(afterFailure.targets, replacedMain.targets, 'rejected analysis leaves prepared targets intact');
  assert.deepEqual(afterFailure.assets, replacedMain.assets, 'rejected analysis leaves source intact');
  await page.locator('button[aria-label="Use built-in source for Main voice bank 5"]').click();
  const builtInDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const restoredBuiltIn = JSON.parse((await readFile(await (await builtInDownload).path())).toString());
  const mainTemplate = JSON.parse((await readFile(new URL('../projects/graph-workspace/main-bank.json', import.meta.url))).toString());
  assert.deepEqual(restoredBuiltIn.targets[0].values, [1, .8, 0, 0]);
  assert.deepEqual(restoredBuiltIn.targets[1], mainTemplate.targets[1]);
  assert.equal(restoredBuiltIn.assets[0].label, 'Built-in two-tone source');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  let delayedAnalysisRequests = 0;
  await page.route('**/manifold_filter.wasm', async (route) => {
    delayedAnalysisRequests++;
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.locator('input[aria-label="Main voice bank 5 audio file"]').setInputFiles([{
    name: 'superseded-source.wav', mimeType: 'audio/wav', buffer: wavSource(12000, false),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('Preparing superseded-source.wav'));
  await page.locator('#graph-load-main').click();
  await page.waitForTimeout(1200);
  assert.ok(delayedAnalysisRequests >= 1, 'the stale worker fetch was delayed');
  const raceDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const afterSupersede = JSON.parse((await readFile(await (await raceDownload).path())).toString());
  assert.equal(afterSupersede.assets[0].label, 'Built-in two-tone source');
  await page.unroute('**/manifold_filter.wasm');
  await page.locator('input[aria-label="Main voice bank 5 follow source position"]').check();
  assert.match(await page.locator('#graph-status').textContent(), /Enabled source motion/);
  await page.locator('select[data-node="5"][data-parameter="6"]').selectOption('4');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · instrument'));
  await page.locator('#audio-toggle').click();
  await page.locator('input[aria-label="Main voice bank 5 follow source position"]').uncheck();
  const disabledMotionDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const disabledMotion = JSON.parse((await readFile(await (await disabledMotionDownload).path())).toString());
  assert.equal(disabledMotion.temporal, undefined);
  await page.locator('#graph-load-live-sampler').click();
  assert.equal(await page.locator('.graph-node').count(), 6);
  assert.equal(await page.locator('#graph-source-mode').inputValue(), 'external');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · test oscillator'));
  await page.locator('select[data-node="6"][data-parameter="0"]').selectOption('1');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.waitForTimeout(180);
  await page.locator('select[data-node="6"][data-parameter="0"]').selectOption('0');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('button[aria-label="Use stopped take for sample instrument 5"]').click();
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('now the source for new notes'));
  const samplerDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const samplerBundle = JSON.parse((await readFile(await (await samplerDownload).path())).toString());
  assert.equal(samplerBundle.signal.nodes.find((node) => node.id === 6).type, 'loop-capture');
  assert.equal(samplerBundle.assets[0].label, 'Loop take 6');
  assert.ok(samplerBundle.assets[0].frames > 1000);
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'live-sampler.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(samplerBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.match(await page.locator('input[aria-label="Sample instrument 5 audio file"]').locator('..').textContent(), /Loop take 6/);
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio running · test oscillator'));
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-workspace-section').screenshot({ path: 'web/public/graph-live-sampler-controls.png' });
  await page.locator('#graph-load-sidechain-sampler').click();
  assert.equal(await page.locator('#graph-sidechain-mode').inputValue(), 'oscillator');
  assert.equal(await page.locator('select[data-to="6"][data-port="0"]').inputValue(), '8');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('test oscillator + oscillator sidechain'));
  await page.locator('select[data-node="6"][data-parameter="0"]').selectOption('1');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.waitForTimeout(220);
  await page.locator('select[data-node="6"][data-parameter="0"]').selectOption('0');
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('in Rust and project state'));
  await page.locator('button[aria-label="Use stopped take for sample instrument 5"]').click();
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.includes('now the source for new notes'));
  const sideDownload = page.waitForEvent('download');
  await page.locator('#graph-project-export').click();
  const sideBundle = JSON.parse((await readFile(await (await sideDownload).path())).toString());
  assert.equal(sideBundle.signal.sidechainSource, 'oscillator');
  const sideAsset = sideBundle.assets[0];
  const pcm = Buffer.from(sideAsset.pcmF32Base64, 'base64');
  let crossings = 0;
  for (let frame = 1; frame < sideAsset.frames; frame++) {
    if (pcm.readFloatLE((frame - 1) * 8) <= 0 && pcm.readFloatLE(frame * 8) > 0) crossings++;
  }
  const capturedHz = crossings * sideAsset.sourceRate / sideAsset.frames;
  assert.ok(capturedHz > 290 && capturedHz < 370, `sidechain take should contain 330 Hz, got ${capturedHz}`);
  await page.locator('#audio-toggle').click();
  await page.locator('#graph-workspace-section').screenshot({ path: 'web/public/graph-sidechain-sampler-controls.png' });
  await page.locator('#graph-load-tone').click();
  await page.locator('#graph-project-file').setInputFiles([{
    name: 'sidechain-sampler.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sideBundle)),
  }]);
  await page.waitForFunction(() => document.querySelector('#graph-status').textContent.startsWith('Opened'));
  assert.equal(await page.locator('#graph-sidechain-mode').inputValue(), 'oscillator');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('test oscillator + oscillator sidechain'));
  await page.locator('#audio-toggle').click();
  assert.deepEqual(errors, []);
  console.log(`Graph workspace browser: live and sidechain sampler capture (${capturedHz.toFixed(1)} Hz), source analysis and rejection, per-voice motion and shaping, 14 native/Wasm references passed`);
} finally {
  await browser.close();
}
