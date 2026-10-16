import { createEffect, phaseVocoder } from 'manifold';

const effect = createEffect({ id: 'spectral-shift', name: 'Spectral Shift' });
const spectral = effect.add('spectral', phaseVocoder);
spectral.configure({ fftOrder: 11 });

const pitch = effect.control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
});
const mix = effect.control('mix', spectral.parameters.wetMix, {
  label: 'Mix',
  min: 0,
  max: 1,
  default: 1,
});

effect.connect(effect.inputs.audio, spectral.inputs.audio);
effect.connect(spectral.outputs.out, effect.outputs.audio);

export default effect;
