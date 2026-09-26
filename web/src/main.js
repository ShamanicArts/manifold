import './style.css';
import filterProject from '../../projects/standalone-filter/project.json';
import crossfaderProject from '../../projects/crossfader/project.json';
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

  const isLog = parameter.hostId === 'cutoff';
  const toPhysical = (position) => isLog
    ? Math.round(parameter.min * (parameter.max / parameter.min) ** (position / 1000))
    : Math.round((parameter.min + (parameter.max - parameter.min) * position / 1000) * 100) / 100;
  const toPosition = (value) => isLog
    ? 1000 * Math.log(value / parameter.min) / Math.log(parameter.max / parameter.min)
    : 1000 * (value - parameter.min) / (parameter.max - parameter.min);
  const format = (value) => parameter.unit ? `${Math.round(value).toLocaleString()} Hz` : Number(value).toFixed(2);
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

function renderPrimitive(family) {
  const { project, title, description, signal } = projects[family];
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
  if (mode) {
    const buttons = mode.choices.map((choice, value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = ['LP', 'BP', 'HP', 'Notch'][value] ?? choice;
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
  for (const parameter of project.parameters.filter((item) => item.kind !== 'choice')) addSlider(parameter);
  if (family === 'svf') {
    const help = document.createElement('p');
    help.className = 'control-help';
    help.textContent = 'Legacy DSP caps resonance at 1.00, although its control reaches 2.00.';
    byId('controls').appendChild(help);
  }
}

let referenceLab;
async function selectPrimitive(family, updateUrl = true) {
  if (!Object.hasOwn(projects, family)) return;
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
    if (audio.running) await audio.stop();
    else await audio.start(byId('source').value, values, projects[activeFamily].project);
    toggle.textContent = audio.running ? 'Stop audio' : 'Start audio';
    document.querySelector('.measurement-hint').textContent = audio.running
      ? 'Spectrum of the processed live input.'
      : 'Start audio to view the output spectrum. The reference cases below run offline.';
    if (spectrumFrame) cancelAnimationFrame(spectrumFrame);
    animateSpectrum();
  } catch (error) {
    status.textContent = String(error);
    toggle.textContent = 'Start audio';
  } finally {
    toggle.disabled = false;
  }
});

initializeReferenceLab(activeFamily).then((lab) => { referenceLab = lab; referenceLab.selectFamily(activeFamily); }).catch((error) => {
  byId('reference-status').textContent = `Reference unavailable: ${String(error)}`;
  byId('reference-meta').textContent = 'Run the reference generation script to create fixture files.';
});
