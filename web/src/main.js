import './style.css';
import project from '../../projects/standalone-filter/project.json';
import { BrowserAudioHost } from './audio/browser-host.js';
import { initializeReferenceLab } from './reference/comparison.js';
import { drawLiveSpectrum } from './reference/plots.js';

const byId = (id) => document.getElementById(id);
const status = byId('status');
const toggle = byId('audio-toggle');
const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
const audio = new BrowserAudioHost((message) => { status.textContent = message; });

const mode = project.parameters.find((parameter) => parameter.id === 0);
const modeButtons = mode.choices.map((choice, value) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = ['LP', 'BP', 'HP', 'Notch'][value];
  button.setAttribute('aria-label', choice);
  button.setAttribute('aria-pressed', String(value === mode.default));
  button.addEventListener('click', () => {
    values.set(mode.id, value);
    audio.setParameter(mode.id, value);
    modeButtons.forEach((item, index) => item.setAttribute('aria-pressed', String(index === value)));
  });
  byId('modes').appendChild(button);
  return button;
});

for (const parameter of project.parameters.filter((item) => item.kind !== 'choice')) {
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

  const isCutoff = parameter.id === 1;
  const toPhysical = (position) => isCutoff
    ? Math.round(parameter.min * (parameter.max / parameter.min) ** (position / 1000))
    : Math.round((parameter.min + (parameter.max - parameter.min) * position / 1000) * 100) / 100;
  const toPosition = (value) => isCutoff
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
const resonanceHelp = document.createElement('p');
resonanceHelp.className = 'control-help';
resonanceHelp.textContent = 'Legacy DSP caps resonance at 1.00, although its control reaches 2.00.';
byId('controls').appendChild(resonanceHelp);

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
    else await audio.start(byId('source').value, values, project);
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

initializeReferenceLab().catch((error) => {
  byId('reference-status').textContent = `Reference unavailable: ${String(error)}`;
  byId('reference-meta').textContent = 'Run the reference generation script to create fixture files.';
});
