// The same authored CV patch runs in browser/Wasm and native hosts.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  attenuverterBias as attenuverterBiasDefinition,
  cvMix as cvMixDefinition,
  lfo as lfoDefinition,
  modulatedGain as modulatedGainDefinition,
  oscillator as oscillatorDefinition,
  sampleHold as sampleHoldDefinition,
  slewControl as slewControlDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace } from '@manifold/author';
// Graph definition — audio and CV instances are distinct, named primitives.
const graph = createGraphWorkspace();
const tone = graph.add(oscillatorDefinition.type, { id: 4 });
const lfo = graph.add(lfoDefinition.type, { id: 5 });
const amount = graph.add(attenuverterBiasDefinition.type, { id: 6 });
const slew = graph.add(slewControlDefinition.type, { id: 7 });
const hold = graph.add(sampleHoldDefinition.type, { id: 8 });
const mix = graph.add(cvMixDefinition.type, { id: 9 });
const gain = graph.add(modulatedGainDefinition.type, { id: 10 });
lfo.parameter('rate').set(5);
amount.parameter('amount').set(-0.8);
amount.parameter('bias').set(0.2);
slew.parameter('riseSamples').set(24);
slew.parameter('fallSamples').set(80);
mix.parameter('input2').set(0.3);
// Composition — cable names describe where the control signal enters audio.
graph.connect(lfo.output('out'), amount.input('cv'));
graph.connect(amount.output('out'), slew.input('cv'));
graph.connect(slew.output('out'), hold.input('cv'));
graph.connect(lfo.output('uni'), hold.input('trigger'));
graph.connect(hold.output('out'), mix.input('in-1'));
graph.connect(lfo.output('inv'), mix.input('in-2'));
graph.connect(mix.output('out'), gain.input('cv'));
graph.connect(tone.output('out'), gain.input('audio'));
graph.connect(gain.output('out'), graph.output.input('in'));
// Export — this plain graph can be prepared by browser or native hosts.
console.log(JSON.stringify(graph.toProject(), null, 2));
