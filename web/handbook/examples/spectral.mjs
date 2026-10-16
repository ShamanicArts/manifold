import { createDevice, audio, sawOscillator, phaseVocoder } from 'manifold';

const device = createDevice({ id: 'spectral-shift', name: 'Spectral transposition' });
const output = device.output('audio', audio.stereo);
const tone = device.add('tone', sawOscillator);
tone.configure({ frequency: 220, level: 0.12 });
const spectral = device.add('spectral', phaseVocoder);

// Declare FFT size before the host prepares audio; this is not a live edit.
spectral.configure({ fftOrder: 11 });

const pitch = device.control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
});
const mix = device.control('mix', spectral.parameters.wetMix, {
  label: 'Wet mix',
  min: 0,
  max: 1,
  default: 1,
});

// This demonstration contains its own tone, so its sound travels with the saved project.
device.connect(tone.outputs.out, spectral.inputs.audio);
device.connect(spectral.outputs.out, output);

export default device;
