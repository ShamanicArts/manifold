import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';

const SHAPES = ['Linear', 'Log', 'Exp'];
const DEFAULT = { riseMs: 0, fallMs: 0, shape: 1, source: 0 };
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
const response = (shape, t) => shape === 0 ? t : shape === 1 ? 1 - (1 - t) ** 2 : t ** 2;

// Face: Main/ui/components/slew.ui.lua. Curve: Main/lib/ui/dynamic_module_graphs.lua.
export function mountMainSlew(get, post, ids) {
  const state = { ...DEFAULT };
  let input = 0, output = 0;
  const panel = get('slew-preview').closest('.rack-slew');
  const shape = mountDropdown(get('slew-shape'), { id: 'slew_shape', options: SHAPES,
    maxVisibleRows: 3, style: { bg: '#112417', colour: '#2dd4bf' } }, panel);
  shape.setSelected(state.shape);
  const rise = mountCompactSlider(get('slew-rise'), { label: 'Rise ms', min: 0, max: 2000,
    step: 1, value: 0, style: { colour: '#22d3ee', bg: '#112417' } });
  const fall = mountCompactSlider(get('slew-fall'), { label: 'Fall ms', min: 0, max: 2000,
    step: 1, value: 0, style: { colour: '#34d399', bg: '#112417' } });
  const send = (id, value) => post({ type: 'slew-parameter', id, value });
  shape.onChange(value => { state.shape = value; send(ids.shape, value); paint(); });
  rise.onChange(value => { state.riseMs = value; send(ids.riseMs, value); paint(); });
  fall.onChange(value => { state.fallMs = value; send(ids.fallMs, value); paint(); });
  const source = get('slew-source');
  for (let slot = 0; slot < 4; slot++) {
    for (const [port, name] of ['OUT', 'INV', 'UNI', 'EOC'].entries()) {
      source.add(new Option(`LFO ${slot + 1} ${name}`, String(slot * 4 + port)));
    }
  }
  source.add(new Option('ATV / Bias OUT', '16'));
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); });

  function paint() {
    const canvas = get('slew-preview'), ctx = canvas.getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, top = 10, bottom = h - 10;
    const yOf = value => bottom - (value + 1) * .5 * (bottom - top);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1812'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#22d3ee1a'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4)); ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff2a'; ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = left; x <= right; x++) {
      const t = (x - left) / (right - left);
      const y = yOf(input * response(state.shape, t));
      if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#22d3ee48'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(left, Math.floor(yOf(input))); ctx.lineTo(right, Math.floor(yOf(input))); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(right, yOf(output), 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22d3ee'; ctx.font = '9px sans-serif';
    ctx.fillText(`in ${signed(input)}  out ${signed(output)}`, 4, 10);
    get('slew-status').textContent = `${SHAPES[state.shape]}  •  ↑ ${state.riseMs} ms  ↓ ${state.fallMs} ms`;
    get('slew-values').textContent = `In ${signed(input)}  •  Out ${signed(output)}`;
    shape.paint(); rise.paint(); fall.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() {
      for (const [key, id] of Object.entries(ids)) send(id, state[key]);
    },
    restore(saved) {
      Object.assign(state, saved);
      shape.setSelected(state.shape);
      rise.setValue(state.riseMs); fall.setValue(state.fallMs);
      source.value = String(state.source);
      this.sendState(); paint();
    },
    setStatus(data) {
      input = data.input; output = data.output;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
