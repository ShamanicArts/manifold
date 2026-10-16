import { mountDropdown } from './dropdown.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_NAMES = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic', 'Chromatic'];
const DIRECTION_NAMES = ['Nearest', 'Up', 'Down'];
const INTERVALS = [[0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10],
  [0, 2, 3, 5, 7, 9, 10], [0, 2, 4, 5, 7, 9, 10], [0, 2, 4, 7, 9],
  Array.from({ length: 12 }, (_, i) => i)];
const DEFAULT = { root: 0, scale: 1, direction: 1, connected: false };
const VOICE_COLOURS = ['#f59e0b', '#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fb7185', '#facc15', '#67e8f9'];
const noteName = note => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

// Original face: Main/ui/components/scale_quantizer.ui.lua and dynamic_module_graphs.lua.
export function mountMainScaleQuantizer(get, post, ids) {
  const state = { ...DEFAULT };
  let voices = [];
  const panel = get('scale-quantizer');
  const style = { bg: '#112417', colour: '#22c55e' };
  const root = mountDropdown(get('scale-quantizer-root'), {
    id: 'scale_quantizer_root', options: NOTE_NAMES, maxVisibleRows: 8, style }, panel);
  const scale = mountDropdown(get('scale-quantizer-scale'), {
    id: 'scale_quantizer_scale', options: SCALE_NAMES, maxVisibleRows: 6, style }, panel);
  const direction = mountDropdown(get('scale-quantizer-direction'), {
    id: 'scale_quantizer_direction', options: DIRECTION_NAMES, maxVisibleRows: 3, style }, panel);
  const connected = get('scale-quantizer-connected');
  const send = (id, value) => post({ type: 'scale-quantizer-parameter', id, value: Number(value) });
  root.onChange(index => { state.root = index; send(ids.root, index); paint(); });
  scale.onChange(index => { state.scale = index + 1; send(ids.scale, state.scale); paint(); });
  direction.onChange(index => { state.direction = index + 1; send(ids.direction, state.direction); paint(); });
  connected.addEventListener('change', () => {
    state.connected = connected.checked; send(ids.connected, Number(state.connected)); paint();
  });

  function paint() {
    const ctx = get('scale-quantizer-preview').getContext('2d');
    const w = 212, h = 50, left = 8, right = w - 8, rowY = 25;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1812'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4ade8012'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
    }
    ctx.stroke();
    const degrees = INTERVALS[state.scale - 1].map(interval => (state.root + interval) % 12);
    for (let i = 0; i < 12; i++) {
      const x = left + (right - left) * i / 11;
      const inScale = degrees.includes(i);
      ctx.fillStyle = inScale ? '#4ade80b4' : '#ffffff2a';
      ctx.beginPath(); ctx.roundRect(Math.floor(x - 4), rowY - (inScale ? 10 : 4), 8, inScale ? 20 : 8, 3); ctx.fill();
    }
    for (const voice of voices) {
      ctx.fillStyle = VOICE_COLOURS[voice.index % VOICE_COLOURS.length];
      for (const [note, y] of [[voice.input, rowY - 14], [voice.output, rowY + 14]]) {
        const x = left + (right - left) * (note % 12) / 11;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    get('scale-quantizer-status').textContent = `${NOTE_NAMES[state.root]} ${SCALE_NAMES[state.scale - 1]}  •  ${DIRECTION_NAMES[state.direction - 1]}`;
    get('scale-quantizer-values').textContent = voices.length
      ? `Preview: ${noteName(voices[0].input)} → ${noteName(voices[0].output)}` : 'Preview: — → —';
    get('scale-quantizer-meter').textContent = state.connected
      ? `${voices.length} active ${voices.length === 1 ? 'voice' : 'voices'}` : 'No connected voices';
    root.paint(); scale.paint(); direction.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, Number(state[key])); },
    restore(saved) {
      Object.assign(state, saved);
      root.setSelected(state.root); scale.setSelected(state.scale - 1);
      direction.setSelected(state.direction - 1); connected.checked = state.connected;
      this.sendState(); paint();
    },
    setStatus(data) {
      voices = data.voices;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
