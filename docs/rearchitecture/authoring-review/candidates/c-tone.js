import { instrument, instantiate, control, connect, oscillator, lowPassFilter } from 'manifold';

const voice = instantiate('voice', oscillator);
const filter = instantiate('filter', lowPassFilter);

const tuning = [voice.parameters.frequency.value(220), voice.parameters.level.value(0.12)];

const cutoff = control('cutoff', filter.parameters.cutoff, {
  label: 'Brightness',
  min: 80,
  max: 8000,
  default: 1200,
  unit: 'Hz',
});

export default instrument('filtered-tone', {
  processors: [voice, filter],
  controls: [cutoff],
  parameters: tuning,
  connections: (audio) => [
    connect(voice.outputs.out, filter.inputs.audio),
    connect(filter.outputs.out, audio.output),
  ],
});
