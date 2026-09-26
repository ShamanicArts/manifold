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
import compressorProject from '../../projects/compressor/project.json';
import limiterProject from '../../projects/limiter/project.json';
import stereoDelayProject from '../../projects/stereo-delay/project.json';
import fxChainProject from '../../projects/fx-chain/project.json';
import standaloneFxProject from '../../projects/standalone-fx-slice/project.json';
import loopCaptureProject from '../../projects/loop-capture/project.json';
import sampleRegionProject from '../../projects/sample-region/project.json';
import spectrumAnalyzerProject from '../../projects/spectrum-analyzer/project.json';
import envelopeFollowerProject from '../../projects/envelope-follower/project.json';
import envelopeDuckingProject from '../../projects/envelope-ducking/project.json';
import { BrowserAudioHost } from './audio/browser-host.js';
import { BrowserMidiInput, midiAvailability } from './audio/midi-input.js';
import { initializeReferenceLab } from './reference/comparison.js';
import { drawLiveSpectrum, drawTransferCurve, drawMeterTrace } from './reference/plots.js';

const byId = (id) => document.getElementById(id);
const primitivePicker = byId('primitive-picker');
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
  compressor: {
    project: compressorProject,
    title: 'Compressor',
    description: 'Legacy scalar stereo compression with threshold, ratio, makeup, and dry/wet mix. Gain reduction is shown below in dB.',
    signal: 'Live path: input → compressor → stereo output · meter → gain reduction',
  },
  limiter: {
    project: limiterProject,
    title: 'Limiter',
    description: 'Legacy stereo peak limiter with immediate gain clamp, smoothed release, optional soft clip, and dry/wet mix. Average gain reduction appears below.',
    signal: 'Live path: input → peak limiter → stereo output · meter → average reduction',
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
    description: 'A swappable effects slot using the original type IDs and normalized controls. Compressor, SVF Filter, Stereo Delay, and Limiter are available in this slice.',
    signal: 'Live path: input → selected effect → dry/wet mix → output',
  },
  'loop-capture': {
    project: loopCaptureProject,
    title: 'Loop capture',
    description: 'Record up to two seconds of stereo input, then play it as a loop. Reverse, change speed, or overdub new sound.',
    signal: 'Live path: input → bounded capture / loop playback → output',
  },
  'sample-region': {
    project: sampleRegionProject,
    title: 'Sample region',
    description: 'Load an audio file, select a playback region, and trigger a loop or one-shot. Decoding happens before the Rust audio callback.',
    signal: 'File decode → prepared stereo sample → region playback → output',
  },
  'spectrum-analyzer': {
    project: spectrumAnalyzerProject,
    title: 'Spectrum analyzer',
    description: 'Eight smoothed band estimates from the original Manifold analyzer. Stereo audio passes through unchanged. These bands are one-pole envelopes, not FFT bins.',
    signal: 'Live path: input → unchanged output · meter tap → eight band estimates',
  },
  'envelope-follower': {
    project: envelopeFollowerProject,
    title: 'Envelope follower',
    description: 'Follow input level with peak, RMS, or hybrid detection. Set attack, release, sensitivity, and a highpass on the detector. Stereo audio passes through unchanged.',
    signal: 'Live path: input → unchanged output · detector tap → envelope meter',
  },
  'envelope-ducking': {
    project: envelopeDuckingProject,
    title: 'Envelope ducking',
    description: 'Use the input envelope as a sample-rate control signal for a gain stage. Loud input reduces the output level; detector attack, release, sensitivity, and duck depth are editable.',
    signal: 'Audio: input → modulated gain → output · CV: input → envelope detector → gain',
  },
  'stereo-delay': {
    project: stereoDelayProject,
    title: 'Stereo delay',
    description: 'Two fractional delay taps with feedback, crossfeed, tempo divisions, a feedback lowpass, ducking, and freeze.',
    signal: 'Live path: input → stereo delay → output · feedback recirculates in prepared buffers',
  },
};
for (const button of document.querySelectorAll('.library-item')) {
  primitivePicker.add(new Option(button.querySelector('strong').textContent, button.dataset.primitive));
}
const initial = new URL(location.href).searchParams.get('primitive');
let activeFamily = Object.hasOwn(projects, initial) ? initial : 'svf';
let values = new Map();
let slotValuesByType = new Map();
let loopHasTake = false;
let loadedSample = null;
function demoSample() {
  const sourceRate = 48_000;
  const frames = 24_000;
  const stereo = new Float32Array(frames * 2);
  for (let frame = 0; frame < frames; frame++) {
    const time = frame / sourceRate;
    const envelope = (1 - frame / frames) ** 2;
    const tone = envelope * (0.48 * Math.sin(2 * Math.PI * 220 * time)
      + 0.16 * Math.sin(2 * Math.PI * 440 * time));
    stereo[frame * 2] = tone;
    stereo[frame * 2 + 1] = tone * 0.85;
  }
  return { sourceRate, stereo };
}
let envelopeHistory = [];
const audio = new BrowserAudioHost((message) => { status.textContent = message; }, (nodeId, bands) => {
  if (nodeId !== 2 || !['spectrum-analyzer', 'envelope-follower', 'envelope-ducking', 'compressor', 'limiter'].includes(activeFamily)) return;
  if (activeFamily === 'compressor' || activeFamily === 'limiter') {
    const reduction = Number.isFinite(bands[0]) ? Math.max(0, activeFamily === 'compressor' ? -bands[0] : bands[0]) : 0;
    const row = byId('live-bands').firstChild;
    row.querySelector('.live-band-fill').style.width = `${Math.min(100, reduction / 24 * 100)}%`;
    row.querySelector('output').textContent = `${reduction.toFixed(1)} dB`;
    envelopeHistory.push(reduction);
    if (envelopeHistory.length > 60) envelopeHistory.shift();
    drawMeterTrace(byId('live-envelope-trace'), [envelopeHistory], Math.max(3, ...envelopeHistory) * 1.2, ['#9a8de8']);
    return;
  }
  const scale = activeFamily === 'spectrum-analyzer'
    ? Math.max(0.05, Math.max(...bands.filter(Number.isFinite)) * 1.2) : 1;
  [...byId('live-bands').children].forEach((row, index) => {
    const value = Number.isFinite(bands[index]) ? Math.max(0, Math.min(1, bands[index])) : 0;
    row.querySelector('.live-band-fill').style.width = `${Math.min(100, value / scale * 100)}%`;
    row.querySelector('output').textContent = value.toFixed(3);
  });
  if (activeFamily === 'envelope-follower' || activeFamily === 'envelope-ducking') {
    envelopeHistory.push(Math.max(0, Math.min(1, bands[0] ?? 0)));
    if (envelopeHistory.length > 60) envelopeHistory.shift();
    const scale = Math.max(0.2, Math.max(...envelopeHistory) * 1.2);
    drawMeterTrace(byId('live-envelope-trace'), [envelopeHistory], scale, ['#9a8de8']);
  }
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
  if (parameter.prepareOnly) {
    wrapper.dataset.prepareOnly = 'true';
    input.disabled = audio.running;
  }
  wrapper.syncValue = (value) => sync(toPosition(value), false);
  sync(toPosition(parameter.default), false);
  input.addEventListener('input', () => sync(Number(input.value), true));
  wrapper.addEventListener('dblclick', () => { if (!input.disabled) sync(toPosition(parameter.default), true); });
  wrapper.append(title, readout, input);
  byId('controls').appendChild(wrapper);
}

function updateSlotControls() {
  if (activeFamily !== 'standalone-fx') return;
  const selected = values.get(0);
  const labels = selected === 3
    ? { 2: 'Threshold', 3: 'Ratio', 4: 'Attack (at select)', 5: 'Release (at select)', 6: 'Knee (inert)' }
    : selected === 6 ? { 2: 'Filter cutoff', 3: 'Resonance', 4: 'Filter drive' }
      : selected === 15 ? { 2: 'Threshold', 3: 'Pre gain', 4: 'Release', 5: 'Soft clip' }
        : { 2: 'Delay time', 3: 'Feedback' };
  for (let id = 2; id <= 6; id++) {
    const wrapper = byId('controls').querySelector(`[data-parameter-id="${id}"]`);
    if (!wrapper) continue;
    wrapper.hidden = !Object.hasOwn(labels, id);
    if (wrapper.hidden) continue;
    const value = values.get(id);
    wrapper.querySelector('span').textContent = labels[id];
    wrapper.querySelector('input').setAttribute('aria-label', labels[id]);
    wrapper.querySelector('output').value = selected === 3
      ? id === 2 ? `${(-40 + 38 * value).toFixed(1)} dB`
        : id === 3 ? (1.5 + 18.5 * value).toFixed(2)
          : id === 4 ? `${(1 + 39 * value).toFixed(1)} ms`
            : id === 5 ? `${(20 + 230 * value).toFixed(1)} ms`
              : `${(12 * value).toFixed(1)} dB`
      : selected === 6
      ? id === 2 ? `${Math.round(60 * (10000 / 60) ** value).toLocaleString()} Hz`
        : id === 3 ? (0.08 + 0.92 * value).toFixed(2) : (6 * value).toFixed(2)
      : selected === 15
        ? id === 2 ? `${(-20 + 19 * value).toFixed(1)} dB`
          : id === 3 ? (0.6 + 1.4 * value).toFixed(2)
            : id === 4 ? `${(10 + 190 * value).toFixed(1)} ms` : value.toFixed(2)
      : id === 2 ? `${Math.round(40 + 740 * value)} / ${Math.round((40 + 740 * value) * 1.5)} ms`
        : (0.92 * value).toFixed(2);
  }
  const help = byId('slot-help');
  if (help) help.textContent = selected === 3
    ? 'Compressor attack and release take effect when the effect is selected; changing them while selected needs a switch away and back. The old knee control has no effect.'
    : selected === 15 ? 'Limiter pre gain is smoothed before peak detection. Its fifth normalized control is unused in the old slot definition.'
      : 'Values are stored separately for each effect type and restored when selected.';
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
  primitivePicker.value = family;
  values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
  if (family === 'standalone-fx') slotValuesByType = new Map([
    [3, [0.4, 0.3, 0.1, 0.3, 0.5]],
    [6, [0.5, 0.4, 0.1, 0.5, 0.5]], [8, [0.3, 0.3, 0.5, 0.5, 0.5]],
    [15, [0.5, 0.3, 0.4, 0.4, 0.5]],
  ]);
  if (family === 'loop-capture') loopHasTake = false;
  byId('module-title').textContent = title;
  const analyzerView = ['spectrum-analyzer', 'envelope-follower', 'envelope-ducking', 'compressor', 'limiter'].includes(family);
  document.querySelector('.measurements h2').textContent = family === 'spectrum-analyzer' ? 'Band levels' : family === 'compressor' || family === 'limiter' ? 'Gain reduction' : family === 'envelope-follower' || family === 'envelope-ducking' ? 'Detector level' : 'Live output';
  envelopeHistory = [];
  document.querySelector('.scope-wrap').hidden = analyzerView;
  document.querySelector('.axis-caption').hidden = analyzerView;
  byId('live-bands').hidden = !analyzerView;
  byId('live-bands').setAttribute('aria-label', family === 'spectrum-analyzer' ? 'Eight legacy analyzer bands' : family === 'compressor' || family === 'limiter' ? 'Live gain reduction in decibels' : 'Live envelope value');
  byId('live-envelope-trace').hidden = !['envelope-follower', 'envelope-ducking', 'compressor', 'limiter'].includes(family);
  byId('live-envelope-trace').setAttribute('aria-label', family === 'compressor' || family === 'limiter' ? 'Recent gain reduction in decibels' : 'Recent envelope history');
  [...byId('live-bands').children].forEach((row, index) => {
    row.hidden = family !== 'spectrum-analyzer' && index > 0;
    row.firstChild.textContent = family === 'compressor' || family === 'limiter' ? 'GR' : family !== 'spectrum-analyzer' ? 'Env' : String(index + 1);
    row.querySelector('output').textContent = family === 'compressor' || family === 'limiter' ? '0.0 dB' : '0.000';
    row.querySelector('.live-band-fill').style.width = '0%';
  });
  byId('module-description').textContent = description;
  byId('signal-path').textContent = signal;
  document.querySelector('.panel-note').textContent = family === 'spectrum-analyzer' ? 'Eight band meter' : family === 'compressor' || family === 'limiter' ? 'Reduction meter' : family === 'envelope-follower' || family === 'envelope-ducking' ? 'Envelope meter' : `Post ${title.toLowerCase()}`;
  document.querySelectorAll('[data-primitive]').forEach((button) => {
    button.setAttribute('aria-current', button.dataset.primitive === family ? 'page' : 'false');
  });
  byId('modes').replaceChildren();
  byId('controls').replaceChildren();
  const mode = project.parameters.find((parameter) => parameter.kind === 'choice');
  byId('mode-section').hidden = !mode;
  byId('mode-label').textContent = family === 'voice' || family === 'oscillator' || family === 'patch' || family === 'modulation' ? 'Waveform' : family === 'envelope-follower' || family === 'envelope-ducking' ? 'Detector' : family === 'fx-chain' ? 'Filter mode' : family === 'stereo-delay' ? 'Time mode' : family === 'standalone-fx' ? 'Effect type' : 'Mode';
  byId('input-label').textContent = isInstrument ? 'Instrument' : 'Live input';
  byId('keyboard-section').hidden = family !== 'voice';
  byId('midi-access-section').hidden = family !== 'voice';
  byId('sample-section').hidden = family !== 'sample-region';
  if (family === 'voice') resetNoteEvents();
  if (mode) {
    byId('modes').style.gridTemplateColumns = `repeat(${mode.choices.length}, minmax(0, 1fr))`;
    const buttons = mode.choices.map((choice, index) => {
      const value = mode.choiceValues?.[index] ?? index;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = family === 'svf' ? ['LP', 'BP', 'HP', 'Notch'][value]
        : family === 'standalone-fx' ? ({ 3: 'Comp', 6: 'SVF', 8: 'Delay', 15: 'Limit' })[value] : choice;
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
  if (family === 'compressor') {
    const help = document.createElement('p');
    help.className = 'control-help';
    help.textContent = 'Attack and release are captured when audio starts; stop audio to change them. The old knee, auto makeup, mode, detector mode, and sidechain HPF controls do not affect this processing path.';
    byId('controls').appendChild(help);
  }
  if (family === 'standalone-fx') {
    const help = document.createElement('p');
    help.id = 'slot-help';
    help.className = 'control-help';
    help.textContent = 'Values are stored separately for each effect type and restored when selected.';
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
    : family === 'envelope-ducking' ? 'Start audio to hear envelope-controlled gain and inspect the detector. Native Rust/Wasm comparisons are below.'
    : family === 'compressor' || family === 'limiter' ? 'Start audio to hear dynamics and view gain reduction in dB. C++ audio and meter snapshots are compared below.'
    : family === 'envelope-follower' ? 'Start audio to view the detected envelope. C++ meter snapshots are compared below.'
    : analyzerView ? 'Start audio to see the original eight band meter. Bars scale to the current peak; numbers are normalized 0–1 values.'
    : 'Start audio to view the output spectrum. The reference cases below run offline.';
  if (family === 'svf') {
    const help = document.createElement('p');
    help.className = 'control-help';
    help.textContent = 'Legacy DSP caps resonance at 1.00, although its control reaches 2.00.';
    byId('controls').appendChild(help);
  }
}

function updatePrepareOnlyControls() {
  for (const wrapper of document.querySelectorAll('[data-prepare-only="true"]')) {
    wrapper.querySelector('input').disabled = audio.running;
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
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function resetNoteEvents() {
  const placeholder = document.createElement('li');
  placeholder.textContent = 'Play the keyboard to inspect note events.';
  byId('midi-events').replaceChildren(placeholder);
}
function showNoteEvent(kind, channel, note, velocity, source, forwarded) {
  const list = byId('midi-events');
  if (list.firstChild?.textContent === 'Play the keyboard to inspect note events.') list.replaceChildren();
  const item = document.createElement('li');
  const name = `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`;
  item.textContent = `${kind === 'on' ? 'On' : 'Off'} · ${name} (${note}) · ch ${channel + 1} · vel ${velocity} · ${source}${forwarded ? '' : ' · received only'}`;
  list.prepend(item);
  while (list.childElementCount > 6) list.lastChild.remove();
}
const heldByAnotherDevice = (key, deviceId) => [...midiHeld].some(([id, notes]) => id !== deviceId && notes.has(key));
function noteOn(note) {
  if (activeFamily !== 'voice' || !audio.running || pressedNotes.has(note)) return;
  pressedNotes.add(note);
  keyButtons.get(note)?.setAttribute('aria-pressed', 'true');
  audio.sendEvent(1, 0, note, 100, 0, 15);
  showNoteEvent('on', 15, note, 100, 'Keyboard', true);
}
function noteOff(note) {
  if (!pressedNotes.delete(note)) return;
  keyButtons.get(note)?.setAttribute('aria-pressed', 'false');
  audio.sendEvent(1, 1, note, 0, 0, 15);
  showNoteEvent('off', 15, note, 0, 'Keyboard', true);
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
      if (!heldByAnotherDevice(key, deviceId)) {
        audio.sendEvent(1, 1, note, 0, 0, channel);
        showNoteEvent('off', channel, note, 0, 'MIDI disconnect', true);
      }
    }
  }
  midiHeld.delete(deviceId);
}
function receiveMidiNote(deviceId, kind, channel, note, velocity) {
  if (activeFamily !== 'voice') return;
  if (!audio.running) {
    showNoteEvent(kind, channel, note, velocity, 'MIDI', false);
    return;
  }
  let held = midiHeld.get(deviceId);
  if (!held) { held = new Set(); midiHeld.set(deviceId, held); }
  const key = `${channel}:${note}`;
  let forwarded = false;
  if (kind === 'on' && !held.has(key)) {
    const alreadyHeld = heldByAnotherDevice(key, deviceId);
    held.add(key);
    if (!alreadyHeld) { audio.sendEvent(1, 0, note, velocity, 0, channel); forwarded = true; }
  } else if (kind === 'off' && held.delete(key)) {
    if (!heldByAnotherDevice(key, deviceId)) { audio.sendEvent(1, 1, note, 0, 0, channel); forwarded = true; }
  }
  showNoteEvent(kind, channel, note, velocity, 'MIDI', forwarded);
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
  midiToggle.textContent = midiInput.listening ? 'Stop MIDI input' : 'Request MIDI access';
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
  stopMonitoring();
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
primitivePicker.addEventListener('change', () => {
  selectPrimitive(primitivePicker.value).catch((error) => { status.textContent = String(error); });
});
window.addEventListener('popstate', () => {
  const family = new URL(location.href).searchParams.get('primitive');
  selectPrimitive(Object.hasOwn(projects, family) ? family : 'svf', false).catch((error) => { status.textContent = String(error); });
});

let spectrumFrame = null;
let meterTimer = null;
const meterFamilies = ['spectrum-analyzer', 'envelope-follower', 'envelope-ducking', 'compressor', 'limiter'];
function stopMonitoring() {
  if (spectrumFrame !== null) cancelAnimationFrame(spectrumFrame);
  if (meterTimer !== null) clearInterval(meterTimer);
  spectrumFrame = null;
  meterTimer = null;
}
const animateSpectrum = () => {
  drawLiveSpectrum(byId('live-spectrum'), audio.analyser);
  spectrumFrame = audio.running ? requestAnimationFrame(animateSpectrum) : null;
};
function startMonitoring() {
  stopMonitoring();
  if (!audio.running) return;
  if (meterFamilies.includes(activeFamily)) {
    const request = () => audio.requestMeters(2, activeFamily === 'spectrum-analyzer' ? 8 : 1);
    request();
    meterTimer = setInterval(request, 100);
  } else animateSpectrum();
}
drawLiveSpectrum(byId('live-spectrum'), null);
byId('sample-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const readout = byId('sample-source-status');
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose a file smaller than 32 MB.');
    readout.textContent = `Decoding ${file.name}…`;
    const decoder = new OfflineAudioContext(2, 1, 48_000);
    const audioBuffer = await decoder.decodeAudioData(await file.arrayBuffer());
    if (audioBuffer.duration > 30 || audioBuffer.length === 0) {
      throw new Error('Choose an audio file between 0 and 30 seconds.');
    }
    const stereo = new Float32Array(audioBuffer.length * 2);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(Math.min(1, audioBuffer.numberOfChannels - 1));
    for (let frame = 0; frame < audioBuffer.length; frame++) {
      stereo[frame * 2] = left[frame];
      stereo[frame * 2 + 1] = right[frame];
    }
    loadedSample = { sourceRate: audioBuffer.sampleRate, stereo };
    readout.textContent = `${file.name} · ${audioBuffer.duration.toFixed(2)} s · ${audioBuffer.numberOfChannels} channel${audioBuffer.numberOfChannels === 1 ? '' : 's'}${audio.running ? ' · restart the instrument to load it' : ' · ready to start'}`;
  } catch (error) {
    readout.textContent = `Sample unavailable: ${error.message ?? String(error)}`;
  }
});
byId('sample-trigger').addEventListener('click', () => {
  if (audio.running && activeFamily === 'sample-region') audio.sendEvent(2, 0, 60, 100);
  else byId('sample-source-status').textContent = 'Start the instrument before triggering the sample.';
});
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
    else await audio.start(byId('source').value, values, projects[activeFamily].project,
      activeFamily === 'sample-region' ? loadedSample ?? demoSample() : null);
    const isInstrument = projects[activeFamily].project.signal.inputSource === 'none';
    toggle.textContent = audio.running
      ? isInstrument ? 'Stop instrument' : 'Stop audio'
      : isInstrument ? 'Start instrument' : 'Start audio';
    updatePrepareOnlyControls();
    document.querySelector('.measurement-hint').textContent = audio.running
      ? activeFamily === 'compressor' || activeFamily === 'limiter' ? 'Live gain reduction in dB; the bar shows 0–24 dB and the trace scales to recent values.' : activeFamily === 'envelope-ducking' ? 'Detector drives gain at sample rate; the live meter shows its normalized control level.' : activeFamily === 'envelope-follower' ? 'Detected input envelope, normalized 0–1. Audio passes through unchanged.' : activeFamily === 'spectrum-analyzer' ? 'Legacy eight band estimates; bars scale to the current peak, numbers are normalized 0–1. Audio passes through unchanged.' : activeFamily === 'voice' ? 'Spectrum of played notes.' : activeFamily === 'oscillator' || activeFamily === 'adsr' || activeFamily === 'noise' || activeFamily === 'patch' || activeFamily === 'modulation' ? 'Spectrum of the instrument.' : 'Spectrum of the processed live input.'
      : activeFamily === 'voice'
        ? 'Start the instrument and play notes to view its output spectrum. The timing cases below run offline.'
        : activeFamily === 'oscillator' || activeFamily === 'adsr' || activeFamily === 'noise' || activeFamily === 'patch' || activeFamily === 'modulation'
          ? `Start the instrument to view its spectrum. The ${activeFamily === 'patch' || activeFamily === 'modulation' ? 'native Rust' : 'C++'} comparisons below run offline.`
        : activeFamily === 'compressor' || activeFamily === 'limiter' ? 'Start audio to hear dynamics and view gain reduction in dB. C++ audio and meter snapshots are compared below.' : activeFamily === 'envelope-ducking' ? 'Start audio to hear envelope-controlled gain. Native Rust/Wasm comparisons are below.' : activeFamily === 'envelope-follower' ? 'Start audio to view the detected envelope. C++ meter snapshots are compared below.' : activeFamily === 'spectrum-analyzer' ? 'Start audio to see the original eight band meter. C++ meter snapshots are compared below.' : 'Start audio to view the output spectrum. The reference cases below run offline.';
    startMonitoring();
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
