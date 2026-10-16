import { GraphWorkspace, createLiveGraphSession } from '@manifold/author';

// This route-only slice prepares every node in the graph. Loop PCM is
// prepared before start; route edits keep the existing capture kernel alive.
const ROUTABLE_TYPES = new Set([
  'input.raw', 'input.sidechain', 'output', 'gain', 'fixed-gain', 'distortion',
  'svf', 'modulated-svf', 'eq8', 'sum2', 'oscillator', 'noise', 'lfo',
  'modulated-gain', 'slew-control', 'attenuverter-bias', 'sample-hold', 'cv-mix', 'cv-compare', 'cv-range', 'stereo-widener',
  'midi-input', 'midi-transpose', 'voice-synth', 'loop-capture',
]);

export function createBrowserLiveSession(project, audio) {
  const signal = project?.signal;
  if (project?.id !== 'manifold.graph-workspace'
    || !Array.isArray(signal?.nodes)
    || signal.nodes.some(node => !ROUTABLE_TYPES.has(node.type))
    || project.graphAssets?.some(asset => !signal.nodes.some(node =>
      node.id === asset.nodeId && node.type === 'loop-capture'))
    || project.graphTargets?.length
    || project.graphTemporal?.length) return null;
  try {
    const graph = GraphWorkspace.fromProject({
      format: 'manifold.project', schemaVersion: 1,
      projectId: 'manifold.graph-workspace', signal,
    });
    return createLiveGraphSession(graph,
      route => audio.setRoute(route.to, route.inputPort, route.from, route.outputPort),
      edit => audio.setNodeParameter(edit.nodeId, edit.id, edit.value));
  } catch {
    return null;
  }
}
