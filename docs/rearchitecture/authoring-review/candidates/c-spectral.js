import { effect, instantiate, control, connect, phaseVocoder } from 'manifold';

const spectral = instantiate('spectral', phaseVocoder);

const pitch = control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
});
const mix = control('mix', spectral.parameters.wetMix, {
  label: 'Mix',
  min: 0,
  max: 1,
  default: 1,
});

export default effect('spectral-shift', {
  processors: [spectral],
  controls: [pitch, mix],
  connections: (audio) => [
    connect(audio.input, spectral.inputs.audio),
    connect(spectral.outputs.out, audio.output),
  ],
});
