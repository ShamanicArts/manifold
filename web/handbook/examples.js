import sourcesDevice from './examples/sources.mjs';
import instrumentDevice from './examples/instrument.mjs';
import reusableDevice from './examples/reusable.mjs';
import gainDevice from './examples/gain.mjs';
import ringDevice from './examples/ring.mjs';
import spectralDevice from './examples/spectral.mjs';
import { lowerDevice } from 'manifold/graph';

// Layout and slider steps belong to this page; musical control metadata belongs to the Device.
function deviceControls(device, steps) {
  const { project, view } = lowerDevice(device);
  return Object.entries(steps).map(([id, step]) => {
    const control = view.find((item) => item.id === id || item.path === '/' + id);
    const endpoint = project.endpoints.find((item) => item.path === control.path);
    return {
      path: control.path,
      label: control.label,
      min: endpoint.min,
      max: endpoint.max,
      step,
      value: endpoint.default,
      unit: control.unit ?? '',
    };
  });
}
// One registry for the rendered controls, executable source and agent links.
const control = (path, label, min, max, step, value, unit = '') => ({
  path,
  label,
  min,
  max,
  step,
  value,
  unit,
});
export const examples = {
  sources: {
    title: 'Audio Sources', file: 'examples/sources.mjs', source: 'sources.mjs', liveInput: true,
    description: 'Real saw, noise and live input, connected through two inspectable crossfaders.',
    controls: deviceControls(sourcesDevice, {
      frequency: 1, 'noise-level': 0.01, 'noise-color': 0.01, 'live-level': 0.01,
      'generated-blend': 0.01, 'source-blend': 0.01, level: 0.01,
    }),
  },
  instrument: {
    title: 'Soft Keys',
    file: 'examples/instrument.mjs',
    source: 'instrument.mjs',
    description:
      'MIDI notes excite a Manifold voice, then a low-pass filter shapes its brightness.',
    keyboard: true,
    controls: deviceControls(instrumentDevice, { brightness: 10, release: 0.01 }),
  },
  reusable: {
    title: 'Two Filter Stages',
    file: 'examples/reusable.mjs',
    source: 'reusable.mjs',
    description:
      'Two instances of one Device, with independent brightness controls and a shared inner graph.',
    controls: deviceControls(reusableDevice, {
      'first/brightness': 10,
      'second/brightness': 10,
    }).map((c, i) => ({ ...c, label: (i ? 'Second' : 'First') + ' brightness' })),
  },
  gain: {
    title: 'Gain',
    file: 'examples/gain.mjs',
    source: 'gain.mjs',
    description: 'A quiet 220 Hz sine through one Manifold gain stage.',
    controls: deviceControls(gainDevice, { level: 0.01 }),
  },
  ring: {
    title: 'Sideband laboratory',
    file: 'examples/ring.mjs',
    source: 'ring.mjs',
    description:
      'Two Manifold oscillators feed a ring modulator. The spectrum measures its output.',
    controls: deviceControls(ringDevice, { carrier: 1, modulator: 1, mix: 0.01 }),
    presets: [
      { label: 'Hollow fifth', values: [220, 110, 1] },
      { label: 'Metallic', values: [220, 173, 1] },
      { label: 'Dry carrier', values: [220, 110, 0] },
    ],
  },
  spectral: {
    title: 'Spectral transposition',
    file: 'examples/spectral.mjs',
    source: 'spectral.mjs',
    description: 'A 220 Hz sawtooth through Manifold’s FFT pitch processor.',
    controls: deviceControls(spectralDevice, { pitch: 1, mix: 0.01 }),
    presets: [
      { label: 'Down an octave', values: [-12, 1] },
      { label: 'Up a fifth', values: [7, 1] },
      { label: 'Dry / wet octave', values: [12, 0.5] },
    ],
  },
  field: {
    title: 'Sound into surface',
    file: '../public/studio/field-rules.manifold.json',
    source: 'field.manifold.json',
    description: 'The actual Nacre-derived field composition, embedded without Studio.',
    controls: [
      control('/probe/gain', 'Audio level', 0, 2, 0.01, 0.5, '×'),
      { ...control(null, 'Mode N', 1, 12, 1, 4), definition: 'field', parameter: 'n' },
      { ...control(null, 'Mode M', 1, 12, 1, 7), definition: 'field', parameter: 'm' },
      {
        ...control(null, 'Relief folds', 0.1, 10, 0.1, 3.5),
        definition: 'relief',
        parameter: 'folds',
      },
    ],
  },
};
export const examplePath = (id) => `/learn/examples/${examples[id].source}`;
