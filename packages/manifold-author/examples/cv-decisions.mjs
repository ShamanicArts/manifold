// Compare emits separate gate and two-block trigger ports; Range maps the gate.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  cvCompare as cvCompareDefinition,
  cvMix as cvMixDefinition,
  cvRange as cvRangeDefinition,
  lfo as lfoDefinition,
  modulatedGain as modulatedGainDefinition,
  oscillator as oscillatorDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace } from '@manifold/author';
// Graph definition — audio and CV instances are distinct, named primitives.
const graph = createGraphWorkspace();
const tone = graph.add(oscillatorDefinition.type, { id: 4 });
const lfo = graph.add(lfoDefinition.type, { id: 5 });
const compare = graph.add(cvCompareDefinition.type, { id: 6 });
const range = graph.add(cvRangeDefinition.type, { id: 7 });
const mix = graph.add(cvMixDefinition.type, { id: 8 });
const gain = graph.add(modulatedGainDefinition.type, { id: 9 });
lfo.parameter('rate').set(20);
compare.parameter('direction').set(2);
compare.parameter('threshold').set(0.2);
range.parameter('minimum').set(0.1);
range.parameter('maximum').set(0.8);
range.parameter('mode').set(1);
mix.parameter('input1').set(0.5);
mix.parameter('input2').set(0.5);
// Composition — cable names describe where the control signal enters audio.
graph.connect(lfo.output('out'), compare.input('cv'));
graph.connect(compare.output('gate'), range.input('cv'));
graph.connect(range.output('out'), mix.input('in-1'));
graph.connect(compare.output('trig'), mix.input('in-2'));
graph.connect(mix.output('out'), gain.input('cv'));
graph.connect(tone.output('out'), gain.input('audio'));
graph.connect(gain.output('out'), graph.output.input('in'));
// Export — this plain graph can be prepared by browser or native hosts.
console.log(JSON.stringify(graph.toProject(), null, 2));
