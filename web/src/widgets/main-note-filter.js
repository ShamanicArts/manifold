import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';

const DEFAULT = { low: 36, high: 96, mode: 0, source: 0, connected: false };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const VOICE_COLOURS = ['#f59e0b', '#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fb7185', '#facc15', '#67e8f9'];
const noteName = note => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

// Original face: Main/ui/components/note_filter.ui.lua and dynamic_module_graphs.lua.
export function mountMainNoteFilter(get, post, ids) {
  const state = { ...DEFAULT };
  let voices = [];
  const panel = get('note-filter');
  const mode = mountDropdown(get('note-filter-mode'), { id: 'note_filter_mode',
    options: ['Inside', 'Outside'], maxVisibleRows: 2,
    style: { bg: '#112417', colour: '#22c55e' } }, panel);
  const low = mountCompactSlider(get('note-filter-low'), { label: 'Low', min: 0, max: 127,
    step: 1, value: 36, style: { colour: '#22c55e', bg: '#112417' } });
  const high = mountCompactSlider(get('note-filter-high'), { label: 'High', min: 0, max: 127,
    step: 1, value: 96, style: { colour: '#34d399', bg: '#112417' } });
  const source = get('note-filter-source'), connected = get('note-filter-connected');
  source.value = String(state.source);
  const send = (id, value) => post({ type: 'note-filter-parameter', id, value: Number(value) });
  mode.onChange(value => { state.mode = value; send(ids.mode, value); paint(); });
  low.onChange(value => { state.low = value; send(ids.low, value); paint(); });
  high.onChange(value => { state.high = value; send(ids.high, value); paint(); });
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); paint(); });
  connected.addEventListener('change', () => {
    state.connected = connected.checked; send(ids.connected, Number(state.connected)); paint();
  });

  function paint() {
    const ctx = get('note-filter-preview').getContext('2d');
    const w = 212, h = 50, left = 6, right = w - 6, midY = Math.floor(h * .55);
    const xFor = note => left + (right - left) * note / 127;
    const min = Math.min(state.low, state.high), max = Math.max(state.low, state.high);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1812'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#22c55e12'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4));
    }
    ctx.stroke();
    ctx.strokeStyle = '#22c55e5a'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke();
    ctx.fillStyle = '#22c55e8c'; ctx.beginPath();
    ctx.roundRect(Math.floor(xFor(min)), midY - 8,
      Math.max(4, Math.floor(xFor(max) - xFor(min))), 16, 4); ctx.fill();
    for (const voice of voices) {
      ctx.fillStyle = voice.passes ? VOICE_COLOURS[voice.index % VOICE_COLOURS.length] : '#ff4444';
      ctx.beginPath(); ctx.arc(xFor(voice.note), midY, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#22c55e'; ctx.font = '9px sans-serif';
    ctx.fillText(voices.some(voice => voice.passes) ? 'pass window' : 'filter window', 4, 10);
    get('note-filter-status').textContent = `${state.mode ? 'Outside' : 'Inside'}  •  ${noteName(min)} .. ${noteName(max)}`;
    get('note-filter-values').textContent = voices.length
      ? `Preview: ${noteName(voices[0].note)} → ${voices[0].passes ? 'PASS' : 'BLOCK'}` : 'Preview: —';
    get('note-filter-meter').textContent = state.connected
      ? `${voices.filter(voice => voice.passes).length} passing / ${voices.length} held`
      : 'No connected voices';
    mode.paint(); low.paint(); high.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, Number(state[key])); },
    restore(saved) {
      Object.assign(state, saved);
      mode.setSelected(state.mode); low.setValue(state.low); high.setValue(state.high);
      source.value = String(state.source); connected.checked = state.connected;
      this.sendState(); paint();
    },
    setStatus(data) { voices = data.voices; if (!get('midisynth-panel').hidden) paint(); },
  };
}
