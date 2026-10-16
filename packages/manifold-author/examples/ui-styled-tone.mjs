// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.oscillator, etc.
import { createGraphWorkspace } from '@manifold/author';
import { oscillator, svf } from '@manifold/author/primitives';

export default function createProject() {
  // Interface — musical names, units and stable paths belong together.
  const controls = {
    pitch: { path: '/ui/tone/pitch', label: 'Pitch · Hz', min: 55, max: 880, default: 220 },
    level: { path: '/ui/tone/level', label: 'Level', min: 0, max: 0.3, default: 0.12 },
    waveform: {
      path: '/ui/tone/waveform', label: 'Waveform', min: 0, max: 3, default: 1,
      choices: ['Sine', 'Saw', 'Square', 'Triangle'],
    },
    cutoff: { path: '/ui/tone/cutoff', label: 'Cutoff · Hz', min: 80, max: 8000, default: 2400 },
    resonance: { path: '/ui/tone/resonance', label: 'Resonance', min: 0.1, max: 1, default: 0.6 },
  };

  // Audio interface — a self-contained instrument, with no external input.
  const graph = createGraphWorkspace().setInputSource('none');
  const output = graph.output.input('in');
  const voice = graph.add(oscillator.type, { id: 4 });
  const filter = graph.add(svf.type, { id: 5 });
  graph.registerInstance('/ui/tone/voice', voice);
  graph.registerInstance('/ui/tone/filter', filter);
  voice.parameter('frequency').expose(controls.pitch);
  voice.parameter('level').expose(controls.level);
  voice.parameter('waveform').expose(controls.waveform);
  filter.parameter('cutoff').expose(controls.cutoff);
  filter.parameter('resonance').expose(controls.resonance);
  graph.connect(voice.output('out'), filter.input('audio'));
  graph.connect(filter.output('out'), output);

  // Presentation — edit these colors, labels and groups, then Apply live.
  // Portable styles work in retained JS and native/Wasm egui.
  const palette = {
    voice: { accent: '#f59e0b', background: '#302313', text: '#fff7ed' },
    filter: { accent: '#38bdf8', background: '#112a36', text: '#e0f2fe' },
  };
  const slider = (control, group, style) => ({
    id: control.path, type: 'parameter', path: control.path,
    label: control.label, choices: control.choices, group, style,
  });
  const view = [
    { id: 'voice-title', type: 'label', label: 'Make a tone', fontSize: 22,
      group: 'Sound', style: palette.voice },
    slider(controls.waveform, 'Sound', palette.voice),
    slider(controls.pitch, 'Sound', palette.voice),
    slider(controls.level, 'Sound', palette.voice),
    { id: 'filter-title', type: 'label', label: 'Shape its color', fontSize: 22,
      group: 'Filter', style: palette.filter },
    slider(controls.cutoff, 'Filter', palette.filter),
    slider(controls.resonance, 'Filter', palette.filter),
  ];
  // A retained declaration is sufficient. Both hosts bind to accepted targets.
  return { graph, view };
}
