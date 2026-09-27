import { mountCompactSlider } from './compact-slider.js';

// Main/ui/behaviors/envelope.lua draws a 0.5 s sustain hold between decay and release.
export function mountMainAdsr(get, parameter, ids) {
  const specs = [
    ['attack', 'Attack', 1, 5000, 50],
    ['decay', 'Decay', 1, 5000, 200],
    ['sustain', 'Sustain', 0, 100, 70],
    ['release', 'Release', 1, 10000, 400],
  ];
  const values = { attack: 50, decay: 200, sustain: 70, release: 400 };
  const sliders = {};
  for (const [name, label, min, max, initial] of specs) {
    sliders[name] = mountCompactSlider(get(`adsr-${name}`), {
      label, min, max, step: 1, value: initial,
      style: { colour: '#fda4af', bg: '#2b141b' },
    });
    sliders[name].onChange(value => {
      values[name] = value;
      parameter(ids[name], name === 'sustain' ? value / 100 : value / 1000);
      paint();
    });
  }

  const canvas = get('adsr-graph');
  const ctx = canvas.getContext('2d');
  const w = 204, h = 122, pad = 6, top = 22, bottom = 116;
  function points() {
    const attack = values.attack / 1000, decay = values.decay / 1000;
    const release = values.release / 1000;
    const total = attack + decay + .5 + release;
    const graphW = w - pad * 2;
    const ax = pad + Math.floor(attack / total * graphW);
    const dx = ax + Math.floor(decay / total * graphW);
    const sx = dx + Math.floor(.5 / total * graphW);
    const sy = top + Math.floor((1 - values.sustain / 100) * (bottom - top));
    return [{ x: pad, y: bottom }, { x: ax, y: top },
      { x: dx, y: sy }, { x: sx, y: sy }, { x: w - pad, y: bottom }];
  }

  function paint() {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1f2b4d'; ctx.lineWidth = 1;
    for (let index = 1; index < 4; index++) {
      ctx.beginPath(); ctx.moveTo(index * w / 4 + .5, 0); ctx.lineTo(index * w / 4 + .5, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, index * h / 4 + .5); ctx.lineTo(w, index * h / 4 + .5); ctx.stroke();
    }
    ctx.fillStyle = '#fda4af'; ctx.font = '11px sans-serif'; ctx.fillText('ADSR', 4, 12);
    const path = points();
    ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 2; ctx.beginPath();
    path.forEach(({ x, y }, index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    for (let index = 1; index <= 3; index++) {
      ctx.fillStyle = '#0a0a1a'; ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(path[index].x, path[index].y, 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  let drag = -1;
  canvas.addEventListener('pointerdown', event => {
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) * w / box.width;
    const y = (event.clientY - box.top) * h / box.height;
    const path = points();
    for (let index = 1; index <= 3; index++) {
      if (Math.hypot(x - path[index].x, y - path[index].y) <= 12) {
        drag = index; canvas.setPointerCapture(event.pointerId); break;
      }
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (drag < 0) return;
    const box = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(w - pad - 1, (event.clientX - box.left) * w / box.width - pad));
    const y = Math.max(top, Math.min(bottom, (event.clientY - box.top) * h / box.height));
    const graphW = w - pad * 2, fraction = Math.min(.98, x / graphW);
    const attack = values.attack / 1000, decay = values.decay / 1000;
    const release = values.release / 1000;
    if (drag === 1) sliders.attack.setValue(Math.round(1000 * fraction * (decay + .5 + release) / (1 - fraction)), true);
    if (drag === 2) sliders.decay.setValue(Math.round(1000 * (fraction * (.5 + release) / (1 - fraction) - attack)), true);
    if (drag === 3) sliders.sustain.setValue(Math.round(100 * (1 - (y - top) / (bottom - top))), true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, () => { drag = -1; });
  }
  paint();
  return {
    paint() { paint(); Object.values(sliders).forEach(slider => slider.paint()); },
    snapshot() { return { ...values }; },
    restore(state) {
      for (const [name] of specs) {
        values[name] = state[name];
        sliders[name].setValue(state[name]);
      }
      paint();
      this.sendDefaults();
    },
    sendDefaults() {
      for (const [name] of specs) parameter(ids[name], name === 'sustain' ? values[name] / 100 : values[name] / 1000);
    },
  };
}
