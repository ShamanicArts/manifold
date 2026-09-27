// Main/ui/components/fx_slot.ui.lua and behaviors/fx_slot.lua, wide 472×208 layout.
import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';
import { DEFAULTS, FX_OPTIONS, LABELS, VISUAL_NAMES } from './fx-slot-data.js';

const clamp = value => Math.max(0, Math.min(1, value));
const colors = ['#4ade80', '#22d3ee', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24'];
const backgrounds = ['#102317', '#08212a', '#0b1c2e', '#1e1b33', '#2b1020', '#2b2008'];

export function mountMainFxSlot(root, parameter, base) {
  const prefix = root.id;
  root.innerHTML = `<canvas class="fx-pad" width="452" height="376" aria-label="${prefix} XY pad"></canvas>
    <div class="fx-visual-dots" hidden><button type="button" data-mode="graph" aria-label="Filter graph">●</button><button type="button" data-mode="xy" aria-label="XY pad">●</button></div>
    <div class="fx-type" id="${prefix}-type"></div><span class="fx-x-label">X</span><div class="fx-x-drop" id="${prefix}-x"></div>
    <span class="fx-y-label">Y</span><div class="fx-y-drop" id="${prefix}-y"></div>
    <div class="fx-mix" id="${prefix}-mix"></div>${Array.from({ length: 5 }, (_, index) =>
      `<div class="fx-param" style="top:${86 + index * 22}px" id="${prefix}-p${index}"></div>`).join('')}`;
  const pad = root.querySelector('.fx-pad'), ctx = pad.getContext('2d');
  const dots = root.querySelector('.fx-visual-dots');
  const type = mountDropdown(root.querySelector('.fx-type'), { id: `${prefix}-type`, options: FX_OPTIONS,
    maxVisibleRows: 8, radius: 0, style: { bg: '#1e293b', colour: '#22d3ee' } }, root);
  const xDrop = mountDropdown(root.querySelector('.fx-x-drop'), { id: `${prefix}-x`, options: LABELS[0],
    maxVisibleRows: 6, radius: 0, style: { bg: '#1e293b', colour: '#64748b' } }, root);
  const yDrop = mountDropdown(root.querySelector('.fx-y-drop'), { id: `${prefix}-y`, options: LABELS[0],
    maxVisibleRows: 6, radius: 0, style: { bg: '#1e293b', colour: '#64748b' } }, root);
  const stored = DEFAULTS.map(values => [...values]);
  let selected = 0, xIndex = 0, yIndex = 1, mode = 'xy', dragging = false, mixValue = 0;
  const mix = mountCompactSlider(root.querySelector('.fx-mix'), { label: 'Mix', min: 0, max: 1,
    step: .01, value: 0, style: { colour: colors[0], bg: backgrounds[0] } });
  const sliders = Array.from({ length: 5 }, (_, index) => mountCompactSlider(
    root.querySelector(`#${prefix}-p${index}`), { label: LABELS[0][index] ?? '', min: 0, max: 1,
      step: .01, value: stored[0][index], style: { colour: colors[index + 1], bg: backgrounds[index + 1] } }));

  function value(index) { return stored[selected][index] ?? .5; }
  function paintPad() {
    const w = 226, h = 188, graph = (selected === 5 || selected === 6) && mode === 'graph';
    const accent = selected === 5 ? '#a78bfa' : selected === 6 ? '#4ade80' : '#22d3ee';
    const x = value(xIndex), y = value(yIndex);
    let markerY = (1 - y) * h;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1420'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1;
    if (graph) {
      for (const db of [-12, -6, 0, 6, 12]) {
        const yy = h * .5 - db / 14 * h * .45;
        ctx.strokeStyle = db === 0 ? '#1f2b4d' : '#1a1a3a';
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
      }
      const cutoff = 80 * 200 ** value(xIndex), reso = .1 + 1.9 * value(yIndex);
      const peakDb = Math.max(-14, Math.min(14, 20 * Math.log10(Math.max(.5, reso * 2))));
      markerY = Math.max(1, Math.min(h - 1, h * .5 - peakDb / 14 * h * .45));
      ctx.strokeStyle = `${accent}77`; ctx.beginPath(); ctx.moveTo(x * w, 0); ctx.lineTo(x * w, h); ctx.stroke();
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
      for (let index = 0; index <= 200; index++) {
        const frac = index / 200, freq = 80 * 200 ** frac, ratio = freq / cutoff;
        const q = Math.max(.5, reso * 2);
        const mag = ratio < .1 ? 1 : ratio > 10 ? 0 : 1 / Math.sqrt((1 - ratio * ratio) ** 2 + (ratio / q) ** 2);
        const db = Math.max(-14, Math.min(14, 20 * Math.log10(mag + 1e-10)));
        const yy = Math.max(1, Math.min(h - 1, h * .5 - db / 14 * h * .45));
        if (index) ctx.lineTo(frac * w, yy); else ctx.moveTo(0, yy);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#1a1a3a';
      for (let index = 1; index < 4; index++) {
        ctx.beginPath(); ctx.moveTo(w * index / 4, 0); ctx.lineTo(w * index / 4, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * index / 4); ctx.lineTo(w, h * index / 4); ctx.stroke();
      }
      ctx.fillStyle = `${accent}22`; ctx.fillRect(0, (1 - y) * h, x * w, y * h);
      ctx.strokeStyle = `${accent}88`; ctx.beginPath(); ctx.moveTo(x * w, 0); ctx.lineTo(x * w, h);
      ctx.moveTo(0, (1 - y) * h); ctx.lineTo(w, (1 - y) * h); ctx.stroke();
      ctx.fillStyle = `${accent}aa`; ctx.font = '9px sans-serif';
      ctx.fillText(`${LABELS[selected][xIndex] ?? 'X'}: ${Math.round(x * 100)}%`, 4, h - 5);
      ctx.fillText(`${LABELS[selected][yIndex] ?? 'Y'}: ${Math.round(y * 100)}%`, w * .5, 12);
    }
    ctx.fillStyle = accent; ctx.font = '11px sans-serif'; ctx.fillText(VISUAL_NAMES[selected], 4, 13);
    ctx.fillStyle = dragging ? accent : '#fff'; ctx.beginPath(); ctx.arc(x * w, markerY, dragging ? 8 : 6, 0, Math.PI * 2); ctx.fill();
  }
  function syncType() {
    const names = LABELS[selected];
    xIndex = Math.min(xIndex, names.length - 1); yIndex = Math.min(yIndex, names.length - 1);
    xDrop.setOptions(names); yDrop.setOptions(names);
    xDrop.setSelected(xIndex); yDrop.setSelected(yIndex);
    sliders.forEach((slider, index) => {
      slider.setLabel(names[index] ?? '');
      slider.setValue(value(index));
      root.querySelector(`#${prefix}-p${index}`).hidden = index >= names.length;
    });
    const hasGraph = selected === 5 || selected === 6;
    if (!hasGraph) mode = 'xy'; else mode = 'graph';
    dots.hidden = !hasGraph;
    paint();
  }
  function paint() {
    type.paint(); xDrop.paint(); yDrop.paint(); mix.paint();
    sliders.forEach(slider => slider.paint()); paintPad();
    for (const button of dots.querySelectorAll('button')) button.classList.toggle('active', button.dataset.mode === mode);
  }
  type.onChange(index => {
    selected = index;
    parameter(base, selected);
    stored[selected].forEach((value, slot) => parameter(base + 2 + slot, value));
    syncType();
  });
  xDrop.onChange(index => { xIndex = index; paintPad(); });
  yDrop.onChange(index => { yIndex = index; paintPad(); });
  mix.onChange(value => { mixValue = value; parameter(base + 1, value); });
  sliders.forEach((slider, index) => slider.onChange(value => {
    stored[selected][index] = value;
    parameter(base + 2 + index, value);
    paintPad();
  }));
  dots.addEventListener('click', event => {
    if (!event.target.dataset.mode) return;
    mode = event.target.dataset.mode; paint();
  });
  function move(event) {
    const bounds = pad.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width);
    const y = clamp(1 - (event.clientY - bounds.top) / bounds.height);
    stored[selected][xIndex] = x; stored[selected][yIndex] = y;
    sliders[xIndex].setValue(x); sliders[yIndex].setValue(y);
    parameter(base + 2 + xIndex, x); parameter(base + 2 + yIndex, y);
    paintPad();
  }
  pad.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true; pad.setPointerCapture(event.pointerId); move(event);
  });
  pad.addEventListener('pointermove', event => { if (dragging) move(event); });
  for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(kind, () => { dragging = false; paintPad(); });
  syncType();
  return {
    paint,
    snapshot() { return { selected, mix: mixValue, parameters: stored.map(values => [...values]),
      xIndex, yIndex, mode }; },
    restore(state) {
      state.parameters.forEach((values, index) => { stored[index] = [...values]; });
      selected = state.selected; mixValue = state.mix;
      xIndex = state.xIndex; yIndex = state.yIndex;
      type.setSelected(selected); mix.setValue(mixValue);
      syncType(); mode = state.mode; paint(); this.sendDefaults();
    },
    sendDefaults() {
      parameter(base, selected);
      stored[selected].forEach((value, slot) => parameter(base + 2 + slot, value));
      parameter(base + 1, mixValue);
    },
  };
}
