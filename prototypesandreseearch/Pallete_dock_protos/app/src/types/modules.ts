export interface RackModule {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  description: string;
  color: string;
  inputs: string[];
  outputs: string[];
  tags: string[];
  favorite?: boolean;
  recent?: boolean;
}

export const moduleCategories = [
  { id: 'osc', name: 'Oscillators', color: '#ef4444', icon: 'wave' },
  { id: 'filter', name: 'Filters', color: '#f97316', icon: 'filter' },
  { id: 'env', name: 'Envelopes', color: '#eab308', icon: 'envelope' },
  { id: 'lfo', name: 'LFOs', color: '#22c55e', icon: 'pulse' },
  { id: 'fx', name: 'Effects', color: '#06b6d4', icon: 'sparkles' },
  { id: 'mix', name: 'Mixers', color: '#3b82f6', icon: 'sliders' },
  { id: 'seq', name: 'Sequencers', color: '#8b5cf6', icon: 'list' },
  { id: 'util', name: 'Utilities', color: '#a855f7', icon: 'settings' },
  { id: 'midi', name: 'MIDI', color: '#ec4899', icon: 'music' },
];

export const mockModules: RackModule[] = [
  // Oscillators
  { id: 'osc1', name: 'Sawtooth OSC', category: 'osc', description: 'Classic sawtooth waveform oscillator', color: '#ef4444', inputs: ['v/oct', 'fm'], outputs: ['out'], tags: ['basic', 'analog'] },
  { id: 'osc2', name: 'Square OSC', category: 'osc', description: 'Pulse width modulatable square wave', color: '#ef4444', inputs: ['v/oct', 'pwm'], outputs: ['out'], tags: ['basic', 'analog'] },
  { id: 'osc3', name: 'Sine OSC', category: 'osc', description: 'Pure sine wave generator', color: '#ef4444', inputs: ['v/oct'], outputs: ['out'], tags: ['basic', 'clean'] },
  { id: 'osc4', name: 'Super Saw', category: 'osc', description: '7-voice supersaw oscillator', color: '#ef4444', inputs: ['v/oct', 'detune'], outputs: ['out'], tags: ['rich', 'supersaw'] },
  { id: 'osc5', name: 'Wavetable', category: 'osc', description: '256-waveform wavetable oscillator', color: '#ef4444', inputs: ['v/oct', 'pos'], outputs: ['out'], tags: ['digital', 'complex'] },
  { id: 'osc6', name: 'FM Operator', category: 'osc', description: '4-operator FM synthesis', color: '#ef4444', inputs: ['v/oct', 'mod'], outputs: ['out'], tags: ['fm', 'digital'] },
  
  // Filters
  { id: 'filt1', name: 'Lowpass 24dB', category: 'filter', description: 'Classic 24dB/octave lowpass', color: '#f97316', inputs: ['in', 'cutoff', 'res'], outputs: ['out'], tags: ['lp', 'moog'] },
  { id: 'filt2', name: 'Highpass 12dB', category: 'filter', description: 'Clean highpass filter', color: '#f97316', inputs: ['in', 'cutoff'], outputs: ['out'], tags: ['hp', 'clean'] },
  { id: 'filt3', name: 'Bandpass', category: 'filter', description: 'Resonant bandpass filter', color: '#f97316', inputs: ['in', 'freq', 'q'], outputs: ['out'], tags: ['bp', 'resonant'] },
  { id: 'filt4', name: 'Notch', category: 'filter', description: 'Notch/phaser hybrid filter', color: '#f97316', inputs: ['in', 'freq'], outputs: ['out'], tags: ['notch', 'phaser'] },
  { id: 'filt5', name: 'Comb', category: 'filter', description: 'Comb filter for physical modeling', color: '#f97316', inputs: ['in', 'time'], outputs: ['out'], tags: ['comb', 'physical'] },
  { id: 'filt6', name: 'Formant', category: 'filter', description: 'Vocal formant filter', color: '#f97316', inputs: ['in', 'vowel'], outputs: ['out'], tags: ['vocal', 'formant'] },
  
  // Envelopes
  { id: 'env1', name: 'ADSR', category: 'env', description: 'Standard 4-stage envelope', color: '#eab308', inputs: ['gate'], outputs: ['out'], tags: ['standard', 'adsr'] },
  { id: 'env2', name: 'AD', category: 'env', description: 'Simple attack-decay envelope', color: '#eab308', inputs: ['trig'], outputs: ['out'], tags: ['simple', 'percussion'] },
  { id: 'env3', name: 'AHDSR', category: 'env', description: 'Envelope with hold stage', color: '#eab308', inputs: ['gate'], outputs: ['out'], tags: ['extended', 'hold'] },
  { id: 'env4', name: 'Multi-Env', category: 'env', description: '6-stage multi-breakpoint envelope', color: '#eab308', inputs: ['gate'], outputs: ['out', 'inv'], tags: ['complex', 'multi'] },
  { id: 'env5', name: 'Looping Env', category: 'env', description: 'LFO-like looping envelope', color: '#eab308', inputs: ['trig'], outputs: ['out'], tags: ['loop', 'lfo'] },
  
  // LFOs
  { id: 'lfo1', name: 'Basic LFO', category: 'lfo', description: '0.01-100Hz low frequency oscillator', color: '#22c55e', inputs: ['reset'], outputs: ['sine', 'tri', 'saw', 'square'], tags: ['basic', 'multi'] },
  { id: 'lfo2', name: 'Random LFO', category: 'lfo', description: 'Sample & hold random source', color: '#22c55e', inputs: ['clock'], outputs: ['out', 'smooth'], tags: ['random', 's&h'] },
  { id: 'lfo3', name: 'Clock Div', category: 'lfo', description: 'Clock divider and multiplier', color: '#22c55e', inputs: ['clock'], outputs: ['/2', '/4', '/8', 'x2'], tags: ['clock', 'divider'] },
  { id: 'lfo4', name: 'Euclidean', category: 'lfo', description: 'Euclidean rhythm generator', color: '#22c55e', inputs: ['clock'], outputs: ['trig', 'accent'], tags: ['rhythm', 'euclidean'] },
  
  // Effects
  { id: 'fx1', name: 'Reverb', category: 'fx', description: 'Algorithmic reverb with shimmer', color: '#06b6d4', inputs: ['in'], outputs: ['wet', 'dry'], tags: ['space', 'reverb'] },
  { id: 'fx2', name: 'Delay', category: 'fx', description: 'Stereo delay with feedback', color: '#06b6d4', inputs: ['in', 'time'], outputs: ['out'], tags: ['time', 'delay'] },
  { id: 'fx3', name: 'Chorus', category: 'fx', description: '3-voice chorus effect', color: '#06b6d4', inputs: ['in'], outputs: ['out'], tags: ['modulation', 'chorus'] },
  { id: 'fx4', name: 'Distortion', category: 'fx', description: 'Wave-shaping distortion', color: '#06b6d4', inputs: ['in', 'drive'], outputs: ['out'], tags: ['drive', 'saturation'] },
  { id: 'fx5', name: 'Phaser', category: 'fx', description: '6-stage phaser effect', color: '#06b6d4', inputs: ['in', 'rate'], outputs: ['out'], tags: ['modulation', 'phaser'] },
  { id: 'fx6', name: 'Bitcrusher', category: 'fx', description: 'Sample rate and bit depth reducer', color: '#06b6d4', inputs: ['in'], outputs: ['out'], tags: ['digital', 'lo-fi'] },
  { id: 'fx7', name: 'Compressor', category: 'fx', description: 'Dynamics compressor', color: '#06b6d4', inputs: ['in', 'sidechain'], outputs: ['out'], tags: ['dynamics', 'compression'] },
  
  // Mixers
  { id: 'mix1', name: '4-Channel', category: 'mix', description: '4-channel audio mixer', color: '#3b82f6', inputs: ['in1', 'in2', 'in3', 'in4'], outputs: ['out'], tags: ['mixer', 'audio'] },
  { id: 'mix2', name: 'CV Mixer', category: 'mix', description: 'CV/Modulation mixer with attenuation', color: '#3b82f6', inputs: ['in1', 'in2', 'in3'], outputs: ['out', 'inv'], tags: ['cv', 'attenuator'] },
  { id: 'mix3', name: 'Crossfader', category: 'mix', description: 'A/B crossfader with curve control', color: '#3b82f6', inputs: ['a', 'b', 'pos'], outputs: ['out'], tags: ['crossfade', 'morph'] },
  { id: 'mix4', name: 'Panner', category: 'mix', description: 'Stereo panner with LFO', color: '#3b82f6', inputs: ['in', 'pan'], outputs: ['l', 'r'], tags: ['stereo', 'pan'] },
  
  // Sequencers
  { id: 'seq1', name: '8-Step', category: 'seq', description: 'Classic 8-step sequencer', color: '#8b5cf6', inputs: ['clock', 'reset'], outputs: ['cv', 'gate'], tags: ['step', 'classic'] },
  { id: 'seq2', name: '16-Step', category: 'seq', description: 'Extended 16-step sequencer', color: '#8b5cf6', inputs: ['clock', 'reset'], outputs: ['cv', 'gate', 'accent'], tags: ['step', 'extended'] },
  { id: 'seq3', name: 'Arpeggiator', category: 'seq', description: 'Note arpeggiator with patterns', color: '#8b5cf6', inputs: ['gate', 'pitch'], outputs: ['cv', 'gate'], tags: ['arp', 'pattern'] },
  { id: 'seq4', name: 'Gate Seq', category: 'seq', description: '16-step gate/trigger sequencer', color: '#8b5cf6', inputs: ['clock'], outputs: ['out1', 'out2', 'out3', 'out4'], tags: ['gate', 'rhythm'] },
  
  // Utilities
  { id: 'util1', name: 'VCA', category: 'util', description: 'Voltage controlled amplifier', color: '#a855f7', inputs: ['in', 'cv'], outputs: ['out'], tags: ['amp', 'vca'] },
  { id: 'util2', name: 'Sample & Hold', category: 'util', description: 'Track & hold / S&H', color: '#a855f7', inputs: ['in', 'trig'], outputs: ['out'], tags: ['s&h', 'utility'] },
  { id: 'util3', name: 'Slew Limiter', category: 'util', description: 'Portamento/glide generator', color: '#a855f7', inputs: ['in'], outputs: ['out'], tags: ['slew', 'glide'] },
  { id: 'util4', name: 'Comparator', category: 'util', description: 'Voltage comparator with hysteresis', color: '#a855f7', inputs: ['a', 'b'], outputs: ['gt', 'lt', 'eq'], tags: ['logic', 'compare'] },
  { id: 'util5', name: 'Multiples', category: 'util', description: '1-to-6 signal splitter', color: '#a855f7', inputs: ['in'], outputs: ['out1', 'out2', 'out3', 'out4', 'out5', 'out6'], tags: ['split', 'mult'] },
  { id: 'util6', name: 'Offset', category: 'util', description: 'DC offset and attenuverter', color: '#a855f7', inputs: ['in'], outputs: ['out'], tags: ['offset', 'attenuverter'] },
  
  // MIDI
  { id: 'midi1', name: 'MIDI-CV', category: 'midi', description: 'MIDI to CV converter', color: '#ec4899', inputs: ['midi'], outputs: ['gate', 'pitch', 'vel', 'mod'], tags: ['midi', 'interface'] },
  { id: 'midi2', name: 'MIDI Clock', category: 'midi', description: 'MIDI clock extractor', color: '#ec4899', inputs: ['midi'], outputs: ['clock', 'run', 'reset'], tags: ['midi', 'clock'] },
  { id: 'midi3', name: 'MIDI CC', category: 'midi', description: 'CC to CV converter', color: '#ec4899', inputs: ['midi'], outputs: ['cc1', 'cc2', 'cc3', 'cc4'], tags: ['midi', 'cc'] },
];
