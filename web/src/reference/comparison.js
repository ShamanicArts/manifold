import { drawComparison } from './plots.js';

const byId = (id) => document.getElementById(id);
const asset = (path) => `${import.meta.env.BASE_URL}reference/svf/${path}`;

async function loadFloat32(path) {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error(`Missing fixture: ${path}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength % 4 !== 0) throw new Error(`Invalid float32 fixture: ${path}`);
  return new Float32Array(bytes);
}

function renderWasm(engine, manifest, input, selected) {
  const block = selected.blockSize;
  if (engine.manifold_prepare(manifest.sampleRate, block) !== 1) throw new Error('Wasm prepare failed');
  for (const [id, value] of [[0, selected.mode], [1, selected.cutoffBefore], [2, selected.resonance]]) {
    if (engine.manifold_set_parameter(id, value) !== 1) throw new Error(`Wasm parameter ${id} failed`);
  }
  const inputView = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), block * 2);
  const outputView = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), block * 2);
  const rendered = new Float32Array(input.length);
  for (let offset = 0; offset < manifest.frames; offset += block) {
    if (offset === manifest.stepFrame) engine.manifold_set_parameter(1, selected.cutoffAfter);
    const count = Math.min(block, manifest.frames - offset);
    for (let frame = 0; frame < count; frame++) {
      inputView[frame] = input[(offset + frame) * 2];
      inputView[block + frame] = input[(offset + frame) * 2 + 1];
    }
    if (engine.manifold_process(count) !== 1) throw new Error('Wasm process failed');
    for (let frame = 0; frame < count; frame++) {
      rendered[(offset + frame) * 2] = outputView[frame];
      rendered[(offset + frame) * 2 + 1] = outputView[block + frame];
    }
  }
  return rendered;
}

function measure(reference, rendered) {
  if (reference.length !== rendered.length) throw new Error('Reference sample count differs');
  let max = 0;
  let sum = 0;
  const difference = new Float32Array(reference.length);
  for (let index = 0; index < reference.length; index++) {
    const delta = reference[index] - rendered[index];
    if (!Number.isFinite(delta)) throw new Error(`Non-finite sample at ${index}`);
    difference[index] = delta;
    max = Math.max(max, Math.abs(delta));
    sum += delta * delta;
  }
  return { max, rms: Math.sqrt(sum / reference.length), difference };
}

export async function initializeReferenceLab() {
  const manifestResponse = await fetch(asset('manifest.json'));
  if (!manifestResponse.ok) throw new Error('Reference manifest missing');
  const manifest = await manifestResponse.json();
  if (manifest.version !== 1 || manifest.channels !== 2) throw new Error('Unsupported reference format');
  const wasmResponse = await fetch(`${import.meta.env.BASE_URL}manifold_filter.wasm`);
  if (!wasmResponse.ok) throw new Error('Wasm module missing');
  const [input, module] = await Promise.all([loadFloat32(manifest.input), WebAssembly.compile(await wasmResponse.arrayBuffer())]);
  const instance = await WebAssembly.instantiate(module, {});
  const engine = instance.exports;
  if (engine.manifold_version() !== 1) throw new Error('Incompatible Wasm ABI');
  if (input.length !== manifest.frames * manifest.channels) throw new Error('Invalid input fixture size');

  const chooser = byId('reference-case');
  for (const entry of manifest.cases) chooser.add(new Option(entry.label, entry.id));

  let active = null;
  let requestId = 0;
  let playbackContext = null;
  let playbackSource = null;
  const draw = () => {
    if (!active) return;
    const start = byId('plot-window').value === 'start' ? 0 : Math.max(0, manifest.stepFrame - 64);
    const count = Math.min(320, manifest.frames - start);
    const amplitude = Math.max(.3, ...active.legacy.slice(start * 2, (start + count) * 2).map(Math.abs));
    drawComparison(byId('comparison-wave'), [active.legacy, active.rust], start, count, amplitude, ['#e2b084', '#9a8de8']);
    drawComparison(byId('comparison-diff'), [active.difference], start, count, Math.max(active.max * 1.15, 1e-8), ['#a4d9bb']);
  };
  byId('plot-window').addEventListener('change', draw);
  const observer = new ResizeObserver(draw);
  observer.observe(byId('comparison-wave'));

  const choose = async () => {
    const currentRequest = ++requestId;
    const selected = manifest.cases.find((entry) => entry.id === chooser.value);
    byId('reference-status').textContent = 'Comparing…';
    byId('reference-meta').textContent = `${manifest.sampleRate.toLocaleString()} Hz · ${manifest.frames} frames · ${selected.blockSize} frame blocks · cutoff ${selected.cutoffBefore.toLocaleString()} → ${selected.cutoffAfter.toLocaleString()} Hz`;
    const legacy = await loadFloat32(selected.output);
    if (currentRequest !== requestId) return;
    const rust = renderWasm(engine, manifest, input, selected);
    const report = measure(legacy, rust);
    active = { legacy, rust, ...report };
    byId('max-difference').textContent = report.max.toExponential(2);
    byId('rms-difference').textContent = report.rms.toExponential(2);
    const pass = report.max <= .0002;
    byId('comparison-result').textContent = pass ? 'Match' : 'Review';
    byId('comparison-result').className = pass ? 'pass' : 'fail';
    byId('reference-status').textContent = `C++ source ${manifest.sourceSha256.slice(0, 10)} · ${selected.label}`;
    draw();
  };
  chooser.addEventListener('change', () => choose().catch((error) => { byId('reference-status').textContent = String(error); }));

  async function play(kind) {
    if (playbackSource) { playbackSource.stop(); playbackSource = null; }
    if (kind === 'stop' || !active) return;
    playbackContext ||= new AudioContext();
    await playbackContext.resume();
    const samples = kind === 'legacy' ? active.legacy : kind === 'rust' ? active.rust : active.difference;
    const buffer = playbackContext.createBuffer(2, manifest.frames, manifest.sampleRate);
    const gain = kind === 'difference' ? Math.min(1e6, .2 / Math.max(active.max, 1e-8)) : 1;
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let frame = 0; frame < manifest.frames; frame++) {
      left[frame] = samples[frame * 2] * gain;
      right[frame] = samples[frame * 2 + 1] * gain;
    }
    playbackSource = playbackContext.createBufferSource();
    playbackSource.buffer = buffer;
    playbackSource.connect(playbackContext.destination);
    playbackSource.start();
    if (kind === 'difference') byId('reference-status').textContent = 'Difference amplified for listening';
  }
  for (const button of document.querySelectorAll('[data-play]')) {
    button.addEventListener('click', () => play(button.dataset.play).catch((error) => { byId('reference-status').textContent = String(error); }));
  }
  await choose();
}
