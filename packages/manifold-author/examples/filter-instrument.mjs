// Standalone_Filter/dsp/main.lua: the original paths, defaults and host slots.
// Imports — the graph tools and filter definition used by this instrument.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { createGraphWorkspace } from '@manifold/author';
import { svf } from '@manifold/author/primitives';
import { applyStudioGraph } from '@manifold/author/studio-graph';

// Studio graph edits are authored data. The same declaration works in a DAW,
// standalone and browser; the original filter definition remains readable.
const studioGraph = { nodes: [], connections: [], removed: [], layout: [] };
const studioParameters = [];

export default function createProject() {
  // Interface — declared once for DSP bindings and presentation.
  const controls = {
    mode: {
      id: 'mode',
      path: '/plugin/params/type',
      label: 'Mode',
      min: 0,
      max: 3,
      default: 0,
      choices: ['Low pass', 'Band pass', 'High pass', 'Notch'],
    },
    cutoff: {
      id: 'cutoff',
      path: '/plugin/params/cutoff',
      label: 'Cutoff',
      unit: 'Hz',
      min: 80,
      max: 16000,
      default: 3200,
    },
    resonance: {
      id: 'resonance',
      path: '/plugin/params/resonance',
      label: 'Resonance',
      min: 0.1,
      max: 2,
      default: 0.75,
    },
  };

  // Audio interface — the host supplies external input and plays this output.
  const graph = createGraphWorkspace().setInputSource('external');
  const input = graph.input.output('out');
  const output = graph.output.input('in');

  // DSP definition — stable identity keeps existing saves and automation valid.
  const filter = graph.add(svf.type, { id: 4 });
  graph.registerInstance('/plugin/filter', filter);
  filter.parameter('mode').expose(controls.mode);
  filter.parameter('cutoff').expose(controls.cutoff);
  filter.parameter('resonance').expose(controls.resonance);
  // Slots are the original DAW automation identities, separate from local names.
  graph.bindHostSlot(0, filter, filter.parameter('mode').description.id);
  graph.bindHostSlot(1, filter, filter.parameter('cutoff').description.id);
  graph.bindHostSlot(2, filter, filter.parameter('resonance').description.id);

  // Composition — the same Rust filter processes browser and native audio.
  graph.connect(input, filter.input('audio'));
  graph.connect(filter.output('out'), output);
  applyStudioGraph(graph, studioGraph);
  for (const definition of studioParameters) {
    graph.findInstance(definition.instance).parameter(definition.parameter).expose(definition);
  }

  // Presentation — both UI renderers use the same declared endpoints.
  const slider = ({ id, path, label, unit, choices }) => ({
    id,
    type: 'parameter',
    path,
    label,
    ...(unit ? { unit } : {}),
    ...(choices ? { choices } : {}),
  });
  const view = [
    { id: 'response', type: 'filter-response', base: '/plugin/params' },
    slider(controls.mode),
    slider(controls.cutoff),
    slider(controls.resonance),
  ];
  for (const definition of studioParameters) view.push({
    id:definition.path, type:'parameter', path:definition.path, label:definition.label,
    choices:definition.choices,
  });

  // The host calls paint for immediate presentation of accepted state.
  function paint(ui) {
    ui.filterResponse();
    for (const control of Object.values(controls)) {
      ui.parameter(control.path, {
        label: control.label,
        ...(control.unit ? { unit: control.unit } : {}),
        ...(control.choices ? { choices: control.choices } : {}),
      });
    }
    for (const definition of studioParameters) ui.parameter(definition.path, {
      label:definition.label, choices:definition.choices,
    });
  }
  return { graph, view, paint, editorGraph: studioGraph };
}
