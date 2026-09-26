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

function prepareAdsr(engine) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 12, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm ADSR graph failed');
  }
}

function prepareNoise(engine, selected) {
  if (engine.manifold_graph_begin(2, 1) !== 1
    || engine.manifold_graph_node(1, 13, selected.levelBefore, selected.colorBefore) !== 1
    || engine.manifold_graph_node(2, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1) {
    throw new Error('Wasm noise graph failed');
  }
}

function preparePatch(engine, selected) {
  const nodes = [
    [1, 11, selected.frequencyBefore, selected.oscillatorLevel],
    [2, 13, selected.noiseLevelBefore, selected.noiseColor],
    [3, 4, 1, 1], [4, 12, 0, 0], [5, 16, selected.cutoffDepth, 0],
    [6, 3, selected.master, 0], [7, 7, 0, 0], [8, 14, selected.lfoRate, 0],
  ];
  const edges = [[1, 3, 0], [2, 3, 1], [3, 4, 0], [4, 5, 0], [5, 6, 0], [6, 7, 0], [8, 5, 1]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm synth graph begin failed');
  for (const node of nodes) {
    if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm synth node ${node[0]} failed`);
  }
  for (const edge of edges) {
    if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm synth edge failed');
  }
  if (engine.manifold_graph_initial_parameter(1, 0, selected.waveform) !== 1) {
    throw new Error('Wasm synth waveform failed');
  }
}

function prepareModulation(engine, selected) {
  const nodes = [
    [1, 11, 220, .3], [2, 14, selected.rateBefore, 0],
    [3, 15, selected.base, selected.depthBefore], [4, 7, 0, 0],
  ];
  const edges = [[1, 3, 0], [2, 3, 1], [3, 4, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm modulation graph begin failed');
  for (const node of nodes) {
    if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm modulation node ${node[0]} failed`);
  }
  for (const edge of edges) {
    if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm modulation edge failed');
  }
  if (engine.manifold_graph_initial_parameter(2, 0, selected.waveform) !== 1) {
    throw new Error('Wasm modulation waveform failed');
  }
}

function prepareDistortion(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 17, selected.driveBefore, selected.mixBefore) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1
    || engine.manifold_graph_initial_parameter(2, 2, selected.outputBefore) !== 1) {
    throw new Error('Wasm distortion graph failed');
  }
}

function prepareStereoDelay(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 18, selected.before[0], selected.before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm stereo delay graph failed');
  }
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) {
      throw new Error(`Wasm stereo delay initial parameter ${id} failed`);
    }
  });
}

function prepareFxChain(engine, selected) {
  const before = selected.before;
  const nodes = [[1, 0, 0, 0], [2, 17, before[0], before[1]],
    [3, 18, before[3], before[4]], [4, 6, 0, 0],
    [5, 5, before[9], 0], [6, 7, 0, 0]];
  const edges = [[1, 2, 0], [2, 3, 0], [3, 4, 0], [3, 5, 0], [4, 5, 1], [5, 6, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm FX chain graph begin failed');
  for (const node of nodes) if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm FX chain node ${node[0]} failed`);
  for (const edge of edges) if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm FX chain edge failed');
  for (const [node, id, value] of [[2, 2, before[2]], [3, 2, before[5]], [3, 7, before[6]]]) {
    if (engine.manifold_graph_initial_parameter(node, id, value) !== 1) throw new Error(`Wasm FX chain initial parameter ${node}/${id} failed`);
  }
}

function prepareEffectSlot(engine, selected) {
  const before = selected.before;
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 19, before[0], before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm effect slot graph failed');
  }
  before.slice(2).forEach((value, index) => {
    if (engine.manifold_graph_initial_parameter(2, index + 2, value) !== 1) {
      throw new Error(`Wasm effect slot initial parameter ${index + 2} failed`);
    }
  });
}

function renderWasm(engine, family, manifest, input, selected) {
  const block = selected.blockSize ?? manifest.blockSize;
  if (family === 'crossfader') prepareCrossfader(engine, manifest, selected);
  if (family === 'mixer') prepareMixer(engine, selected);
  if (family === 'voice') prepareVoice(engine);
  if (family === 'oscillator') prepareOscillator(engine, selected);
  if (family === 'adsr') prepareAdsr(engine);
  if (family === 'noise') prepareNoise(engine, selected);
  if (family === 'patch') preparePatch(engine, selected);
  if (family === 'modulation') prepareModulation(engine, selected);
  if (family === 'distortion') prepareDistortion(engine, selected);
  if (family === 'stereo-delay') prepareStereoDelay(engine, selected);
  if (family === 'fx-chain') prepareFxChain(engine, selected);
  if (family === 'standalone-fx') prepareEffectSlot(engine, selected);
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
  if (family === 'adsr') {
    for (const [id, value] of [selected.attack, selected.decay, selected.sustain, selected.release, 1].entries()) {
      if (engine.manifold_set_node_parameter(2, id, value) !== 1) throw new Error(`Wasm ADSR parameter ${id} failed`);
    }
  }
  if (family === 'patch') {
    const initial = [
      [4, 0, selected.attack], [4, 1, selected.decay], [4, 2, selected.sustain],
      [4, 3, selected.release], [5, 0, 0], [5, 1, selected.cutoffBefore],
      [5, 2, selected.resonance], [4, 4, 1],
    ];
    for (const [node, id, value] of initial) {
      if (engine.manifold_set_node_parameter(node, id, value) !== 1) throw new Error(`Wasm synth parameter ${node}/${id} failed`);
    }
  }
  if (family === 'fx-chain') {
    for (const [id, value] of [[0, selected.before[10]], [1, selected.before[7]], [2, selected.before[8]]]) {
      if (engine.manifold_set_node_parameter(4, id, value) !== 1) throw new Error(`Wasm FX chain filter parameter ${id} failed`);
    }
  }
  const inputView = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), block * 2);
  const outputView = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), block * 2);
  const rendered = new Float32Array(input.length);
  for (let offset = 0; offset < manifest.frames; offset += block) {
    const count = Math.min(block, manifest.frames - offset);
    if (family === 'adsr' && offset === selected.gateOffFrame
      && engine.manifold_set_node_parameter(2, 4, 0) !== 1) {
      throw new Error('Wasm ADSR gate-off failed');
    }
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
      if (family === 'noise') {
        updated &= engine.manifold_set_node_parameter(1, 0, selected.levelAfter);
        updated &= engine.manifold_set_node_parameter(1, 1, selected.colorAfter);
      }
      if (family === 'patch') {
        for (const [node, id, value] of [[1, 1, selected.frequencyAfter], [2, 0, selected.noiseLevelAfter], [5, 1, selected.cutoffAfter], [4, 4, 0]]) {
          updated &= engine.manifold_set_node_parameter(node, id, value);
        }
      }
      if (family === 'modulation') {
        updated &= engine.manifold_set_node_parameter(2, 1, selected.rateAfter);
        updated &= engine.manifold_set_node_parameter(3, 1, selected.depthAfter);
      }
      if (family === 'distortion') {
        updated &= engine.manifold_set_node_parameter(2, 0, selected.driveAfter);
        updated &= engine.manifold_set_node_parameter(2, 1, selected.mixAfter);
        updated &= engine.manifold_set_node_parameter(2, 2, selected.outputAfter);
      }
      if (family === 'stereo-delay') {
        selected.after.forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
      }
      if (family === 'fx-chain') {
        const after = selected.after;
        for (const [node, id, value] of [
          [2, 0, after[0]], [2, 1, after[1]], [2, 2, after[2]],
          [3, 0, after[3]], [3, 1, after[4]], [3, 2, after[5]], [3, 7, after[6]],
          [4, 1, after[7]], [4, 2, after[8]], [5, 0, after[9]], [4, 0, after[10]],
        ]) updated &= engine.manifold_set_node_parameter(node, id, value);
      }
      if (family === 'standalone-fx') {
        selected.after.forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
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
  const envelopeView = (samples, start, span) => {
    const count = 256;
    const reduced = new Float32Array(count * 2);
    for (let index = 0; index < count; index++) {
      const frame = Math.min(manifest.frames - 1, start + Math.floor(index / (count - 1) * (span - 1)));
      reduced[index * 2] = samples[frame * 2];
      reduced[index * 2 + 1] = samples[frame * 2 + 1];
    }
    return reduced;
  };
  const peakView = (samples, start, span, channel = 0) => {
    const count = 256;
    const reduced = new Float32Array(count * 2);
    for (let index = 0; index < count; index++) {
      const begin = start + Math.floor(index / count * span);
      const end = Math.min(manifest.frames, start + Math.floor((index + 1) / count * span));
      let peak = 0;
      for (let frame = begin; frame < end; frame++) peak = Math.max(peak, Math.abs(samples[frame * 2 + channel]));
      reduced[index * 2] = peak;
      reduced[index * 2 + 1] = peak;
    }
    return reduced;
  };
  const draw = () => {
    if (!active) return;
    if (currentFamily === 'stereo-delay' || currentFamily === 'fx-chain' || currentFamily === 'standalone-fx') {
      const span = byId('plot-window').value === 'start' ? manifest.stepFrame : manifest.frames;
      const oldLeft = peakView(active.legacy, 0, span, 0);
      const newLeft = peakView(active.rust, 0, span, 0);
      const oldRight = peakView(active.legacy, 0, span, 1);
      const newRight = peakView(active.rust, 0, span, 1);
      const difference = peakView(active.difference, 0, span);
      const scale = Math.max(.1, ...oldLeft, ...oldRight);
      drawComparison(byId('comparison-wave'), [oldLeft, newLeft, oldRight, newRight], 0, 256, scale, ['#e2b084', '#9a8de8', '#d7c49d', '#80c5d5']);
      drawComparison(byId('comparison-diff'), [difference], 0, 256, Math.max(active.max * 1.15, 1e-8), ['#a4d9bb']);
      return;
    }
    if (currentFamily === 'modulation') {
      const span = byId('plot-window').value === 'start' ? manifest.stepFrame : manifest.frames;
      const legacy = peakView(active.legacy, 0, span);
      const rust = peakView(active.rust, 0, span);
      const difference = peakView(active.difference, 0, span);
      drawComparison(byId('comparison-wave'), [legacy, rust], 0, 256, .3, ['#e2b084', '#9a8de8']);
      drawComparison(byId('comparison-diff'), [difference], 0, 256, Math.max(active.max * 1.15, 1e-8), ['#a4d9bb']);
      return;
    }
    if (currentFamily === 'adsr') {
      const span = byId('plot-window').value === 'start' ? Math.min(4096, manifest.frames) : manifest.frames;
      const legacy = envelopeView(active.legacy, 0, span);
      const rust = envelopeView(active.rust, 0, span);
      const difference = envelopeView(active.difference, 0, span);
      drawComparison(byId('comparison-wave'), [legacy, rust], 0, 256, .5, ['#e2b084', '#9a8de8']);
      drawComparison(byId('comparison-diff'), [difference], 0, 256, Math.max(active.max * 1.15, 1e-8), ['#a4d9bb']);
      return;
    }
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
            : family === 'adsr'
              ? `attack ${selected.attack} s · decay ${selected.decay} s · sustain ${selected.sustain} · release ${selected.release} s · gate off at ${selected.gateOffFrame}`
              : family === 'noise'
                ? `level ${selected.levelBefore} → ${selected.levelAfter} · color ${selected.colorBefore} → ${selected.colorAfter}`
                : family === 'patch'
                  ? `pitch ${selected.frequencyBefore} → ${selected.frequencyAfter} Hz · noise ${selected.noiseLevelBefore} → ${selected.noiseLevelAfter} · cutoff ${selected.cutoffBefore} → ${selected.cutoffAfter} Hz · LFO ${selected.lfoRate} Hz × ${selected.cutoffDepth} Hz`
                  : family === 'modulation'
                    ? `${['sine', 'triangle', 'square'][selected.waveform]} CV · rate ${selected.rateBefore} → ${selected.rateAfter} Hz · depth ${selected.depthBefore} → ${selected.depthAfter}`
                    : family === 'distortion'
                      ? `drive ${selected.driveBefore} → ${selected.driveAfter} · mix ${selected.mixBefore} → ${selected.mixAfter} · output ${selected.outputBefore} → ${selected.outputAfter}`
                    : family === 'stereo-delay'
                      ? `left ${selected.before[0]} → ${selected.after[0]} ms · right ${selected.before[1]} → ${selected.after[1]} ms · feedback ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'fx-chain'
                      ? `drive ${selected.before[0]} → ${selected.after[0]} · delay mix ${selected.before[6]} → ${selected.after[6]} · cutoff ${selected.before[7]} → ${selected.after[7]} Hz`
                    : family === 'standalone-fx'
                      ? `type ${selected.before[0]} → ${selected.after[0]} · wet mix ${selected.before[1]} → ${selected.after[1]} · p/0 ${selected.before[2]} → ${selected.after[2]}`
            : `${selected.events.length} timed note events · attack ${selected.attack} s · release ${selected.release} s`;
    byId('reference-meta').textContent = `${manifest.sampleRate.toLocaleString()} Hz · ${manifest.frames} frames · ${selected.blockSize ?? manifest.blockSize} frame blocks · ${transition}`;
    const nativeReference = family === 'voice' || family === 'patch' || family === 'modulation' || family === 'fx-chain' || family === 'standalone-fx';
    byId('reference-title').textContent = nativeReference ? 'Native Rust ↔ Rust/Wasm' : 'C++ ↔ Rust/Wasm';
    byId('plot-window').querySelector('[value="step"]').textContent = family === 'stereo-delay' || family === 'fx-chain' || family === 'standalone-fx' ? 'Whole tail' : family === 'voice' ? 'Note event' : family === 'adsr' ? 'Whole envelope' : family === 'modulation' ? 'Whole modulation' : 'Parameter change';
    byId('plot-window').querySelector('[value="start"]').textContent = family === 'stereo-delay' || family === 'fx-chain' || family === 'standalone-fx' ? 'Before change' : family === 'adsr' ? 'Attack detail' : family === 'modulation' ? 'Before change' : 'Start';
    byId('plot-title').textContent = family === 'stereo-delay' || family === 'fx-chain' || family === 'standalone-fx' ? 'Left and right output tails · peak level' : family === 'adsr' ? 'Envelope shape · left channel' : family === 'modulation' ? 'Amplitude envelope · left channel' : 'Output waveform';
    document.querySelector('.legend-old').textContent = family === 'stereo-delay' ? 'C++ L/R' : family === 'fx-chain' || family === 'standalone-fx' ? 'Native L/R' : nativeReference ? 'Native Rust' : 'C++';
    document.querySelector('.legend-new').textContent = family === 'stereo-delay' || family === 'fx-chain' || family === 'standalone-fx' ? 'Wasm L/R' : 'Rust/Wasm';
    document.querySelector('[data-play="legacy"]').textContent = nativeReference ? 'Play native' : 'Play C++';
    const legacy = await loadFloat32(family, selected.output);
    if (currentRequest !== requestId) return;
    const rust = renderWasm(engine, family, manifest, input, selected);
    const report = measure(legacy, rust);
    active = { legacy, rust, focusFrame: selected.focusFrame ?? selected.gateOffFrame ?? manifest.stepFrame, ...report };
    byId('max-difference').textContent = report.max.toExponential(2);
    byId('rms-difference').textContent = report.rms.toExponential(2);
    const pass = report.max <= .0002;
    byId('comparison-result').textContent = pass ? 'Match' : 'Review';
    byId('comparison-result').className = pass ? 'pass' : 'fail';
    byId('reference-status').textContent = `${nativeReference ? 'Rust' : 'C++'} source ${manifest.sourceSha256.slice(0, 10)} · ${selected.label}`;
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
