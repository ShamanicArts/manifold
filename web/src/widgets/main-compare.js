import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';

const DIRECTIONS = ['Rising', 'Falling', 'Both'];
const DEFAULT = { direction: 0, threshold: 0, hysteresis: .05, source: 0, gate: false, pulseRemaining: 0 };
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

// Face: Main/ui/components/compare.ui.lua. Graph: Main/lib/ui/dynamic_module_graphs.lua.
export function mountMainCompare(get, post, ids) {
  const state = { ...DEFAULT };
  let input = 0, trigger = 0;
  const panel = get('compare');
  const direction = mountDropdown(get('compare-direction'), { id: 'compare_direction', options: DIRECTIONS,
    maxVisibleRows: 3, style: { bg: '#1f160f', colour: '#f97316' } }, panel);
  const threshold = mountCompactSlider(get('compare-threshold'), { label: 'Threshold', min: -1, max: 1,
    step: .01, value: 0, bidirectional: true, style: { colour: '#f97316', bg: '#1f160f' } });
  const hysteresis = mountCompactSlider(get('compare-hysteresis'), { label: 'Hysteresis', min: 0, max: .5,
    step: .01, value: .05, style: { colour: '#fb923c', bg: '#1f160f' } });
  const source = get('compare-source');
  for (let slot = 0; slot < 4; slot++) {
    for (const [port, name] of ['OUT', 'INV', 'UNI', 'EOC'].entries()) {
      source.add(new Option(`LFO ${slot + 1} ${name}`, String(slot * 4 + port)));
    }
  }
  for (const [id, label] of [['16', 'ATV / Bias OUT'], ['17', 'Slew OUT'],
    ['18', 'Sample Hold OUT'], ['19', 'Sample Hold INV']]) source.add(new Option(label, id));
  const send = (id, value) => post({ type: 'compare-parameter', id, value: Number(value) });
  direction.onChange(value => { state.direction = value; send(ids.direction, value); paint(); });
  threshold.onChange(value => { state.threshold = value; send(ids.threshold, value); paint(); });
  hysteresis.onChange(value => { state.hysteresis = value; send(ids.hysteresis, value); paint(); });
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); });

  function paint() {
    const canvas = get('compare-preview'), ctx = canvas.getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, top = 10, bottom = h - 10;
    const yOf = value => bottom - (value + 1) * .5 * (bottom - top);
    const lowY = yOf(state.threshold - state.hysteresis * .5);
    const highY = yOf(state.threshold + state.hysteresis * .5);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#1f160f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f973161a'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4)); ctx.stroke();
    }
    ctx.fillStyle = '#f9731622';
    ctx.beginPath(); ctx.roundRect(left, Math.floor(Math.min(lowY, highY)), right - left,
      Math.max(2, Math.floor(Math.abs(highY - lowY))), 3); ctx.fill();
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2; ctx.beginPath();
    const gateY = state.gate ? top : bottom;
    ctx.moveTo(left, gateY); ctx.lineTo(right, gateY); ctx.stroke();
    const inputX = left + (input + 1) * .5 * (right - left);
    ctx.fillStyle = trigger ? '#fff' : '#ffffffb4'; ctx.beginPath();
    ctx.arc(inputX, yOf(input), 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f97316'; ctx.font = '9px sans-serif';
    ctx.fillText(`thr ${signed(state.threshold)}  gate ${Number(state.gate)} trig ${trigger}`, 4, 10);
    get('compare-status').textContent = `${DIRECTIONS[state.direction]}  •  Th ${signed(state.threshold)}  •  Hy ${state.hysteresis.toFixed(2)}`;
    get('compare-values').textContent = `In ${signed(input)}  •  Gate ${Number(state.gate)}  •  Trig ${trigger}`;
    get('compare-meter').textContent = `Gate ${state.gate ? 'high' : 'low'}  •  Trigger ${trigger ? 'high' : 'low'}`;
    direction.paint(); threshold.paint(); hysteresis.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, state[key]); },
    restore(saved) {
      Object.assign(state, saved);
      direction.setSelected(state.direction);
      threshold.setValue(state.threshold); hysteresis.setValue(state.hysteresis);
      source.value = String(state.source);
      this.sendState(); paint();
    },
    setStatus(data) {
      input = data.input; trigger = data.trigger;
      state.gate = data.gate; state.pulseRemaining = data.pulseRemaining;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
