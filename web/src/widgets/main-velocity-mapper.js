import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';

const DEFAULT = { amount: 1, curve: 0, offset: 0, source: 4, connected: false };
const VOICE_COLOURS = ['#4ade80', '#38bdf8', '#fbbf24', '#f87171', '#a78bfa', '#2dd4bf', '#fb923c', '#f472b6'];
const clamp = value => Math.max(0, Math.min(1, value));

// The historical runtime uses smoothstep for Soft. Its UI graph used sqrt;
// this face draws the actual audio rule so the markers stay on the curve.
function mapped(input, state) {
  const x = clamp(input);
  if (state.amount <= 0) return x;
  const shaped = state.curve === 1 ? x * x * (3 - 2 * x) : state.curve === 2 ? x * x : x;
  return clamp(x * (1 - state.amount) + shaped * state.amount + state.offset * state.amount);
}

// Original face: Main/ui/components/velocity_mapper.ui.lua and its dynamic graph.
export function mountMainVelocityMapper(get, post, ids) {
  const state = { ...DEFAULT };
  let voices = [];
  const panel = get('velocity-mapper');
  const curve = mountDropdown(get('velocity-mapper-curve'), { id: 'velocity_mapper_curve',
    options: ['Linear', 'Soft', 'Hard'], maxVisibleRows: 3,
    style: { bg: '#112417', colour: '#4ade80' } }, panel);
  const amount = mountCompactSlider(get('velocity-mapper-amount'), { label: 'Amount', min: 0, max: 1,
    step: .01, value: 1, style: { colour: '#22c55e', bg: '#112417' } });
  const offset = mountCompactSlider(get('velocity-mapper-offset'), { label: 'Offset', min: -1, max: 1,
    step: .01, value: 0, bidirectional: true, style: { colour: '#34d399', bg: '#112417' } });
  const source = get('velocity-mapper-source'), connected = get('velocity-mapper-connected');
  source.value = String(state.source);
  const send = (id, value) => post({ type: 'velocity-mapper-parameter', id, value: Number(value) });
  curve.onChange(value => { state.curve = value; send(ids.curve, value); paint(); });
  amount.onChange(value => { state.amount = value; send(ids.amount, value); paint(); });
  offset.onChange(value => { state.offset = value; send(ids.offset, value); paint(); });
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); paint(); });
  connected.addEventListener('change', () => {
    state.connected = connected.checked; send(ids.connected, Number(state.connected)); paint();
  });

  function paint() {
    const ctx = get('velocity-mapper-preview').getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, top = 10, bottom = h - 10;
    const xFor = input => left + (right - left) * clamp(input);
    const yFor = output => bottom - (bottom - top) * clamp(output);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#101611'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4ade8018'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4));
    }
    ctx.stroke();
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= right - left; i++) {
      const x = left + i, input = i / (right - left), y = yFor(mapped(input, state));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (const voice of voices) {
      ctx.fillStyle = VOICE_COLOURS[voice.index % VOICE_COLOURS.length];
      ctx.beginPath(); ctx.arc(xFor(voice.input), yFor(voice.output), 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4ade80'; ctx.font = '9px sans-serif';
    ctx.fillText(`in ${Math.round((voices[0]?.input ?? 0) * 100)}%  out ${Math.round((voices[0]?.output ?? 0) * 100)}%`, 4, 10);
    get('velocity-mapper-status').textContent = `${['Linear', 'Soft', 'Hard'][state.curve]}  •  Amt ${Math.round(state.amount * 100)}%  •  Off ${Math.round(state.offset * 100)}%`;
    get('velocity-mapper-values').textContent = voices.length
      ? `Preview: ${(voices[0].input * 100).toFixed(0)}% → ${(voices[0].output * 100).toFixed(0)}%` : 'Preview: —';
    get('velocity-mapper-meter').textContent = state.connected
      ? `${voices.length} active ${voices.length === 1 ? 'voice' : 'voices'}` : 'No connected voices';
    curve.paint(); amount.paint(); offset.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, Number(state[key])); },
    restore(saved) {
      Object.assign(state, saved);
      curve.setSelected(state.curve); amount.setValue(state.amount); offset.setValue(state.offset);
      source.value = String(state.source); connected.checked = state.connected;
      this.sendState(); paint();
    },
    setStatus(data) { voices = data.voices; if (!get('midisynth-panel').hidden) paint(); },
  };
}
