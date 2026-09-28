import { mountCompactSlider } from './compact-slider.js';

const clamp = value => Math.max(-1, Math.min(1, value));
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

// Main/ui/components/attenuverter_bias.ui.lua supplies the face geometry;
// Main/lib/ui/dynamic_module_graphs.lua supplies the transfer curve.
export function mountMainAtvBias(get, post) {
  const state = { amount: 1, bias: 0, slot: 0, port: 0 };
  let input = 0, output = 0;
  const amount = mountCompactSlider(get('atv-amount'), { label: 'Amount', min: -1, max: 1,
    step: .01, value: 1, bidirectional: true, style: { colour: '#22c55e', bg: '#112417' } });
  const bias = mountCompactSlider(get('atv-bias'), { label: 'Bias', min: -1, max: 1,
    step: .01, value: 0, bidirectional: true, style: { colour: '#3b82f6', bg: '#0f1a2e' } });
  const send = (id, value) => post({ type: 'atv-parameter', id, value });
  amount.onChange(value => { state.amount = value; send(0, value); paint(); });
  bias.onChange(value => { state.bias = value; send(1, value); paint(); });
  get('atv-slot').addEventListener('change', event => {
    state.slot = Number(event.target.value); send(2, state.slot);
  });
  get('atv-port').addEventListener('change', event => {
    state.port = Number(event.target.value); send(3, state.port);
  });

  function paint() {
    const canvas = get('atv-preview'), ctx = canvas.getContext('2d');
    const w = 212, h = 54, left = 6, right = w - 6, top = 10, bottom = h - 10;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1812'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#22c55e18'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4)); ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff2a'; ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = left; x <= right; x++) {
      const t = (x - left) / (right - left);
      const result = clamp((t * 2 - 1) * state.amount + state.bias);
      const y = bottom - (result + 1) * .5 * (bottom - top);
      if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.arc(left + (input + 1) * .5 * (right - left), bottom - (output + 1) * .5 * (bottom - top), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e'; ctx.font = '9px sans-serif';
    ctx.fillText(`amt ${signed(state.amount)}  bias ${signed(state.bias)}`, 4, 9);
    get('atv-status').textContent = `In ${signed(input)}  •  Out ${signed(output)}`;
    get('atv-values').textContent = `Amt ${signed(state.amount)}  •  Bias ${signed(state.bias)}`;
    amount.paint(); bias.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { send(0, state.amount); send(1, state.bias); send(2, state.slot); send(3, state.port); },
    restore(saved) {
      Object.assign(state, saved);
      amount.setValue(state.amount); bias.setValue(state.bias);
      get('atv-slot').value = String(state.slot);
      get('atv-port').value = String(state.port);
      this.sendState(); paint();
    },
    setStatus(data) { input = data.input; output = data.output; if (!get('midisynth-panel').hidden) paint(); },
  };
}
