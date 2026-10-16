import { mountCompactSlider } from './compact-slider.js';

const DEFAULT = { semitones: 0, source: 1, connected: false };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const VOICE_COLOURS = ['#f59e0b', '#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fb7185', '#facc15', '#67e8f9'];
const noteName = note => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

// Face and graph: Main/ui/components/transpose.ui.lua and Main/lib/ui/dynamic_module_graphs.lua.
export function mountMainTranspose(get, post, ids) {
  const state = { ...DEFAULT };
  let voices = [];
  const slider = mountCompactSlider(get('transpose-semitones'), { label: 'Semitones', min: -24, max: 24,
    step: 1, value: 0, bidirectional: true, style: { colour: '#22c55e', bg: '#112417' } });
  const source = get('transpose-source'), connected = get('transpose-connected');
  source.value = String(state.source);
  const send = (id, value) => post({ type: 'transpose-parameter', id, value: Number(value) });
  slider.onChange(value => { state.semitones = value; send(ids.semitones, value); paint(); });
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); paint(); });
  connected.addEventListener('change', () => {
    state.connected = connected.checked; send(ids.connected, Number(state.connected)); paint();
  });

  function paint() {
    const ctx = get('transpose-preview').getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, centerY = Math.floor(h * .55);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1812'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4ade8012'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4));
    }
    ctx.stroke();
    ctx.strokeStyle = '#4ade806e'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(left, centerY); ctx.lineTo(right, centerY); ctx.stroke();
    for (const voice of voices) {
      const color = VOICE_COLOURS[voice.index % VOICE_COLOURS.length];
      const inputX = left + (right - left) * voice.input / 127;
      const outputX = left + (right - left) * voice.output / 127;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(Math.floor(inputX), centerY - 12); ctx.lineTo(Math.floor(inputX), centerY + 12); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(outputX, centerY, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4ade80'; ctx.font = '9px sans-serif'; ctx.fillText('pitch shift', 4, 10);
    const signed = state.semitones >= 0 ? `+${state.semitones}` : String(state.semitones);
    get('transpose-status').textContent = `Shift ${signed} st  •  ${state.semitones >= 0 ? '+' : ''}${(state.semitones / 12).toFixed(1)} oct`;
    get('transpose-values').textContent = voices.length
      ? `Preview: ${noteName(voices[0].input)} → ${noteName(voices[0].output)}` : 'Preview: — → —';
    get('transpose-meter').textContent = state.connected
      ? `${voices.length} active ${voices.length === 1 ? 'voice' : 'voices'}` : 'No connected voices';
    slider.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, Number(state[key])); },
    restore(saved) {
      Object.assign(state, saved);
      slider.setValue(state.semitones); source.value = String(state.source);
      connected.checked = state.connected; this.sendState(); paint();
    },
    setStatus(data) { voices = data.voices; if (!get('midisynth-panel').hidden) paint(); },
  };
}
