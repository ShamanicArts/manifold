import './style.css';
import filterProject from '../../projects/standalone-filter/project.json';
import crossfaderProject from '../../projects/crossfader/project.json';
import mixerProject from '../../projects/mixer/project.json';
import voiceProject from '../../projects/voice-synth/project.json';
import oscillatorProject from '../../projects/oscillator/project.json';
import adsrProject from '../../projects/adsr/project.json';
import noiseProject from '../../projects/noise/project.json';
import patchProject from '../../projects/synth-patch/project.json';
import modulationProject from '../../projects/modulated-gain/project.json';
import distortionProject from '../../projects/distortion/project.json';
import stereoDelayProject from '../../projects/stereo-delay/project.json';
import fxChainProject from '../../projects/fx-chain/project.json';
import standaloneFxProject from '../../projects/standalone-fx-slice/project.json';
import loopCaptureProject from '../../projects/loop-capture/project.json';
import spectrumAnalyzerProject from '../../projects/spectrum-analyzer/project.json';
import { BrowserAudioHost } from './audio/browser-host.js';
import { BrowserMidiInput, midiAvailability } from './audio/midi-input.js';
import { initializeReferenceLab } from './reference/comparison.js';
import { drawLiveSpectrum, drawTransferCurve } from './reference/plots.js';

const byId = (id) => document.getElementById(id);
const status = byId('status');
const toggle = byId('audio-toggle');
const projects = {
  svf: {
    project: filterProject,
    title: 'SVF filter',
    description: 'Four filter modes with smoothed cutoff and resonance. This is the first slice of the historical Standalone Filter project.',
    signal: 'Live path: input → SVF → output',
  },
  crossfader: {
    project: crossfaderProject,
    title: 'Crossfader',
    description: 'Move between two stereo signals. Choose linear or equal power behavior, then blend the result with the dry input.',
    signal: 'Live path: input ↘ A · input → lowpass → B · A/B → output',
  },
  mixer: {
    project: mixerProject,
    title: 'Mixer',
    description: 'Sum stereo buses with independent gain and equal-power pan, then apply a smoothed master level. The graph supports up to 32 buses.',
    signal: 'Live path: input → bus A · input → lowpass → bus B · mixer → output',
  },
  voice: {
    project: voiceProject,
    title: 'Voice synth',
    description: 'An eight voice Rust instrument with note events at audio sample offsets. Sine, saw, square and triangle share an attack, decay, sustain and release envelope.',
    signal: 'Event path: keyboard → timed note → voice synth → output',
  },
  oscillator: {
    project: oscillatorProject,
    title: 'Oscillator',
    description: 'The original standard waveform generator, ported to Rust with frequency and amplitude smoothing. This view covers five scalar modes.',
    signal: 'Audio path: oscillator → stereo output',
  },
  adsr: {
    project: adsrProject,
    title: 'ADSR envelope',
    description: 'Shape a stereo signal with attack, decay, sustain and release. The Rust gate also releases during attack or decay.',
    signal: 'Audio path: oscillator → ADSR → stereo output',
  },
  noise: {
    project: noiseProject,
    title: 'Noise generator',
    description: 'Seeded stereo noise with a level control and a color filter from bright to dark.',
    signal: 'Audio path: noise → stereo output',
  },
  patch: {
    project: patchProject,
    title: 'Synth patch',
    description: 'Mix a pitched oscillator with colored noise, shape both with an envelope, then sweep the lowpass filter with a Rust LFO.',
    signal: 'Audio: oscillator + noise → ADSR → SVF → output · CV: LFO → cutoff',
  },
  modulation: {
    project: modulationProject,
    title: 'LFO modulation',
    description: 'An audio oscillator passes through a gain controlled at sample rate by a separate bipolar LFO signal. Set the base gain and modulation depth independently.',
    signal: 'Audio: oscillator → gain → output · CV: LFO → gain depth',
  },
  distortion: {
    project: distortionProject,
    title: 'Distortion',
    description: 'Shape stereo audio with a smoothed drive, a dry/wet blend, and output gain. The final signal is clamped to the audio range.',
    signal: 'Live path: input → distortion → stereo output',
  },
  'fx-chain': {
    project: fxChainProject,
    title: 'FX chain',
    description: 'An authored v2 project combining distortion, stereo delay, and a filtered branch. Each stage has its own editable mix.',
    signal: 'Live path: input → distortion → stereo delay → filter blend → output',
  },
  'standalone-fx': {
    project: standaloneFxProject,
    title: 'Standalone FX slice',
    description: 'A swappable effects slot using the original type IDs and normalized controls. SVF Filter and Stereo Delay are available in this slice.',
    signal: 'Live path: input → selected effect → dry/wet mix → output',
  },
  'loop-capture': {
    project: loopCaptureProject,
    title: 'Loop capture',
    description: 'Record up to two seconds of stereo input, then play it as a loop. Reverse, change speed, or overdub new sound.',
    signal: 'Live path: input → bounded capture / loop playback → output',
  },
  'spectrum-analyzer': {
    project: spectrumAnalyzerProject,
    title: 'Spectrum analyzer',
    description: 'Eight smoothed band estimates from the original Manifold analyzer. Stereo audio passes through unchanged. These bands are one-pole envelopes, not FFT bins.',
    signal: 'Live path: input → unchanged output · meter tap → eight band estimates',
  },
  'stereo-delay': {
    project: stereoDelayProject,
    title: 'Stereo delay',
    description: 'Two fractional delay taps with feedback, crossfeed, tempo divisions, a feedback lowpass, ducking, and freeze.',
    signal: 'Live path: input → stereo delay → output · feedback recirculates in prepared buffers',
  },
};
const initial = new URL(location.href).searchParams.get('primitive');
let activeFamily = Object.hasOwn(projects, initial) ? initial : 'svf';
let values = new Map();
let slotValuesByType = new Map();
let loopHasTake = false;
const audio = new BrowserAudioHost((message) => { status.textContent = message; }, (nodeId, bands) => {
  if (nodeId !== 2 || activeFamily !== 'spectrum-analyzer') return;
  const scale = Math.max(0.05, Math.max(...bands.filter(Number.isFinite)) * 1.2);
  [...byId('live-bands').children].forEach((row, index) => {
    const value = Number.isFinite(bands[index]) ? Math.max(0, Math.min(1, bands[index])) : 0;
    row.querySelector('.live-band-fill').style.width = `${Math.min(100, value / scale * 100)}%`;
    row.querySelector('output').textContent = value.toFixed(3);
  });
});
for (let band = 0; band < 8; band++) {
  const row = document.createElement('div');
  row.className = 'live-band';
  const label = document.createElement('span');
  label.textContent = String(band + 1);
  const track = document.createElement('div');
  track.className = 'live-band-track';
  const fill = document.createElement('span');
  fill.className = 'live-band-fill';
  track.appendChild(fill);
  const value = document.createElement('output');
  value.textContent = '0.000';
  row.append(label, track, value);
  byId('live-bands').appendChild(row);
}

function updateCutoffRange() {
  const target = byId('cutoff-range');
  if (!target) return;
  const base = values.get(10);
  const depth = Math.abs(values.get(14));
  const low = Math.max(20, Math.round(base - depth));
  const high = Math.min(20000, Math.round(base + depth));
  target.textContent = `Cutoff target: ${low.toLocaleString()}–${high.toLocaleString()} Hz, then 20 ms smoothing.`;
}

function updateTransferCurve() {
  const canvas = byId('transfer-curve');
  if (canvas) drawTransferCurve(canvas, values.get(0), values.get(1), values.get(2));
}
window.addEventListener('resize', updateTransferCurve);

function addSlider(parameter) {
  const wrapper = document.createElement('label');
  wrapper.className = 'compact-slider';
  const title = document.createElement('span');
  title.textContent = parameter.label;
  const readout = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1000';
  input.step = '1';
  input.setAttribute('aria-label', parameter.label);

  const isLog = parameter.hostId === 'cutoff' || parameter.hostId === 'frequency' || parameter.hostId === 'rate';
  const precision = parameter.unit === 's' ? 1000 : 100;
  const toPhysical = (position) => isLog
    ? Math.round(parameter.min * (parameter.max / parameter.min) ** (position / 1000) * (parameter.hostId === 'rate' ? 100 : 1)) / (parameter.hostId === 'rate' ? 100 : 1)
    : Math.round((parameter.min + (parameter.max - parameter.min) * position / 1000) * precision) / precision;
  const toPosition = (value) => isLog
    ? 1000 * Math.log(value / parameter.min) / Math.log(parameter.max / parameter.min)
    : 1000 * (value - parameter.min) / (parameter.max - parameter.min);
  const format = (value) => parameter.unit === 'Hz'
    ? parameter.hostId === 'rate' ? `${Number(value).toFixed(2)} Hz` : `${Math.round(value).toLocaleString()} Hz`
    : parameter.unit === 's' ? `${Number(value).toFixed(3)} s` : Number(value).toFixed(2);
  const sync = (position, publish) => {
    const value = toPhysical(position);
    input.value = String(Math.round(position));
    wrapper.style.setProperty('--fill', `${position / 10}%`);
    readout.value = format(value);
    values.set(parameter.id, value);
    if (activeFamily === 'standalone-fx') updateSlotControls();
    if (publish) audio.setParameter(parameter.id, value);
    if (publish) updateCutoffRange();
    if (publish) updateTransferCurve();
  };
  wrapper.dataset.parameterId = String(parameter.id);
  wrapper.syncValue = (value) => sync(toPosition(value), false);
  sync(toPosition(parameter.default), false);
  input.addEventListener('input', () => sync(Number(input.value), true));
  wrapper.addEventListener('dblclick', () => sync(toPosition(parameter.default), true));
  wrapper.append(title, readout, input);
  byId('controls').appendChild(wrapper);
}

function updateSlotControls() {
  if (activeFamily !== 'standalone-fx') return;
  const selected = values.get(0);
  const labels = selected === 6
    ? { 2: 'Filter cutoff', 3: 'Resonance', 4: 'Filter drive' }
    : { 2: 'Delay time', 3: 'Feedback' };
  for (let id = 2; id <= 6; id++) {
    const wrapper = byId('controls').querySelector(`[data-parameter-id="${id}"]`);
    if (!wrapper) continue;
    wrapper.hidden = !Object.hasOwn(labels, id);
    if (wrapper.hidden) continue;
    const value = values.get(id);
    wrapper.querySelector('span').textContent = labels[id];
    wrapper.querySelector('input').setAttribute('aria-label', labels[id]);
    wrapper.querySelector('output').value = selected === 6
      ? id === 2 ? `${Math.round(60 * (10000 / 60) ** value).toLocaleString()} Hz`
        : id === 3 ? (0.08 + 0.92 * value).toFixed(2) : (6 * value).toFixed(2)
      : id === 2 ? `${Math.round(40 + 740 * value)} / ${Math.round((40 + 740 * value) * 1.5)} ms`
        : (0.92 * value).toFixed(2);
  }
}

function addGate(parameter) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gate-button';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'Open gate';
  button.addEventListener('click', () => {
    const next = values.get(parameter.id) ? 0 : 1;
    values.set(parameter.id, next);
    audio.setParameter(parameter.id, next);
    button.setAttribute('aria-pressed', String(next === 1));
    button.textContent = next ? 'Close gate' : 'Open gate';
  });
  byId('controls').appendChild(button);
}

function addToggle(parameter) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gate-button';
  button.setAttribute('aria-pressed', String(parameter.default === 1));
  const render = () => { button.textContent = `${parameter.label}: ${values.get(parameter.id) ? 'On' : 'Off'}`; };
  button.dataset.parameterId = String(parameter.id);
  render();
  button.addEventListener('click', () => {
    const next = values.get(parameter.id) ? 0 : 1;
    values.set(parameter.id, next);
    audio.setParameter(parameter.id, next);
    if (activeFamily === 'loop-capture' && parameter.id === 0 && next === 1) {
      loopHasTake = false;
      for (const id of [1, 2]) {
        values.set(id, 0);
        audio.setParameter(id, 0);
      }
    }
    if (activeFamily === 'loop-capture' && parameter.id === 0 && next === 0) {
      loopHasTake = audio.running;
    }
    button.setAttribute('aria-pressed', String(next === 1));
    render();
    if (activeFamily === 'loop-capture') updateLoopToggles();
  });
  byId('controls').appendChild(button);
}

function updateLoopToggles() {
  if (activeFamily !== 'loop-capture') return;
  for (const id of [0, 1, 2, 4]) {
    const button = byId('controls').querySelector(`[data-parameter-id="${id}"]`);
    if (!button) continue;
    const label = projects['loop-capture'].project.parameters.find((parameter) => parameter.id === id).label;
    const on = Boolean(values.get(id));
    button.textContent = `${label}: ${on ? 'On' : 'Off'}`;
    button.setAttribute('aria-pressed', String(on));
    button.disabled = (id === 1 || id === 2) && (Boolean(values.get(0)) || !loopHasTake);
  }
}

function addSelect(parameter) {
  const wrapper = document.createElement('label');
  wrapper.className = 'compact-select';
  const title = document.createElement('span');
  title.textContent = parameter.label;
  const select = document.createElement('select');
  select.setAttribute('aria-label', parameter.label);
  parameter.choices.forEach((choice, index) => select.add(new Option(choice, String(index))));
  select.value = String(parameter.default);
  select.addEventListener('change', () => {
    const value = Number(select.value);
    values.set(parameter.id, value);
    audio.setParameter(parameter.id, value);
  });
  wrapper.append(title, select);
  byId('controls').appendChild(wrapper);
}

function renderPrimitive(family) {
  const { project, title, description, signal } = projects[family];
  const isInstrument = project.signal.inputSource === 'none';
  activeFamily = family;
  values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
  if (family === 'standalone-fx') slotValuesByType = new Map([
    [6, [0.5, 0.4, 0.1, 0.5, 0.5]], [8, [0.3, 0.3, 0.5, 0.5, 0.5]],
  ]);
  if (family === 'loop-capture') loopHasTake = false;
  byId('module-title').textContent = title;
  const analyzerView = family === 'spectrum-analyzer';
  document.querySelector('.scope-wrap').hidden = analyzerView;
  document.querySelector('.axis-caption').hidden = analyzerView;
  byId('live-bands').hidden = !analyzerView;
  byId('module-description').textContent = description;
  byId('signal-path').textContent = signal;
  document.querySelector('.panel-note').textContent = analyzerView ? 'Eight band meter' : `Post ${title.toLowerCase()}`;
  document.querySelectorAll('[data-primitive]').forEach((button) => {
    button.setAttribute('aria-current', button.dataset.primitive === family ? 'page' : 'false');
  });
  byId('modes').replaceChildren();
  byId('controls').replaceChildren();
  const mode = project.parameters.find((parameter) => parameter.kind === 'choice');
  byId('mode-section').hidden = !mode;
  byId('mode-label').textContent = family === 'voice' || family === 'oscillator' || family === 'patch' || family === 'modulation' ? 'Waveform' : family === 'fx-chain' ? 'Filter mode' : family === 'stereo-delay' ? 'Time mode' : family === 'standalone-fx' ? 'Effect type' : 'Mode';
  byId('input-label').textContent = isInstrument ? 'Instrument' : 'Live input';
  byId('keyboard-section').hidden = family !== 'voice';
  if (mode) {
    byId('modes').style.gridTemplateColumns = `repeat(${mode.choices.length}, minmax(0, 1fr))`;
    const buttons = mode.choices.map((choice, index) => {
      const value = mode.choiceValues?.[index] ?? index;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = family === 'svf' ? ['LP', 'BP', 'HP', 'Notch'][value] : choice;
      button.setAttribute('aria-label', choice);
      button.setAttribute('aria-pressed', String(value === mode.default));
      button.addEventListener('click', () => {
        if (family === 'standalone-fx') {
          slotValuesByType.set(values.get(0), [2, 3, 4, 5, 6].map((id) => values.get(id)));
        }
        values.set(mode.id, value);
        audio.setParameter(mode.id, value);
        buttons.forEach((item, itemIndex) => item.setAttribute('aria-pressed', String(itemIndex === index)));
        if (family === 'standalone-fx') {
          const restored = slotValuesByType.get(value);
          [2, 3, 4, 5, 6].forEach((id, offset) => {
            values.set(id, restored[offset]);
            byId('controls').querySelector(`[data-parameter-id="${id}"]`)?.syncValue(restored[offset]);
            audio.setParameter(id, restored[offset]);
          });
          updateSlotControls();
        }
      });
      byId('modes').appendChild(button);
      return button;
    });
  }
  for (const parameter of project.parameters.filter((item) => item.kind !== 'choice')) {
    if (parameter.kind === 'gate') addGate(parameter);
    else if (parameter.kind === 'toggle') addToggle(parameter);
    else if (parameter.kind === 'select') addSelect(parameter);
    else addSlider(parameter);
  }
  updateSlotControls();
  updateLoopToggles();
  if (family === 'loop-capture') {
    const help = document.createElement('p');
    help.className = 'control-help';
    help.textContent = 'Start audio, record a phrase, stop recording, then turn Play on. The input remains audible while recording.';
    byId('controls').appendChild(help);
  }
  if (family === 'stereo-delay') {
    const help = document.createElement('p');
    help.className = 'control-help';
    help.textContent = '¹ The original delay exposes resonance but its feedback filter uses one pole, so resonance has no audible effect.';
    byId('controls').appendChild(help);
  }
  if (family === 'patch') {
    const range = document.createElement('p');
    range.id = 'cutoff-range';
    range.className = 'control-help';
    byId('controls').appendChild(range);
    updateCutoffRange();
  }
  if (family === 'distortion') {
    const label = document.createElement('p');
    label.className = 'control-help';
    label.textContent = 'Transfer curve · input −1 to +1';
    const curve = document.createElement('canvas');
    curve.id = 'transfer-curve';
    curve.className = 'transfer-curve';
    curve.setAttribute('aria-label', 'Distortion transfer curve');
    byId('controls').append(label, curve);
    updateTransferCurve();
  }
  byId('source').hidden = isInstrument;
  toggle.textContent = isInstrument ? 'Start instrument' : 'Start audio';
  document.querySelector('.measurement-hint').textContent = family === 'voice'
    ? 'Start the instrument and play notes to view its output spectrum. The timing cases below run offline.'
    : family === 'oscillator' || family === 'adsr' || family === 'noise' || family === 'patch' || family === 'modulation'
      ? `Start the instrument to view its spectrum. The ${family === 'patch' || family === 'modulation' ? 'native Rust' : 'C++'} comparisons below run offline.`
    : analyzerView ? 'Start audio to see the original eight band meter. Bars scale to the current peak; numbers are normalized 0–1 values.'
    : 'Start audio to view the output spectrum. The reference cases below run offline.';
  if (family === 'svf') {
    const help = document.createElement('p');
    help.className = 'control-help';
    help.textContent = 'Legacy DSP caps resonance at 1.00, although its control reaches 2.00.';
    byId('controls').appendChild(help);
  }
}

const keyboardNotes = [
  ['C', 60, 'a'], ['C♯', 61, 'w'], ['D', 62, 's'], ['D♯', 63, 'e'],
  ['E', 64, 'd'], ['F', 65, 'f'], ['F♯', 66, 't'], ['G', 67, 'g'],
  ['G♯', 68, 'y'], ['A', 69, 'h'], ['A♯', 70, 'u'], ['B', 71, 'j'],
];
const keyButtons = new Map();
const pressedNotes = new Set();
const midiHeld = new Map();
const heldByAnotherDevice = (key, deviceId) => [...midiHeld].some(([id, notes]) => id !== deviceId && notes.has(key));
function noteOn(note) {
  if (activeFamily !== 'voice' || !audio.running || pressedNotes.has(note)) return;
  pressedNotes.add(note);
  keyButtons.get(note)?.setAttribute('aria-pressed', 'true');
  audio.sendEvent(1, 0, note, 100, 0, 15);
}
function noteOff(note) {
  if (!pressedNotes.delete(note)) return;
  keyButtons.get(note)?.setAttribute('aria-pressed', 'false');
  audio.sendEvent(1, 1, note, 0, 0, 15);
}
function releaseAllNotes() {
  if ((pressedNotes.size || midiHeld.size) && audio.running) audio.sendEvent(1, 2);
  pressedNotes.clear();
  midiHeld.clear();
  for (const button of keyButtons.values()) button.setAttribute('aria-pressed', 'false');
}
function releaseDevice(deviceId) {
  const held = midiHeld.get(deviceId);
  if (!held) return;
  if (audio.running && activeFamily === 'voice') {
    for (const key of held) {
      const [channel, note] = key.split(':').map(Number);
      if (!heldByAnotherDevice(key, deviceId)) audio.sendEvent(1, 1, note, 0, 0, channel);
    }
  }
  midiHeld.delete(deviceId);
}
function receiveMidiNote(deviceId, kind, channel, note, velocity) {
  if (activeFamily !== 'voice' || !audio.running) return;
  let held = midiHeld.get(deviceId);
  if (!held) { held = new Set(); midiHeld.set(deviceId, held); }
  const key = `${channel}:${note}`;
  if (kind === 'on' && !held.has(key)) {
    const alreadyHeld = heldByAnotherDevice(key, deviceId);
    held.add(key);
    if (!alreadyHeld) audio.sendEvent(1, 0, note, velocity, 0, channel);
  } else if (kind === 'off' && held.delete(key)) {
    if (!heldByAnotherDevice(key, deviceId)) audio.sendEvent(1, 1, note, 0, 0, channel);
  }
  if (!held.size) midiHeld.delete(deviceId);
}
const midiToggle = byId('midi-toggle');
const midiInput = new BrowserMidiInput(receiveMidiNote, releaseDevice, (message) => {
  byId('midi-status').textContent = message;
});
const midiUnavailable = midiAvailability();
if (midiUnavailable) {
  midiToggle.disabled = true;
  byId('midi-status').textContent = `${midiUnavailable} The on-screen keyboard still works.`;
}
midiToggle.addEventListener('click', async () => {
  midiToggle.disabled = true;
  if (midiInput.listening) midiInput.stop();
  else await midiInput.connect();
  midiToggle.textContent = midiInput.listening ? 'Stop MIDI input' : 'Connect MIDI input';
  midiToggle.disabled = Boolean(midiAvailability());
});
for (const [label, note, shortcut] of keyboardNotes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = label.includes('♯') ? 'black-key' : 'white-key';
  button.textContent = label;
  button.setAttribute('aria-label', `${label}4 · ${shortcut.toUpperCase()}`);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    noteOn(note);
  });
  button.addEventListener('pointerup', () => noteOff(note));
  button.addEventListener('pointercancel', () => noteOff(note));
  byId('keyboard').appendChild(button);
  keyButtons.set(note, button);
}
const shortcutToNote = new Map(keyboardNotes.map(([, note, shortcut]) => [shortcut, note]));
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.target.matches('input, select')) return;
  const note = shortcutToNote.get(event.key.toLowerCase());
  if (note !== undefined && activeFamily === 'voice') { event.preventDefault(); noteOn(note); }
});
document.addEventListener('keyup', (event) => {
  const note = shortcutToNote.get(event.key.toLowerCase());
  if (note !== undefined && activeFamily === 'voice') noteOff(note);
});

let referenceLab;
async function selectPrimitive(family, updateUrl = true) {
  if (!Object.hasOwn(projects, family)) return;
  releaseAllNotes();
  if (audio.running) {
    await audio.stop();
    toggle.textContent = 'Start audio';
  }
  renderPrimitive(family);
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('primitive', family);
    history.pushState({ primitive: family }, '', url);
  }
  referenceLab?.selectFamily(family);
  drawLiveSpectrum(byId('live-spectrum'), null);
}

renderPrimitive(activeFamily);
document.querySelectorAll('[data-primitive]').forEach((button) => {
  button.addEventListener('click', () => selectPrimitive(button.dataset.primitive).catch((error) => { status.textContent = String(error); }));
});
window.addEventListener('popstate', () => {
  const family = new URL(location.href).searchParams.get('primitive');
  selectPrimitive(Object.hasOwn(projects, family) ? family : 'svf', false).catch((error) => { status.textContent = String(error); });
});

let spectrumFrame = null;
let lastMeterRequest = 0;
const animateSpectrum = () => {
  if (activeFamily === 'spectrum-analyzer') {
    const now = performance.now();
    if (audio.running && now - lastMeterRequest >= 100) {
      audio.requestMeters(2);
      lastMeterRequest = now;
    }
  } else drawLiveSpectrum(byId('live-spectrum'), audio.analyser);
  spectrumFrame = audio.running ? requestAnimationFrame(animateSpectrum) : null;
};
drawLiveSpectrum(byId('live-spectrum'), null);
toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  try {
    if (audio.running) {
      releaseAllNotes(); await audio.stop();
      if (activeFamily === 'loop-capture') {
        loopHasTake = false;
        for (const id of [0, 1, 2]) values.set(id, 0);
        updateLoopToggles();
      }
    }
    else await audio.start(byId('source').value, values, projects[activeFamily].project);
    const isInstrument = projects[activeFamily].project.signal.inputSource === 'none';
    toggle.textContent = audio.running
      ? isInstrument ? 'Stop instrument' : 'Stop audio'
      : isInstrument ? 'Start instrument' : 'Start audio';
    document.querySelector('.measurement-hint').textContent = audio.running
      ? activeFamily === 'spectrum-analyzer' ? 'Legacy eight band estimates; bars scale to the current peak, numbers are normalized 0–1. Audio passes through unchanged.' : activeFamily === 'voice' ? 'Spectrum of played notes.' : activeFamily === 'oscillator' || activeFamily === 'adsr' || activeFamily === 'noise' || activeFamily === 'patch' || activeFamily === 'modulation' ? 'Spectrum of the instrument.' : 'Spectrum of the processed live input.'
      : activeFamily === 'voice'
        ? 'Start the instrument and play notes to view its output spectrum. The timing cases below run offline.'
        : activeFamily === 'oscillator' || activeFamily === 'adsr' || activeFamily === 'noise' || activeFamily === 'patch' || activeFamily === 'modulation'
          ? `Start the instrument to view its spectrum. The ${activeFamily === 'patch' || activeFamily === 'modulation' ? 'native Rust' : 'C++'} comparisons below run offline.`
        : activeFamily === 'spectrum-analyzer' ? 'Start audio to see the original eight band meter. C++ meter snapshots are compared below.' : 'Start audio to view the output spectrum. The reference cases below run offline.';
    if (spectrumFrame) cancelAnimationFrame(spectrumFrame);
    animateSpectrum();
  } catch (error) {
    status.textContent = String(error);
    toggle.textContent = projects[activeFamily].project.signal.inputSource === 'none' ? 'Start instrument' : 'Start audio';
  } finally {
    toggle.disabled = false;
  }
});

initializeReferenceLab(activeFamily).then((lab) => { referenceLab = lab; referenceLab.selectFamily(activeFamily); }).catch((error) => {
  byId('reference-status').textContent = `Reference unavailable: ${String(error)}`;
  byId('reference-meta').textContent = 'Run the reference generation script to create fixture files.';
});
