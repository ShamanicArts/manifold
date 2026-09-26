import './style.css';
import filterProject from '../../projects/standalone-filter/project.json';
import crossfaderProject from '../../projects/crossfader/project.json';
import mixerProject from '../../projects/mixer/project.json';
import voiceProject from '../../projects/voice-synth/project.json';
import oscillatorProject from '../../projects/oscillator/project.json';
import adsrProject from '../../projects/adsr/project.json';
import noiseProject from '../../projects/noise/project.json';
import patchProject from '../../projects/synth-patch/project.json';
import { BrowserAudioHost } from './audio/browser-host.js';
import { initializeReferenceLab } from './reference/comparison.js';
import { drawLiveSpectrum } from './reference/plots.js';

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
    description: 'Mix a pitched oscillator with colored noise, then shape both with an envelope and lowpass filter. This is the first authored multi-primitive instrument graph.',
    signal: 'Audio path: oscillator + noise → ADSR → SVF → output',
  },
};
const initial = new URL(location.href).searchParams.get('primitive');
let activeFamily = Object.hasOwn(projects, initial) ? initial : 'svf';
let values = new Map();
const audio = new BrowserAudioHost((message) => { status.textContent = message; });

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

  const isLog = parameter.hostId === 'cutoff' || parameter.hostId === 'frequency';
  const precision = parameter.unit === 's' ? 1000 : 100;
  const toPhysical = (position) => isLog
    ? Math.round(parameter.min * (parameter.max / parameter.min) ** (position / 1000))
    : Math.round((parameter.min + (parameter.max - parameter.min) * position / 1000) * precision) / precision;
  const toPosition = (value) => isLog
    ? 1000 * Math.log(value / parameter.min) / Math.log(parameter.max / parameter.min)
    : 1000 * (value - parameter.min) / (parameter.max - parameter.min);
  const format = (value) => parameter.unit === 'Hz'
    ? `${Math.round(value).toLocaleString()} Hz`
    : parameter.unit === 's' ? `${Number(value).toFixed(3)} s` : Number(value).toFixed(2);
  const sync = (position, publish) => {
    const value = toPhysical(position);
    input.value = String(Math.round(position));
    wrapper.style.setProperty('--fill', `${position / 10}%`);
    readout.value = format(value);
    values.set(parameter.id, value);
    if (publish) audio.setParameter(parameter.id, value);
  };
  sync(toPosition(parameter.default), false);
  input.addEventListener('input', () => sync(Number(input.value), true));
  wrapper.addEventListener('dblclick', () => sync(toPosition(parameter.default), true));
  wrapper.append(title, readout, input);
  byId('controls').appendChild(wrapper);
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

function renderPrimitive(family) {
  const { project, title, description, signal } = projects[family];
  const isInstrument = project.signal.inputSource === 'none';
  activeFamily = family;
  values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
  byId('module-title').textContent = title;
  byId('module-description').textContent = description;
  byId('signal-path').textContent = signal;
  document.querySelector('.panel-note').textContent = `Post ${title.toLowerCase()}`;
  document.querySelectorAll('[data-primitive]').forEach((button) => {
    button.setAttribute('aria-current', button.dataset.primitive === family ? 'page' : 'false');
  });
  byId('modes').replaceChildren();
  byId('controls').replaceChildren();
  const mode = project.parameters.find((parameter) => parameter.kind === 'choice');
  byId('mode-section').hidden = !mode;
  byId('mode-label').textContent = family === 'voice' || family === 'oscillator' || family === 'patch' ? 'Waveform' : 'Mode';
  byId('input-label').textContent = isInstrument ? 'Instrument' : 'Live input';
  byId('keyboard-section').hidden = family !== 'voice';
  if (mode) {
    byId('modes').style.gridTemplateColumns = `repeat(${mode.choices.length}, minmax(0, 1fr))`;
    const buttons = mode.choices.map((choice, value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = family === 'svf' ? ['LP', 'BP', 'HP', 'Notch'][value] : choice;
      button.setAttribute('aria-label', choice);
      button.setAttribute('aria-pressed', String(value === mode.default));
      button.addEventListener('click', () => {
        values.set(mode.id, value);
        audio.setParameter(mode.id, value);
        buttons.forEach((item, index) => item.setAttribute('aria-pressed', String(index === value)));
      });
      byId('modes').appendChild(button);
      return button;
    });
  }
  for (const parameter of project.parameters.filter((item) => item.kind !== 'choice')) {
    if (parameter.kind === 'gate') addGate(parameter);
    else addSlider(parameter);
  }
  byId('source').hidden = isInstrument;
  toggle.textContent = isInstrument ? 'Start instrument' : 'Start audio';
  document.querySelector('.measurement-hint').textContent = family === 'voice'
    ? 'Start the instrument and play notes to view its output spectrum. The timing cases below run offline.'
    : family === 'oscillator' || family === 'adsr' || family === 'noise' || family === 'patch'
      ? `Start the instrument to view its spectrum. The ${family === 'patch' ? 'native Rust' : 'C++'} comparisons below run offline.`
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
function noteOn(note) {
  if (activeFamily !== 'voice' || !audio.running || pressedNotes.has(note)) return;
  pressedNotes.add(note);
  keyButtons.get(note)?.setAttribute('aria-pressed', 'true');
  audio.sendEvent(1, 0, note, 100);
}
function noteOff(note) {
  if (!pressedNotes.delete(note)) return;
  keyButtons.get(note)?.setAttribute('aria-pressed', 'false');
  audio.sendEvent(1, 1, note);
}
function releaseAllNotes() {
  if (pressedNotes.size && audio.running) audio.sendEvent(1, 2);
  pressedNotes.clear();
  for (const button of keyButtons.values()) button.setAttribute('aria-pressed', 'false');
}
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
const animateSpectrum = () => {
  drawLiveSpectrum(byId('live-spectrum'), audio.analyser);
  spectrumFrame = audio.running ? requestAnimationFrame(animateSpectrum) : null;
};
drawLiveSpectrum(byId('live-spectrum'), null);
toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  try {
    if (audio.running) { releaseAllNotes(); await audio.stop(); }
    else await audio.start(byId('source').value, values, projects[activeFamily].project);
    const isInstrument = projects[activeFamily].project.signal.inputSource === 'none';
    toggle.textContent = audio.running
      ? isInstrument ? 'Stop instrument' : 'Stop audio'
      : isInstrument ? 'Start instrument' : 'Start audio';
    document.querySelector('.measurement-hint').textContent = audio.running
      ? activeFamily === 'voice' ? 'Spectrum of played notes.' : activeFamily === 'oscillator' || activeFamily === 'adsr' || activeFamily === 'noise' || activeFamily === 'patch' ? 'Spectrum of the instrument.' : 'Spectrum of the processed live input.'
      : activeFamily === 'voice'
        ? 'Start the instrument and play notes to view its output spectrum. The timing cases below run offline.'
        : activeFamily === 'oscillator' || activeFamily === 'adsr' || activeFamily === 'noise' || activeFamily === 'patch'
          ? `Start the instrument to view its spectrum. The ${activeFamily === 'patch' ? 'native Rust' : 'C++'} comparisons below run offline.`
        : 'Start audio to view the output spectrum. The reference cases below run offline.';
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
