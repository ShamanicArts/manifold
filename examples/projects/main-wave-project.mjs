// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { GraphWorkspace } from '../../packages/manifold-author/author.js';
import {
  buildGraph,
  createProject as createWave,
} from '../../packages/manifold-author/examples/main-wave-graph.mjs';
import { createMainVoiceControl } from '../../packages/manifold-author/examples/main-voice-control.mjs';

function controller(host, graph) {
  const wave = createWave(host, graph),
    voices = createMainVoiceControl(wave);
  return {
    ...wave,
    noteOn: (note, velocity) => voices.on(note, velocity),
    noteOff: (note) => voices.off(note),
    advance: (dt, now) => voices.advance(dt, now),
    panic: () => voices.panic(),
    voiceSnapshot: () => voices.snapshot(),
  };
}
export const createProject = (host) => controller(host, buildGraph({ captureLayers: true }));
export const restoreProject = (host, saved) => controller(host, GraphWorkspace.fromProject(saved));
