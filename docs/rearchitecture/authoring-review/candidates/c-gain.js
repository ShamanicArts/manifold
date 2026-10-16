import { effect, instantiate, control, connect, gain } from 'manifold';

const level = instantiate('level', gain);

const volume = control('volume', level.parameters.level, {
  label: 'Volume',
  min: 0,
  max: 1,
  default: 0.65,
});

export default effect('gentle-gain', {
  processors: [level],
  controls: [volume],
  connections: (audio) => [
    connect(audio.input, level.inputs.audio),
    connect(level.outputs.out, audio.output),
  ],
});
