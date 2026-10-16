import { createDevice, audio, midi, phaseVocoder } from 'manifold';

// device is our JavaScript variable name; device.input refers to this same object.
const device = createDevice({ id: 'spectral-shift', name: 'Spectral Shift' });
const input = device.input('audio', audio.stereo);
const output = device.output('audio', audio.stereo);
// MIDI is available to connect to event processors; it does not drive pitch by itself.
const notes = device.input('midi', midi.events);
const spectral = device.add('spectral', phaseVocoder);
spectral.configure({ fftOrder: 11 });

const pitch = device.control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
});
const mix = device.control('mix', spectral.parameters.wetMix, {
  label: 'Mix',
  min: 0,
  max: 1,
  default: 1,
});

device.connect(input, spectral.inputs.audio);
device.connect(spectral.outputs.out, output);

export default device;
