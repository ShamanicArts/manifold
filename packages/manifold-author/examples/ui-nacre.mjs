// Nacre processes incoming audio. Studio's separate Input graph supplies test sounds.
import {
  createEffect,
  phaseVocoder,
  svf,
  waveShaper,
  granulator,
  crossfader,
  gain,
} from 'manifold';

// Prism Bend is a reusable Device. Enter its node in Studio to inspect the filter and exciter.
const prismBend = createEffect({ id: 'prism-bend', name: 'Prism Bend' });
const contour = prismBend.add('contour', svf);
const exciter = prismBend.add('exciter', waveShaper);
contour.configure({ mode: 0, resonance: 0.75 });
prismBend.control('edge', contour.parameters.cutoff, {
  label: 'Prism edge · Hz',
  min: 100,
  max: 12000,
  default: 4800,
  unit: 'Hz',
  style: {
    accent: '#7cf2e4',
    background: '#123f4b',
    text: '#edfffc',
  },
});
prismBend.control('heat', exciter.parameters.driveDb, {
  label: 'Prism heat · dB',
  min: 0,
  max: 40,
  default: 8,
  unit: 'dB',
  style: {
    accent: '#ff9c6f',
    background: '#632943',
    text: '#fff0e8',
  },
});

prismBend.connect(prismBend.inputs.audio, contour.inputs.audio);
prismBend.connect(contour.outputs.out, exciter.inputs.audio);
prismBend.connect(exciter.outputs.out, prismBend.outputs.audio);
prismBend.place(contour, { x: 240, y: 0 });
prismBend.place(exciter, { x: 480, y: 0 });

// 'effect' is our JavaScript name for this Device; 'nacre' is its stable authored identity.
const effect = createEffect({ id: 'nacre', name: 'Nacre' });
const spectral = effect.add('spectral', phaseVocoder);
const focus = effect.add('focus', svf);
const shaper = effect.add('shaper', waveShaper);
const prism = effect.add('prism-bend', prismBend);
const memory = effect.add('memory', granulator);
const mix = effect.add('mix', crossfader);
const bypass = effect.add('bypass', crossfader);
const output = effect.add('output', gain);

// Initial sound: FFT pitch displacement, bandpass focus, excitation and granular memory.
spectral.configure({ wetMix: 1, fftOrder: 11 });
focus.configure({ mode: 1 }); // Bandpass selects the material to excite.
shaper.configure({ postFilterHz: 10000, outputDb: -8 });
memory.configure({ density: 32, position: 0.04, pitch: 0, enabled: 1 });
mix.configure({ curve: 0 });
bypass.configure({ curve: 0 });

// Public controls feed the Inspector, physical panel and visual parameter references.
effect.control('focus', focus.parameters.cutoff, {
  label: 'Spectral focus · Hz',
  min: 160,
  max: 10000,
  default: 2400,
  unit: 'Hz',
  style: {
    accent: '#62dce5',
    background: '#123958',
    text: '#edf8f6',
  },
});
effect.control('shift', spectral.parameters.pitchSemitones, {
  label: 'Displacement · semitones',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
  style: {
    accent: '#f295d8',
    background: '#402b6c',
    text: '#f9edf8',
  },
});
effect.control('drive', shaper.parameters.driveDb, {
  label: 'Excitation · dB',
  min: 0,
  max: 40,
  default: 18,
  unit: 'dB',
  style: {
    accent: '#f78d68',
    background: '#63203e',
    text: '#fff0e8',
  },
});
effect.control('resonance', focus.parameters.resonance, {
  label: 'Coherence',
  min: 0.1,
  max: 1,
  default: 0.58,
  style: {
    accent: '#eaca71',
    background: '#485230',
    text: '#fff5d8',
  },
});
effect.control('mix', mix.parameters.position, {
  label: 'Transmutation · dry / wet',
  min: -1,
  max: 1,
  default: 0.64,
  style: {
    accent: '#a6a0fa',
    background: '#2b315e',
    text: '#f1f0fc',
  },
});
effect.control('output', output.parameters.level, {
  label: 'Output',
  min: 0,
  max: 1,
  default: 0.64,
  style: {
    accent: '#cbd6f3',
    background: '#40466d',
    text: '#f3f6fa',
  },
});
effect.control('afterimage', memory.parameters.wetMix, {
  label: 'Afterimage · dry / memory',
  min: 0,
  max: 1,
  default: 0.22,
  style: {
    accent: '#ef79c5',
    background: '#4b244e',
    text: '#fff0fa',
  },
});
effect.control('hold', memory.parameters.freeze, {
  label: 'Memory · capture / hold',
  min: 0,
  max: 1,
  default: 0,
  style: {
    accent: '#deb7e6',
    background: '#35243f',
    text: '#f5edf5',
  },
});
effect.control('grain-size', memory.parameters.grainSize, {
  label: 'Memory grain · ms',
  min: 15,
  max: 300,
  default: 85,
  unit: 'ms',
  style: {
    accent: '#8de5d7',
    background: '#174149',
    text: '#effffd',
  },
});
effect.control('scatter', memory.parameters.spray, {
  label: 'Memory scatter',
  min: 0,
  max: 1,
  default: 0.28,
  style: {
    accent: '#f2a6e6',
    background: '#47274b',
    text: '#fff0fc',
  },
});
effect.control('active', bypass.parameters.position, {
  label: 'Processor · bypass / engaged',
  min: -1,
  max: 1,
  default: 1,
  style: {
    accent: '#deb7e6',
    background: '#35243f',
    text: '#f5edf5',
  },
});
effect.control('curve', shaper.parameters.curve, {
  label: 'Nonlinearity',
  min: 0,
  max: 6,
  default: 0,
  style: {
    accent: '#deb7e6',
    background: '#35243f',
    text: '#f5edf5',
  },
});

// Wet path. The same Rust processors execute this graph in every audio host.
effect.connect(effect.inputs.audio, spectral.inputs.audio);
effect.connect(spectral.outputs.out, focus.inputs.audio);
effect.connect(focus.outputs.out, shaper.inputs.audio);
effect.connect(shaper.outputs.out, prism.inputs.audio);
effect.connect(prism.outputs.audio, memory.inputs.audio);

// Blend with the dry input, then provide bypass and output level.
effect.connect(effect.inputs.audio, mix.inputs.a);
effect.connect(memory.outputs.out, mix.inputs.b);
effect.connect(effect.inputs.audio, bypass.inputs.a);
effect.connect(mix.outputs.out, bypass.inputs.b);
effect.connect(bypass.outputs.out, output.inputs.audio);
effect.connect(output.outputs.out, effect.outputs.audio);

// Authored canvas positions remain editable in Studio.
effect.place(spectral, { x: 240, y: 0 });
effect.place(focus, { x: 480, y: 0 });
effect.place(shaper, { x: 720, y: 0 });
effect.place(prism, { x: 960, y: 0 });
effect.place(memory, { x: 1200, y: 0 });
effect.place(mix, { x: 720, y: 350 });
effect.place(bypass, { x: 960, y: 350 });
effect.place(output, { x: 1200, y: 350 });

export default effect;
