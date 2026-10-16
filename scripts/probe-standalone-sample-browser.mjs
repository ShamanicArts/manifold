// Runs a real Rust/Wasm AudioWorklet in muted, headless Chromium.
// The browser cannot connect to the user's PulseAudio/PipeWire socket.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '../web/node_modules/playwright-core/index.mjs';

const url = process.env.MANIFOLD_SAMPLE_URL ?? 'http://127.0.0.1:4173/standalone-sample.html';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  env: { ...process.env, PULSE_SERVER: 'unix:/tmp/manifold-no-audio-server' } });
const page = await browser.newPage({ viewport: { width: 1100, height: 960 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function saveBundle() {
  const pending = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await pending;
  return JSON.parse(readFileSync(await download.path(), 'utf8'));
}
function decodePcm(bundle) {
  const asset = bundle.assets?.find((item) => item.nodeId === 5);
  if (!asset) throw new Error('Saved project has no sample asset.');
  const data = Buffer.from(asset.pcmF32Base64, 'base64');
  const values = new Float32Array(asset.frames);
  for (let frame = 0; frame < values.length; frame++) values[frame] = data.readFloatLE(frame * 8);
  return values;
}
function crossings(values, sampleRate) {
  let count = 0;
  // Ignore a short capture boundary and measure the final 0.3 seconds.
  const start = Math.max(1, values.length - Math.floor(sampleRate * .3));
  for (let i = start; i < values.length; i++) if (values[i - 1] <= 0 && values[i] > 0) count++;
  return count / ((values.length - start) / sampleRate);
}
function testWav() {
  const sampleRate = 48_000, frames = 9_600;
  const bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 4, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame++) {
    const value = Math.round(Math.sin(2 * Math.PI * 220 * frame / sampleRate) * 18_000);
    bytes.writeInt16LE(value, 44 + frame * 4);
    bytes.writeInt16LE(value, 46 + frame * 4);
  }
  return bytes;
}
async function selectSource(index) {
  await page.locator('#widget-sample_source_dropdown').click();
  const overlay = page.locator('.project-dropdown-overlay:visible');
  const box = await overlay.boundingBox();
  const scale = box.height / 64;
  await page.mouse.click(box.x + 30 * scale, box.y + (2 + index * 30 + 15) * scale);
}

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  const widgets = await page.locator('#plugin-content [data-widget]').evaluateAll((elements) =>
    elements.map((element) => ({ id: element.dataset.widget, x: element.offsetLeft,
      y: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight })));
  const expected = [
    ['sampleRoot', 0, 0, 472, 208],
    ['sample_graph', 10, 10, 226, 126],
    ['sample_panel', 242, 10, 220, 188],
    ['sample_source_dropdown', 246, 18, 68, 20],
  ];
  for (const [id, x, y, width, height] of expected) {
    const got = widgets.find((item) => item.id === id);
    if (!got || got.x !== x || got.y !== y || got.width !== width || got.height !== height) {
      throw new Error(`Original widget geometry differs for ${id}: ${JSON.stringify(got)}`);
    }
  }
  await page.locator('#capture-seconds').selectOption('0.5');
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#engine-indicator').textContent === 'Running');
  await page.waitForTimeout(800);

  await selectSource(1);
  await page.locator('#capture-button').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('published'), null, { timeout: 15_000 });
  const graph = await page.locator('#widget-sample_graph').boundingBox();
  const graphScale = graph.width / 226;
  await page.mouse.move(graph.x + 2 * graphScale, graph.y + 116 * graphScale);
  await page.mouse.down();
  await page.mouse.move(graph.x + graph.width * .2, graph.y + 116 * graphScale, { steps: 4 });
  await page.mouse.up();
  const sidechain = await saveBundle();
  const sidechainHz = crossings(decodePcm(sidechain), sidechain.assets[0].sourceRate);
  const loopStart = sidechain.signal.initialParameters.find((item) => item.nodeId === 5 && item.id === 7)?.value;
  if (sidechain.signal.selectedCaptureSourceId !== 1 || sidechainHz < 300 || sidechainHz > 360) {
    throw new Error(`Sidechain capture/source mismatch: ${sidechainHz.toFixed(1)} Hz`);
  }
  if (Math.abs(loopStart - .2) > .03) throw new Error(`Loop start drag was not saved: ${loopStart}`);
  const key = await page.locator('.sample-key').nth(0).boundingBox();
  await page.mouse.move(key.x + key.width / 2, key.y + key.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const outputDuringNote = await page.locator('#output-db').textContent();
  await page.mouse.up();
  if (!outputDuringNote || outputDuringNote.includes('∞')) throw new Error('Sample note produced no measured output.');
  await page.screenshot({ path: resolve('web/public/standalone-sample-browser.png'), fullPage: true });

  await selectSource(0);
  await page.waitForTimeout(650);
  await page.locator('#capture-button').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('published'), null, { timeout: 15_000 });
  const audioInput = await saveBundle();
  const inputHz = crossings(decodePcm(audioInput), audioInput.assets[0].sourceRate);
  if (audioInput.signal.selectedCaptureSourceId !== 0 || inputHz < 145 || inputHz > 185) {
    throw new Error(`Audio Input capture/source mismatch: ${inputHz.toFixed(1)} Hz`);
  }
  await page.locator('#sample-file').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: testWav() });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('loaded'), null, { timeout: 15_000 });
  const fileProject = await saveBundle();
  if (fileProject.assets?.[0]?.frames !== 9_600 || fileProject.assets[0].label !== 'test-tone.wav') {
    throw new Error('Live file replacement did not reach portable project state.');
  }
  await page.locator('#audio-toggle').click();
  await page.waitForFunction(() => document.querySelector('#engine-indicator').textContent === 'Idle');
  const savedPath = resolve('web/public/standalone-sample-browser-project.json');
  if (!existsSync(savedPath) || process.env.MANIFOLD_UPDATE_FIXTURE === '1') {
    writeFileSync(savedPath, JSON.stringify(sidechain));
  }
  await page.locator('#open-project').setInputFiles({ name: 'standalone-sample.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sidechain)) });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('opened'));
  const reopenedSource = await page.locator('#widget-sample_source_dropdown').getAttribute('data-value');
  if (reopenedSource !== '1') throw new Error('Project reopen lost Sidechain selection.');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  const result = { widgets, sidechain: { sourceId: 1, frames: sidechain.assets[0].frames,
    measuredHz: sidechainHz, loopStart }, audioInput: { sourceId: 0, frames: audioInput.assets[0].frames,
    measuredHz: inputHz }, fileReplacement: { frames: fileProject.assets[0].frames,
    label: fileProject.assets[0].label }, outputDuringNote, reopenedSource: Number(reopenedSource),
    audioIsolation: 'Headless Chromium, --mute-audio, PULSE_SERVER to nonexistent socket' };
  writeFileSync(resolve('web/public/standalone-sample-browser.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
