import './style.css';
import project from '../../projects/standalone-filter/project.json';
import { BrowserAudioHost } from './audio/browser-host.js';
import { createFrequencyField } from './visual/frequency-field.js';

const byId = (id) => document.getElementById(id);
const status = byId('status');
const toggle = byId('audio-toggle');
const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
const audio = new BrowserAudioHost((message) => { status.textContent = message; });

for (const parameter of project.parameters) {
  const wrapper = document.createElement('label');
  wrapper.className = 'control';
  const heading = document.createElement('span');
  heading.textContent = parameter.label;
  const readout = document.createElement('strong');
  const format = (value) => parameter.kind === 'choice' ? parameter.choices[value] : parameter.unit ? `${Math.round(value)} ${parameter.unit}` : Number(value).toFixed(2);
  readout.textContent = format(parameter.default);
  wrapper.append(heading, readout);
  let input;
  if (parameter.kind === 'choice') {
    input = document.createElement('select');
    parameter.choices.forEach((choice, value) => input.add(new Option(choice, value)));
    input.value = String(parameter.default);
  } else {
    input = document.createElement('input');
    input.type = 'range';
    input.min = parameter.min;
    input.max = parameter.max;
    input.step = parameter.id === 1 ? '1' : '0.01';
    input.value = parameter.default;
  }
  input.setAttribute('aria-label', parameter.label);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    values.set(parameter.id, value);
    readout.textContent = format(value);
    audio.setParameter(parameter.id, value);
  });
  wrapper.appendChild(input);
  byId('controls').appendChild(wrapper);
}

toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  try {
    if (audio.running) await audio.stop();
    else await audio.start(byId('source').value, values);
    toggle.textContent = audio.running ? 'Stop audio' : 'Start audio';
  } catch (error) {
    status.textContent = String(error);
    toggle.textContent = 'Start audio';
  } finally {
    toggle.disabled = false;
  }
});

createFrequencyField(byId('visualizer'), byId('render-backend'), () => audio.analyser)
  .catch((error) => { byId('render-backend').textContent = `VISUALIZER UNAVAILABLE: ${String(error)}`; });
