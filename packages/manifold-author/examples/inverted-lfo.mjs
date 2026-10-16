// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  lfo as lfoDefinition,
  modulatedGain as modulatedGainDefinition,
  oscillator as oscillatorDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace } from '@manifold/author';
// Graph definition — audio and CV instances are distinct, named primitives.
const graph = createGraphWorkspace();
const tone = graph.add(oscillatorDefinition.type, { id: 4 });
const lfo = graph.add(lfoDefinition.type, { id: 5 });
const gain = graph.add(modulatedGainDefinition.type, { id: 6 });
// Composition — cable names describe where the control signal enters audio.
graph.connect(tone.output('out'), gain.input('audio'));
graph.connect(lfo.output('inv'), gain.input('cv'));
graph.connect(gain.output('out'), graph.output.input('in'));
// Export — this plain graph can be prepared by browser or native hosts.
console.log(JSON.stringify(graph.toProject(), null, 2));
