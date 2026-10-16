import { defineEffect, control, connect, phaseVocoder } from 'manifold';

export default defineEffect('spectral-shift', {
  processors: {
    spectral: phaseVocoder,
  },

  controls: ({ spectral }) => ({
    pitch: control(spectral.parameters.pitchSemitones, {
      label: 'Pitch',
      min: -12,
      max: 12,
      default: 7,
      unit: 'semitones',
    }),
    mix: control(spectral.parameters.wetMix, {
      label: 'Mix',
      min: 0,
      max: 1,
      default: 1,
    }),
  }),

  connections: ({ spectral }, audio) => [
    connect(audio.input, spectral.inputs.audio),
    connect(spectral.outputs.out, audio.output),
  ],
});
