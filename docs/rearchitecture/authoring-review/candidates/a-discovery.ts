// TypeScript discovery sketch: proposed API, not implemented.
// No annotations should be needed for this ordinary JavaScript.
import { createEffect, phaseVocoder } from 'manifold';

const effect = createEffect('spectral-shift');
const spectral = effect.add('spectral', phaseVocoder);

// spectral.parameters. offers pitchSemitones, wetMix, fftOrder, …
// spectral.inputs. offers audio; spectral.outputs. offers out.
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

// Intended diagnostics: unknown parameter members and incompatible
// port domains are rejected by types and runtime validation.
