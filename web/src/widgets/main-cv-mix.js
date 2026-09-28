import { mountCompactSlider } from './compact-slider.js';

const DEFAULT = {
  level1: 1, level2: 0, level3: 0, level4: 0, offset: 0,
  source1: 0, source2: 0, source3: 0, source4: 0,
};
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

// Face: Main/ui/components/cv_mix.ui.lua. Graph: Main/lib/ui/dynamic_module_graphs.lua.
export function mountMainCvMix(get, post, ids) {
  const state = { ...DEFAULT };
  let inputs = [0, 0, 0, 0], output = 0;
  const send = (id, value) => post({ type: 'cv-mix-parameter', id, value: Number(value) });
  const sliders = [];
  for (let index = 1; index <= 4; index++) {
    const key = `level${index}`;
    const slider = mountCompactSlider(get(`cv-mix-${key}`), { label: `In ${index}`, min: 0, max: 1,
      step: .01, value: state[key], style: { colour: '#c084fc', bg: '#150f22' } });
    slider.onChange(value => { state[key] = value; send(ids[key], value); paint(); });
    sliders.push(slider);
  }
  const offset = mountCompactSlider(get('cv-mix-offset'), { label: 'Offset', min: -1, max: 1,
    step: .01, value: 0, bidirectional: true, style: { colour: '#a855f7', bg: '#150f22' } });
  offset.onChange(value => { state.offset = value; send(ids.offset, value); paint(); });
  for (let index = 1; index <= 4; index++) {
    const key = `source${index}`, source = get(`cv-mix-${key}`);
    for (let slot = 0; slot < 4; slot++) {
      for (const [port, name] of ['OUT', 'INV', 'UNI', 'EOC'].entries()) {
        source.add(new Option(`LFO ${slot + 1} ${name}`, String(slot * 4 + port)));
      }
    }
    for (const [id, label] of [['16', 'ATV / Bias OUT'], ['17', 'Slew OUT'],
      ['18', 'Sample Hold OUT'], ['19', 'Sample Hold INV'], ['20', 'Compare GATE'],
      ['21', 'Compare TRIG']]) source.add(new Option(label, id));
    source.addEventListener('change', () => { state[key] = Number(source.value); send(ids[key], state[key]); });
  }

  function paint() {
    const canvas = get('cv-mix-preview'), ctx = canvas.getContext('2d');
    const w = 212, h = 46, left = 8, right = w - 8, top = 12, bottom = h - 10;
    const gap = 6, barW = Math.max(8, Math.floor((right - left - gap * 4) / 5));
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#140f22'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c084fc16'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(Math.round(w * i / 4), 0); ctx.lineTo(Math.round(w * i / 4), h);
      ctx.moveTo(0, Math.round(h * i / 4)); ctx.lineTo(w, Math.round(h * i / 4)); ctx.stroke();
    }
    for (let index = 0; index < 5; index++) {
      const value = index === 4 ? output : inputs[index] * state[`level${index + 1}`];
      const height = Math.max(2, Math.floor((bottom - top) * Math.max(0, Math.min(1, (value + 1) * .5))));
      ctx.fillStyle = index === 4 ? '#fff' : '#c084fcb4';
      ctx.beginPath(); ctx.roundRect(left + index * (barW + gap), bottom - height, barW, height, 3); ctx.fill();
    }
    ctx.fillStyle = '#c084fc'; ctx.font = '9px sans-serif'; ctx.fillText(`out ${signed(output)}`, 4, 10);
    get('cv-mix-status').textContent = `Levels ${[1, 2, 3, 4].map(index => Math.round(state[`level${index}`] * 100)).join(' / ')}`;
    get('cv-mix-values').textContent = `Out ${signed(output)}  •  Inv ${signed(-output)}`;
    sliders.forEach(slider => slider.paint()); offset.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() { for (const [key, id] of Object.entries(ids)) send(id, state[key]); },
    restore(saved) {
      Object.assign(state, saved);
      sliders.forEach((slider, index) => slider.setValue(state[`level${index + 1}`]));
      offset.setValue(state.offset);
      for (let index = 1; index <= 4; index++) get(`cv-mix-source${index}`).value = String(state[`source${index}`]);
      this.sendState(); paint();
    },
    setStatus(data) {
      inputs = data.inputs; output = data.output;
      if (!get('midisynth-panel').hidden) paint();
    },
  };
}
