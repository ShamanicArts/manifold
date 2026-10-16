import { createEffect, gain, lowPassFilter } from 'manifold';

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

const effect = createEffect({ id: 'double-filter', name: 'Two Filter Stages' });
const first = effect.add('first', filterStage);
const second = effect.add('second', filterStage);
second.configure({ brightness: 600 });

effect.connect(effect.inputs.audio, first.inputs.audio);
effect.connect(first.outputs.audio, second.inputs.audio);
effect.connect(second.outputs.audio, effect.outputs.audio);

export default effect;
