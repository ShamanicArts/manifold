// Inspectable authoring programs. Each published source contains its complete
// graph and UI declaration and is independent of this library after saving.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { source as networkSource } from './network-services.mjs';
import { WORKSPACE_TYPES } from '@manifold/author/workspace-types';
import { PORT_CATALOG } from '@manifold/author/catalog';
import { source as defaultSource } from './dsp-live-scripting.mjs';
import { source as slotsSource } from './fx-slot-swap.mjs';
import { source as nacreSource } from './ui-nacre-source.generated.mjs';
import { source as orbitSource } from './ui-orbit-source.generated.mjs';
import { source as threeToneSource } from './ui-three-tone-source.generated.mjs';
import { source as styledToneSource } from './ui-styled-tone-source.generated.mjs';
import { source as reactiveToneSource } from './ui-reactive-tone-source.generated.mjs';

function program(
  id,
  label,
  description,
  nodes,
  connections,
  { input = 'external', reference = null } = {},
) {
  const camel = (type) => type.replace(/[.-]([a-z])/g, (_, letter) => letter.toUpperCase());
  const bindings = new Map(
    nodes.map((spec) => [spec.id, spec.name === 'node' ? camel(spec.type) : spec.name]),
  );
  const definitions = [...new Set(nodes.map((spec) => camel(spec.type)))];
  const controls = [];
  const setup = [];
  const exposed = [];
  for (const spec of nodes) {
    const name = bindings.get(spec.id);
    const contract = WORKSPACE_TYPES[spec.type];
    // Preserve the previous effective constructor values: old a/b sketch fields
    // were ignored by GraphWorkspace.add, whose public argument is config.
    const configuration = Object.fromEntries(
      Object.entries(PORT_CATALOG[spec.type].configuration)
        .filter(([, field]) => spec.args?.[field.argument] !== undefined)
        .map(([key, field]) => [key, PORT_CATALOG[spec.type].args[field.argument]]),
    );
    const options = {
      id: spec.id,
      ...(Object.keys(configuration).length ? { config: configuration } : {}),
    };
    setup.push(
      `  const ${name} = graph.add(${camel(spec.type)}Definition.type, ${JSON.stringify(options)});`,
    );
    setup.push(`  graph.registerInstance('/primitives/${id}/${spec.name}', ${name});`);
    for (const parameter of contract.parameters ?? []) {
      const value = spec.values?.[parameter.id] ?? parameter.default;
      const expose =
        (!spec.expose || spec.expose.includes(parameter.id)) &&
        !(spec.type === 'phase-vocoder' && parameter.id === 4);
      if (expose) {
        const key = `${name}_${parameter.name}`;
        const control = {
          path: `/primitives/${id}/${spec.name}/${parameter.id}`,
          label: parameter.label,
          group: spec.parameterGroups?.[parameter.id] ?? spec.label ?? contract.label,
          min: parameter.min,
          max: parameter.max,
          default: value,
          ...(parameter.choices ? { choices: parameter.choices } : {}),
        };
        controls.push(`    ${key}: ${JSON.stringify(control, null, 2).replaceAll("\n", "\n    ")},`);
        setup.push(`  ${name}.parameter('${parameter.name}').expose(controls.${key});`);
        exposed.push(key);
      } else if (spec.values?.[parameter.id] !== undefined || (spec.type === 'wave-shaper' && parameter.id === 7)) {
        setup.push(`  ${name}.parameter('${parameter.name}').set(${value});`);
      }
    }
    setup.push('');
  }
  const port = (id, name, direction) =>
    id === 1 ? 'input' : id === 3 ? 'output' : `${bindings.get(id)}.${direction}('${name}')`;
  const wiring = connections.map(
    ([from, output, to, input]) =>
      `  graph.connect(${port(from, output, 'output')}, ${port(to, input, 'input')});`,
  );
  const source = `// ${label}: ${description}
// ${reference ? 'Legacy reference: ' + reference : 'Audition composition of public Rust primitives; not an instrument parity claim.'}
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
// Imports — each definition can be inspected in Manifold's primitive catalog.
import { createGraphWorkspace } from '@manifold/author';
import {\n  ${definitions.map((name) => name + ' as ' + name + 'Definition').join(',\n  ')},\n} from '@manifold/author/primitives';

export default function createProject() {
  // Interface — public paths and stable IDs preserve saved controls.
  const controls = {
${controls.join('\n')}
  };

  // Audio inputs and outputs — ${input === 'none' ? 'generated sound; no audio input is needed' : 'the host supplies the external audio input'}.
  const graph = createGraphWorkspace().setInputSource('${input}');
${connections.some(([from]) => from === 1) ? "  const input = graph.input.output('out');\n" : ''}  const output = graph.output.input('in');

  // DSP instances — parameters belong to these named instances.
${setup.join('\n')}
  // Composition — named ports make the audio and control paths visible.
${wiring.join('\n')}

  // Presentation — both renderers bind to the controls declared above.
  const view = ${
    exposed.length
      ? '[\n    ' +
        exposed.map((key) => `controls.${key}`).join(',\n    ') +
        `\n  ].map(control => ({
    id: control.path, type: 'parameter', path: control.path,
    label: control.label, group: control.group,
    ...(control.choices ? { choices: control.choices } : {}),
  }))`
      : "[{ id: 'constructor', type: 'label', label: 'Edit fixedGain config.gain and Apply live to change the multiplier.' }]"
  };
  function paint(ui) {
    for (const component of view) {
      if (component.type === 'label') ui.label(component.label, component.id);
      else ui.parameter(component.path, component);
    }
  }

  // The host uses this project declaration for audio, UI, save and live edits.
  return { graph, view, paint };
}`;
  return Object.freeze({ id, label, description, reference, source });
}
const node = (type, values = {}, extra = {}) => ({
  id: 4,
  type,
  name: 'node',
  values,
  ...extra,
});
const serial = [
  [1, 'out', 4, 'audio'],
  [4, 'out', 3, 'in'],
];
const tone = (type = 'oscillator', extra = {}) => node(type, { 1: 220, 2: 0.16 }, extra);
const a = (id, type, name, values = {}, extra = {}) => ({
  id,
  type,
  name,
  values,
  ...extra,
});
const pair = [
  a(4, 'oscillator', 'low', { 1: 110, 2: 0.16 }),
  a(5, 'oscillator', 'high', { 0: 1, 1: 330, 2: 0.16 }),
];
export const programs = Object.freeze([
  Object.freeze({id:'ui-nacre',label:'Nacre · Spectral field device',description:'A playable iridescent chamber: FFT displacement, resonant distortion, sound-driven Chladni grains and physical Manifold controls.',reference:'Original authored effect over public Rust primitives',source:nacreSource}),
  Object.freeze({ id: 'ui-orbit', label: 'Orbit · Authored plugin face', description: 'An eight-voice spectral drone with its own playable face, live inspector and editable control layout.', reference: 'Authored instrument presentation over public Rust primitives', source: orbitSource }),
  Object.freeze({ id: 'ui-three-tone', label: 'UI · Three.js instrument',
    description: 'Drag the 3D tone to change pitch and cutoff; edit its scene module alongside the sounding graph.',
    reference: 'Custom web view over public graph bindings', source: threeToneSource }),
  Object.freeze({ id: 'ui-styled-tone', label: 'UI · Styled instrument',
    description: 'Compose colored groups, labels, sliders and choices in JS and egui; edit the palette live.',
    reference: 'Portable presentation example', source: styledToneSource }),
  Object.freeze({ id: 'ui-reactive-tone', label: 'UI · Reactive drawing',
    description: 'Accepted pitch and level drive a custom drawing, live text, color and conditional layout.',
    reference: 'Immediate presentation example', source: reactiveToneSource }),
  Object.freeze({
    id: 'network-services',
    label: 'Networking and Link',
    description:
      'TCP/UDP and OSC control a sounding graph; OSCQuery discovers accepted controls; Link tempo sets the Rust LFO rate.',
    reference: 'Public host-service integration example',
    source: networkSource,
  }),
  Object.freeze({
    id: 'default',
    label: 'Original live graph',
    description: 'Original Gain → Width, with a live authored distortion insert.',
    reference: 'DspLiveScripting/dsp/default_dsp.lua',
    source: defaultSource,
  }),
  Object.freeze({
    id: 'fx-slots',
    label: 'Original lazy FX slots',
    description:
      'Two serial slots. Selecting Width creates its primitive and gate; inactive amounts are remembered.',
    reference: 'DspLiveScripting/dsp/fx_slot_swap_harness.lua',
    source: slotsSource,
  }),
  program('gain', 'Gain', 'Scale the incoming audio.', [node('gain', { 0: 1 })], serial),
  program(
    'fixed-gain',
    'Fixed gain',
    'Constant ×4 gain; edit config.gain to change it.',
    [node('fixed-gain', {}, { args: { a: 4 } })],
    serial,
  ),
  program(
    'width',
    'Stereo widener',
    'Mid/side width with low-frequency mono protection; use stereo noise or a stereo file.',
    [node('stereo-widener', { 0: 1.6, 1: 160, 2: 1 })],
    serial,
  ),
  program(
    'distortion',
    'Distortion',
    'Drive, wet mix and output level. This is the Distortion primitive, distinct from legacy WaveShaper.',
    [node('distortion', { 0: 4, 1: 1, 2: 0.5 })],
    serial,
  ),
  program('svf', 'SVF filter', 'Four modes, cutoff and resonance.', [node('svf')], serial),
  program(
    'oscillator',
    'Oscillator',
    'Five waveforms with frequency and level.',
    [tone()],
    [[4, 'out', 3, 'in']],
    { input: 'none' },
  ),
  program(
    'extended-oscillator',
    'Extended oscillator',
    'Eight waveforms, drive, unison and additive rendering.',
    [tone('extended-oscillator')],
    [[4, 'out', 3, 'in']],
    { input: 'none' },
  ),
  program(
    'pulse',
    'Pulse oscillator',
    'Frequency, level and pulse width.',
    [tone('pulse-oscillator', { values: { 1: 220, 2: 0.16, 4: 0.25 } })],
    [[4, 'out', 3, 'in']],
    { input: 'none' },
  ),
  program(
    'adsr',
    'ADSR envelope',
    'Gate a constant tone through the core audio-rate envelope. Switch Gate on and off to hear attack and release.',
    [tone(), a(5, 'adsr', 'envelope', { 4: 0 }, { expose: [0, 1, 2, 3, 4] })],
    [
      [4, 'out', 5, 'audio'],
      [5, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'lfo-gain',
    'LFO → CV gain',
    'A typed control cable modulates input level. Rate, waveform, base and depth remain live.',
    [a(4, 'lfo', 'lfo'), a(5, 'modulated-gain', 'gain')],
    [
      [1, 'out', 5, 'audio'],
      [4, 'uni', 5, 'cv'],
      [5, 'out', 3, 'in'],
    ],
  ),
  program(
    'crossfader',
    'Crossfader',
    'Blend a low sine and a higher saw using the core crossfader.',
    [...pair, a(6, 'crossfader', 'blend')],
    [
      [4, 'out', 6, 'a'],
      [5, 'out', 6, 'b'],
      [6, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'sum',
    'Audio sum',
    'Sum two independent tones; each input has its own editable level.',
    [...pair, a(6, 'sum2', 'sum')],
    [
      [4, 'out', 6, 'a'],
      [5, 'out', 6, 'b'],
      [6, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'mixer',
    'Stereo mixer',
    'Two active inputs with separate gain and pan, plus master level.',
    [...pair, a(6, 'mixer', 'mixer', {}, { args: { a: 2, b: 1 }, expose: [0, 1, 2, 33, 34] })],
    [
      [4, 'out', 6, 'in-1'],
      [5, 'out', 6, 'in-2'],
      [6, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'phase-vocoder',
    'Phase vocoder',
    'Pitch, time and wet mix. FFT order is prepared from source, not changed in the audio callback.',
    [node('phase-vocoder', { 1: 7, 3: 1, 4: 11 })],
    serial,
  ),
  program(
    'noise',
    'Noise generator',
    'The core deterministic stereo noise source, with live level and color.',
    [node('noise', { 0: 0.16 })],
    [[4, 'out', 3, 'in']],
    { input: 'none' },
  ),
  program(
    'cv-slew',
    'CV slew',
    'Asymmetric rise and fall applied to a square LFO before it controls audio gain.',
    [
      tone(),
      a(5, 'lfo', 'lfo', { 0: 2 }),
      a(6, 'slew-control', 'slew', { 0: 800, 1: 400 }),
      a(7, 'modulated-gain', 'gain', { 0: 0.5, 1: 0.4 }),
    ],
    [
      [4, 'out', 7, 'audio'],
      [5, 'out', 6, 'cv'],
      [6, 'out', 7, 'cv'],
      [7, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'attenuverter',
    'Attenuverter and bias',
    'Invert, scale and offset a typed control signal before it controls audio gain.',
    [
      tone(),
      a(5, 'lfo', 'lfo'),
      a(6, 'attenuverter-bias', 'amount', { 0: -0.8, 1: 0.2 }),
      a(7, 'modulated-gain', 'gain'),
    ],
    [
      [4, 'out', 7, 'audio'],
      [5, 'out', 6, 'cv'],
      [6, 'out', 7, 'cv'],
      [7, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'sample-hold',
    'Sample and hold',
    'Sample, track or quantize one LFO using a separate trigger LFO. The stored value survives compatible source edits.',
    [
      tone(),
      a(5, 'lfo', 'source', { 1: 2 }),
      a(6, 'lfo', 'clock', { 0: 2, 1: 7 }),
      a(7, 'sample-hold', 'hold'),
      a(8, 'modulated-gain', 'gain'),
    ],
    [
      [4, 'out', 8, 'audio'],
      [5, 'out', 7, 'cv'],
      [6, 'uni', 7, 'trigger'],
      [7, 'out', 8, 'cv'],
      [8, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'cv-mix',
    'CV mixer',
    'Combine four typed control inputs and an offset; two LFO outputs are connected here.',
    [
      tone(),
      a(5, 'lfo', 'lfo'),
      a(6, 'cv-mix', 'mix', { 0: 0.8, 1: 0.2 }),
      a(7, 'modulated-gain', 'gain'),
    ],
    [
      [4, 'out', 7, 'audio'],
      [5, 'out', 6, 'in-1'],
      [5, 'inv', 6, 'in-2'],
      [6, 'out', 7, 'cv'],
      [7, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'compare',
    'CV comparator',
    'Hysteresis converts a continuous LFO to a gate that modulates audio. Gate and trigger are distinct output ports.',
    [
      tone(),
      a(5, 'lfo', 'lfo'),
      a(6, 'cv-compare', 'compare', { 0: 2, 1: 0.2 }),
      a(7, 'modulated-gain', 'gain', { 0: 0.1, 1: 0.8 }),
    ],
    [
      [4, 'out', 7, 'audio'],
      [5, 'out', 6, 'cv'],
      [6, 'gate', 7, 'cv'],
      [7, 'out', 3, 'in'],
    ],
    { input: 'none', reference: 'Main/ui/behaviors/compare_runtime.lua' },
  ),
  program(
    'range',
    'CV range',
    'Clamp or remap the unipolar LFO into an authored range before it controls audio.',
    [
      tone(),
      a(5, 'lfo', 'lfo'),
      a(6, 'cv-range', 'range', { 0: 0.2, 1: 0.8, 2: 1 }),
      a(7, 'modulated-gain', 'gain'),
    ],
    [
      [4, 'out', 7, 'audio'],
      [5, 'uni', 6, 'cv'],
      [6, 'out', 7, 'cv'],
      [7, 'out', 3, 'in'],
    ],
    { input: 'none', reference: 'Main/ui/behaviors/range_mapper_runtime.lua' },
  ),
  program(
    'cv-filter',
    'CV filter',
    'An LFO controls cutoff through a typed CV cable; base cutoff, resonance and depth stay live.',
    [a(4, 'lfo', 'lfo', { 1: 1 }), a(5, 'modulated-svf', 'filter', { 1: 2000, 3: 5000 })],
    [
      [1, 'out', 5, 'audio'],
      [4, 'uni', 5, 'cv'],
      [5, 'out', 3, 'in'],
    ],
  ),
  program(
    'ring',
    'Ring modulator',
    'Two actual oscillator primitives feed the carrier and modulator audio ports.',
    [...pair, a(6, 'ring-modulator', 'ring')],
    [
      [4, 'out', 6, 'carrier'],
      [5, 'out', 6, 'modulator'],
      [6, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'eq8',
    'Eight-band EQ',
    'Eight independent bands with seven filter shapes, output gain and wet mix. Band 4 starts as an audible low-pass.',
    [
      node(
        'eq8',
        { 15: 1, 16: 3, 17: 500 },
        {
          parameterGroups: Object.fromEntries(
            Array.from({ length: 42 }, (_, id) => [
              id,
              id < 40 ? 'Band ' + (Math.floor(id / 5) + 1) : 'Output',
            ]),
          ),
        },
      ),
    ],
    serial,
    { reference: 'dsp/core/nodes/EQ8Node.h' },
  ),
  program(
    'mixer9',
    'Nine-input mixer',
    'Nine audio ports with a master level. Two independent tones occupy inputs 1 and 2; edit source to connect the remaining ports.',
    [...pair, a(6, 'mixer9', 'mixer', { 0: 0.7 })],
    [
      [4, 'out', 6, 'in-1'],
      [5, 'out', 6, 'in-2'],
      [6, 'out', 3, 'in'],
    ],
    { input: 'none' },
  ),
  program(
    'wave-shaper',
    'WaveShaper',
    'Seven curves, drive/output dB, tone filters, bias and mix. Legacy tone factor legacyToneFactor is source-only and scales filter cutoff; it is not FIR oversampling.',
    [node('wave-shaper', { 1: 12, 2: -6, 3: 2000, 4: 4000 }, { expose: [0, 1, 2, 3, 4, 5, 6] })],
    serial,
    { reference: 'dsp/core/nodes/WaveShaperNode.cpp' },
  ),
  program(
    'legacy-filter',
    'Legacy Filter',
    'Original FilterNode scalar algorithm, with cutoff, resonance and wet mix. Distinct from the four-mode SVF primitive.',
    [node('legacy-filter')],
    serial,
    { reference: 'dsp/core/nodes/FilterNode.cpp' },
  ),
]);
export function getProgram(id) {
  const value = programs.find((entry) => entry.id === id);
  if (!value) throw Error(`Unknown live primitive program: ${id}`);
  return value;
}
