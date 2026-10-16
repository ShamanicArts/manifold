import { createDevice, audio, sineOscillator, gain } from 'manifold';

// device is our JavaScript name for this particular sound generator.
const device = createDevice({ id: 'gain-stage', name: 'Gain stage' });
const output = device.output('audio', audio.stereo);
const tone = device.add('tone', sineOscillator);
tone.configure({ frequency: 220, level: 0.12 });
const level = device.add('level', gain);

// Export the same control reference for a website's slider to use.
export const volume = device.control('level', level.parameters.level, {
  label: 'Gain',
  min: 0,
  max: 1,
  default: 0.65,
  unit: '×',
});

device.connect(tone.outputs.out, level.inputs.audio);
device.connect(level.outputs.out, output);

export default device;
