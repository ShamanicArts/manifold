// A native/browser project entry over the shipped public Rack Sample module.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { GraphWorkspace, createLiveGraphSession } from '../../packages/manifold-author/author.js';
import {
  buildGraph,
  createProject as createRack,
} from '../../packages/manifold-author/examples/rack-sample-eight-voice.mjs';
import { SAMPLE_BASE } from '../../packages/manifold-author/examples/sample-voice-chain.mjs';

function pcm(frequency) {
  const stereo = new Float32Array(8192 * 2);
  for (let frame = 0; frame < 8192; frame++) {
    stereo[frame * 2] = Math.sin((frame * 2 * Math.PI * frequency) / 48000) * 0.3;
    stereo[frame * 2 + 1] = stereo[frame * 2] * -0.7;
  }
  return stereo;
}

function controller(host, graph) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (project) => host.replaceGraph(project),
    (edits) => host.setParameterBatch(edits),
  );
  const rack = createRack(host, graph, session);
  const api = {
    ...rack,
    adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
    async activate() {
      await rack.activate();
      return session.toProject();
    },
    replaceSource(frequency) {
      return session.transaction((candidate) => {
        const source = candidate.findInstance(`${SAMPLE_BASE}/nodes/voice_1/playback`);
        candidate.setSampleAsset(source, pcm(frequency), 48000, `Source ${frequency} Hz`);
      });
    },
    setInsert(enabled) {
      return session.transaction((candidate) => {
        const output = candidate.findInstance(`${SAMPLE_BASE}/nodes/output`);
        candidate.disconnect(candidate.output.input('in'));
        if (candidate.find(800)) candidate.remove(candidate.find(800));
        if (enabled) {
          const unity = candidate.add('fixed-gain', {
            id: 800,
            config: { gain: 1 },
          });
          candidate.connect(output.output('out'), unity.input('audio'));
          candidate.connect(unity.output('out'), candidate.output.input('in'));
        } else candidate.connect(output.output('out'), candidate.output.input('in'));
      });
    },
    async event(event) {
      if ((await host.sendEvent(event)) === false) throw new Error('Event rejected');
      return session.toProject();
    },
    async batch(edits) {
      if ((await host.setParameterBatch(edits)) === false) throw new Error('Batch rejected');
      // This diagnostic method changes targets through the host; the next
      // control synchronization adopts the accepted published values.
      return session.toProject();
    },
  };
  return api;
}

export const createProject = (host) =>
  controller(host, buildGraph(pcm(220), 48000, 'Initial 220 Hz source'));
export const restoreProject = (host, saved) => controller(host, GraphWorkspace.fromProject(saved));
