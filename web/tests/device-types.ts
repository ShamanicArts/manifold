import {
  createEffect,
  createInstrument,
  createDevice,
  phaseVocoder,
  gain,
  audio,
  midi,
} from 'manifold';
import { lowerDevice } from 'manifold/graph';
import { BrowserDeviceHost } from 'manifold/browser';
const effect = createEffect({ id: 'spectral', name: 'Spectral' });
const spectral = effect.add('spectral', phaseVocoder);
spectral.configure({ fftOrder: 11, pitchSemitones: 7 });
const pitch = effect.control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
});
effect.connect(effect.inputs.audio, spectral.inputs.audio);
effect.connect(spectral.outputs.out, effect.outputs.audio);
lowerDevice(effect);
const instrument = createInstrument({ id: 'tone', name: 'Tone' });
instrument.input('audio', audio.stereo);
const plain = createDevice({ id: 'plain', name: 'Plain' });
const input = plain.input('audio', audio.stereo);
const level = plain.add('level', gain);
plain.connect(input, level.inputs.audio);
// @ts-expect-error The processor's actual parameter names are inferred.
spectral.configure({ notAParameter: 1 });
// @ts-expect-error Unknown parameter member.
spectral.parameters.frequency;
// @ts-expect-error MIDI cannot connect to an audio input.
plain.connect(plain.input('midi', midi.events), level.inputs.audio);
// @ts-expect-error Connections require output -> input direction.
effect.connect(spectral.inputs.audio, effect.outputs.audio);
// @ts-expect-error A control describes initial state; it is not a running parameter.
pitch.set(4);
// @ts-expect-error Rich imported definitions, not their type string.
effect.add('bad', phaseVocoder.type);

async function embed(context: AudioContext) {
  const host = new BrowserDeviceHost(context);
  await host.prepare(effect);
  host.connectOutput('audio', context.destination);
  const accepted: number = await host.setControl(pitch, 3);
  // @ts-expect-error A processor parameter is not a Device control reference.
  await host.setControl(spectral.parameters.pitchSemitones, 3);
  // @ts-expect-error Runtime transport IDs are not the control interface.
  await host.setControl(4, 3);
  await host.close();
  return accepted;
}
