import { defineEffect, control, connect, gain } from 'manifold';

export default defineEffect('gentle-gain', {
  processors: {
    level: gain,
  },

  controls: ({ level }) => ({
    volume: control(level.parameters.level, {
      label: 'Volume',
      min: 0,
      max: 1,
      default: 0.65,
    }),
  }),

  connections: ({ level }, audio) => [
    connect(audio.input, level.inputs.audio),
    connect(level.outputs.out, audio.output),
  ],
});
