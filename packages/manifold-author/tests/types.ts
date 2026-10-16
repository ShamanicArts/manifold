import { createGraphWorkspace } from '../index.js';
import { BrowserGraphHost } from '../browser.js';
import { createProject as createLegacyProject } from '../examples/dsp-live-scripting.mjs';
import { createProject as createRackProject } from '../examples/rack-filter-eq.mjs';
import { createProject as createTransposeProject } from '../examples/transpose-audition.mjs';
import { createProject as createLoopProject } from '../examples/loop-authoring.mjs';
import type { EventAdmission, GraphEvent, MidiTrace } from '../browser.js';
import { createProject as createMainWave } from '../examples/main-wave-graph.mjs';
import { createMainVoiceControl } from '../examples/main-voice-control.mjs';
import createNetworkInstrument from '../examples/network-instrument.mjs';
import { defineNetwork } from '../host-services.js';
import * as manifold from '../author.js';

const namespaceGraph = manifold.createGraphWorkspace();
namespaceGraph.add(manifold.svf.type, { id: 89 }).parameter('cutoff').set(1000);
namespaceGraph.add(manifold.eq8.type, { id: 88 }).parameter('band4Frequency').set(500);
manifold.defineNetwork({ udp: '127.0.0.1:0' }).onEvent(() => null);
manifold.oscillatorPreviewCurves({ waveform: 1 }).wave;
// @ts-expect-error A filter has no oscillator frequency parameter.
namespaceGraph.add(manifold.svf.type, { id: 87 }).parameter('frequency');

defineNetwork({ udp: '127.0.0.1:0', link: { tempo: 120 } }).onEvent((event, accepted) => {
  return { reply: { type: event.type, revision: accepted.revision } };
});
// @ts-expect-error Network event handlers are callbacks, not callback names.
defineNetwork({}).onEvent('onNetwork');
// @ts-expect-error Link tempo is numeric.
defineNetwork({ link: { tempo: 'fast' } });

const networkInstrument = createNetworkInstrument();
const namedTone = networkInstrument.graph.add('oscillator', { id: 90 });
namedTone.parameter('frequency').set(440);
namedTone.parameter('waveform').description.choices;
// @ts-expect-error The oscillator's parameter is frequency, not an invented pitch member.
namedTone.parameter('pitch');
const namedGain = networkInstrument.graph.add('gain', { id: 91 });
namedGain.parameter('level').expose({ path: '/typed/level', min: 0, max: 1, default: 0.5 });
// @ts-expect-error A gain instance has no frequency parameter.
namedGain.parameter('frequency');

declare const host: BrowserGraphHost;
const mainWave = createMainWave(host);
createMainVoiceControl(mainWave).on(60, 100);
mainWave.session.parameters([{ nodeId: 10, id: 2, value: 0.4 }]);
const configuredGraph = createGraphWorkspace();
const configuredMixer = configuredGraph.add('mixer', { id: 4, config: { inputs: 13 } });
configuredMixer.input('in-13');
configuredGraph.describeNode(configuredMixer).outputs;
// @ts-expect-error Mixer configuration uses named constructor fields.
configuredGraph.add('mixer', { id: 5, config: { inputCount: 13 } });
// @ts-expect-error Mixer has no audio input named "audio".
configuredMixer.input('audio');
const transpose = createTransposeProject(host);
const loops = createLoopProject(host);
loops.layers.record(1, true); loops.snapshot(); loops.setInsert(true);
// @ts-expect-error There are four layers.
loops.layers.play(5, true);
const admission: Promise<EventAdmission> = transpose.sendEvents([{ kind: 0, note: 60, velocity: 100, offset: 64 }]);
const bend: GraphEvent = { nodeId: 4, kind: 3, note: 0, velocity: 64 };
host.sendEventBatch([bend]);
const trace: Promise<MidiTrace> = host.readMidiTrace();
// @ts-expect-error Unknown MIDI event kind.
transpose.sendEvents([{ kind: 4, note: 60 }]);
const liveLegacy = createLegacyProject(host);
liveLegacy.set('/dsp/live/width', 0.5);
liveLegacy.adoptPublishedParameters(host.readPublishedParameters());
liveLegacy.synchronizeParameters();
liveLegacy.setDistortion(true);
liveLegacy.session.transaction(graph => { graph.add('stereo-widener', { id: 7 }); });
liveLegacy.session.routeWithControl({ to: 3, input: 'in', from: 4, output: 'out' },
  { path: '/rack_host/module/index', value: 4 });
// @ts-expect-error Unknown project endpoint.
liveLegacy.set('/dsp/live/missing', 0.5);

const rack = createRackProject({ setRoute: route => host.setRoute(route),
  setParameter: edit => host.setParameter(edit) });
rack.set('/rack_host/module/index', 6);
rack.set('/rack_host/input_a/pitch', 69);
rack.set('/rack_host/input_a/mode', 4);
rack.set('/midi/synth/rack/fx/1/mix', 0.5);
rack.set('/midi/synth/rack/filter/1/cutoff', 800);
// @ts-expect-error The Rack slice does not expose an invented control.
rack.set('/rack_host/unknown', 1);

const graph = createGraphWorkspace();
const oscillator = graph.add('oscillator', { id: 4 });
const configuredLoop = graph.add('loop-capture', { id: 20, config: { capacitySeconds: .5 } });
graph.configure(configuredLoop, { capacitySeconds: 1.5 });
graph.add('fixed-gain', { id: 21, config: { gain: .25 } });
// @ts-expect-error Misspelled constructor field.
graph.add('loop-capture', { id: 22, config: { capacity: 1 } });
// @ts-expect-error Live transport is a parameter, not structural configuration.
graph.configure(configuredLoop, { playing: true });
// @ts-expect-error Oscillator live frequency is a parameter.
graph.add('oscillator', { id: 23, config: { capacitySeconds: 1 } });
const discoveredNode = graph.find(20);
if (discoveredNode) graph.configure(discoveredNode, { capacitySeconds: 1.5 });
const lfo = graph.add('lfo', { id: 5 });
const gain = graph.add('modulated-gain', { id: 6 });
graph.connect(oscillator.output('out'), gain.input('audio'));
graph.connect(lfo.output('inv'), gain.input('cv'));
graph.connect(gain.output('out'), graph.output.input('in'));

// @ts-expect-error The LFO has no fourth output.
lfo.output('missing');
// @ts-expect-error Control cannot connect to an audio input.
graph.connect(lfo.output('inv'), gain.input('audio'));
// @ts-expect-error The type ID must be in the generated Rust catalog.
graph.add('unlisted-processor', { id: 10 });
import { instantiateProjectPackage, type PackageController } from '../package.js';
async function eventOnlyPackage(host: BrowserGraphHost, bytes: string) {
  interface InstrumentController extends PackageController {
    event(event: { kind: 0; note: number; velocity: number }): Promise<unknown>;
  }
  const { controller } = await instantiateProjectPackage<InstrumentController>(bytes, host);
  await controller.event({ kind: 0, note: 60, velocity: 100 });
  controller.toProject();
}
import {LiveProjectRuntime, type EventMappingSession, type ProjectEvent} from '../live-project.js';
import {decodeMidiControl} from '../midi-control.js';
import {source as oscillatorCreatorSource} from '../examples/standalone-oscillator.mjs';
const playableCreator = new LiveProjectRuntime(null,oscillatorCreatorSource);
const note:ProjectEvent|null=decodeMidiControl(new Uint8Array([0x90,60,100]));
if(note)playableCreator.request({operation:'event.send',event:note});
declare const eventSession:EventMappingSession;
eventSession.parameters([{nodeId:31,id:4,value:1}]);
playableCreator.presentation().components.filter(c=>c.type==='keyboard').map(c=>c.firstNote);

import type {PaintUI, ComponentStyle} from '../live-project.js';
declare const painter:PaintUI;
const palette:ComponentStyle={accent:'#38bdf8',background:'#112a36',text:'#e0f2fe'};
painter.label('Play','title',{fontSize:22,group:'Sound',style:palette});
painter.curve({id:'preview',points:[[0,0.5],[1,0.5]],height:160,style:palette});
// @ts-expect-error Arbitrary CSS is not part of the portable color contract.
const unsupportedStyle:ComponentStyle={display:'grid'};

const wideMixer = graph.add('mixer', { id: 300, config: { inputs: 513 } });
graph.connect(graph.input.output('out'), wideMixer.input('in-513'));
wideMixer.parameter('input513Gain').set(.5);
wideMixer.parameter('input513Pan').set(-1);
// @ts-expect-error Mixer controls retain meaningful names, not arbitrary strings.
wideMixer.parameter('unrelatedParameter');
import { createEffect } from '../device.js';
import { mixer as mixerDefinition } from '../primitives.js';
const wideEffect = createEffect({ id: 'wide-mix', name: 'Wide mix' });
const wideBlend = wideEffect.add('mix', mixerDefinition, { config: { inputs: 513 } });
wideEffect.connect(wideEffect.inputs.audio, wideBlend.inputs['in-513']);
wideEffect.control('lastLevel', wideBlend.parameters.input513Gain, { label: 'Last input', min: 0, max: 2, default: .5 });
