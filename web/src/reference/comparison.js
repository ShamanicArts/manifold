import { drawComparison, drawBandBars, drawMeterTrace, drawCvStageTraces } from './plots.js';

const byId = (id) => document.getElementById(id);
const asset = (family, path) => `${import.meta.env.BASE_URL}reference/${family}/${path}`;
const isFxSwitchFamily = (family) => family === 'standalone-fx-routing' || family === 'standalone-fx-host';

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

function prepareSampleRegion(engine) {
  if (engine.manifold_graph_begin(2, 1) !== 1
    || engine.manifold_graph_node(2, 26, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm sample region graph failed');
  }
}

function prepareSampleInstrument(engine) {
  if (engine.manifold_graph_begin(2, 1) !== 1
    || engine.manifold_graph_node(2, 27, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm sample instrument graph failed');
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

function prepareCompressor(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 24, selected.before[0], selected.before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm compressor graph failed');
  }
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) {
      throw new Error(`Wasm compressor initial parameter ${id} failed`);
    }
  });
}

function prepareLimiter(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 25, selected.before[0], selected.before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm limiter graph failed');
  }
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) {
      throw new Error(`Wasm limiter initial parameter ${id} failed`);
    }
  });
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

function preparePhaser(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 34, selected.before[0], selected.before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm phaser graph failed');
  }
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) {
      throw new Error(`Wasm phaser initial parameter ${id} failed`);
    }
  });
}

function prepareChorus(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 35, selected.before[0], selected.before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm chorus graph failed');
  }
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) {
      throw new Error(`Wasm chorus initial parameter ${id} failed`);
    }
  });
}

function prepareEq8(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 36, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm EQ8 graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm EQ8 initial parameter ${id} failed`);
  });
}

function prepareWaveShaper(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 37, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm WaveShaper graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm WaveShaper initial parameter ${id} failed`);
  });
}

function prepareStereoWidener(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 38, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm stereo widener graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm stereo widener initial parameter ${id} failed`);
  });
}

function prepareLegacyFilter(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 39, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm FilterNode graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm FilterNode initial parameter ${id} failed`);
  });
}

function prepareReverb(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 40, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Reverb graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Reverb initial parameter ${id} failed`);
  });
}

function prepareMultitap(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 41, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Multitap graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Multitap initial parameter ${id} failed`);
  });
}

function prepareRing(engine, selected) {
  const edges = selected.external ? 3 : 2;
  if (engine.manifold_graph_begin(3, edges) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 42, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || (selected.external && engine.manifold_graph_edge(1, 2, 1) !== 1)
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Ring Modulator graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Ring Modulator initial parameter ${id} failed`);
  });
}

function prepareTransient(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 43, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Transient Shaper graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Transient Shaper initial parameter ${id} failed`);
  });
}

function prepareBitcrusher(engine, selected) {
  const edges = selected.external ? 3 : 2;
  if (engine.manifold_graph_begin(3, edges) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 44, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || (selected.external && engine.manifold_graph_edge(1, 2, 1) !== 1)
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm BitCrusher graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm BitCrusher initial parameter ${id} failed`);
  });
}

function prepareEqNode(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 45, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm EQNode graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm EQNode initial parameter ${id} failed`);
  });
}

function prepareFormant(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 46, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Formant graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Formant initial parameter ${id} failed`);
  });
}

function prepareReverseDelay(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 47, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm ReverseDelay graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm ReverseDelay initial parameter ${id} failed`);
  });
}

function prepareStutter(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 48, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Stutter graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Stutter initial parameter ${id} failed`);
  });
}

function preparePitchShifter(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 49, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm PitchShifter graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm PitchShifter initial parameter ${id} failed`);
  });
}

function prepareShimmer(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 50, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Shimmer graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Shimmer initial parameter ${id} failed`);
  });
}

function prepareGranulator(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 51, 0, 0) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm Granulator graph failed');
  selected.before.forEach((value, id) => {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm Granulator initial parameter ${id} failed`);
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

function prepareEffectSlot(engine, selected, kind = 19) {
  const before = selected.before;
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, kind, before[0], before[1]) !== 1
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

function prepareLoopCapture(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 20, selected.capacitySeconds, selected.mix) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm loop capture graph failed');
  }
}

function prepareSpectrumAnalyzer(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 21, selected.sensitivityBefore, selected.smoothingBefore) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1
    || engine.manifold_graph_initial_parameter(2, 2, selected.floorBefore) !== 1) {
    throw new Error('Wasm spectrum analyzer graph failed');
  }
}

function prepareFftSpectrum(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 28, selected.before[0], selected.before[1]) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) throw new Error('Wasm FFT graph failed');
}

function prepareEnvelopeFollower(engine, selected) {
  if (engine.manifold_graph_begin(3, 2) !== 1
    || engine.manifold_graph_node(1, 0, 0, 0) !== 1
    || engine.manifold_graph_node(2, 22, selected.attackBefore, selected.releaseBefore) !== 1
    || engine.manifold_graph_node(3, 7, 0, 0) !== 1
    || engine.manifold_graph_edge(1, 2, 0) !== 1
    || engine.manifold_graph_edge(2, 3, 0) !== 1) {
    throw new Error('Wasm envelope follower graph failed');
  }
  for (const [id, value] of [[2, selected.sensitivityBefore], [3, selected.highpassBefore], [4, selected.modeBefore]]) {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm follower initial parameter ${id} failed`);
  }
}

function prepareEnvelopeDucking(engine, selected) {
  const before = selected.before;
  const nodes = [[1, 0, 0, 0], [2, 23, before[0], before[1]],
    [3, 15, before[5], before[6]], [4, 7, 0, 0]];
  const edges = [[1, 2, 0], [1, 3, 0], [2, 3, 1], [3, 4, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm ducking graph begin failed');
  for (const node of nodes) if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm ducking node ${node[0]} failed`);
  for (const edge of edges) if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm ducking edge failed');
  for (const [id, value] of [[2, before[2]], [3, before[3]], [4, before[4]]]) {
    if (engine.manifold_graph_initial_parameter(2, id, value) !== 1) throw new Error(`Wasm ducking initial parameter ${id} failed`);
  }
}

function prepareSlewAudio(engine, selected) {
  const nodes = [[1, 0, 0, 0], [2, 29, selected.upBefore, selected.downBefore], [3, 7, 0, 0]];
  const edges = [[1, 2, 0], [2, 3, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm slew graph begin failed');
  for (const node of nodes) if (engine.manifold_graph_node(...node) !== 1) throw new Error('Wasm slew node failed');
  for (const edge of edges) if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm slew edge failed');
}

function prepareSlewModulation(engine, selected) {
  const nodes = [[1, 11, 220, .3], [2, 14, selected.rateBefore, 0],
    [3, 30, selected.upBefore, selected.downBefore],
    [4, 15, .6, selected.depthBefore], [5, 7, 0, 0]];
  const edges = [[1, 4, 0], [2, 3, 0], [3, 4, 1], [4, 5, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm slew modulation graph begin failed');
  for (const node of nodes) if (engine.manifold_graph_node(...node) !== 1) throw new Error('Wasm slew modulation node failed');
  for (const edge of edges) if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm slew modulation edge failed');
  if (engine.manifold_graph_initial_parameter(2, 0, selected.waveform) !== 1) throw new Error('Wasm slew modulation wave failed');
}

function prepareCvRack(engine, selected) {
  const p = selected.before;
  const nodes = [[1, 11, 220, .3], [2, 14, p[1], 0], [3, 14, p[2], 0],
    [4, 32, p[0], 0], [5, 31, p[3], p[4]], [6, 14, 1, 0],
    [7, 33, p[5], p[6]], [8, 15, p[8], p[9]], [9, 7, 0, 0]];
  const edges = [[1, 8, 0], [2, 4, 0], [3, 4, 1], [4, 5, 0],
    [5, 7, 0], [6, 7, 1], [7, 8, 1], [8, 9, 0]];
  if (engine.manifold_graph_begin(nodes.length, edges.length) !== 1) throw new Error('Wasm CV rack graph begin failed');
  for (const node of nodes) if (engine.manifold_graph_node(...node) !== 1) throw new Error(`Wasm CV rack node ${node[0]} failed`);
  for (const edge of edges) if (engine.manifold_graph_edge(...edge) !== 1) throw new Error('Wasm CV rack edge failed');
  for (const [node, id, value] of [[3, 0, 2], [6, 0, 1], [7, 4, p[7]]]) {
    if (engine.manifold_graph_initial_parameter(node, id, value) !== 1) throw new Error('Wasm CV rack initial value failed');
  }
}

function renderWasm(engine, family, manifest, input, selected) {
  const block = selected.blockSize ?? manifest.blockSize;
  if (family === 'crossfader') prepareCrossfader(engine, manifest, selected);
  if (family === 'mixer') prepareMixer(engine, selected);
  if (family === 'voice') prepareVoice(engine);
  if (family === 'sample-region') prepareSampleRegion(engine);
  if (family === 'sample-instrument') prepareSampleInstrument(engine);
  if (family === 'oscillator') prepareOscillator(engine, selected);
  if (family === 'adsr') prepareAdsr(engine);
  if (family === 'noise') prepareNoise(engine, selected);
  if (family === 'patch') preparePatch(engine, selected);
  if (family === 'modulation') prepareModulation(engine, selected);
  if (family === 'distortion') prepareDistortion(engine, selected);
  if (family === 'compressor') prepareCompressor(engine, selected);
  if (family === 'limiter') prepareLimiter(engine, selected);
  if (family === 'stereo-delay') prepareStereoDelay(engine, selected);
  if (family === 'phaser') preparePhaser(engine, selected);
  if (family === 'chorus') prepareChorus(engine, selected);
  if (family === 'eq8') prepareEq8(engine, selected);
  if (family === 'waveshaper') prepareWaveShaper(engine, selected);
  if (family === 'stereo-widener') prepareStereoWidener(engine, selected);
  if (family === 'legacy-filter') prepareLegacyFilter(engine, selected);
  if (family === 'reverb') prepareReverb(engine, selected);
  if (family === 'multitap') prepareMultitap(engine, selected);
  if (family === 'ring-modulator') prepareRing(engine, selected);
  if (family === 'transient-shaper') prepareTransient(engine, selected);
  if (family === 'bitcrusher') prepareBitcrusher(engine, selected);
  if (family === 'eq-node') prepareEqNode(engine, selected);
  if (family === 'formant') prepareFormant(engine, selected);
  if (family === 'reverse-delay') prepareReverseDelay(engine, selected);
  if (family === 'stutter') prepareStutter(engine, selected);
  if (family === 'pitch-shifter') preparePitchShifter(engine, selected);
  if (family === 'shimmer') prepareShimmer(engine, selected);
  if (family === 'granulator') prepareGranulator(engine, selected);
  if (family === 'fx-chain') prepareFxChain(engine, selected);
  if (family === 'standalone-fx') prepareEffectSlot(engine, selected);
  if (family === 'standalone-fx-routing') prepareEffectSlot(engine, selected, 52);
  if (family === 'standalone-fx-host') prepareEffectSlot(engine, selected, 53);
  if (family === 'loop-capture') prepareLoopCapture(engine, selected);
  if (family === 'spectrum-analyzer') prepareSpectrumAnalyzer(engine, selected);
  if (family === 'fft-spectrum') prepareFftSpectrum(engine, selected);
  if (family === 'envelope-follower') prepareEnvelopeFollower(engine, selected);
  if (family === 'envelope-ducking') prepareEnvelopeDucking(engine, selected);
  if (family === 'slew-audio') prepareSlewAudio(engine, selected);
  if (family === 'slew-modulation') prepareSlewModulation(engine, selected);
  if (family === 'cv-rack') prepareCvRack(engine, selected);
  if (engine.manifold_prepare(manifest.sampleRate, block) !== 1) throw new Error('Wasm prepare failed');
  if (family === 'granulator' && selected.source) {
    if (engine.manifold_sample_begin(2, manifest.sourceFrames, manifest.sampleRate) !== 1) throw new Error('Wasm grain source preparation failed');
    new Float32Array(engine.memory.buffer, engine.manifold_sample_ptr(), manifest.sourceData.length).set(manifest.sourceData);
    if (engine.manifold_sample_commit() !== 1) throw new Error('Wasm grain source commit failed');
  }
  if (family === 'sample-region' || family === 'sample-instrument') {
    if (engine.manifold_sample_begin(2, manifest.sampleFrames, manifest.sampleSourceRate) !== 1) {
      throw new Error('Wasm sample storage preparation failed');
    }
    new Float32Array(engine.memory.buffer, engine.manifold_sample_ptr(), manifest.sampleData.length).set(manifest.sampleData);
    if (engine.manifold_sample_commit() !== 1) throw new Error('Wasm sample commit failed');
    selected.parameters.forEach((value, id) => {
      const parameter = family === 'sample-region' && id === 6 ? 8 : id;
      if (engine.manifold_set_node_parameter(2, parameter, value) !== 1) throw new Error(`Wasm sample parameter ${id} failed`);
    });
  }
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
  const meterCount = family === 'fft-spectrum' ? 33 : family === 'spectrum-analyzer' ? 8 : family === 'cv-rack' ? 4 : ['envelope-follower', 'envelope-ducking', 'compressor', 'limiter', 'stereo-widener', 'transient-shaper'].includes(family) ? 1 : 0;
  const meterSnapshots = meterCount ? new Float32Array(Math.ceil(manifest.frames / block) * meterCount) : null;
  for (let offset = 0; offset < manifest.frames; offset += block) {
    const count = Math.min(block, manifest.frames - offset);
    if (isFxSwitchFamily(family)) {
      for (const [frame, type] of selected.switches) {
        if (frame === offset && engine.manifold_set_node_parameter(2, 0, type) !== 1) {
          throw new Error(`Wasm effect slot switch at ${frame} failed`);
        }
      }
    }
    if (family === 'loop-capture') {
      for (const [frame, id, value] of selected.events) {
        if (frame === offset && engine.manifold_set_node_parameter(2, id, value) !== 1) {
          throw new Error(`Wasm loop capture event ${id} at ${frame} failed`);
        }
      }
    }
    if (family === 'sample-region') {
      for (const [frame, id, value] of selected.events) {
        if (frame !== offset) continue;
        const accepted = id === 9
          ? engine.manifold_event_push(2, 0, 0, 0, value, 100)
          : engine.manifold_set_node_parameter(2, id, value);
        if (accepted !== 1) throw new Error(`Wasm sample event ${id} at ${frame} failed`);
      }
    }
    if (family === 'sample-instrument') {
      for (const [frame, id, value] of selected.changes) {
        if (frame === offset && engine.manifold_set_node_parameter(2, id, value) !== 1) {
          throw new Error(`Wasm sample instrument parameter ${id} at ${frame} failed`);
        }
      }
      for (const [frame, kind, channel, note, velocity] of selected.events) {
        if (frame >= offset && frame < offset + count
          && engine.manifold_event_push(2, frame - offset, kind, channel, note, velocity) !== 1) {
          throw new Error(`Wasm sample instrument event at ${frame} failed`);
        }
      }
    }
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
      if (family === 'compressor') {
        selected.after.forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
      }
      if (family === 'limiter') {
        selected.after.forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
      }
      if (family === 'stereo-delay') {
        selected.after.forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
      }
      if (family === 'phaser' || family === 'chorus') {
        selected.after.forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
      }
      if (family === 'eq8' || family === 'eq-node' || family === 'formant' || family === 'reverse-delay' || family === 'stutter' || family === 'pitch-shifter' || family === 'shimmer' || family === 'granulator' || family === 'waveshaper' || family === 'stereo-widener' || family === 'legacy-filter' || family === 'reverb' || family === 'multitap' || family === 'ring-modulator' || family === 'transient-shaper' || family === 'bitcrusher') {
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
      if (family === 'spectrum-analyzer') {
        for (const [id, value] of [[0, selected.sensitivityAfter], [1, selected.smoothingAfter], [2, selected.floorAfter]]) {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        }
      }
      if (family === 'fft-spectrum') {
        selected.after.forEach((value, id) => { updated &= engine.manifold_set_node_parameter(2, id, value); });
      }
      if (family === 'slew-audio') {
        updated &= engine.manifold_set_node_parameter(2, 0, selected.upAfter);
        updated &= engine.manifold_set_node_parameter(2, 1, selected.downAfter);
      }
      if (family === 'slew-modulation') {
        for (const [node, id, value] of [[2, 1, selected.rateAfter], [3, 0, selected.upAfter],
          [3, 1, selected.downAfter], [4, 1, selected.depthAfter]]) {
          updated &= engine.manifold_set_node_parameter(node, id, value);
        }
      }
      if (family === 'cv-rack') {
        const p = selected.after;
        for (const [node, id, value] of [[4, 0, p[0]], [2, 1, p[1]], [3, 1, p[2]],
          [5, 0, p[3]], [5, 1, p[4]], [7, 0, p[5]], [7, 1, p[6]],
          [7, 4, p[7]], [8, 0, p[8]], [8, 1, p[9]]]) {
          updated &= engine.manifold_set_node_parameter(node, id, value);
        }
      }
      if (family === 'envelope-follower') {
        for (const [id, value] of [[0, selected.attackAfter], [1, selected.releaseAfter], [2, selected.sensitivityAfter], [3, selected.highpassAfter], [4, selected.modeAfter]]) {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        }
      }
      if (family === 'envelope-ducking') {
        selected.after.slice(0, 5).forEach((value, id) => {
          updated &= engine.manifold_set_node_parameter(2, id, value);
        });
        updated &= engine.manifold_set_node_parameter(3, 0, selected.after[5]);
        updated &= engine.manifold_set_node_parameter(3, 1, selected.after[6]);
      }
      if (updated !== 1) throw new Error('Wasm parameter change failed');
    }
    if (family === 'voice') {
      for (const event of selected.events) {
        if (event.frame >= offset && event.frame < offset + count) {
          if (engine.manifold_event_push(1, event.frame - offset, event.kind, event.channel ?? 0, event.note, event.velocity) !== 1) {
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
    if (meterSnapshots) {
      const snapshot = offset / block * meterCount;
      for (let band = 0; band < meterCount; band++) {
        const value = engine.manifold_get_node_meter(family === 'cv-rack' ? [4, 5, 7, 8][band] : 2, family === 'cv-rack' ? 0 : band);
        if (!Number.isFinite(value)) throw new Error(`Missing analyzer band ${band}`);
        meterSnapshots[snapshot + band] = value;
      }
    }
    for (let frame = 0; frame < count; frame++) {
      rendered[(offset + frame) * 2] = outputView[frame];
      rendered[(offset + frame) * 2 + 1] = outputView[block + frame];
    }
  }
  if (meterSnapshots) rendered.meters = meterSnapshots;
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

export async function initializeReferenceLab(initialFamily = 'svf', initialEffectType = null) {
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
  let preferredEffectType = initialEffectType;

  function effectCase(type) {
    return manifest?.cases.find((entry) => entry.before?.[0] === type && entry.after?.[0] === type)
      ?? manifest?.cases.find((entry) => entry.before?.[0] === type);
  }

  async function loadFamily(family) {
    if (!fixtures.has(family)) {
      const response = await fetch(asset(family, 'manifest.json'));
      if (!response.ok) throw new Error(`Reference manifest missing: ${family}`);
      const next = await response.json();
      if (next.version !== 1 || next.channels !== 2) throw new Error('Unsupported reference format');
      const nextInput = await loadFloat32(family, next.input);
      if (nextInput.length !== next.frames * next.channels) throw new Error('Invalid input fixture size');
      if (family === 'sample-region' || family === 'sample-instrument') {
        next.sampleData = await loadFloat32(family, next.sample);
        if (next.sampleData.length !== next.sampleFrames * 2) throw new Error('Invalid sample fixture size');
      }
      if (family === 'granulator') {
        next.sourceData = await loadFloat32(family, next.sourceFile);
        if (next.sourceData.length !== next.sourceFrames * 2) throw new Error('Invalid grain source fixture size');
      }
      fixtures.set(family, { manifest: next, input: nextInput });
    }
    if (selectedFamily !== family) return;
    ({ manifest, input } = fixtures.get(family));
    currentFamily = family;
    byId('plot-window').querySelector('[value="stage"]').hidden = family !== 'cv-rack';
    byId('plot-window').querySelector('[value="tail"]').hidden = !isFxSwitchFamily(family);
    if (isFxSwitchFamily(family)) byId('plot-window').value = 'tail';
    chooser.replaceChildren();
    for (const entry of manifest.cases) chooser.add(new Option(entry.label, entry.id));
    if (family === 'standalone-fx' && preferredEffectType !== null) {
      const matching = effectCase(preferredEffectType);
      if (matching) chooser.value = matching.id;
    }
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
    const stageView = currentFamily === 'cv-rack' && byId('plot-window').value === 'stage';
    byId('comparison-wave').parentElement.classList.toggle('cv-stage-plot', stageView);
    byId('comparison-wave').setAttribute('aria-label', stageView
      ? 'Native Rust and Rust/Wasm held, scaled, mixed, and effective gain traces'
      : 'Overlaid reference and Rust/Wasm output waveform');
    if (currentFamily === 'cv-rack') {
      byId('plot-title').textContent = stageView ? 'CV stages · one snapshot per block' : 'Amplitude envelope · left channel';
      document.querySelector('.plot-unit').textContent = stageView ? 'Maximum stage difference per block' : 'Left channel · scaled to fit';
      if (stageView) {
        drawCvStageTraces(byId('comparison-wave'), active.metersLegacy, active.metersRust);
        const maxPerBlock = Array.from({ length: active.meterDifference.length / 4 }, (_, block) =>
          Math.max(...active.meterDifference.slice(block * 4, block * 4 + 4).map(Math.abs)));
        drawMeterTrace(byId('comparison-diff'), [maxPerBlock], Math.max(active.max * 1.15, 1e-8), ['#a4d9bb']);
        return;
      }
    }
    if (currentFamily === 'envelope-follower' || currentFamily === 'envelope-ducking' || currentFamily === 'compressor' || currentFamily === 'limiter' || currentFamily === 'stereo-widener' || currentFamily === 'transient-shaper') {
      const count = byId('plot-window').value === 'start'
        ? manifest.stepFrame / active.blockSize : active.metersLegacy.length;
      const oldMeter = active.metersLegacy.slice(0, count).map((value) => currentFamily === 'compressor' ? -value : currentFamily === 'stereo-widener' ? (value + 1) / 2 : value);
      const newMeter = active.metersRust.slice(0, count).map((value) => currentFamily === 'compressor' ? -value : currentFamily === 'stereo-widener' ? (value + 1) / 2 : value);
      const difference = active.meterDifference.slice(0, count).map(Math.abs);
      drawMeterTrace(byId('comparison-wave'), [oldMeter, newMeter], currentFamily === 'stereo-widener' ? 1 : Math.max(0.05, ...oldMeter, ...newMeter) * 1.15, ['#e2b084', '#9a8de8']);
      drawMeterTrace(byId('comparison-diff'), [difference], Math.max(active.max, 1e-8) * 1.15, ['#a4d9bb']);
      return;
    }
    if (currentFamily === 'fft-spectrum') {
      const snapshot = byId('plot-window').value === 'start'
        ? Math.max(0, manifest.stepFrame / active.blockSize - 1)
        : active.metersLegacy.length / 33 - 1;
      const begin = snapshot * 33;
      const oldBands = active.metersLegacy.slice(begin, begin + 32);
      const newBands = active.metersRust.slice(begin, begin + 32);
      const difference = active.meterDifference.slice(begin, begin + 32).map(Math.abs);
      drawBandBars(byId('comparison-wave'), [oldBands, newBands], 1, ['#e2b084', '#9a8de8']);
      drawBandBars(byId('comparison-diff'), [difference], Math.max(active.max, 1e-8), ['#a4d9bb']);
      return;
    }
    if (currentFamily === 'spectrum-analyzer') {
      const block = active.blockSize;
      const snapshot = byId('plot-window').value === 'start'
        ? Math.max(0, manifest.stepFrame / block - 1)
        : active.metersLegacy.length / 8 - 1;
      const begin = snapshot * 8;
      const oldBands = active.metersLegacy.slice(begin, begin + 8);
      const newBands = active.metersRust.slice(begin, begin + 8);
      const difference = active.meterDifference.slice(begin, begin + 8).map(Math.abs);
      const scale = Math.max(0.05, ...oldBands, ...newBands) * 1.15;
      drawBandBars(byId('comparison-wave'), [oldBands, newBands], scale, ['#e2b084', '#9a8de8'], true);
      drawBandBars(byId('comparison-diff'), [difference], Math.max(active.max, 1e-8), ['#a4d9bb']);
      return;
    }
    if (currentFamily === 'stereo-delay' || currentFamily === 'phaser' || currentFamily === 'chorus' || currentFamily === 'eq8' || currentFamily === 'reverb' || currentFamily === 'multitap' || currentFamily === 'fx-chain' || currentFamily === 'standalone-fx' || isFxSwitchFamily(currentFamily) || currentFamily === 'loop-capture' || currentFamily === 'sample-region' || currentFamily === 'sample-instrument') {
      const start = isFxSwitchFamily(currentFamily) && byId('plot-window').value === 'tail' ? 16384 : 0;
      const span = byId('plot-window').value === 'start' ? manifest.stepFrame : manifest.frames - start;
      const oldLeft = peakView(active.legacy, start, span, 0);
      const newLeft = peakView(active.rust, start, span, 0);
      const oldRight = peakView(active.legacy, start, span, 1);
      const newRight = peakView(active.rust, start, span, 1);
      const difference = peakView(active.difference, start, span);
      const scale = Math.max(.1, ...oldLeft, ...oldRight);
      drawComparison(byId('comparison-wave'), [oldLeft, newLeft, oldRight, newRight], 0, 256, scale, ['#e2b084', '#9a8de8', '#d7c49d', '#80c5d5']);
      drawComparison(byId('comparison-diff'), [difference], 0, 256, Math.max(active.audioMax * 1.15, 1e-8), ['#a4d9bb']);
      return;
    }
    if (currentFamily === 'modulation' || currentFamily === 'slew-modulation' || currentFamily === 'cv-rack') {
      const span = byId('plot-window').value === 'start' ? manifest.stepFrame : manifest.frames;
      const legacy = peakView(active.legacy, 0, span);
      const rust = peakView(active.rust, 0, span);
      const difference = peakView(active.difference, 0, span);
      drawComparison(byId('comparison-wave'), [legacy, rust], 0, 256, .3, ['#e2b084', '#9a8de8']);
      drawComparison(byId('comparison-diff'), [difference], 0, 256, Math.max(active.audioMax * 1.15, 1e-8), ['#a4d9bb']);
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
                  : family === 'slew-modulation'
                    ? `${['sine', 'triangle', 'square'][selected.waveform]} CV · rise ${selected.upBefore} → ${selected.upAfter} samples · fall ${selected.downBefore} → ${selected.downAfter} · depth ${selected.depthBefore} → ${selected.depthAfter}`
                  : family === 'slew-audio'
                    ? `rise ${selected.upBefore} → ${selected.upAfter} samples · fall ${selected.downBefore} → ${selected.downAfter} samples`
                  : family === 'cv-rack'
                    ? `${['sample', 'track', '12-step sample'][selected.before[0]]} → ${['sample', 'track', '12-step sample'][selected.after[0]]} · amount ${selected.before[3]} → ${selected.after[3]} · held/free ${selected.after[5]}/${selected.after[6]} · depth ${selected.before[9]} → ${selected.after[9]}`
                    : family === 'distortion'
                      ? `drive ${selected.driveBefore} → ${selected.driveAfter} · mix ${selected.mixBefore} → ${selected.mixAfter} · output ${selected.outputBefore} → ${selected.outputAfter}`
                    : family === 'eq8'
                      ? `8 bands · ${selected.before.filter((_, id) => id < 40 && id % 5 === 0 && selected.before[id] >= 0.5).length} enabled before → ${selected.after.filter((_, id) => id < 40 && id % 5 === 0 && selected.after[id] >= 0.5).length} after · mix ${selected.before[41]} → ${selected.after[41]}`
                    : family === 'waveshaper'
                      ? `curve ${selected.before[0]} → ${selected.after[0]} · drive ${selected.before[1]} → ${selected.after[1]} dB · mix ${selected.before[6]} → ${selected.after[6]}`
                    : family === 'stereo-widener'
                      ? `width ${selected.before[0]} → ${selected.after[0]} · mono low ${selected.before[1]} → ${selected.after[1]} Hz · enabled ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'legacy-filter'
                      ? `${selected.referenceMode} · cutoff ${selected.before[0]} → ${selected.after[0]} Hz · resonance ${selected.before[1]} → ${selected.after[1]} · mix ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'reverb'
                      ? `room ${selected.before[0]} → ${selected.after[0]} · damping ${selected.before[1]} → ${selected.after[1]} · wet ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'multitap'
                      ? `${selected.before[0]} → ${selected.after[0]} taps · feedback ${selected.before[1]} → ${selected.after[1]} · wet ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'ring-modulator'
                      ? `${selected.external ? 'external stereo bus' : 'internal oscillator'} · frequency ${selected.before[0]} → ${selected.after[0]} Hz · depth ${selected.before[1]} → ${selected.after[1]} · spread ${selected.before[3]} → ${selected.after[3]}°`
                    : family === 'transient-shaper'
                      ? `attack ${selected.before[0]} → ${selected.after[0]} · sustain ${selected.before[1]} → ${selected.after[1]} · sensitivity ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'bitcrusher'
                      ? `${selected.referenceMode} · ${selected.external ? 'bus B connected' : 'internal only'} · bits ${selected.before[0]} → ${selected.after[0]} · hold ${selected.before[1]} → ${selected.after[1]} samples · mode ${selected.before[4]} → ${selected.after[4]}`
                    : family === 'eq-node'
                      ? `low ${selected.before[0]} → ${selected.after[0]} dB · mid ${selected.before[2]} → ${selected.after[2]} dB · high ${selected.before[5]} → ${selected.after[5]} dB · mix ${selected.before[8]} → ${selected.after[8]}`
                    : family === 'formant'
                      ? `vowel ${selected.before[0]} → ${selected.after[0]} · shift ${selected.before[1]} → ${selected.after[1]} st · Q ${selected.before[2]} → ${selected.after[2]} · mix ${selected.before[4]} → ${selected.after[4]}`
                    : family === 'reverse-delay'
                      ? `time ${selected.before[0]} → ${selected.after[0]} ms · window ${selected.before[1]} → ${selected.after[1]} ms · feedback ${selected.before[2]} → ${selected.after[2]} · mix ${selected.before[3]} → ${selected.after[3]}`
                    : family === 'stutter'
                      ? `length ${selected.before[0]} → ${selected.after[0]} beats · gate ${selected.before[1]} → ${selected.after[1]} · probability ${selected.before[4]} → ${selected.after[4]} · pattern ${selected.before[5]} → ${selected.after[5]}`
                    : family === 'pitch-shifter'
                      ? `pitch ${selected.before[0]} → ${selected.after[0]} st · window ${selected.before[1]} → ${selected.after[1]} ms · feedback ${selected.before[2]} → ${selected.after[2]} · mix ${selected.before[3]} → ${selected.after[3]}`
                    : family === 'shimmer'
                      ? `size ${selected.before[0]} → ${selected.after[0]} · pitch ${selected.before[1]} → ${selected.after[1]} st · feedback ${selected.before[2]} → ${selected.after[2]} · mix ${selected.before[3]} → ${selected.after[3]}`
                    : family === 'granulator'
                      ? `grain ${selected.before[0]} → ${selected.after[0]} ms · density ${selected.before[1]} → ${selected.after[1]} /s · position ${selected.before[2]} → ${selected.after[2]} · pitch ${selected.before[3]} → ${selected.after[3]} st`
                    : family === 'phaser'
                      ? `rate ${selected.before[0]} → ${selected.after[0]} Hz · stages ${selected.before[2]} → ${selected.after[2]} · feedback ${selected.before[3]} → ${selected.after[3]}`
                    : family === 'chorus'
                      ? `rate ${selected.before[0]} → ${selected.after[0]} Hz · voices ${selected.before[2]} → ${selected.after[2]} · mix ${selected.before[6]} → ${selected.after[6]}`
                    : family === 'stereo-delay'
                      ? `left ${selected.before[0]} → ${selected.after[0]} ms · right ${selected.before[1]} → ${selected.after[1]} ms · feedback ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'fx-chain'
                      ? `drive ${selected.before[0]} → ${selected.after[0]} · delay mix ${selected.before[6]} → ${selected.after[6]} · cutoff ${selected.before[7]} → ${selected.after[7]} Hz`
                    : family === 'standalone-fx-host'
                      ? `Delay → Chorus at ${selected.switches[0][0]} → Delay at ${selected.switches[1][0]} · graph-reprepared gates`
                    : family === 'standalone-fx-routing'
                      ? `Delay → Chorus at ${selected.switches[0][0]} → Delay at ${selected.switches[1][0]} · visited tails keep processing`
                    : family === 'standalone-fx'
                      ? `type ${selected.before[0]} → ${selected.after[0]} · wet mix ${selected.before[1]} → ${selected.after[1]} · p/0 ${selected.before[2]} → ${selected.after[2]}`
                    : family === 'loop-capture'
                      ? `${selected.capacitySeconds} s capture · ${selected.events.length} control changes · mix ${selected.mix}`
                    : family === 'sample-region'
                      ? `${(manifest.sampleFrames / manifest.sampleSourceRate).toFixed(3)} s source · speed ${selected.parameters[0]} · reverse ${Boolean(selected.parameters[1])} · one-shot ${Boolean(selected.parameters[2])} · crossfade ${selected.parameters[6]} · ${selected.events.length} events`
                    : family === 'sample-instrument'
                      ? `${(manifest.sampleFrames / manifest.sampleSourceRate).toFixed(3)} s shared source · root ${selected.parameters[0]} · keytrack ${selected.parameters[1]} · ${selected.events.length} note events · ${selected.changes.length} control changes`
                    : family === 'fft-spectrum'
                      ? `smoothing ${selected.before[0]} → ${selected.after[0]} · floor ${selected.before[1]} → ${selected.after[1]} dB`
                    : family === 'spectrum-analyzer'
                      ? `sensitivity ${selected.sensitivityBefore} → ${selected.sensitivityAfter} · smoothing ${selected.smoothingBefore} → ${selected.smoothingAfter} · floor ${selected.floorBefore} → ${selected.floorAfter} dB`
                    : family === 'envelope-follower'
                      ? `${['peak', 'RMS', 'hybrid'][selected.modeBefore]} → ${['peak', 'RMS', 'hybrid'][selected.modeAfter]} · attack ${selected.attackBefore} → ${selected.attackAfter} ms · release ${selected.releaseBefore} → ${selected.releaseAfter} ms`
                    : family === 'envelope-ducking'
                      ? `detector ${['peak', 'RMS', 'hybrid'][selected.before[4]]} → ${['peak', 'RMS', 'hybrid'][selected.after[4]]} · duck depth ${selected.before[6]} → ${selected.after[6]}`
                    : family === 'compressor'
                      ? `threshold ${selected.before[0]} → ${selected.after[0]} dB · ratio ${selected.before[1]} → ${selected.after[1]} · attack ${selected.before[2]} ms at prepare`
                    : family === 'limiter'
                      ? `threshold ${selected.before[0]} → ${selected.after[0]} dB · release ${selected.before[1]} → ${selected.after[1]} ms · soft clip ${selected.before[3]} → ${selected.after[3]}`
            : `${selected.events.length} timed note events · attack ${selected.attack} s · release ${selected.release} s`;
    byId('reference-meta').textContent = `${manifest.sampleRate.toLocaleString()} Hz · ${manifest.frames} frames · ${selected.blockSize ?? manifest.blockSize} frame blocks · ${transition}`;
    const nativeReference = family === 'voice' || family === 'patch' || family === 'modulation' || family === 'slew-modulation' || family === 'cv-rack' || family === 'fx-chain' || family === 'standalone-fx' || family === 'loop-capture' || family === 'sample-region' || family === 'sample-instrument' || family === 'envelope-ducking' || family === 'fft-spectrum';
    byId('reference-title').textContent = nativeReference ? 'Native Rust ↔ Rust/Wasm' : 'C++ ↔ Rust/Wasm';
    byId('plot-window').querySelector('[value="step"]').textContent = family === 'spectrum-analyzer' || family === 'fft-spectrum' ? 'End of capture' : family === 'compressor' || family === 'limiter' || family === 'stereo-widener' || family === 'transient-shaper' ? 'Whole capture' : family === 'envelope-follower' || family === 'envelope-ducking' ? 'Whole envelope' : family === 'stereo-delay' || family === 'phaser' || family === 'chorus' || family === 'eq8' || family === 'waveshaper' || family === 'reverb' || family === 'multitap' || family === 'ring-modulator' || family === 'fx-chain' || family === 'standalone-fx' || isFxSwitchFamily(family) || family === 'loop-capture' ? 'Whole capture' : family === 'voice' ? 'Note event' : family === 'adsr' ? 'Whole envelope' : family === 'modulation' || family === 'slew-modulation' || family === 'cv-rack' ? 'Whole modulation' : 'Parameter change';
    byId('plot-window').querySelector('[value="start"]').textContent = family === 'spectrum-analyzer' || family === 'fft-spectrum' || family === 'cv-rack' || family === 'envelope-follower' || family === 'envelope-ducking' || family === 'compressor' || family === 'limiter' || family === 'stereo-widener' || family === 'transient-shaper' ? 'Before change' : family === 'stereo-delay' || family === 'phaser' || family === 'chorus' || family === 'eq8' || family === 'reverb' || family === 'multitap' || family === 'ring-modulator' || family === 'fx-chain' || family === 'standalone-fx' || isFxSwitchFamily(family) || family === 'loop-capture' ? 'Before change' : family === 'adsr' ? 'Attack detail' : family === 'modulation' ? 'Before change' : 'Start';
    byId('plot-title').textContent = family === 'fft-spectrum' ? '32 FFT bands · last block' : family === 'compressor' || family === 'limiter' ? 'Gain reduction · dB per block' : family === 'envelope-follower' || family === 'envelope-ducking' ? 'Detected envelope · one value per block' : family === 'spectrum-analyzer' ? 'Eight band estimates · last block' : family === 'loop-capture' ? 'Capture and playback · stereo peak level' : family === 'phaser' ? 'Stereo phaser output · peak level' : family === 'chorus' ? 'Stereo chorus output · peak level' : family === 'eq8' ? 'EQ8 stereo output · peak level' : family === 'eq-node' ? 'Three-band EQ stereo output' : family === 'reverb' ? 'Stereo reverb tail · peak level' : family === 'ring-modulator' ? 'Ring-modulated stereo output' : family === 'transient-shaper' ? 'Transient strength · mean per block' : family === 'bitcrusher' ? 'Quantized stereo output' : family === 'multitap' ? 'Multitap echoes · stereo peak level' : family === 'stereo-widener' ? 'Output stereo correlation · −1 to +1' : family === 'stereo-delay' || family === 'fx-chain' || family === 'standalone-fx' || isFxSwitchFamily(family) ? 'Left and right output tails · peak level' : family === 'adsr' ? 'Envelope shape · left channel' : family === 'modulation' || family === 'slew-modulation' || family === 'cv-rack' ? 'Amplitude envelope · left channel' : 'Output waveform';
    document.querySelector('.plot-unit').textContent = family === 'spectrum-analyzer' || family === 'fft-spectrum' || family === 'envelope-follower' || family === 'envelope-ducking' || family === 'compressor' || family === 'limiter' || family === 'stereo-widener' || family === 'transient-shaper' ? 'Meter difference · scaled to fit' : 'Left channel · scaled to fit';
    document.querySelector('.metric-row span').textContent = family === 'spectrum-analyzer' || family === 'fft-spectrum' || family === 'cv-rack' || family === 'envelope-follower' || family === 'envelope-ducking' || family === 'compressor' || family === 'limiter' || family === 'stereo-widener' || family === 'transient-shaper' ? 'Maximum meter difference' : 'Maximum difference';
    document.querySelectorAll('.metric-row span')[1].textContent = family === 'spectrum-analyzer' || family === 'fft-spectrum' || family === 'cv-rack' || family === 'envelope-follower' || family === 'envelope-ducking' || family === 'compressor' || family === 'limiter' || family === 'stereo-widener' || family === 'transient-shaper' ? 'RMS meter difference' : 'RMS difference';
    document.querySelector('.legend-old').textContent = isFxSwitchFamily(family) || family === 'stereo-delay' || family === 'phaser' || family === 'chorus' || family === 'eq8' || family === 'waveshaper' || family === 'reverb' || family === 'multitap' || family === 'ring-modulator' ? 'C++ L/R' : family === 'fx-chain' || family === 'standalone-fx' || family === 'loop-capture' || family === 'sample-region' || family === 'sample-instrument' ? 'Native L/R' : nativeReference ? 'Native Rust' : 'C++';
    document.querySelector('.legend-new').textContent = isFxSwitchFamily(family) || family === 'stereo-delay' || family === 'phaser' || family === 'chorus' || family === 'eq8' || family === 'waveshaper' || family === 'reverb' || family === 'multitap' || family === 'ring-modulator' || family === 'fx-chain' || family === 'standalone-fx' || family === 'loop-capture' || family === 'sample-region' || family === 'sample-instrument' ? 'Wasm L/R' : 'Rust/Wasm';
    document.querySelector('[data-play="legacy"]').textContent = nativeReference ? 'Play native' : 'Play C++';
    const legacy = await loadFloat32(family, selected.output);
    if (currentRequest !== requestId) return;
    const rust = renderWasm(engine, family, manifest, input, selected);
    const audioReport = measure(legacy, rust);
    const metersLegacy = family === 'spectrum-analyzer' || family === 'fft-spectrum' || family === 'cv-rack' || family === 'envelope-follower' || family === 'envelope-ducking' || family === 'compressor' || family === 'limiter' || family === 'stereo-widener' || family === 'transient-shaper' ? await loadFloat32(family, selected.meterOutput) : null;
    if (currentRequest !== requestId) return;
    const report = metersLegacy ? measure(metersLegacy, rust.meters) : audioReport;
    if (metersLegacy) byId('reference-meta').textContent += ` · audio max Δ ${audioReport.max.toExponential(2)}`;
    active = { legacy, rust, focusFrame: selected.focusFrame ?? selected.gateOffFrame ?? manifest.stepFrame,
      ...report, audioMax: audioReport.max, difference: audioReport.difference, metersLegacy, metersRust: rust.meters,
      meterDifference: report.difference, blockSize: selected.blockSize ?? manifest.blockSize };
    byId('max-difference').textContent = report.max.toExponential(2);
    byId('rms-difference').textContent = report.rms.toExponential(2);
    const pass = report.max <= .0002 && audioReport.max <= .0002;
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
    byId('comparison-wave').parentElement.classList.remove('cv-stage-plot');
    byId('plot-window').value = 'step';
    byId('plot-window').querySelector('[value="stage"]').hidden = family !== 'cv-rack';
    byId('plot-window').querySelector('[value="tail"]').hidden = !isFxSwitchFamily(family);
    if (isFxSwitchFamily(family)) byId('plot-window').value = 'tail';
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

  function selectEffectType(type) {
    preferredEffectType = type;
    if (currentFamily !== 'standalone-fx' || selectedFamily !== 'standalone-fx') return;
    const matching = effectCase(type);
    if (matching && chooser.value !== matching.id) {
      chooser.value = matching.id;
      choose().catch((error) => { byId('reference-status').textContent = String(error); });
    }
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
  return { selectFamily, selectEffectType };
}
