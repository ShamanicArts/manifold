import { createInstrument, voiceSynth, lowPassFilter } from 'manifold';

const instrument = createInstrument({ id: 'soft-keys', name: 'Soft Keys' });
const voice = instrument.add('voice', voiceSynth);
const filter = instrument.add('filter', lowPassFilter);

voice.configure({ attack: 0.012, decay: 0.18, sustain: 0.65, release: 0.35, level: 0.16 });
filter.configure({ resonance: 0.6 });

const brightness = instrument.control('brightness', filter.parameters.cutoff, {
  label: 'Brightness',
  min: 100,
  max: 8000,
  default: 1800,
  unit: 'Hz',
});
const release = instrument.control('release', voice.parameters.release, {
  label: 'Release',
  min: 0.02,
  max: 2,
  default: 0.35,
  unit: 's',
});

instrument.connect(instrument.inputs.midi, voice.inputs.midi);
instrument.connect(voice.outputs.out, filter.inputs.audio);
instrument.connect(filter.outputs.out, instrument.outputs.audio);

export default instrument;
