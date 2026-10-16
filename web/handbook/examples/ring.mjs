import { createDevice, audio, oscillator, ringModulator, gain } from 'manifold';

// This sound generator has an audio output and needs no external input.
const device = createDevice({ id: 'sideband-laboratory', name: 'Sideband laboratory' });
const output = device.output('audio', audio.stereo);

// Two oscillators: the sound, and the signal multiplying it.
const carrier = device.add('carrier', oscillator);
carrier.configure({ level: 0.3 });
const modulator = device.add('modulator', oscillator);
modulator.configure({ level: 0.8 });
const ring = device.add('ring', ringModulator);
const outputLevel = device.add('output-level', gain);
outputLevel.configure({ level: 0.35 });

const carrierFrequency = device.control('carrier', carrier.parameters.frequency, {
  label: 'Carrier',
  min: 80,
  max: 880,
  default: 220,
  unit: 'Hz',
});
const modulatorFrequency = device.control('modulator', modulator.parameters.frequency, {
  label: 'Modulator',
  min: 20,
  max: 880,
  default: 110,
  unit: 'Hz',
});
const mix = device.control('mix', ring.parameters.wetMix, {
  label: 'Wet mix',
  min: 0,
  max: 1,
  default: 1,
});

device.connect(carrier.outputs.out, ring.inputs.carrier);
device.connect(modulator.outputs.out, ring.inputs.modulator);
device.connect(ring.outputs.out, outputLevel.inputs.audio);
device.connect(outputLevel.outputs.out, output);

export default device;
