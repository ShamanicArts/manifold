import { mountDropdown } from './dropdown.js';

const MODES = ['Sample', 'Track', 'Step'];
const DEFAULT = { mode: 0, source: 0, triggerSource: 0, manualGate: false, held: 0, triggerHigh: false };
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

// Face: Main/ui/components/sample_hold.ui.lua. Graph: Main/lib/ui/dynamic_module_graphs.lua.
export function mountMainSampleHold(get, post, ids) {
  const state = { ...DEFAULT };
  let input = 0, trigger = 0;
  const panel = get('sample-hold');
  const mode = mountDropdown(get('sample-hold-mode'), { id: 'sample_hold_mode', options: MODES,
    maxVisibleRows: 3, style: { bg: '#1f160f', colour: '#f59e0b' } }, panel);
  const source = get('sample-hold-source');
  for (let slot = 0; slot < 4; slot++) {
    for (const [port, name] of ['OUT', 'INV', 'UNI', 'EOC'].entries()) {
      source.add(new Option(`LFO ${slot + 1} ${name}`, String(slot * 4 + port)));
    }
  }
  source.add(new Option('ATV / Bias OUT', '16'));
  source.add(new Option('Slew OUT', '17'));
  const triggerSource = get('sample-hold-trigger-source');
  for (let slot = 0; slot < 4; slot++) {
    triggerSource.add(new Option(`LFO ${slot + 1} EOC`, String(slot)));
  }
  triggerSource.add(new Option('Manual gate', '4'));
  const gate = get('sample-hold-manual-gate');
  const send = (id, value) => post({ type: 'sample-hold-parameter', id, value: Number(value) });
  const updateGate = () => { gate.disabled = state.triggerSource !== 4; gate.checked = state.manualGate; };
  mode.onChange(value => { state.mode = value; send(ids.mode, value); paint(); });
  source.addEventListener('change', () => { state.source = Number(source.value); send(ids.source, state.source); });
  triggerSource.addEventListener('change', () => {
    state.triggerSource = Number(triggerSource.value);
    state.manualGate = false;
    send(ids.triggerSource, state.triggerSource); send(ids.manualGate, 0);
    updateGate();
  });
  gate.addEventListener('change', () => {
    state.manualGate = gate.checked;
    send(ids.manualGate, Number(state.manualGate));
  });

  function paint() {
    const canvas = get('sample-hold-preview'), ctx = canvas.getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, top = 10, bottom = h - 10;
    const yOf = value => bottom - (value + 1) * .5 * (bottom - top);
    const mid1 = left + .33 * (right - left), mid2 = left + .66 * (right - left);
    const outY = Math.round(yOf(state.held)), inY = Math.round(yOf(input));
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#1f160f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f59e0b1a'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4)); ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff2a'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(left, outY); ctx.lineTo(mid1, outY); ctx.lineTo(mid1, inY); ctx.stroke();
    ctx.strokeStyle = '#f59e0bb4'; ctx.beginPath(); ctx.moveTo(mid1, inY); ctx.lineTo(mid2, inY); ctx.stroke();
    ctx.strokeStyle = '#f59e0b'; ctx.beginPath();
    ctx.moveTo(mid2, inY); ctx.lineTo(mid2, outY); ctx.lineTo(right, outY); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(right, outY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b'; ctx.font = '9px sans-serif';
    ctx.fillText(`mode ${state.mode}  hold ${signed(state.held)}`, 4, 10);
    get('sample-hold-status').textContent = `${MODES[state.mode]}  •  Hold ${signed(state.held)}`;
    get('sample-hold-values').textContent = `In ${signed(input)}  •  Hold ${signed(state.held)}`;
    get('sample-hold-inv').textContent = `Inv ${signed(-state.held)}`;
    get('sample-hold-trigger-meter').textContent = `Trigger ${trigger ? 'high' : 'low'}`;
    mode.paint();
  }
  updateGate(); paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() {
      for (const [key, id] of Object.entries(ids)) send(id, state[key]);
    },
    restore(saved) {
      Object.assign(state, saved);
      mode.setSelected(state.mode);
      source.value = String(state.source);
      triggerSource.value = String(state.triggerSource);
      updateGate();
      this.sendState(); paint();
    },
    setStatus(data) {
      input = data.input; trigger = data.trigger;
      state.held = data.held; state.triggerHigh = data.triggerHigh;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
