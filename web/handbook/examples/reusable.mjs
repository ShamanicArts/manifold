import { createEffect, createDevice, audio, sawOscillator, gain, lowPassFilter } from 'manifold';

// A reusable sound-shaping Device, with its own input, output and control.
const filterStage = createEffect({ id: 'filter-stage', name: 'Filter Stage' });
const filter = filterStage.add('filter', lowPassFilter);
const level = filterStage.add('level', gain);
level.configure({ level: 0.7 });
filterStage.control('brightness', filter.parameters.cutoff, {
  label: 'Brightness',
  min: 80,
  max: 8000,
  default: 1800,
  unit: 'Hz',
});
filterStage.connect(filterStage.inputs.audio, filter.inputs.audio);
filterStage.connect(filter.outputs.out, level.inputs.audio);
filterStage.connect(level.outputs.out, filterStage.outputs.audio);

const device = createDevice({ id: 'double-filter', name: 'Two Filter Stages' });
const output = device.output('audio', audio.stereo);
const tone = device.add('tone', sawOscillator);
tone.configure({ frequency: 220, level: 0.12 });
const first = device.add('first', filterStage);
const second = device.add('second', filterStage);
second.configure({ brightness: 600 });

device.connect(tone.outputs.out, first.inputs.audio);
device.connect(first.outputs.audio, second.inputs.audio);
device.connect(second.outputs.audio, output);

export default device;
