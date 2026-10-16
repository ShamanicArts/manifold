// A small public-primitive four-layer graph, composed outside any audio host.
// Main's transport, seek, quantization, and loop PCM recall remain separate
// migration work; these are independent Loop Capture nodes and source ports.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { loopCapture as loopCaptureDefinition } from '@manifold/author/primitives';
import { attachRackSampleLayerSource } from './rack-module-host.mjs';
import { GraphWorkspace } from '@manifold/author';
export const layerPath = (layer) => `/rack_host/layers/${layer}/loop`;
export function addFourLayerLoopSources(
  graph,
  { firstNodeId = 70, input = graph.input.output('out'), registerSampleSources = true } = {},
) {
  const loops = Array.from({ length: 4 }, (_, index) => {
    const layer = index + 1;
    const loop = graph.add(loopCaptureDefinition.type, {
      id: firstNodeId + index,
    });
    graph.registerInstance(layerPath(layer), loop);
    graph.connect(input, loop.input('audio'));
    return loop;
  });
  if (registerSampleSources)
    loops.forEach((loop, index) =>
      attachRackSampleLayerSource(graph, index + 1, loop.output('out')),
    );
  return loops;
}
export function createFourLayerLoopController(session) {
  const node = (layer) => {
    if (!Number.isInteger(layer) || layer < 1 || layer > 4) {
      throw new RangeError('Layer must be 1–4');
    }
    const instance = session.forkGraph().findInstance(layerPath(layer));
    if (instance?.type !== 'loop-capture') throw new TypeError(`Missing authored layer ${layer}`);
    return instance.id;
  };
  return Object.freeze({
    record: (layer, enabled) =>
      session.parameter({ nodeId: node(layer), id: 0, value: enabled ? 1 : 0 }),
    play: (layer, enabled) =>
      session.parameter({ nodeId: node(layer), id: 1, value: enabled ? 1 : 0 }),
    overdub: (layer, enabled) =>
      session.parameter({ nodeId: node(layer), id: 2, value: enabled ? 1 : 0 }),
    speed: (layer, value) => session.parameter({ nodeId: node(layer), id: 3, value }),
    reverse: (layer, enabled) =>
      session.parameter({ nodeId: node(layer), id: 4, value: enabled ? 1 : 0 }),
  });
}
// Until loop PCM is a portable asset, export a truthful graph snapshot whose
// layer controls will not claim to play a take that was never serialized.
export function snapshotWithoutLoopAudio(project) {
  const loopNodes = new Set(
    project.instances
      .filter((entry) => /^\/rack_host\/layers\/[1-4]\/loop$/.test(entry.path))
      .map((entry) => entry.nodeId),
  );
  return {
    ...project,
    signal: {
      ...project.signal,
      initialParameters: project.signal.initialParameters.map((entry) =>
        loopNodes.has(entry.nodeId) && entry.id <= 2 ? { ...entry, value: 0 } : entry,
      ),
    },
  };
}
/** Freeze every stopped layer into the same portable PCM assets as Sample nodes. */
export async function snapshotWithLoopAudio(project, snapshotLoop) {
  const graph = GraphWorkspace.fromProject(project);
  for (let layer = 1; layer <= 4; layer++) {
    const loop = graph.findInstance(layerPath(layer));
    if (!loop) continue;
    if (loop.type !== 'loop-capture') throw new TypeError(`Layer ${layer} is not a loop`);
    const recording = project.signal.initialParameters.some(
      (parameter) => parameter.nodeId === loop.id && parameter.id === 0 && parameter.value >= 0.5,
    );
    if (recording) throw new Error(`Stop recording layer ${layer} before saving`);
    const { stereo, sourceRate } = await snapshotLoop(loop.id);
    if (stereo.length)
      graph.setSampleAsset(loop, stereo, Math.round(sourceRate), `Layer ${layer} take`);
    else graph.removeSampleAsset(loop);
  }
  return graph.toProject();
}
