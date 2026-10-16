// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.parameterValue(), etc.
import { createGraphWorkspace, parameterValue } from '@manifold/author';
import { oscillator } from '@manifold/author/primitives';

export default function createProject() {
  // Interface — these controls drive real Rust DSP, in either renderer.
  const controls = {
    pitch: { path: '/ui/reactive/pitch', label: 'Pitch · Hz', min: 55, max: 880, default: 220 },
    level: { path: '/ui/reactive/level', label: 'Level', min: 0, max: 0.3, default: 0.12 },
  };
  const graph = createGraphWorkspace().setInputSource('none');
  const voice = graph.add(oscillator.type, { id: 4 });
  graph.registerInstance('/ui/reactive/voice', voice);
  voice.parameter('frequency').expose(controls.pitch);
  voice.parameter('level').expose(controls.level);
  graph.connect(voice.output('out'), graph.output.input('in'));

  // Presentation — painting reads accepted state, never a second control store.
  // This is a waveform illustration of a 10 ms window, not an audio scope.
  const windowSeconds = 0.01;
  function paint(ui, accepted) {
    const pitch = parameterValue(accepted.graph, controls.pitch.path);
    const level = parameterValue(accepted.graph, controls.level.path);
    const style = {
      accent: level > 0.2 ? '#fb7185' : '#34d399',
      background: '#102b29',
      text: '#ecfdf5',
    };
    const points = Array.from({ length: 257 }, (_, index) => {
      const x = index / 256;
      const wave = Math.sin(2 * Math.PI * pitch * windowSeconds * x);
      return [x, 0.5 - wave * (level / controls.level.max) * 0.42];
    });
    ui.curve({ id: 'wave', label: 'Sine illustration · 10 ms',
      group: 'Drawing', points, height: 160, style });
    ui.label(`${Math.round(pitch)} Hz · ${level.toFixed(2)} level`, 'readout', {
      group: 'Play', fontSize: 22, style,
    });
    for (const control of Object.values(controls)) {
      ui.parameter(control.path, { id: control.path, label: control.label,
        group: 'Play', style });
    }
    // Conditional composition: turn up Level to reveal this extra hint.
    if (level > 0.2) ui.label('More level — the accent changes with the sound.', 'hint', {
      group: 'Play', style: { text: '#fb7185' },
    });
    ui.label('Edit windowSeconds, height or the palette and Apply live.', 'lesson', {
      group: 'Try editing', style: { text: '#94a3b8' },
    });
  }
  return { graph, paint };
}
