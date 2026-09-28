import { mountCompactSlider } from './compact-slider.js';

const SHAPES = ['Sine', 'Triangle', 'Saw', 'Square', 'S&H', 'Noise'];
export const DEFAULT_LFO_STATE = Object.freeze({
  shape: 0, rate: 1, depth: 1, phase: 0, retrig: 1,
  route: { source: 0, target: 0, amount: .05, bias: 0, mode: 0, enabled: false },
});

export function mountMainLfo(get, post, contract, slot = 0) {
  const ids = contract.lfoParameters, routeIds = contract.routeParameters;
  const state = { ...DEFAULT_LFO_STATE, route: { ...DEFAULT_LFO_STATE.route } };
  const canvas = get('lfo-preview'), ctx = canvas.getContext('2d');
  const shape = get('lfo-shape');
  const routeHeading = get('mod-source').closest('.rack-route').querySelector('h2');
  const paintRouteHeading = () => {
    routeHeading.textContent = state.route.source === 4 ? 'ATV / Bias → target'
      : state.route.source === 5 ? 'Slew → target' : `LFO ${slot + 1} → target`;
  };
  let phaseNow = 0, outputNow = 0;
  const seededStep = index => {
    const seed = Math.sin(index * 12.9898) * 43758.5453;
    return ((seed - Math.floor(seed)) * 2 - 1);
  };
  const previewShape = p => {
    if (state.shape === 0) return Math.sin(p * Math.PI * 2);
    if (state.shape === 1) return 1 - Math.abs(p * 4 - 2);
    if (state.shape === 2) return p * 2 - 1;
    if (state.shape === 3) return p < .5 ? 1 : -1;
    if (state.shape === 4) return seededStep(Math.floor(p * 8) + 1);
    const a = seededStep(Math.floor(p * 6) + 1);
    const b = seededStep(Math.floor(p * 6) + 2);
    return a + (b - a) * ((p * 6) % 1);
  };
  const sliders = {
    retrig: mountCompactSlider(get('lfo-retrig'), { label: 'Retrig', min: 0, max: 1, step: 1, value: 1, style: { colour: '#22d3ee', bg: '#111827' } }),
    rate: mountCompactSlider(get('lfo-rate'), { label: 'Rate Hz', min: .01, max: 20, step: .01, value: 1, style: { colour: '#38bdf8', bg: '#111827' } }),
    depth: mountCompactSlider(get('lfo-depth'), { label: 'Depth', min: 0, max: 1, step: .01, value: 1, style: { colour: '#22d3ee', bg: '#111827' } }),
    phase: mountCompactSlider(get('lfo-phase'), { label: 'Phase °', min: 0, max: 360, step: 1, value: 0, style: { colour: '#60a5fa', bg: '#111827' } }),
    amount: mountCompactSlider(get('mod-amount'), { label: 'Amount', min: -1, max: 1, step: .01, value: .05, style: { colour: '#38bdf8', bg: '#111827' } }),
    bias: mountCompactSlider(get('mod-bias'), { label: 'Bias', min: -1, max: 1, step: .01, value: 0, style: { colour: '#22d3ee', bg: '#111827' } }),
  };

  const lfoParam = (id, value) => post({ type: 'lfo-parameter', slot, id, value });
  const routeParam = (id, value) => post({ type: 'modulation-route', slot, id, value });
  function paint() {
    const w = 212, h = 54;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#08111f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#38bdf81c'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.floor(w * i / 4), 0); ctx.lineTo(Math.floor(w * i / 4), h);
      ctx.moveTo(0, Math.floor(h * i / 4)); ctx.lineTo(w, Math.floor(h * i / 4)); ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff2a'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 6; x <= w - 6; x++) {
      const p = (x - 6) / (w - 12);
      const y = 10 + (1 - previewShape(p) * state.depth) * (h - 20) / 2;
      if (x === 6) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const head = 6 + phaseNow * (w - 12);
    ctx.strokeStyle = '#38bdf878'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(head, 10); ctx.lineTo(head, h - 10); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.arc(head, 10 + (1 - outputNow) * (h - 20) / 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#38bdf8'; ctx.font = '9px sans-serif';
    ctx.fillText(`shape ${state.shape}  out ${outputNow >= 0 ? '+' : ''}${outputNow.toFixed(2)}`, 4, 10);
    get('lfo-status').textContent = `${SHAPES[state.shape]}  •  ${state.rate.toFixed(2)} Hz  •  Depth ${Math.round(state.depth * 100)}%`;
  }
  shape.addEventListener('change', () => { state.shape = Number(shape.value); lfoParam(ids.shape, state.shape); paint(); });
  for (const [key, id] of [['rate', ids.rate], ['depth', ids.depth], ['phase', ids.phase], ['retrig', ids.retrig]]) {
    sliders[key].onChange(value => { state[key] = value; lfoParam(id, value); paint(); });
  }
  for (const [key, id] of [['amount', routeIds.amount], ['bias', routeIds.bias]]) {
    sliders[key].onChange(value => { state.route[key] = value; routeParam(id, value); });
  }
  for (const [key, id] of [['source', routeIds.source], ['target', routeIds.target], ['mode', routeIds.mode]]) {
    get(`mod-${key}`).addEventListener('change', event => {
      state.route[key] = Number(event.target.value);
      routeParam(id, state.route[key]);
      if (key === 'source') paintRouteHeading();
      if (key === 'target') {
        state.route.enabled = state.route.target !== 0;
        get('mod-enabled').checked = state.route.enabled;
        routeParam(routeIds.enabled, Number(state.route.enabled));
      }
    });
  }
  get('mod-enabled').addEventListener('change', event => {
    state.route.enabled = event.target.checked;
    routeParam(routeIds.enabled, Number(state.route.enabled));
  });
  get('lfo-reset').addEventListener('click', () => {
    post({ type: 'lfo-gate', slot, id: 0, high: 1 });
    post({ type: 'lfo-gate', slot, id: 0, high: 0 });
  });
  get('lfo-sync').addEventListener('change', event => post({ type: 'lfo-gate', slot, id: 1, high: Number(event.target.checked) }));
  paint();
  return {
    paint() { paint(); Object.values(sliders).forEach(slider => slider.paint()); },
    snapshot() { return { shape: state.shape, rate: state.rate, depth: state.depth,
      phase: state.phase, retrig: state.retrig, route: { ...state.route } }; },
    restore(saved) {
      for (const key of ['shape', 'rate', 'depth', 'phase', 'retrig']) state[key] = saved[key];
      state.route = { ...saved.route };
      shape.value = String(state.shape);
      for (const key of ['rate', 'depth', 'phase', 'retrig']) sliders[key].setValue(state[key]);
      for (const key of ['amount', 'bias']) sliders[key].setValue(state.route[key]);
      for (const key of ['source', 'target', 'mode']) get(`mod-${key}`).value = String(state.route[key]);
      get('mod-enabled').checked = state.route.enabled;
      paintRouteHeading();
      this.sendState(); this.paint();
    },
    sendState() {
      for (const [id, value] of [[ids.shape, state.shape], [ids.rate, state.rate], [ids.depth, state.depth],
        [ids.phase, state.phase], [ids.retrig, state.retrig]]) lfoParam(id, value);
      for (const [id, value] of [[routeIds.source, state.route.source], [routeIds.target, state.route.target],
        [routeIds.amount, state.route.amount], [routeIds.bias, state.route.bias], [routeIds.mode, state.route.mode],
        [routeIds.enabled, Number(state.route.enabled)]]) routeParam(id, value);
    },
    setStatus(data) {
      phaseNow = data.phase; outputNow = data.out;
      get('lfo-output').textContent = `Out ${data.out >= 0 ? '+' : ''}${data.out.toFixed(2)}  •  Uni ${data.uni.toFixed(2)}  •  Φ ${data.phase.toFixed(2)}`;
      get('mod-effective').textContent = `Cutoff ${Math.round(data.cutoff)} Hz · Reso ${data.resonance.toFixed(2)} · FX1 ${data.fx1Mix.toFixed(2)} · FX2 ${data.fx2Mix.toFixed(2)}`;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
