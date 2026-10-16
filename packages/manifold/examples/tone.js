import { createInstrument, oscillator, lowPassFilter } from 'manifold';

const instrument = createInstrument({ id: 'filtered-tone', name: 'Filtered Tone' });
const voice = instrument.add('voice', oscillator);
const filter = instrument.add('filter', lowPassFilter);

voice.configure({ frequency: 220, level: 0.12 });

const cutoff = instrument.control('cutoff', filter.parameters.cutoff, {
  label: 'Brightness',
  min: 80,
  max: 8000,
  default: 1200,
  unit: 'Hz',
});

instrument.connect(voice.outputs.out, filter.inputs.audio);
instrument.connect(filter.outputs.out, instrument.outputs.audio);

export default instrument;
