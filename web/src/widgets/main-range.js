import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';

const MODES = ['Clamp', 'Remap'];
const DEFAULT = { min: 0, max: 1, mode: 0, source: 0 };

// Face: Main/ui/components/range_mapper.ui.lua. Graph: Main/lib/ui/dynamic_module_graphs.lua.
export function mountMainRange(get, post, ids) {
  const state = { ...DEFAULT };
  let input = 0, output = 0;
  const panel = get('range');
  const mode = mountDropdown(get('range-mode'), { id: 'range_mode', options: MODES,
    maxVisibleRows: 2, style: { bg: '#112417', colour: '#22c55e' } }, panel);
  const min = mountCompactSlider(get('range-min'), { label: 'Min', min: 0, max: 1,
    step: .01, value: 0, style: { colour: '#22c55e', bg: '#112417' } });
  const max = mountCompactSlider(get('range-max'), { label: 'Max', min: 0, max: 1,
    step: .01, value: 1, style: { colour: '#34d399', bg: '#112417' } });
  const source = get('range-source');
  for (let slot = 0; slot < 4; slot++) {
    for (const [port, name] of ['OUT', 'INV', 'UNI', 'EOC'].entries()) {
      source.add(new Option(`LFO ${slot + 1} ${name}`, String(slot * 4 + port)));
    }
  }
  for (const [id, label] of [['16', 'ATV / Bias OUT'], ['17', 'Slew OUT'],
    ['18', 'Sample Hold OUT'], ['19', 'Sample Hold INV'], ['20', 'Compare GATE'],
    ['21', 'Compare TRIG'], ['22', 'CV Mix OUT'], ['23', 'CV Mix INV']]) source.add(new Option(label, id));
  const send = (id, value) => post({ type: 'range-parameter', id, value: Number(value) });
  mode.onChange(value => { state.mode = value; send(ids.mode, value); paint(); });
  min.onChange(value => { state.min = value; send(ids.min, value); paint(); });
  max.onChange(value => { state.max = value; send(ids.max, value); paint(); });
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); });

  function paint() {
    const canvas = get('range-preview'), ctx = canvas.getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, top = 10, bottom = h - 10;
    const low = Math.min(state.min, state.max), high = Math.max(state.min, state.max);
    const yOf = value => bottom - value * (bottom - top);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1812'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4ade8016'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4)); ctx.stroke();
    }
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = left; x <= right; x++) {
      const t = (x - left) / (right - left);
      const mapped = state.mode === 0 ? Math.max(low, Math.min(high, t)) : low + t * (high - low);
      if (x === left) ctx.moveTo(x, yOf(mapped)); else ctx.lineTo(x, yOf(mapped));
    }
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.arc(left + Math.max(0, Math.min(1, input)) * (right - left), yOf(Math.max(0, Math.min(1, output))), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4ade80'; ctx.font = '9px sans-serif';
    ctx.fillText(`${state.mode ? 'remap' : 'clamp'} ${Math.round(low * 100)}→${Math.round(high * 100)}%`, 4, 10);
    get('range-status').textContent = `${MODES[state.mode]}  •  ${Math.round(low * 100)}% → ${Math.round(high * 100)}%`;
    get('range-values').textContent = `Preview: In ${input.toFixed(2)}  •  Out ${output.toFixed(2)}`;
    mode.paint(); min.paint(); max.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, state[key]); },
    restore(saved) {
      Object.assign(state, saved);
      mode.setSelected(state.mode); min.setValue(state.min); max.setValue(state.max);
      source.value = String(state.source);
      this.sendState(); paint();
    },
    setStatus(data) {
      input = data.input; output = data.output;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
