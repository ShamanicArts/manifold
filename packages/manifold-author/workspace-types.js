// Browser display labels and choices; numeric contracts are generated from Rust.
import { PORT_CATALOG } from './catalog.generated.js';
import { NODE_METADATA } from './node-metadata.js';
import { ADDITIONAL_NODES } from './additional-nodes.js';
import { PARAMETER_NAMES } from './parameter-names.js';
export const VISUAL_NAMES = [
  "CHORUS",
  "PHASER",
  "WAVESHAPER",
  "COMPRESSOR",
  "STEREO WIDENER",
  "FILTER",
  "SVF FILTER",
  "REVERB",
  "STEREO DELAY",
  "MULTITAP",
  "PITCH SHIFT",
  "GRANULATOR",
  "RING MOD",
  "FORMANT",
  "EQ",
  "LIMITER",
  "TRANSIENT",
  "BITCRUSHER",
  "SHIMMER",
  "REVERSE DELAY",
  "STUTTER",
];
const EQ_CURVES = ['Bell', 'Low shelf', 'High shelf', 'Low pass', 'High pass', 'Notch', 'Band pass'];
const EQ_PARAMETERS = Array.from({ length: 8 }, (_, band) => [
  { id: band * 5, label: `Band ${band + 1} on`, choices: ['Off', 'On'] },
  { id: band * 5 + 1, label: `Band ${band + 1} curve`, choices: EQ_CURVES },
  { id: band * 5 + 2, label: `Band ${band + 1} Hz` },
  { id: band * 5 + 3, label: `Band ${band + 1} dB` },
  { id: band * 5 + 4, label: `Band ${band + 1} Q` },
]).flat().concat([
  { id: 40, label: 'Output dB' },
  { id: 41, label: 'Mix' },
]);
const NODE_PRESENTATION = {
  ...ADDITIONAL_NODES,
  adsr: {label:'ADSR',parameters:[{id:0,label:'Attack'},{id:1,label:'Decay'},{id:2,label:'Sustain'},{id:3,label:'Release'},{id:4,label:'Gate',choices:['Off','On']},{id:5,label:'Retrigger sequence',discrete:true}]},
  'input.raw': { label: 'Live input', fixedId: 1 },
  'input.sidechain': { label: 'Sidechain input' },
  output: { label: 'Output', fixedId: 3 },
  gain: { label: 'Gain',
    parameters: [{ id: 0, name: 'level', label: 'Level' }] },
  'fixed-gain': { label: 'Fixed gain ×4' },
  distortion: { label: 'Distortion',
    parameters: [{ id: 0, label: 'Drive' },
      { id: 1, label: 'Wet mix' },
      { id: 2, label: 'Output' }] },
  svf: { label: 'SVF filter',
    parameters: [{ id: 0, label: 'Mode', choices: ['Low pass', 'Band pass', 'High pass', 'Notch'] },
      { id: 1, label: 'Cutoff' },
      { id: 2, label: 'Resonance' }] },
  'modulated-svf': { label: 'CV filter', parameters: [
      { id: 0, label: 'Mode', choices: ['Low pass', 'Band pass', 'High pass', 'Notch'] },
      { id: 1, label: 'Cutoff' },
      { id: 2, label: 'Resonance' },
      { id: 3, label: 'CV depth Hz' },
    ] },
  'effect-slot-legacy': { label: 'Main FX slot', parameters: [
      { id: 0, label: 'Effect', choices: VISUAL_NAMES },
      { id: 1, label: 'Mix' },
      ...Array.from({ length: 5 }, (_, index) => ({ id: index + 2,
        label: `P${index + 1}` })),
    ] },
  eq8: { label: 'Eight-band EQ',
    parameters: EQ_PARAMETERS },
  'wave-shaper': {label:'WaveShaper',parameters:[
    {id:0,label:'Curve',choices:['Tanh','Asymmetric','Arctangent','Hard clip','Fold','Soft clip','Diode']},
    {id:1,label:'Drive dB'},{id:2,label:'Output dB'},
    {id:3,label:'Pre-filter Hz (0 disables)'},{id:4,label:'Post-filter Hz (0 disables)'},
    {id:5,label:'Bias'},{id:6,label:'Wet mix'},{id:7,label:'Legacy tone factor (source: 1, 2 or 4)',discrete:true},
  ]},
  'legacy-filter': {label:'Legacy Filter',parameters:[
    {id:0,label:'Cutoff Hz'},{id:1,label:'Resonance'},{id:2,label:'Wet mix'},
  ]},
  sum2: { label: 'Audio sum' },
  mixer9: { label: 'Nine-input mixer', parameters: [{ id: 0, label: 'Master level' }] },
  mixer: { label: 'Mixer', parameters: [{ id: 0, label: 'Master level' },
    ...Array.from({ length: 32 }, (_, index) => ({ id: index + 1, label: `Input ${index + 1} gain` })),
    ...Array.from({ length: 32 }, (_, index) => ({ id: index + 33, label: `Input ${index + 1} pan` }))] },
  'phase-vocoder': { label: 'Phase vocoder', parameters: [
    { id: 0, label: 'Mode', choices: ['Bin mapping', 'Stretch then resample'] },
    { id: 1, label: 'Pitch semitones' },
    { id: 2, label: 'Time stretch' }, { id: 3, label: 'Wet mix' },
    { id: 4, label: 'FFT order (prepare only)',
      choices: ['512', '1024', '2048', '4096'], choiceValues: [9, 10, 11, 12] },
  ] },
  crossfader: { label: 'Equal-power crossfader', parameters: [
    { id: 0, label: 'Position' }, { id: 1, label: 'Curve' },
    { id: 2, label: 'Wet mix' },
  ] },
  'ring-modulator': { label: 'Ring modulator', parameters: [
    { id: 0, label: 'Carrier Hz' }, { id: 1, label: 'Depth' },
    { id: 2, label: 'Wet mix' }, { id: 3, label: 'Spread' },
    { id: 4, label: 'Enabled', choices: ['Off', 'On'] },
  ] },
  'audio-fm': { label: 'Audio FM', parameters: [
    { id: 0, label: 'Amount' }, { id: 1, label: 'Wet mix' },
  ] },
  'audio-sync': { label: 'Audio sync', parameters: [
    { id: 0, label: 'Hardness' }, { id: 1, label: 'Wet mix' },
  ] },
  'loop-capture': { label: 'Loop capture',
    parameters: [
      { id: 0, label: 'Record', choices: ['Stopped', 'Recording'] },
      { id: 1, label: 'Play', choices: ['Off', 'On'] },
      { id: 2, label: 'Overdub', choices: ['Off', 'On'] },
      { id: 3, label: 'Speed' },
      { id: 4, label: 'Reverse', choices: ['Forward', 'Reverse'] },
      { id: 5, label: 'Loop mix' },
      { id: 6, label: 'Overdub level' },
    ] },
  'retrospective-capture': { label: 'Retrospective capture' },
  oscillator: { label: 'Oscillator',
    parameters: [{ id: 0, name: 'waveform', label: 'Waveform', choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Blend'] },
      { id: 1, name: 'frequency', label: 'Frequency' },
      { id: 2, name: 'level', label: 'Level' }] },
  'extended-oscillator': { label: 'Extended oscillator',
    parameters: [{ id: 0, label: 'Waveform', choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Blend', 'Noise', 'Pulse', 'Supersaw'] },
      { id: 1, label: 'Frequency' },
      { id: 2, label: 'Level' },
      { id: 3, label: 'Sync enabled', choices: ['Free', 'Sync'] },
      { id: 4, label: 'Pulse width' },
      { id: 5, label: 'Drive' },
      { id: 6, label: 'Drive shape', choices: ['Tanh', 'Atan', 'Clip', 'Fold'] },
      { id: 7, label: 'Drive bias' },
      { id: 8, label: 'Drive mix' },
      { id: 9, label: 'Retrigger on level rise', choices: ['Off', 'On'] },
      { id: 10, label: 'Unison voices' },
      { id: 11, label: 'Detune cents' },
      { id: 12, label: 'Stereo spread' },
      { id: 13, label: 'Render mode', choices: ['Standard', 'Additive'] },
      { id: 14, label: 'Additive partials' },
      { id: 15, label: 'Additive tilt' },
      { id: 16, label: 'Additive drift' }] },
  'pulse-oscillator': { label: 'Pulse oscillator',
    parameters: [{ id: 1, label: 'Frequency' },
      { id: 2, label: 'Level' },
      { id: 4, label: 'Pulse width' }] },
  noise: { label: 'Noise',
    parameters: [{ id: 0, label: 'Level' },
      { id: 1, label: 'Color' }] },
  lfo: { label: 'LFO',
    parameters: [{ id: 0, name: 'waveform', label: 'Waveform', choices: ['Sine', 'Triangle', 'Square'] },
      { id: 1, name: 'rate', label: 'Rate' }] },
  'modulated-gain': { label: 'CV gain',
    parameters: [{ id: 0, name: 'base', label: 'Base' },
      { id: 1, name: 'depth', label: 'Depth' }] },
  'slew-control': { label: 'CV slew',
    parameters: [{ id: 0, label: 'Rise samples' }, { id: 1, label: 'Fall samples' }] },
  'attenuverter-bias': { label: 'Attenuverter / bias',
    parameters: [{ id: 0, label: 'Amount' }, { id: 1, label: 'Bias' }] },
  'sample-hold': { label: 'Sample / hold',
    parameters: [{ id: 0, label: 'Mode', choices: ['Sample', 'Track', '12-step'] }] },
  'cv-mix': { label: 'CV mixer',
    parameters: [
      { id: 0, label: 'Input 1' }, { id: 1, label: 'Input 2' },
      { id: 2, label: 'Input 3' }, { id: 3, label: 'Input 4' },
      { id: 4, label: 'Offset' },
    ] },
  'cv-compare': { label: 'CV compare',
    parameters: [
      { id: 0, label: 'Direction', choices: ['Rise', 'Fall', 'Both'] },
      { id: 1, label: 'Threshold' }, { id: 2, label: 'Hysteresis' },
    ] },
  'cv-range': { label: 'CV range',
    parameters: [
      { id: 0, label: 'Minimum' }, { id: 1, label: 'Maximum' },
      { id: 2, label: 'Mode', choices: ['Clamp', 'Remap'] },
    ] },
  'stereo-widener': { label: 'Stereo widener',
    parameters: [
      { id: 0, label: 'Width' }, { id: 1, label: 'Mono low cutoff' },
      { id: 2, label: 'Mono low', choices: ['Off', 'On'] },
    ] },
  'midi-input': { label: 'MIDI input' },
  'midi-transpose': { label: 'MIDI transpose',
    parameters: [{ id: 0, label: 'Semitones' }] },
  'voice-synth': { label: 'Voice synth',
    parameters: [{ id: 0, label: 'Waveform', choices: ['Sine', 'Saw', 'Square', 'Triangle'] },
      { id: 1, label: 'Attack' },
      { id: 2, label: 'Decay' },
      { id: 3, label: 'Sustain' },
      { id: 4, label: 'Release' },
      { id: 5, label: 'Level' }] },
  'sample-instrument': { label: 'Sample instrument',
    parameters: [
      { id: 0, label: 'Root note' },
      { id: 1, label: 'Key tracking' },
      { id: 2, label: 'Level' },
      { id: 3, label: 'Speed' },
      { id: 4, label: 'Reverse', choices: ['Forward', 'Reverse'] },
      { id: 5, label: 'One shot', choices: ['Loop', 'One shot'] },
      { id: 6, label: 'Play start' },
      { id: 7, label: 'Loop start' },
      { id: 8, label: 'Loop end' },
      { id: 9, label: 'Crossfade' },
      { id: 10, label: 'Release' },
      { id: 11, label: 'Unison' },
      { id: 12, label: 'Detune' },
      { id: 13, label: 'Spread' },
    ] },
  'sample-region': { label: 'Sample region',
    parameters: [
      { id: 0, label: 'Speed' },
      { id: 1, label: 'Reverse', choices: ['Forward', 'Reverse'] },
      { id: 2, label: 'One shot', choices: ['Loop', 'One shot'] },
      { id: 3, label: 'Play start' },
      { id: 4, label: 'Loop start' },
      { id: 5, label: 'Loop end' },
      { id: 8, label: 'Crossfade' },
      { id: 9, label: 'Unison', choices: ['1', '2', '3', '4', '5', '6', '7', '8'], choiceValues: [1, 2, 3, 4, 5, 6, 7, 8] },
      { id: 10, label: 'Detune' },
      { id: 11, label: 'Spread' },
    ] },
  granulator: { label: 'Granulator',
    parameters: [
      { id: 0, label: 'Grain size' },
      { id: 1, label: 'Density' },
      { id: 2, label: 'Position' },
      { id: 3, label: 'Pitch' },
      { id: 4, label: 'Spray' },
      { id: 5, label: 'Wet mix' },
      { id: 6, label: 'Freeze', choices: ['Capture', 'Freeze'] },
      { id: 7, label: 'Envelope', choices: ['Hann', 'Triangle', 'Blackman', 'Tukey', 'Rectangle'] },
      { id: 8, label: 'Enabled', choices: ['Off', 'On'] },
      { id: 9, label: 'Region start' },
      { id: 10, label: 'Region end' },
    ] },
  'main-voice-bank': { label: 'Main voice bank',
    parameters: [
      { id: 0, label: 'Wave shape', choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Sine + saw'] },
      { id: 1, label: 'Wave / sample' },
      { id: 2, label: 'Sample root' },
      { id: 3, label: 'Keytrack', choices: ['Wave', 'Sample', 'Both'] },
      { id: 4, label: 'Sample pitch' },
      { id: 5, label: 'Pitch engine', choices: ['Classic', 'Vocoder', 'Vocoder HQ'] },
      { id: 6, label: 'Blend mode', choices: ['Normal', 'Ring', 'FM', 'Sync', 'Add', 'Morph'] },
      { id: 7, label: 'Direction depth' },
      { id: 8, label: 'Wave to sample' },
      { id: 9, label: 'Sample to wave' },
      { id: 10, label: 'Sync retrigger', choices: ['Off', 'On'] },
      { id: 11, label: 'Attack' },
      { id: 12, label: 'Decay' },
      { id: 13, label: 'Sustain' },
      { id: 14, label: 'Release' },
      { id: 15, label: 'Output' },
      { id: 16, label: 'Vocoder time' },
      { id: 17, label: 'Phrase contour' },
      { id: 18, label: 'Phrase reference' },
      { id: 19, label: 'Add wave source', choices: ['Prepared partials', 'Original additive'] },
    ] },
};

if (Object.keys(NODE_PRESENTATION).length !== Object.keys(PORT_CATALOG).length) {
  throw new Error('Presentation and Rust primitive catalogs differ');
}

export const WORKSPACE_TYPES = Object.fromEntries(Object.entries(NODE_PRESENTATION).map(([id, spec]) => {
  const ports = PORT_CATALOG[id];
  if (!ports) throw new Error(`Missing Rust port metadata for ${id}`);
  const labels = new Map((spec.parameters ?? []).map(parameter => [parameter.id, parameter]));
  if (labels.size !== ports.parameters.length) throw new Error(`Parameter count differs for ${id}`);
  const parameters = ports.parameters.map(contract => {
    const display = labels.get(contract.id);
    const choiceValues = display?.choices?.map((_, index) => display.choiceValues?.[index] ?? index);
    if (!display || Boolean(display.choices || display.discrete) !== contract.discrete
      || (choiceValues && (choiceValues.length !== display.choices.length
        || choiceValues[0] !== contract.min || choiceValues.at(-1) !== contract.max
        || choiceValues.some((value, index) => !Number.isInteger(value) || value < contract.min || value > contract.max || index > 0 && value <= choiceValues[index - 1])))) {
      throw new Error(`Parameter contract differs for ${id}:${contract.id}`);
    }
    const name = PARAMETER_NAMES[id]?.[contract.id];
    if (!name) throw new Error(`Missing author parameter name for ${id}:${contract.id}`);
    return { ...contract, ...display, name };
  });
  if (!NODE_METADATA[id]) throw new Error(`Missing node description for ${id}`);
  return [id, { ...NODE_METADATA[id], label: spec.label, ...(spec.fixedId === undefined ? {} : { fixedId: spec.fixedId }),
    ...(parameters.length ? { parameters } : {}),
    code: ports.code, args: ports.args, configuration: ports.configuration, inputs: ports.inputs.map(port => port.signal),
    inputNames: ports.inputs.map(port => port.name),
    output: ports.outputs[0]?.signal ?? null,
    outputs: ports.outputs.map(port => port.signal),
    outputNames: ports.outputs.map(port => port.name) }];
}));

// Local u32 parameter identities match manifold-core::parameter_catalog. They
// never depend on the current port count, so grow/shrink preserves automation.
const mixerParameterId = (index, pan) => index < 32
  ? index + (pan ? 33 : 1) : 67 + (index - 32) * 2 + Number(pan);
export const validMixerInputs = inputs => Number.isInteger(inputs) && inputs >= 1
  && Math.fround(inputs) === inputs && mixerParameterId(inputs - 1, true) <= 0xffffffff;

/** Instance metadata follows structural configuration, not the library default. */
export function configuredWorkspaceType(node) {
  const base = WORKSPACE_TYPES[node.type];
  if (node.type !== 'mixer') return base;
  const count = node.a ?? base.args.a;
  if (!validMixerInputs(count)) throw new Error('Mixer inputs must fit the graph port and parameter representation');
  const inputNames = Array.from({ length: count }, (_, index) => `in-${index + 1}`);
  const parameter = (index, pan) => ({
    ...base.parameters.find(entry => entry.id === (pan ? 33 : 1)),
    id: mixerParameterId(index, pan),
    name: `input${index + 1}${pan ? 'Pan' : 'Gain'}`,
    label: `Input ${index + 1} ${pan ? 'pan' : 'gain'}`,
  });
  return { ...base, inputs: inputNames.map(() => 'audio'), inputNames,
    parameters: [base.parameters[0], ...Array.from({ length: count }, (_, i) => parameter(i, false)),
      ...Array.from({ length: count }, (_, i) => parameter(i, true))] };
}
