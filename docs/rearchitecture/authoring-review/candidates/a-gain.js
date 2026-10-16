import { createEffect, gain } from 'manifold';

const effect = createEffect('gentle-gain');
const level = effect.add('level', gain);

const volume = effect.control('volume', level.parameters.level, {
  label: 'Volume',
  min: 0,
  max: 1,
  default: 0.65,
});

effect.connect(effect.inputs.audio, level.inputs.audio);
effect.connect(level.outputs.out, effect.outputs.audio);

export default effect;
