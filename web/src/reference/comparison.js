import { drawComparison } from './plots.js';

const byId = (id) => document.getElementById(id);
const asset = (family, path) => `${import.meta.env.BASE_URL}reference/${family}/${path}`;

async function loadFloat32(family, path) {
  const response = await fetch(asset(family, path));
  if (!response.ok) throw new Error(`Missing fixture: ${path}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength % 4 !== 0) throw new Error(`Invalid float32 fixture: ${path}`);
  return new Float32Array(bytes);
}

function prepareCrossfader(engine, manifest, selected) {
  const nodes = [
    [1, 0, 0, 0],
    [2, 2, manifest.secondInput.value, 0],
    [3, 8, selected.positionBefore, selected.curve],
    [4, 7, 0, 0],
  ];
  const edges = [[1, 3, 0], [2, 3, 1], [3, 4, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm graph begin failed');
  for (const node of nodes) {
    if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm graph node ${node[0]} failed`);
  }
  if (engine.manifold_graph_initial_parameter(3, 2, selected.mix) !== 1) throw new Error('Wasm initial mix failed');
  for (const edge of edges) {
    if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm graph edge failed');
  }
}

function prepareMixer(engine, selected) {
  const nodes = [
    [1, 0, 0, 0],
    [2, 2, .25, 0],
    [3, 9, selected.buses, selected.master],
    [4, 7, 0, 0],
  ];
  const edges = [[1, 3, 0], [2, 3, 1], [3, 4, 0]];
  for (let bus = 2; bus < selected.buses; bus++) {
    nodes.push([100 + bus, 2, .1 + .01 * (bus + 1), 0]);
    edges.push([100 + bus, 3, bus]);
  }
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm mixer graph begin failed');
  for (const node of nodes) {
    if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm mixer node ${node[0]} failed`);
  }
  for (const edge of edges) {
    if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm mixer edge failed');
  }
  const initial = [[1, selected.gain1], [2, selected.gain2], [33, selected.pan1], [34, selected.pan2]];
  for (let bus = 3; bus <= selected.buses; bus++) initial.push([bus, .02]);
  for (const [id, value] of initial) {
    if (engine.manifold_graph_initial_parameter(3, id, value) !== 1) throw new Error(`Wasm mixer initial parameter ${id} failed`);
  }
}

function prepareVoice(engine) {
  if (engine.manifold_graph_begin(2, 1) !== 1
    || engine.manifold_graph_node(1, 10, 0, 0) !== 1
    || engine.manifold_graph_node(2, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1) {
    throw new Error('Wasm voice graph failed');
  }
}

function prepareOscillator(engine, selected) {
  if (engine.manifold_graph_begin(2, 1) !== 1
    || engine.manifold_graph_node(1, 11, selected.frequencyBefore, selected.amplitudeBefore) !== 1
    || engine.manifold_graph_node(2, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_initial_parameter(1, 0, selected.waveform) !== 1) {
    throw new Error('Wasm oscillator graph failed');
  }
}

function renderWasm(engine, family, manifest, input, selected) {
  const block = selected.blockSize ?? manifest.blockSize;
  if (family === 'crossfader') prepareCrossfader(engine, manifest, selected);
  if (family === 'mixer') prepareMixer(engine, selected);
  if (family === 'voice') prepareVoice(engine);
  if (family === 'oscillator') prepareOscillator(engine, selected);
  if (engine.manifold_prepare(manifest.sampleRate, block) !== 1) throw new Error('Wasm prepare failed');
  if (family === 'svf') {
    for (const [id, value] of [[0, selected.mode], [1, selected.cutoffBefore], [2, selected.resonance]]) {
      if (engine.manifold_set_parameter(id, value) !== 1) throw new Error(`Wasm parameter ${id} failed`);
    }
  }
  if (family === 'voice') {
    for (const [id, value] of [selected.waveform, selected.attack, selected.decay, selected.sustain, selected.release, selected.level].entries()) {
      if (engine.manifold_set_node_parameter(1, id, value) !== 1) throw new Error(`Wasm voice parameter ${id} failed`);
    }
  }
  const inputView = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), block * 2);
  const outputView = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), block * 2);
  const rendered = new Float32Array(input.length);
  for (let offset = 0; offset < manifest.frames; offset += block) {
    const count = Math.min(block, manifest.frames - offset);
    if (offset === manifest.stepFrame) {
      let updated = 1;
      if (family === 'svf') updated = engine.manifold_set_parameter(1, selected.cutoffAfter);
      if (family === 'crossfader') updated = engine.manifold_set_node_parameter(3, 0, selected.positionAfter);
      if (family === 'mixer') {
        for (const [id, value] of [[2, selected.gain2After], [34, selected.pan2After], [0, selected.masterAfter]]) {
          updated &= engine.manifold_set_node_parameter(3, id, value);
        }
      }
      if (family === 'oscillator') {
        updated &= engine.manifold_set_node_parameter(1, 1, selected.frequencyAfter);
        updated &= engine.manifold_set_node_parameter(1, 2, selected.amplitudeAfter);
      }
      if (updated !== 1) throw new Error('Wasm parameter change failed');
    }
    if (family === 'voice') {
      for (const event of selected.events) {
        if (event.frame >= offset && event.frame < offset + count) {
          if (engine.manifold_event_push(1, event.frame - offset, event.kind, 0, event.note, event.velocity) !== 1) {
            throw new Error('Wasm voice event failed');
          }
        }
      }
    }
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

export async function initializeReferenceLab(initialFamily = 'svf') {
  const wasmResponse = await fetch(`${import.meta.env.BASE_URL}manifold_filter.wasm`);
  if (!wasmResponse.ok) throw new Error('Wasm module missing');
  const module = await WebAssembly.compile(await wasmResponse.arrayBuffer());
  const instance = await WebAssembly.instantiate(module, {});
  const engine = instance.exports;
  if (engine.manifold_version() !== 2) throw new Error('Incompatible Wasm ABI');

  const chooser = byId('reference-case');
  const fixtures = new Map();
  let manifest;
  let input;
  let currentFamily = null;
  let selectedFamily = initialFamily;

  async function loadFamily(family) {
    if (!fixtures.has(family)) {
      const response = await fetch(asset(family, 'manifest.json'));
      if (!response.ok) throw new Error(`Reference manifest missing: ${family}`);
      const next = await response.json();
      if (next.version !== 1 || next.channels !== 2) throw new Error('Unsupported reference format');
      const nextInput = await loadFloat32(family, next.input);
      if (nextInput.length !== next.frames * next.channels) throw new Error('Invalid input fixture size');
      fixtures.set(family, { manifest: next, input: nextInput });
    }
    if (selectedFamily !== family) return;
    ({ manifest, input } = fixtures.get(family));
    currentFamily = family;
    chooser.replaceChildren();
    for (const entry of manifest.cases) chooser.add(new Option(entry.label, entry.id));
    chooser.disabled = false;
  }

  let active = null;
  let requestId = 0;
  let playbackContext = null;
  let playbackSource = null;
  const draw = () => {
    if (!active) return;
    const start = byId('plot-window').value === 'start' ? 0 : Math.max(0, active.focusFrame - 64);
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
    const family = selectedFamily;
    const selected = manifest.cases.find((entry) => entry.id === chooser.value);
    byId('reference-status').textContent = 'Comparing…';
    const transition = family === 'svf'
      ? `cutoff ${selected.cutoffBefore.toLocaleString()} → ${selected.cutoffAfter.toLocaleString()} Hz`
      : family === 'crossfader'
        ? `position ${selected.positionBefore} → ${selected.positionAfter} · curve ${selected.curve} · mix ${selected.mix}`
        : family === 'mixer'
          ? `${selected.buses} buses · B gain ${selected.gain2} → ${selected.gain2After} · B pan ${selected.pan2} → ${selected.pan2After} · master ${selected.master} → ${selected.masterAfter}`
          : family === 'oscillator'
            ? `frequency ${selected.frequencyBefore} → ${selected.frequencyAfter} Hz · amplitude ${selected.amplitudeBefore} → ${selected.amplitudeAfter}`
            : `${selected.events.length} timed note events · attack ${selected.attack} s · release ${selected.release} s`;
    byId('reference-meta').textContent = `${manifest.sampleRate.toLocaleString()} Hz · ${manifest.frames} frames · ${selected.blockSize ?? manifest.blockSize} frame blocks · ${transition}`;
    byId('reference-title').textContent = family === 'voice' ? 'Native Rust ↔ Rust/Wasm' : 'C++ ↔ Rust/Wasm';
    byId('plot-window').querySelector('[value="step"]').textContent = family === 'voice' ? 'Note event' : 'Parameter change';
    document.querySelector('.legend-old').textContent = family === 'voice' ? 'Native Rust' : 'C++';
    document.querySelector('[data-play="legacy"]').textContent = family === 'voice' ? 'Play native' : 'Play C++';
    const legacy = await loadFloat32(family, selected.output);
    if (currentRequest !== requestId) return;
    const rust = renderWasm(engine, family, manifest, input, selected);
    const report = measure(legacy, rust);
    active = { legacy, rust, focusFrame: selected.focusFrame ?? manifest.stepFrame, ...report };
    byId('max-difference').textContent = report.max.toExponential(2);
    byId('rms-difference').textContent = report.rms.toExponential(2);
    const pass = report.max <= .0002;
    byId('comparison-result').textContent = pass ? 'Match' : 'Review';
    byId('comparison-result').className = pass ? 'pass' : 'fail';
    byId('reference-status').textContent = `${family === 'voice' ? 'Rust' : 'C++'} source ${manifest.sourceSha256.slice(0, 10)} · ${selected.label}`;
    draw();
  };
  chooser.addEventListener('change', () => choose().catch((error) => { byId('reference-status').textContent = String(error); }));
  function selectFamily(family) {
    if (selectedFamily === family && currentFamily === family) return;
    selectedFamily = family;
    ++requestId;
    if (playbackSource) { playbackSource.stop(); playbackSource = null; }
    active = null;
    chooser.disabled = true;
    chooser.replaceChildren();
    byId('comparison-result').textContent = '—';
    byId('max-difference').textContent = '—';
    byId('rms-difference').textContent = '—';
    byId('reference-status').textContent = 'Loading comparison…';
    loadFamily(family).then(() => {
      if (selectedFamily === family) choose();
    }).catch((error) => { byId('reference-status').textContent = String(error); });
  }

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
  await loadFamily(initialFamily);
  await choose();
  return { selectFamily };
}
