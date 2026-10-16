// Compose existing Rack factories with the reusable authored oscillator module.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  gain as gainDefinition,
  inputSidechain as inputSidechainDefinition,
  retrospectiveCapture as retrospectiveCaptureDefinition,
  sum2 as sum2Definition,
} from '@manifold/author/primitives';
import { buildGraph as buildFilterEqGraph, createProject } from './rack-filter-eq.mjs';
import { addRackOscillatorModule } from './rack-oscillator.mjs';
import { addRackSampleModule } from './rack-sample-eight-voice.mjs';
import { SAMPLE_BASE } from './sample-voice-chain.mjs';
// Attach a real layer playback output to the public Rack Sample capture bus.
// The original Main source numbers 1–4 map to v2 IDs 2–5: v2 ID 1 is the
// already-saved sidechain source. The caller owns the layer's playback graph.
export function attachRackSampleLayerSource(graph, layer, sourceOutput) {
  if (!Number.isInteger(layer) || layer < 1 || layer > 4) {
    throw new RangeError('Rack Sample layer must be 1–4');
  }
  const source = graph.find(sourceOutput?.nodeId);
  if (
    sourceOutput?.graph !== graph ||
    sourceOutput?.direction !== 'outputs' ||
    sourceOutput?.signal !== 'audio' ||
    source?.generation !== sourceOutput.generation
  ) {
    throw new TypeError('Layer source must be a current audio output in this graph');
  }
  const snapshot = graph.toProject();
  if (snapshot.signal.captureSources?.some((entry) => entry.id === layer + 1)) {
    throw new RangeError(`Rack Sample layer ${layer} is already registered`);
  }
  const silentSend = graph.findInstance(`${SAMPLE_BASE}/nodes/capture_silent_send`);
  const edge = snapshot.signal.connections.find(
    (entry) => entry.to === silentSend?.id && entry.inputPort === 0,
  );
  if (!silentSend || !edge) throw new TypeError('Rack Sample capture bus is missing');
  const previous = graph.find(edge.from).output('out');
  const firstId = Math.max(...snapshot.signal.nodes.map((node) => node.id)) + 1;
  const capture = graph.add(retrospectiveCaptureDefinition.type, {
    id: firstId,
  });
  const merge = graph.add(sum2Definition.type, { id: firstId + 1 });
  graph.registerInstance(`${SAMPLE_BASE}/nodes/layer_${layer}_capture`, capture);
  graph.registerInstance(`${SAMPLE_BASE}/nodes/layer_${layer}_capture_merge`, merge);
  graph.connect(sourceOutput, capture.input('audio'));
  graph.connect(previous, merge.input('a'));
  graph.connect(capture.output('out'), merge.input('b'));
  graph.disconnect(silentSend.input('audio'));
  graph.connect(merge.output('out'), silentSend.input('audio'));
  graph.registerCaptureSource(capture, `Rack Sample layer ${layer}`, 'layer', layer + 1);
  return capture;
}
export function buildRackModuleHostGraph({ selection = 1, sampleSource = null } = {}) {
  if (![1, 2, 3, 4, 5, 6].includes(selection)) throw new RangeError('Unported Rack selection');
  const graph = buildFilterEqGraph();
  const oscillatorOutput = addRackOscillatorModule(graph, {
    firstVoiceId: 28,
    mixerId: 37,
    outputId: 38,
  });
  let sampleOutput;
  if (sampleSource || selection === 2) {
    sampleOutput = addRackSampleModule(graph, {
      firstVoiceId: 39,
      mixerId: 63,
      outputId: 64,
      ...sampleSource,
    });
    const capture = graph.add(retrospectiveCaptureDefinition.type, { id: 65 });
    const silentSend = graph.add(gainDefinition.type, { id: 66 });
    graph.registerInstance(`${SAMPLE_BASE}/nodes/capture_input`, capture);
    graph.registerInstance(`${SAMPLE_BASE}/nodes/capture_silent_send`, silentSend);
    silentSend.parameter('level').set(0);
    graph.setInputSource('external');
    graph.connect(graph.input.output('out'), capture.input('audio'));
    const captureMerge = graph.add(sum2Definition.type, { id: 69 });
    graph.registerInstance(`${SAMPLE_BASE}/nodes/capture_merge`, captureMerge);
    graph.connect(capture.output('out'), captureMerge.input('a'));
    graph.connect(captureMerge.output('out'), silentSend.input('audio'));
    graph.connect(
      silentSend.output('out'),
      graph.findInstance(`${SAMPLE_BASE}/nodes/mixer`).input('in-9'),
    );
    graph.registerCaptureSource(capture, 'Rack Sample input', 'input', 0);
    const sidechainInput = graph.add(inputSidechainDefinition.type, { id: 67 });
    const sidechainCapture = graph.add(retrospectiveCaptureDefinition.type, {
      id: 68,
    });
    graph.registerInstance(`${SAMPLE_BASE}/nodes/sidechain_input`, sidechainInput);
    graph.registerInstance(`${SAMPLE_BASE}/nodes/sidechain_capture`, sidechainCapture);
    graph.connect(sidechainInput.output('out'), sidechainCapture.input('audio'));
    graph.connect(sidechainCapture.output('out'), captureMerge.input('b'));
    graph.registerCaptureSource(sidechainCapture, 'Rack Sample sidechain', 'sidechain', 1);
  }
  if (selection === 1) {
    graph.disconnect(graph.output.input('in'));
    graph.connect(oscillatorOutput.output('out'), graph.output.input('in'));
  }
  if (selection === 2) {
    graph.disconnect(graph.output.input('in'));
    graph.connect(sampleOutput.output('out'), graph.output.input('in'));
  }
  graph.unregisterControl('/rack_host/module/index');
  graph.registerControl('/rack_host/module/index', {
    min: 1,
    max: 19,
    default: selection,
    discrete: true,
  });
  return graph;
}
export { createProject };
