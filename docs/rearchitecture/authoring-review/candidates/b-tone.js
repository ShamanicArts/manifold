import { defineInstrument, control, connect, oscillator, lowPassFilter } from 'manifold';

export default defineInstrument('filtered-tone', {
  processors: {
    voice: oscillator,
    filter: lowPassFilter,
  },

  configure({ voice }) {
    voice.parameters.frequency.set(220);
    voice.parameters.level.set(0.12);
  },

  controls: ({ filter }) => ({
    cutoff: control(filter.parameters.cutoff, {
      label: 'Brightness',
      min: 80,
      max: 8000,
      default: 1200,
      unit: 'Hz',
    }),
  }),

  connections: ({ voice, filter }, audio) => [
    connect(voice.outputs.out, filter.inputs.audio),
    connect(filter.outputs.out, audio.output),
  ],
});
