import './main-looper.css';
import project from '../../projects/main-looper/project.json';
import rackCatalog from '../../projects/main-looper/rack.json';
import { NODE_TYPES } from './graph/topology.js';
import { compileMainRackInsert, validateMainRackInsertDocument,
  validateMainRackControlRoute } from './state/main-rack-graph.js';
import { mountMainAudioPatch } from './widgets/main-audio-patch.js';
import { encodePcm, decodePcm } from './state/stereo-source.js';
import { validateMainRackState } from './state/main-rack-state.js';
import { mountCompactSlider } from './widgets/compact-slider.js';
import { mountMainAdsr } from './widgets/main-adsr.js';
import { mountMainFilter } from './widgets/main-filter.js';
import { mountMainEq } from './widgets/main-eq.js';
import { mountMainFxSlot } from './widgets/main-fx-slot.js';
import { mountMainLfoRack } from './widgets/main-lfo-rack.js';
import { mountMainAtvBias } from './widgets/main-atv-bias.js';
import { mountMainSlew } from './widgets/main-slew.js';
import { mountMainSampleHold } from './widgets/main-sample-hold.js';
import { mountMainCompare } from './widgets/main-compare.js';
import { mountMainCvMix } from './widgets/main-cv-mix.js';
import { mountMainRange } from './widgets/main-range.js';
import { mountMainScaleQuantizer } from './widgets/main-scale-quantizer.js';
import { mountMainTranspose } from './widgets/main-transpose.js';
import { mountMainNoteFilter } from './widgets/main-note-filter.js';
import { mountMainVelocityMapper } from './widgets/main-velocity-mapper.js';
import { mountMainArpeggiator } from './widgets/main-arpeggiator.js';
import { mountMainCapturePlane } from './widgets/main-capture-plane.js';
import { drawMainLayerKnob } from './widgets/main-layer-knob.js';
import { mainEditorAction } from './audio/main-editor-control-map.js';
import { BrowserMidiInput, midiAvailability } from './audio/midi-input.js';
import { MidiHoldState } from './audio/midi-hold.js';

const $ = (id) => document.getElementById(id);
const editorMode = new URLSearchParams(location.search).has('editor');
if (editorMode) document.body.classList.add('plugin-editor');
const bars = project.segments;
const labels = ['16', '8', '4', '2', '1', '1/2', '1/4', '1/8', '1/16'];
const layerColors = ['#22d3ee', '#a78bfa', '#f59e0b', '#34d399'];
let context = null, processor = null, stream = null, sourceNode = null, inputGain = null;
let latest = null, poll = null, dragging = null;
let transferJob = null, nextRequest = 1;
let sampleJob = null, freeSource = null, sampleMode = 0;
let applyingEditorState = false;
const status = (message) => { $('status').textContent = message; };
const pendingRackRoutes = new Map();
const pendingRackLayouts = new Map();
const rackPatch = mountMainAudioPatch({
  content: document.querySelector('.rack-scroll-content'), catalog: rackCatalog,
  toggle: $('rack-view-switch'), onError: status, readOnly: editorMode,
  onRoute: ({ to, port, from }) => {
    if (editorMode) return Promise.resolve(false);
    if (!processor) return Promise.resolve(true);
    const requestId = nextRequest++;
    return new Promise(resolve => {
      const timer = setTimeout(() => { pendingRackRoutes.delete(requestId); resolve(false); }, 5000);
      pendingRackRoutes.set(requestId, { resolve, timer });
      processor.port.postMessage({ type: 'rack-route', requestId, to, port, from });
    });
  },
  onRoutes: routes => {
    if (editorMode) return Promise.resolve(false);
    if (!processor) return Promise.resolve(true);
    const requestId = nextRequest++;
    return new Promise(resolve => {
      const timer = setTimeout(() => { pendingRackRoutes.delete(requestId); resolve(false); }, 5000);
      pendingRackRoutes.set(requestId, { resolve, timer });
      processor.port.postMessage({ type: 'rack-routes', requestId, routes });
    });
  },
  onControlRoute: async endpoint => {
    if (editorMode) return false;
    const previous = lfo.snapshot().find(item => item.slot === 0)?.route;
    if (!previous) return false;
    const binding = rackCatalog.preparedControlOutputs.find(item =>
      item.from.moduleId === endpoint?.moduleId && item.from.portId === endpoint?.portId);
    if (endpoint && !binding) return false;
    const connected = Boolean(binding);
    const next = { source: binding?.source ?? 0, target: binding?.target ?? 0, enabled: connected };
    if (!processor) { lfo.applyCableRoute(connected, next.source); return true; }
    const routes = [
      { slot: 0, id: project.modulation.routeParameters.source,
        value: next.source, previous: previous.source },
      { slot: 0, id: project.modulation.routeParameters.target,
        value: next.target, previous: previous.target },
      { slot: 0, id: project.modulation.routeParameters.enabled,
        value: Number(next.enabled), previous: Number(previous.enabled) },
    ];
    const requestId = nextRequest++;
    const accepted = await new Promise(resolve => {
      const timer = setTimeout(() => { pendingRackRoutes.delete(requestId); resolve(false); }, 5000);
      pendingRackRoutes.set(requestId, { resolve, timer });
      processor.port.postMessage({ type: 'modulation-routes', requestId, routes });
    });
    if (accepted) lfo.applyCableRoute(connected, next.source);
    return accepted;
  },
  onLayout: document => {
    if (!editorMode) return Promise.resolve(true);
    if (!window.ipc?.postMessage) return Promise.resolve(false);
    const requestId = nextRequest++;
    return new Promise(resolve => {
      const timer = setTimeout(() => { pendingRackLayouts.delete(requestId); resolve(false); }, 5000);
      pendingRackLayouts.set(requestId, { resolve, timer });
      window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'rack-layout', requestId, document }));
    });
  },
});
function formatBars(value) {
  if (!value) return '';
  if (value < 1) {
    const index = bars.findIndex(bar => Math.abs(bar - value) < .001);
    return `${index >= 0 ? labels[index] : value.toFixed(2)} bar`;
  }
  return `${Math.round(value)} ${Math.round(value) === 1 ? 'bar' : 'bars'}`;
}
const post = (message) => {
  if (!editorMode) return processor?.port.postMessage(message);
  if (applyingEditorState) return;
  if (message.type === 'snapshot') return;
  const action = mainEditorAction(message, project);
  if (action) window.ipc?.postMessage(JSON.stringify({ version: 1, ...action }));
  else status('This Main action is awaiting its native editor bridge.');
};
const control = (id, value) => post({ type: 'control', id, value });
const layerControl = (layer, id, value) => post({ type: 'layer-control', layer, id, value });
const command = (id, value = 0) => post({ type: 'command', id, value });
const synthNote = (kind, note = 0, velocity = 0) => post({ type: 'synth-note', kind, note, velocity });
const midiHold = new MidiHoldState();
const soundingMidiNotes = new Set();
let selectedMidiId = null;
function emitMidiEvents(events) {
  for (const event of events) {
    if (event.kind === 'on') {
      if (!soundingMidiNotes.has(event.note)) {
        synthNote(0, event.note, event.velocity);
        soundingMidiNotes.add(event.note);
      }
    } else if (soundingMidiNotes.has(event.note)
      && !Array.from({ length: 16 }, (_, channel) => channel)
        .some(channel => midiHold.isHeld(channel * 128 + event.note))) {
      synthNote(1, event.note);
      soundingMidiNotes.delete(event.note);
    }
  }
}
function releaseMidiDevice(id) { emitMidiEvents(midiHold.disconnect(id)); }
function syncMidiDevices() {
  const select = $('main-midi-input');
  const previous = selectedMidiId;
  const devices = [...midiInput.bound.values()];
  select.replaceChildren(...devices.map(input => {
    const option = document.createElement('option');
    option.value = input.id; option.textContent = input.name || `MIDI input ${input.id}`;
    return option;
  }));
  selectedMidiId = devices.some(input => input.id === previous) ? previous : devices[0]?.id ?? null;
  if (selectedMidiId) select.value = selectedMidiId;
  else select.append(new Option('No MIDI inputs', ''));
  select.disabled = !selectedMidiId;
  if (previous && previous !== selectedMidiId) releaseMidiDevice(previous);
  $('main-midi-connect').textContent = midiInput.pending ? 'Cancel request'
    : midiInput.listening ? 'Disconnect MIDI' : 'Connect MIDI';
}
const midiInput = new BrowserMidiInput((id, kind, channel, note, velocity) => {
  if (id !== selectedMidiId || !processor) return;
  emitMidiEvents(midiHold.note(id, kind, channel, note, velocity).events);
  $('main-midi-status').textContent = `${$('main-midi-input').selectedOptions[0]?.textContent ?? 'MIDI'} · ${kind === 'on' ? 'Note on' : 'Note off'} ${note} · channel ${channel + 1}`;
}, releaseMidiDevice, message => {
  $('main-midi-status').textContent = message;
  if (/no MIDI permission prompt|permission was denied or blocked/i.test(message)) {
    $('main-midi-browser-link').hidden = false;
    $('main-midi-copy').hidden = false;
  }
  syncMidiDevices();
}, (id, channel, down) => {
  if (id === selectedMidiId && processor) emitMidiEvents(midiHold.sustain(id, channel, down));
}, () => {}, syncMidiDevices);
$('main-midi-connect').addEventListener('click', () => {
  if (midiInput.listening || midiInput.pending) midiInput.stop();
  else void midiInput.connect();
});
$('main-midi-input').addEventListener('change', () => {
  const previous = selectedMidiId;
  selectedMidiId = $('main-midi-input').value;
  if (previous && previous !== selectedMidiId) releaseMidiDevice(previous);
  $('main-midi-status').textContent = `Listening to ${$('main-midi-input').selectedOptions[0]?.textContent ?? 'MIDI input'}.`;
});
const midiUnavailable = midiAvailability();
if (midiUnavailable) {
  $('main-midi-connect').disabled = true;
  $('main-midi-status').textContent = `${midiUnavailable} On-screen keys still work.`;
  $('main-midi-browser-link').hidden = false;
  $('main-midi-copy').hidden = false;
}
$('main-midi-copy').addEventListener('click', async () => {
  const address = new URL('/main-looper.html', location.href).href;
  try {
    await navigator.clipboard.writeText(address);
    $('main-midi-status').textContent = 'Main link copied. Open it in a browser that allows Web MIDI.';
  } catch {
    $('main-midi-status').textContent = `Open this address in a browser that allows Web MIDI: ${address}`;
  }
});
const synthParameter = (id, value) => post({ type: 'synth-parameter', id, value });
const synthIds = project.synthParameters;
const adsr = mountMainAdsr($, synthParameter, synthIds);
const filter = mountMainFilter($, synthParameter, synthIds);
const eq = mountMainEq($, synthParameter, project.eqParameters);
const fx1 = mountMainFxSlot($('fx1-module'), synthParameter, project.fxParameters.fx1Base);
const fx2 = mountMainFxSlot($('fx2-module'), synthParameter, project.fxParameters.fx2Base);
const lfo = mountMainLfoRack($, post, project.modulation,
  route => { if (!editorMode) rackPatch.reflectControlRoute(route); });
const atv = mountMainAtvBias($, post, state => {
  if (!editorMode) rackPatch.reflectControlInputRoute('atv1', { atv: state });
});
const slew = mountMainSlew($, post, project.modulation.slewParameters, state => {
  if (!editorMode) rackPatch.reflectControlInputRoute('slew1', { slew: state });
});
const sampleHold = mountMainSampleHold($, post, project.modulation.sampleHoldParameters, state => {
  if (!editorMode) rackPatch.reflectControlInputRoute('sample_hold1', { sampleHold: state });
});
const compare = mountMainCompare($, post, project.modulation.compareParameters);
const cvMix = mountMainCvMix($, post, project.modulation.cvMixParameters);
const range = mountMainRange($, post, project.modulation.rangeParameters);
const scaleQuantizer = mountMainScaleQuantizer($, post, project.modulation.scaleQuantizerParameters);
const transpose = mountMainTranspose($, post, project.modulation.transposeParameters);
const noteFilter = mountMainNoteFilter($, post, project.modulation.noteFilterParameters);
const velocityMapper = mountMainVelocityMapper($, post, project.modulation.velocityMapperParameters);
const arpeggiator = mountMainArpeggiator($, post, project.modulation.arpeggiatorParameters);
const selectedSegment = id => Number($(id).querySelector('[aria-pressed="true"]').dataset.value);
function wireSegments(id, change) {
  const group = $(id);
  group.addEventListener('click', ({ target }) => {
    const button = target.closest('button[data-value]');
    if (!button || !group.contains(button)) return;
    for (const option of group.querySelectorAll('button[data-value]')) option.setAttribute('aria-pressed', String(option === button));
    change(Number(button.dataset.value));
  });
}

const sampleBars = mountCompactSlider($('sample-bars'), { label: 'Bars', min: .0625, max: 16,
  step: .0625, value: 1, style: { colour: '#22d3ee', bg: '#08212a' } });
const sampleRoot = mountCompactSlider($('sample-root'), { label: 'Root', min: 12, max: 96,
  step: 1, value: 60, style: { colour: '#fbbf24', bg: '#2b2008' } });
const sampleBlend = mountCompactSlider($('sample-blend'), { label: 'Blend', min: 0, max: 1,
  step: .01, value: 0, style: { colour: '#f59e0b', bg: '#2a1b08' } });
const sampleXfade = mountCompactSlider($('sample-xfade'), { label: 'X-Fade', min: 0, max: 50,
  step: 1, value: 10, style: { colour: '#f472b6', bg: '#2b1020' } });
const sampleStretch = mountCompactSlider($('sample-stretch'), { label: 'Stretch', min: .25, max: 4,
  step: .25, value: 1, style: { colour: '#22d3ee', bg: '#08212a' } });
const blendPitch = mountCompactSlider($('blend-pitch'), { label: 'Pitch', min: -24, max: 24,
  step: 1, value: 0, style: { colour: '#f472b6', bg: '#2b1020' } });
const blendDepth = mountCompactSlider($('blend-depth'), { label: 'Depth', min: 0, max: 1,
  step: .01, value: .5, style: { colour: '#fb923c', bg: '#2a1708' } });
const sourceOutput = mountCompactSlider($('source-output'), { label: 'Output', min: 0, max: 2,
  step: .01, value: 1, style: { colour: '#34d399', bg: '#10231d' } });
let sampleBarsValue = 1, sampleBlendValue = 0;
let sourceTab = 'sample', latestSamplePeaks = [];
sampleBars.onChange(value => { sampleBarsValue = value; });
sampleRoot.onChange(value => synthParameter(synthIds.sampleRoot, value));
sampleBlend.onChange(value => { sampleBlendValue = value; synthParameter(synthIds.blend, value * 2 - 1); });
sampleXfade.onChange(value => synthParameter(synthIds.sampleXfade, value / 100));
sampleStretch.onChange(value => synthParameter(synthIds.timeStretch, value));
blendPitch.onChange(value => synthParameter(synthIds.samplePitch, value));
blendDepth.onChange(value => synthParameter(synthIds.blendDepth, value));
sourceOutput.onChange(value => synthParameter(synthIds.output, value));
const paintSampleSliders = () => { [sampleBars, sampleRoot, sampleBlend, sampleXfade,
  sampleStretch, blendPitch, blendDepth, sourceOutput].forEach(slider => slider.paint()); };
new ResizeObserver(paintSampleSliders).observe($('sample-root'));
requestAnimationFrame(paintSampleSliders);
function drawSourceGraph(peaks = latestSamplePeaks) {
  const canvas = $('source-graph'), ctx = canvas.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = '#0d1420'; ctx.fillRect(0, 0, 270, 164);
  ctx.strokeStyle = '#213248'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(0, 82.5); ctx.lineTo(270, 82.5); ctx.stroke();
  if (sourceTab === 'wave') {
    const shape = Number($('synth-wave').value);
    ctx.strokeStyle = '#38bdf8'; ctx.beginPath();
    for (let x = 0; x < 270; x++) {
      const phase = (x / 135) % 1;
      const sine = Math.sin(phase * Math.PI * 2);
      const saw = phase * 2 - 1;
      const value = [sine, saw, phase < .5 ? 1 : -1,
        1 - 4 * Math.abs(phase - .5), .45 * sine + .55 * saw][shape];
      const y = 82 - value * 58;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#22d3ee';
    for (let bin = 0; bin < peaks.length; bin++) {
      const x = 2 + bin * 266 / peaks.length;
      const height = Math.max(1, peaks[bin] * 71);
      ctx.beginPath(); ctx.moveTo(x, 82 - height); ctx.lineTo(x, 82 + height); ctx.stroke();
    }
  }
}
for (const tab of document.querySelectorAll('[data-source-tab]')) {
  tab.addEventListener('click', () => {
    sourceTab = tab.dataset.sourceTab;
    for (const button of document.querySelectorAll('[data-source-tab]')) {
      button.setAttribute('aria-selected', String(button === tab));
    }
    for (const name of ['wave', 'sample', 'blend']) {
      $(`source-${name}-panel`).hidden = name !== sourceTab;
    }
    requestAnimationFrame(paintSampleSliders);
    drawSourceGraph();
  });
}
const sliderValue = id => Number($(id).getAttribute('aria-valuenow'));
function sourceSnapshot() {
  return {
    waveform: Number($('synth-wave').value), waveRender: selectedSegment('wave-render-mode'),
    sampleBars: sliderValue('sample-bars'), sampleRoot: sliderValue('sample-root'),
    sampleBlend: sliderValue('sample-blend'), sampleXfade: sliderValue('sample-xfade'),
    sampleStretch: sliderValue('sample-stretch'), pitchMode: selectedSegment('sample-pitch-mode'),
    samplePitch: sliderValue('blend-pitch'), blendMode: Number($('blend-mode').value),
    keytrack: selectedSegment('blend-keytrack'), blendDepth: sliderValue('blend-depth'),
    output: sliderValue('source-output'), tab: sourceTab,
    sampleSource: Number($('sample-source-select').value), sampleMode,
  };
}
function sendSourceState() {
  const state = sourceSnapshot();
  for (const [id, value] of [
    [synthIds.waveform, state.waveform], [synthIds.addWave, state.waveRender],
    [synthIds.sampleRoot, state.sampleRoot], [synthIds.blend, state.sampleBlend * 2 - 1],
    [synthIds.sampleXfade, state.sampleXfade / 100], [synthIds.timeStretch, state.sampleStretch],
    [synthIds.pitchMode, state.pitchMode], [synthIds.samplePitch, state.samplePitch],
    [synthIds.blendMode, state.blendMode], [synthIds.keytrack, state.keytrack],
    [synthIds.blendDepth, state.blendDepth], [synthIds.output, state.output],
  ]) synthParameter(id, value);
}
function restoreSource(state) {
  $('synth-wave').value = String(state.waveform);
  synthParameter(synthIds.waveform, state.waveform);
  for (const [group, value] of [['wave-render-mode', state.waveRender],
    ['sample-pitch-mode', state.pitchMode], ['blend-keytrack', state.keytrack]]) {
    $(`${group}`).querySelector(`[data-value="${value}"]`).click();
  }
  $('blend-mode').value = String(state.blendMode);
  synthParameter(synthIds.blendMode, state.blendMode);
  for (const [slider, value] of [[sampleBars, state.sampleBars], [sampleRoot, state.sampleRoot],
    [sampleBlend, state.sampleBlend], [sampleXfade, state.sampleXfade],
    [sampleStretch, state.sampleStretch], [blendPitch, state.samplePitch],
    [blendDepth, state.blendDepth], [sourceOutput, state.output]]) slider.setValue(value, true);
  $('sample-source-select').value = String(state.sampleSource);
  sampleMode = state.sampleMode;
  $('sample-mode').textContent = sampleMode ? 'Free' : 'Retro';
  $('sample-mode').classList.toggle('free', sampleMode === 1);
  document.querySelector(`[data-source-tab="${state.tab}"]`).click();
  sendSourceState();
  drawSourceGraph();
}
function rackSnapshot() {
  return { source: sourceSnapshot(), adsr: adsr.snapshot(), filter: filter.snapshot(),
    fx1: fx1.snapshot(), fx2: fx2.snapshot(), eq: eq.snapshot(), lfos: lfo.snapshot(),
    atv: atv.snapshot(), slew: slew.snapshot(), sampleHold: sampleHold.snapshot(),
    compare: compare.snapshot(), cvMix: cvMix.snapshot(), range: range.snapshot(),
    scaleQuantizer: scaleQuantizer.snapshot(), transpose: transpose.snapshot(), noteFilter: noteFilter.snapshot(),
    velocityMapper: velocityMapper.snapshot(), arpeggiator: arpeggiator.snapshot() };
}
function restoreRack(state) {
  restoreSource(state.source);
  adsr.restore(state.adsr); filter.restore(state.filter);
  fx1.restore(state.fx1); fx2.restore(state.fx2); eq.restore(state.eq);
  lfo.restore(state.lfos ?? state.lfo);
  if (!editorMode) rackPatch.reflectControlRoute(lfo.snapshot().find(item => item.slot === 0)?.route);
  atv.restore(state.atv ?? { amount: 1, bias: 0, slot: 0, port: 0 });
  if (!editorMode) rackPatch.reflectControlInputRoute('atv1', { atv: atv.snapshot() });
  slew.restore(state.slew ?? { riseMs: 0, fallMs: 0, shape: 1, source: 0 });
  if (!editorMode) rackPatch.reflectControlInputRoute('slew1', { slew: slew.snapshot() });
  sampleHold.restore(state.sampleHold ?? {
    mode: 0, source: 0, triggerSource: 0, manualGate: false, held: 0, triggerHigh: false,
  });
  if (!editorMode) rackPatch.reflectControlInputRoute('sample_hold1', { sampleHold: sampleHold.snapshot() });
  compare.restore(state.compare ?? {
    direction: 0, threshold: 0, hysteresis: .05, source: 0, gate: false, pulseRemaining: 0,
  });
  cvMix.restore(state.cvMix ?? {
    level1: 1, level2: 0, level3: 0, level4: 0, offset: 0,
    source1: 0, source2: 0, source3: 0, source4: 0,
  });
  range.restore(state.range ?? { min: 0, max: 1, mode: 0, source: 0 });
  scaleQuantizer.restore(state.scaleQuantizer ?? { root: 0, scale: 1, direction: 1, connected: false });
  transpose.restore(state.transpose ?? { semitones: 0, source: 1, connected: false });
  noteFilter.restore(state.noteFilter ?? { low: 36, high: 96, mode: 0, source: 0, connected: false });
  velocityMapper.restore(state.velocityMapper ?? { amount: 1, curve: 0, offset: 0, source: 4, connected: false });
  arpeggiator.restore(state.arpeggiator ?? { mode: 0, hold: 0, rate: 8, octaves: 1, gate: 60, connected: false });
}
drawSourceGraph();
function resetSampleCaptureUI() {
  $('sample-cap').textContent = 'Cap';
  $('sample-cap').classList.remove('recording');
  $('sample-cap').disabled = false;
  $('sample-mode').disabled = false;
  $('sample-source-select').disabled = false;
}
$('sample-mode').onclick = () => {
  if (sampleJob || freeSource !== null) return;
  sampleMode = 1 - sampleMode;
  $('sample-mode').textContent = sampleMode ? 'Free' : 'Retro';
  $('sample-mode').classList.toggle('free', sampleMode === 1);
};
$('sample-cap').onclick = () => {
  if (!processor) { status('Start audio to capture a sample.'); return; }
  if (freeSource !== null) {
    const source = freeSource;
    freeSource = null;
    sampleJob = { source, mode: 1 };
    $('sample-cap').textContent = 'Cap';
    $('sample-cap').classList.remove('recording');
    $('sample-cap').disabled = true;
    status(`Freezing ${source === 0 ? 'Live' : `L${source}`} Free sample…`);
    post({ type: 'sample-free-stop' });
    return;
  }
  const source = Number($('sample-source-select').value);
  if (!editorMode && source === 0 && $('source').value === 'none') { status('Choose a dry input before capturing a Live sample.'); return; }
  if (source > 0 && !latest?.layers[source - 1]?.length) { status(`Record or commit a loop into L${source} before sampling it.`); return; }
  if (sampleJob || transferJob) return;
  if (sampleMode === 1) {
    freeSource = source;
    $('sample-cap').textContent = 'STOP';
    $('sample-cap').classList.add('recording');
    $('sample-mode').disabled = true;
    $('sample-source-select').disabled = true;
    $('sample-length').textContent = '0ms';
    status(`Recording ${source === 0 ? 'Live' : `L${source}`} Free sample. Press STOP to capture.`);
    post({ type: 'sample-free-start', source });
    return;
  }
  sampleJob = { source, bars: sampleBarsValue, mode: 0 };
  $('sample-cap').disabled = true;
  status(`Capturing recent ${source === 0 ? 'dry input' : `L${source} playback`} for the Main Sample voice…`);
  post({ type: 'sample-capture', source, bars: sampleBarsValue });
};

function sizeInstrument() {
  const frame = $('instrument-frame');
  const instrument = frame.querySelector('.instrument');
  const scale = Math.min(1, frame.clientWidth / 1280);
  instrument.style.transform = `scale(${scale})`;
  frame.style.height = `${Math.ceil(instrument.offsetHeight * scale)}px`;
  rackPatch.repaint();
}
new ResizeObserver(sizeInstrument).observe($('instrument-frame'));
sizeInstrument();
function rackUtilityTop(selector, inset = 0) {
  const content = document.querySelector('.rack-scroll-content');
  const bounds = content.getBoundingClientRect();
  const target = content.querySelector(selector).getBoundingClientRect();
  return Math.max(0, (target.top - bounds.top) / (bounds.width / content.offsetWidth) - inset);
}
$('patch-jump').onclick = () => {
  const scroll = $('rack-scroll');
  const bottom = scroll.scrollTop > 100;
  scroll.scrollTo({ top: bottom ? 0 : rackUtilityTop('.rack-route', 13), behavior: 'smooth' });
  $('patch-jump').textContent = bottom ? 'ROUTES ↓' : 'RACK ↑';
  $('patch-jump').setAttribute('aria-label', bottom ? 'Scroll to Main modulation route controls' : 'Scroll back to Main rack controls');
  requestAnimationFrame(() => lfo.paint());
};
for (const tab of document.querySelectorAll('[data-main-tab]')) {
  tab.addEventListener('click', () => {
    const synth = tab.dataset.mainTab === 'midisynth';
    $('layers').hidden = synth;
    $('midisynth-panel').hidden = !synth;
    for (const button of document.querySelectorAll('[data-main-tab]')) {
      const selected = button === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    requestAnimationFrame(() => { sizeInstrument(); if (synth) { paintSampleSliders(); adsr.paint(); filter.paint(); fx1.paint(); fx2.paint(); eq.paint(); lfo.paint(); atv.paint(); slew.paint(); sampleHold.paint(); compare.paint(); cvMix.paint(); range.paint(); scaleQuantizer.paint(); transpose.paint(); noteFilter.paint(); velocityMapper.paint(); arpeggiator.paint(); } });
  });
}
if (location.hash === '#slew') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-slew', 13); slew.paint(); });
}
if (location.hash === '#sample-hold') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-sample-hold', 13); sampleHold.paint(); });
}
if (location.hash === '#compare') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-compare', 217); compare.paint(); });
}
if (location.hash === '#cv-mix') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-cv-mix', 217); cvMix.paint(); });
}
if (location.hash === '#range') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-range', 217); range.paint(); });
}
if (location.hash === '#scale-quantizer') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-scale-quantizer', 217); scaleQuantizer.paint(); });
}
if (location.hash === '#transpose') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-transpose', 217); transpose.paint(); });
}
if (location.hash === '#note-filter') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-note-filter', 217); noteFilter.paint(); });
}
if (location.hash === '#velocity-mapper') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-velocity-mapper', 217); velocityMapper.paint(); });
}
if (location.hash === '#arpeggiator') {
  document.querySelector('[data-main-tab="midisynth"]').click();
  requestAnimationFrame(() => { $('rack-scroll').scrollTop = rackUtilityTop('.rack-arpeggiator', 221); arpeggiator.paint(); });
}

const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C'];
for (let index = 0; index < noteNames.length; index++) {
  const note = 60 + index;
  const key = document.createElement('button');
  key.type = 'button'; key.className = `synth-key ${noteNames[index].includes('♯') ? 'black' : 'white'}`;
  key.textContent = noteNames[index] + (index === 12 ? '5' : '4');
  key.setAttribute('aria-label', `Play ${key.textContent}`);
  const release = () => {
    if (!key.classList.contains('held')) return;
    key.classList.remove('held'); synthNote(1, note);
  };
  key.addEventListener('pointerdown', event => {
    if (!processor) return;
    key.setPointerCapture(event.pointerId);
    key.classList.add('held'); synthNote(0, note, 100);
  });
  key.addEventListener('pointerup', release);
  key.addEventListener('pointercancel', release);
  key.addEventListener('keydown', event => {
    if (!processor || key.classList.contains('held') || ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); key.classList.add('held'); synthNote(0, note, 100);
  });
  key.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) release(); });
  key.addEventListener('blur', release);
  $('synth-keys').append(key);
}

function drawWave(canvas, peaks, position, color, pending = 0) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0e1828'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] <= 0) continue;
    const x = Math.floor(i * w / peaks.length), y = Math.max(1, peaks[i] * h * .44);
    ctx.beginPath(); ctx.moveTo(x + .5, h / 2 - y); ctx.lineTo(x + .5, h / 2 + y); ctx.stroke();
  }
  if (peaks.length) {
    ctx.strokeStyle = '#f8fafc'; const x = position * w;
    ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke();
  }
  if (pending > 0) { ctx.fillStyle = '#84cc1655'; ctx.fillRect(0, h - 3, pending * w, 3); }
}

function drawDonut(canvas, layer, selected, color) {
  const ctx = canvas.getContext('2d'), center = 14;
  ctx.clearRect(0, 0, 28, 28); ctx.lineWidth = 5;
  ctx.strokeStyle = '#475a7555'; ctx.beginPath(); ctx.arc(center, center, 10, 0, Math.PI * 2); ctx.stroke();
  if (layer.length) {
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(center, center, 10, -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.max(.02, layer.position)); ctx.stroke();
    const angle = -Math.PI / 2 + Math.PI * 2 * layer.position;
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(center + Math.cos(angle) * 10,
      center + Math.sin(angle) * 10, 2, 0, Math.PI * 2); ctx.fill();
  }
  if (selected) { ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(center, center, 13, 0, Math.PI * 2); ctx.stroke(); }
}

function makeKnob(layer, id, label, min, max, initial, color) {
  const canvas = document.createElement('canvas'); canvas.className = 'knob';
  canvas.width = 60; canvas.height = 108; canvas.setAttribute('role', 'slider');
  canvas.setAttribute('aria-label', `Layer ${layer + 1} ${label}`);
  canvas.tabIndex = 0; canvas.dataset.value = initial;
  const set = (value) => {
    value = Math.max(min, Math.min(max, Math.round(value * 100) / 100));
    canvas.dataset.value = value; canvas.setAttribute('aria-valuenow', String(value));
    drawMainLayerKnob(canvas, value, min, max, label, color); layerControl(layer, id, value);
  };
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId); dragging = canvas;
    canvas.dataset.startY = event.clientY; canvas.dataset.startValue = canvas.dataset.value;
  });
  canvas.addEventListener('pointermove', event => {
    if (dragging !== canvas) return;
    set(Number(canvas.dataset.startValue) + (Number(canvas.dataset.startY) - event.clientY) / 150 * (max - min));
  });
  canvas.addEventListener('pointerup', () => { dragging = null; });
  canvas.addEventListener('dblclick', () => set(1));
  canvas.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { set(Number(canvas.dataset.value) + .01); event.preventDefault(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { set(Number(canvas.dataset.value) - .01); event.preventDefault(); }
  });
  drawMainLayerKnob(canvas, initial, min, max, label, color);
  return canvas;
}

const layerElements = [], donutElements = [];
for (let index = 0; index < project.layers; index++) {
  const donut = document.createElement('button'); donut.className = 'donut'; donut.title = `Select layer ${index + 1}`;
  donut.innerHTML = '<canvas width="28" height="28"></canvas>';
  donut.onclick = () => control(project.controls.activeLayer, index); $('donuts').append(donut); donutElements.push(donut);
  const row = document.createElement('div'); row.className = 'layer'; row.dataset.layer = index;
  row.innerHTML = `<div class="layer-meta"><div class="label">L${index}</div><div class="state">Empty</div><div class="bars"></div></div><canvas class="wave" width="980" height="108" aria-label="Layer ${index + 1} waveform"></canvas>`;
  const volume = makeKnob(index, project.layerControls.volume, 'Vol', 0, 2, 1, '#a78bfa');
  const speed = makeKnob(index, project.layerControls.speed, 'Speed', -4, 4, 1, '#22d3ee');
  row.append(volume, speed);
  const mute = document.createElement('button'); mute.className = 'layer-button'; mute.textContent = 'Mute';
  mute.onclick = () => { control(project.controls.activeLayer, index); layerControl(index, project.layerControls.mute, latest?.layers[index].muted ? 0 : 1); };
  const actions = document.createElement('div'); actions.className = 'layer-actions';
  const clear = document.createElement('button'); clear.textContent = '✕'; clear.title = 'Clear layer';
  clear.onclick = () => { control(project.controls.activeLayer, index); command(project.commands.clearLayer, index); };
  const play = document.createElement('button'); play.textContent = '▶'; play.title = 'Play or pause layer';
  play.onclick = () => { control(project.controls.activeLayer, index); layerControl(index, project.layerControls.play, latest?.layers[index].playing ? 0 : 1); };
  actions.append(clear, play); row.append(mute, actions); $('layers').append(row);
  row.addEventListener('click', event => { if (event.target === row || row.querySelector('.layer-meta').contains(event.target)) control(project.controls.activeLayer, index); });
  const wave = row.querySelector('.wave');
  let scrub = null;
  const scrubPos = event => Math.max(0, Math.min(1,
    (event.clientX - wave.getBoundingClientRect().left) / wave.getBoundingClientRect().width));
  wave.addEventListener('pointerdown', event => {
    control(project.controls.activeLayer, index);
    if (!latest?.layers[index].length) return;
    wave.setPointerCapture(event.pointerId); dragging = wave;
    const position = scrubPos(event);
    scrub = { savedSpeed: latest.layers[index].speed, lastPosition: position, smoothedSpeed: 0,
      idle: null, lastSent: 0 };
    layerControl(index, project.layerControls.speed, 0);
    layerControl(index, project.layerControls.seek, position);
  });
  wave.addEventListener('pointermove', event => {
    if (dragging !== wave || !scrub) return;
    const position = scrubPos(event), delta = position - scrub.lastPosition;
    scrub.lastPosition = position;
    layerControl(index, project.layerControls.seek, position);
    if (Math.abs(delta) > .0006) {
      const signed = delta * latest.layers[index].length / Math.max(1, latest.sampleRate / 70);
      scrub.smoothedSpeed = scrub.smoothedSpeed * .6 + signed * .4;
      const next = Math.max(-4, Math.min(4, scrub.smoothedSpeed));
      if (Math.abs(next - scrub.lastSent) > .01 || Math.sign(next) !== Math.sign(scrub.lastSent)) {
        layerControl(index, project.layerControls.speed, next); scrub.lastSent = next;
        post({ type: 'snapshot' });
      }
    }
    clearTimeout(scrub.idle);
    scrub.idle = setTimeout(() => { if (scrub) { layerControl(index, project.layerControls.speed, 0); scrub.lastSent = 0; } }, 50);
  });
  const endScrub = event => {
    if (dragging !== wave || !scrub) return;
    clearTimeout(scrub.idle);
    layerControl(index, project.layerControls.seek, scrubPos(event));
    layerControl(index, project.layerControls.speed, scrub.savedSpeed);
    post({ type: 'snapshot' });
    scrub = null; dragging = null;
  };
  wave.addEventListener('pointerup', endScrub);
  wave.addEventListener('pointercancel', endScrub);
  layerElements.push({ row, wave, volume, speed, mute, play });
}
const capturePlane = mountMainCapturePlane($('capture'), bars, labels,
  duration => command(project.commands.segment, duration));

const stateNames = ['Empty', 'Playing', 'Recording', 'Stopped', 'Paused'];
const stateColors = ['#64748b', '#34d399', '#ef4444', '#fde047', '#a78bfa'];
function render(data) {
  latest = data;
  if (data.lfos) lfo.setStatus(data.lfos);
  if (data.atv) atv.setStatus(data.atv);
  if (data.slew) slew.setStatus(data.slew);
  if (data.sampleHold) sampleHold.setStatus(data.sampleHold);
  if (data.compare) compare.setStatus(data.compare);
  if (data.cvMix) cvMix.setStatus(data.cvMix);
  if (data.range) range.setStatus(data.range);
  if (data.scaleQuantizer) scaleQuantizer.setStatus(data.scaleQuantizer);
  if (data.transpose) transpose.setStatus(data.transpose);
  if (data.noteFilter) noteFilter.setStatus(data.noteFilter);
  if (data.velocityMapper) velocityMapper.setStatus(data.velocityMapper);
  if (data.arpeggiator) arpeggiator.setStatus(data.arpeggiator);
  latestSamplePeaks = data.samplePeaks ?? [];
  eq.setResponse(data.eqResponse);
  drawSourceGraph();
  if (document.activeElement !== $('tempo')) $('tempo').value = Math.round(data.tempo);
  if (document.activeElement !== $('mode')) $('mode').value = String(data.mode);
  capturePlane.setMode(data.mode === 2);
  $('rec').classList.toggle('active', data.recording);
  $('rec').textContent = data.recording ? '● REC*' : '● REC';
  $('overdub').classList.toggle('active', data.overdub);
  const playing = data.layers.some(layer => layer.playing);
  $('play').classList.toggle('active', playing);
  $('play').textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
  $('fire').hidden = !(data.forwardBars > 0);
  if (data.forwardBars > 0) $('fire').textContent = `Commit armed ${bars.find((bar) => bar === data.forwardBars) ?? data.forwardBars} bar segment`;
  for (let index = 0; index < project.layers; index++) {
    const layer = data.layers[index], ui = layerElements[index];
    ui.row.classList.toggle('active', index === data.active);
    ui.row.querySelector('.state').textContent = stateNames[layer.state] ?? 'Empty';
    ui.row.querySelector('.state').style.color = stateColors[layer.state] ?? '#64748b';
    ui.row.querySelector('.bars').textContent = formatBars(layer.bars);
    ui.mute.textContent = layer.muted ? 'Muted' : 'Mute'; ui.mute.classList.toggle('muted', layer.muted);
    ui.play.textContent = layer.playing ? '⏸' : '▶'; ui.play.classList.toggle('playing', layer.playing);
    drawWave(ui.wave, layer.peaks, layer.position, layer.muted ? '#94a3b8' : stateColors[layer.state], layer.pending);
    if (dragging !== ui.volume) { ui.volume.dataset.value = layer.volume; drawMainLayerKnob(ui.volume, layer.volume, 0, 2, 'Vol', '#a78bfa'); }
    if (dragging !== ui.speed) { ui.speed.dataset.value = layer.speed; drawMainLayerKnob(ui.speed, layer.speed, -4, 4, 'Speed', '#22d3ee'); }
    drawDonut(donutElements[index].querySelector('canvas'), layer, index === data.active, layerColors[index]);
  }
  capturePlane.render(data.segments, data.forwardBars);
}

function nextSaveChunk() {
  const job = transferJob;
  if (!job || job.kind !== 'save') return;
  while (job.layer < project.layers) {
    const frames = job.state.layers[job.layer].frames;
    if (job.offset < frames) {
      post({ type: 'save-chunk', requestId: job.id, layer: job.layer,
        offset: job.offset, frames: Math.min(4096, frames - job.offset) });
      return;
    }
    job.layer++; job.offset = 0;
  }
  if (job.sampleOffset < job.state.sample.frames) {
    post({ type: 'save-sample-chunk', requestId: job.id, offset: job.sampleOffset,
      frames: Math.min(4096, job.state.sample.frames - job.sampleOffset) });
    return;
  }
  post({ type: 'save-end', requestId: job.id });
  for (let index = 0; index < project.layers; index++) {
    const layer = job.state.layers[index];
    layer.pcmF32Base64 = layer.frames ? encodePcm(job.audio[index]) : '';
  }
  job.state.sample.pcmF32Base64 = job.state.sample.frames ? encodePcm(job.sampleAudio) : '';
  const blob = new Blob([JSON.stringify(job.state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'manifold-main-looper.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Downloaded the Main instrument session.');
  transferJob = null; $('save-session').disabled = false;
}

function nextImportLayer() {
  const job = transferJob;
  if (!job || job.kind !== 'import') return;
  while (job.layer < project.layers && !job.state.layers[job.layer].frames) job.layer++;
  if (job.layer === project.layers) {
    if (job.sampleAudio) {
      const stereo = job.sampleAudio;
      job.sampleAudio = null;
      post({ type: 'import-sample-begin', requestId: job.id, frames: job.state.sample.frames, stereo }, [stereo.buffer]);
    } else post({ type: 'import-end', requestId: job.id });
    return;
  }
  const layer = job.state.layers[job.layer];
  const stereo = job.audio[job.layer];
  post({ type: 'import-begin', requestId: job.id, layer: job.layer, stereo,
    bars: layer.bars, position: layer.position, playing: layer.playing }, [stereo.buffer]);
  job.audio[job.layer] = null;
}

function handleTransfer(data) {
  const job = transferJob;
  if (!job || job.id !== data.requestId) return;
  if (data.type === 'save-started' && job.kind === 'save') {
    job.state = data.state;
    job.state.rack = job.rack;
    job.state.rackDocument = job.rackDocument;
    Object.assign(job.state.rack.sampleHold, data.sampleHold);
    Object.assign(job.state.rack.compare, data.compare);
    job.audio = data.state.layers.map(layer => new Float32Array(layer.frames * 2));
    job.sampleAudio = new Float32Array(data.state.sample.frames * 2);
    nextSaveChunk();
  } else if (data.type === 'save-chunk' && job.kind === 'save') {
    job.audio[data.layer].set(data.stereo, data.offset * 2);
    job.offset = data.offset + data.stereo.length / 2;
    nextSaveChunk();
  } else if (data.type === 'save-sample-chunk' && job.kind === 'save') {
    job.sampleAudio.set(data.stereo, data.offset * 2);
    job.sampleOffset = data.offset + data.stereo.length / 2;
    nextSaveChunk();
  } else if (data.type === 'import-started' && job.kind === 'import') {
    nextImportLayer();
  } else if (data.type === 'import-progress' && job.kind === 'import') {
    if (data.done) { job.layer++; nextImportLayer(); }
    else post({ type: 'import-step', requestId: job.id, layer: data.layer });
  } else if (data.type === 'import-sample-progress' && job.kind === 'import') {
    if (data.done) post({ type: 'import-end', requestId: job.id });
    else post({ type: 'import-sample-step', requestId: job.id });
  } else if (data.type === 'import-complete' && job.kind === 'import') {
    $('target').value = Math.round(job.state.targetBpm);
    transferJob = null;
    void rackPatch.restore(job.state.version >= 16 ? job.state.rackDocument : null).then(() => {
      if (job.state.version >= 2) {
        restoreRack(job.state.rack);
        $('sample-length').textContent = `${Math.round(job.state.sample.frames / context.sampleRate * 1000)}ms`;
      }
      status('Opened the four-layer Main session.');
      post({ type: 'snapshot' });
    }).catch(error => status(`Session audio cables could not be restored: ${error.message}`));
  }
}

$('save-session').onclick = () => {
  if (!processor) { status('Start audio before downloading a looper session.'); return; }
  if (rackPatch.pending()) { status('Wait for the cable change before downloading.'); return; }
  if (transferJob || sampleJob || freeSource !== null) return;
  if (editorMode) {
    $('save-session').disabled = true;
    status('Collecting native Main session…');
    window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'session-export' }));
    return;
  }
  const id = nextRequest++;
  let rack;
  try {
    rack = validateMainRackState(rackSnapshot(), true, project.modulation, true, true, true, true, true, true, true, true, true, true, true);
    validateMainRackControlRoute(rackPatch.document(), rack, rackCatalog);
  }
  catch (error) { status(error.message); return; }
  transferJob = { kind: 'save', id, state: null, audio: null, layer: 0, offset: 0,
    sampleOffset: 0, sampleAudio: null, rack, rackDocument: rackPatch.document() };
  $('save-session').disabled = true; status('Collecting loop audio for download…');
  post({ type: 'save-start', requestId: id });
};
$('open-session').onchange = async () => {
  if (!processor) { status('Start audio before opening a looper session.'); return; }
  if (rackPatch.pending()) { status('Wait for the cable change before opening.'); $('open-session').value = ''; return; }
  if (transferJob || sampleJob || freeSource !== null) return;
  const file = $('open-session').files[0];
  if (!file) return;
  if (editorMode) {
    try {
      if (!file.size || file.size > 300 * 1024 * 1024) throw new Error('Session exceeds native limits.');
      $('open-session').disabled = true;
      status(`Opening ${file.name} in the native host…`);
      window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'session-import-start', size: file.size }));
      const reader = file.stream().getReader();
      let chunks = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.length; offset += 2048) {
          const part = value.subarray(offset, offset + 2048);
          window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'session-import-chunk',
            data: btoa(String.fromCharCode(...part)) }));
          if (++chunks % 32 === 0) await new Promise(requestAnimationFrame);
        }
      }
      window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'session-import-end' }));
    } catch (error) {
      status(error.message);
      $('open-session').disabled = false;
    }
    $('open-session').value = '';
    return;
  }
  try {
    const state = JSON.parse(await file.text());
    if (state.format !== project.format || !Number.isInteger(state.version) || state.version < 1
      || state.version > project.sessionVersion || state.id !== project.id
      || state.sampleRate !== context.sampleRate || !Array.isArray(state.layers) || state.layers.length !== project.layers
      || !Number.isFinite(state.tempo) || !Number.isFinite(state.targetBpm)
      || !Number.isInteger(state.activeLayer) || state.activeLayer < 0 || state.activeLayer >= project.layers
      || !Number.isInteger(state.mode) || state.mode < 0 || state.mode > 2) {
      throw new Error('This session is incompatible with the running looper or sample rate.');
    }
    const audio = state.layers.map(layer => {
      if (!Number.isInteger(layer.frames) || layer.frames < 0 || layer.frames > context.sampleRate * project.captureSeconds
        || !Number.isFinite(layer.bars) || !Number.isFinite(layer.position)
        || !Number.isFinite(layer.volume) || !Number.isFinite(layer.speed)
        || layer.position < 0 || layer.position > 1 || layer.volume < 0 || layer.volume > 2
        || layer.speed < -4 || layer.speed > 4) throw new Error('Invalid looper layer data.');
      return layer.frames ? decodePcm(layer.pcmF32Base64, layer.frames) : null;
    });
    let sampleAudio = null;
    if (state.version >= 16) {
      state.rackDocument = validateMainRackInsertDocument(state.rackDocument, rackCatalog);
      validateMainRackControlRoute(state.rackDocument, state.rack, rackCatalog);
    }
    if (state.version >= 2) {
      validateMainRackState(state.rack, state.version >= 3, project.modulation, state.version >= 4, state.version >= 5, state.version >= 6, state.version >= 7, state.version >= 8, state.version >= 9, state.version >= 10, state.version >= 11, state.version >= 12, state.version >= 13, state.version >= 14, state.version >= 15);
      if (!state.sample || !Number.isInteger(state.sample.frames)
        || state.sample.frames < 0 || state.sample.frames > Math.min(1_440_000, context.sampleRate * project.captureSeconds)
        || (state.sample.frames === 0 && state.sample.pcmF32Base64 !== '')) {
        throw new Error('Invalid Main Sample state.');
      }
      sampleAudio = state.sample.frames ? decodePcm(state.sample.pcmF32Base64, state.sample.frames) : null;
    }
    const id = nextRequest++;
    const metadata = { ...state, layers: state.layers.map(({ pcmF32Base64: _pcm, ...layer }) => layer),
      sample: state.sample ? { frames: state.sample.frames } : undefined };
    transferJob = { kind: 'import', id, state: metadata, audio, sampleAudio, layer: 0 };
    status('Opening looper session…');
    post({ type: 'import-start', requestId: id, state: metadata });
  } catch (error) { status(error.message); }
  $('open-session').value = '';
};

async function start() {
  if (context) return;
  if (rackPatch.pending()) { status('Wait for the cable change before starting audio.'); return; }
  const sourceKind = $('source').value;
  if (sourceKind === 'file' && !$('file').files[0]) { status('Choose an audio file first.'); return; }
  const button = $('audio-button'); button.disabled = true; $('rack-view-switch').disabled = true; status('Preparing Main looper…');
  try {
    context = new AudioContext({ latencyHint: 'interactive' });
    await context.resume();
    await context.audioWorklet.addModule(new URL('./audio/main-looper-processor.js', import.meta.url));
    const response = await fetch(`${import.meta.env.BASE_URL}manifold_filter.wasm`);
    if (!response.ok) throw new Error('Wasm audio engine missing. Run ./scripts/build-wasm.sh.');
    const wasmBytes = await response.arrayBuffer();
    processor = new AudioWorkletNode(context, 'manifold-main-looper', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    processor.connect(context.destination);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Looper preparation timed out')), 20000);
      processor.port.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
        else if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
      };
      const insert = compileMainRackInsert(rackPatch.document(), rackCatalog);
      const rackInsert = { ...insert, nodes: insert.nodes.map(node =>
        ({ id: node.id, kind: NODE_TYPES[node.type].code, a: node.a ?? 0, b: node.b ?? 0 })) };
      processor.port.postMessage({ type: 'init', wasmBytes, project, rackInsert }, [wasmBytes]);
    });
    processor.port.onmessage = ({ data }) => {
      if (data.type === 'snapshot') render(data);
      else if (data.type === 'rack-route-applied' || data.type === 'control-route-applied') {
        const pending = pendingRackRoutes.get(data.requestId);
        if (pending) { clearTimeout(pending.timer); pendingRackRoutes.delete(data.requestId); pending.resolve(data.accepted); }
      }
      else if (data.type === 'error') {
        if (transferJob) { transferJob = null; $('save-session').disabled = false; }
        sampleJob = null; freeSource = null; resetSampleCaptureUI();
        status(`Audio error: ${data.message}`);
      }
      else if (data.type === 'sample-free-progress' && freeSource !== null) {
        $('sample-length').textContent = `${Math.round(data.frames / context.sampleRate * 1000)}ms`;
      }
      else if (data.type === 'sample-capture-started') {
        sampleJob.frames = data.frames;
        status(`Freezing ${(data.frames / context.sampleRate).toFixed(2)}s of ${data.source === 0 ? 'dry input' : `L${data.source} playback`}…`);
      }
      else if (data.type === 'sample-capture-ready' || data.type === 'sample-publish-progress') {
        post({ type: 'sample-publish-next' });
      }
      else if (data.type === 'sample-capture-complete') {
        const source = sampleJob?.source ?? 0;
        const mode = sampleJob?.mode ?? 0;
        sampleJob = null;
        resetSampleCaptureUI();
        $('sample-length').textContent = `${Math.round(data.frames / context.sampleRate * 1000)}ms`;
        sampleBlend.setValue(1, true);
        status(`${source === 0 ? 'Live' : `L${source}`} ${mode === 1 ? 'Free ' : ''}sample captured. Play the keyboard to hear the Sample voice.`);
        post({ type: 'snapshot' });
      }
      else if (data.type === 'rejected') status('That looper action could not be applied.');
      else handleTransfer(data);
    };
    sendSourceState();
    adsr.sendDefaults();
    filter.sendDefaults();
    fx1.sendDefaults(); fx2.sendDefaults();
    eq.sendState();
    lfo.sendState();
    atv.sendState();
    slew.sendState();
    sampleHold.sendState();
    compare.sendState();
    cvMix.sendState();
    range.sendState();
    scaleQuantizer.sendState();
    transpose.sendState();
    noteFilter.sendState();
    velocityMapper.sendState();
    arpeggiator.sendState();
    if (sourceKind === 'microphone') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      sourceNode = context.createMediaStreamSource(stream);
    } else if (sourceKind === 'file') {
      const bytes = await $('file').files[0].arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      sourceNode = context.createBufferSource(); sourceNode.buffer = buffer; sourceNode.loop = true; sourceNode.start();
    } else if (sourceKind === 'oscillator') {
      sourceNode = context.createOscillator(); sourceNode.type = 'sine';
      sourceNode.frequency.value = Number($('pitch').value) || 220; sourceNode.start();
    }
    if (sourceNode) {
      inputGain = context.createGain(); inputGain.gain.value = sourceKind === 'oscillator' ? .18 : 1;
      sourceNode.connect(inputGain).connect(processor);
    }
    poll = setInterval(() => post({ type: 'snapshot' }), 100);
    post({ type: 'snapshot' });
    button.textContent = 'Stop audio'; button.disabled = false; button.onclick = stop;
    $('rack-view-switch').disabled = false;
    $('source').disabled = true;
    status(`Running · ${sourceKind === 'none' ? 'no dry input' : sourceKind === 'oscillator' ? 'test tone' : sourceKind === 'file' ? 'looping audio file' : 'microphone'} + Main voice bank · all four layers capturing`);
  } catch (error) {
    status(error.message); await stop();
  }
}
async function stop() {
  for (const pending of pendingRackRoutes.values()) { clearTimeout(pending.timer); pending.resolve(false); }
  pendingRackRoutes.clear();
  synthNote(2);
  midiHold.clear(); soundingMidiNotes.clear();
  document.querySelectorAll('.synth-key.held').forEach(key => key.classList.remove('held'));
  if (transferJob?.kind === 'import') post({ type: 'import-cancel' });
  if (sampleJob) post({ type: 'sample-cancel' });
  if (freeSource !== null) post({ type: 'sample-free-cancel' });
  sampleJob = null; freeSource = null; resetSampleCaptureUI();
  $('sample-length').textContent = '0ms';
  sampleBlend.setValue(0, true);
  transferJob = null; $('save-session').disabled = false;
  clearInterval(poll); poll = null;
  sourceNode?.disconnect(); if (sourceNode?.stop) { try { sourceNode.stop(); } catch { /* already stopped */ } }
  inputGain?.disconnect(); processor?.disconnect(); stream?.getTracks().forEach(track => track.stop());
  await context?.close(); sourceNode = null; inputGain = null; processor = null; stream = null; context = null;
  $('audio-button').textContent = 'Start audio'; $('audio-button').disabled = false; $('audio-button').onclick = start;
  $('rack-view-switch').disabled = false;
  $('source').disabled = false;
}
$('audio-button').onclick = start;
$('source').onchange = () => { $('file-label').hidden = $('source').value !== 'file'; $('pitch-label').hidden = $('source').value !== 'oscillator'; };
$('synth-wave').onchange = () => { synthParameter(synthIds.waveform, Number($('synth-wave').value)); drawSourceGraph(); };
wireSegments('wave-render-mode', mode => synthParameter(synthIds.addWave, mode));
wireSegments('sample-pitch-mode', mode => {
  synthParameter(synthIds.pitchMode, mode);
  $('sample-stretch').hidden = mode === 0;
  requestAnimationFrame(paintSampleSliders);
});
$('blend-mode').onchange = () => synthParameter(synthIds.blendMode, Number($('blend-mode').value));
wireSegments('blend-keytrack', mode => synthParameter(synthIds.keytrack, mode));
$('pitch').onchange = () => { if (sourceNode?.frequency) sourceNode.frequency.setTargetAtTime(Math.max(60, Math.min(1200, Number($('pitch').value))), context.currentTime, .01); };
$('mode').onchange = () => {
  capturePlane.setMode($('mode').value === '2');
  control(project.controls.mode, Number($('mode').value));
};
$('tempo').onchange = () => control(project.controls.tempo, Number($('tempo').value));
$('target').onchange = () => control(project.controls.targetBpm, Number($('target').value));
$('rec').onclick = () => command(latest?.recording ? project.commands.stopRecord : project.commands.record);
$('play').onclick = () => command(latest?.layers.some(layer => layer.playing) ? project.commands.pause : project.commands.play);
$('stop').onclick = () => command(project.commands.stop);
$('overdub').onclick = () => control(project.controls.overdub, latest?.overdub ? 0 : 1);
$('clear-all').onclick = () => command(project.commands.clearAll);
$('fire').onclick = () => command(project.commands.fireForward);

function editorPeaks(base64, frames) {
  if (!frames || !base64) return [];
  const audio = decodePcm(base64, frames);
  return Array.from({ length: 128 }, (_, bin) => {
    const start = Math.floor(frames * bin / 128);
    const end = Math.max(start + 1, Math.floor(frames * (bin + 1) / 128));
    let peak = 0;
    for (let frame = start; frame < Math.min(end, frames); frame++) {
      peak = Math.max(peak, Math.abs(audio[frame * 2]), Math.abs(audio[frame * 2 + 1]));
    }
    return peak;
  });
}

function editorSnapshot(session) {
  return {
    tempo: session.tempo, active: session.activeLayer, mode: session.mode,
    recording: false, overdub: session.overdub, forwardBars: 0,
    captured: 0, sampleRate: session.sampleRate,
    layers: session.layers.map(layer => ({
      state: !layer.frames ? 0 : layer.playing ? 1 : 3,
      length: layer.frames, position: layer.position, bars: layer.bars,
      pending: 0, volume: layer.volume, speed: layer.speed,
      muted: layer.muted, playing: layer.playing,
      peaks: layer.peaks ?? editorPeaks(layer.pcmF32Base64, layer.frames),
    })),
    segments: bars.map(() => Array(128).fill(0)),
    sampleFrames: session.sample?.frames ?? 0,
    samplePeaks: session.sample?.peaks
      ?? editorPeaks(session.sample?.pcmF32Base64, session.sample?.frames ?? 0),
    eqResponse: [],
  };
}

if (editorMode) {
  window.manifoldEditorLayoutResult = result => {
    const pending = pendingRackLayouts.get(result?.requestId);
    if (!pending) return;
    pendingRackLayouts.delete(result.requestId);
    clearTimeout(pending.timer);
    pending.resolve(result.ok === true);
  };
  for (const id of ['audio-button']) {
    $(id).disabled = true;
  }
  document.querySelectorAll('[id^="lfo-reset"], [id^="lfo-sync"]').forEach(control => {
    control.disabled = true;
  });
  window.manifoldEditorStatus = status;
  window.manifoldEditorImportResult = (result) => {
    $('open-session').disabled = false;
    status(result?.message || 'Main session import ended.');
  };
  window.manifoldEditorExportResult = (result) => {
    $('save-session').disabled = false;
    status(result?.message || 'Main session export ended.');
  };
  window.manifoldEditorLiveStatus = (data) => {
    if (!latest || !Array.isArray(data?.layers) || data.layers.length !== project.layers) return;
    const layers = data.layers.map((layer, index) => ({
      ...latest.layers[index], ...layer,
      peaks: layer.peaks ?? (layer.length === latest.layers[index].length
        ? latest.layers[index].peaks : []),
    }));
    render({ ...latest, ...data, layers });
    if (Number.isFinite(data.sampleFrames)) {
      $('sample-length').textContent = `${Math.round(data.sampleFrames / data.sampleRate * 1000)}ms`;
    }
    if (Number.isFinite(data.targetBpm) && document.activeElement !== $('target')) {
      $('target').value = Math.round(data.targetBpm);
    }
  };
  window.manifoldEditorSampleUpdate = (data) => {
    switch (data?.phase) {
      case 'free-started':
        status('Recording Free sample from the selected host source. Press STOP to capture.');
        break;
      case 'started':
        status(`Freezing ${data.frames} frames for the Main Sample voice…`);
        break;
      case 'progress':
        status(`Preparing Main Sample ${data.copied} / ${data.total} frames…`);
        break;
      case 'published':
        sampleJob = null; freeSource = null; resetSampleCaptureUI();
        $('sample-length').textContent = `${Math.round(data.frames / context.sampleRate * 1000)}ms`;
        sampleBlend.setValue(1, true);
        status('Main Sample captured. Play the keyboard to hear the new source.');
        break;
      case 'free-cancelled':
        sampleJob = null; freeSource = null; resetSampleCaptureUI();
        status('Free Sample recording cancelled.');
        break;
      case 'rejected':
        sampleJob = null; freeSource = null; resetSampleCaptureUI();
        status('Main Sample capture was rejected by the native host.');
        break;
      default:
        break;
    }
  };
  window.manifoldEditorReceive = (session) => {
    // A host save can publish an older full snapshot while a rack gesture is
    // awaiting acknowledgement. Keep the local gesture intact; the host sends
    // a fresh presentation after it accepts the edit.
    if (rackPatch.pending()) return;
    if (session?.id !== project.id || session.version !== project.sessionVersion
      || !Array.isArray(session.layers) || session.layers.length !== project.layers
      || !Number.isFinite(session.sampleRate) || !session.rack) {
      status('The native Main session could not be shown.');
      return;
    }
    applyingEditorState = true;
    try {
      sampleJob = null; freeSource = null; resetSampleCaptureUI();
      context = { sampleRate: session.sampleRate };
      processor = { port: { postMessage: () => {} } };
      restoreRack(session.rack);
      void rackPatch.restore(session.rackDocument, true).catch(error => status(error.message));
      $('target').value = Math.round(session.targetBpm);
      $('sample-length').textContent = `${Math.round((session.sample?.frames ?? 0) / session.sampleRate * 1000)}ms`;
      render(editorSnapshot(session));
      status('Main session · native audio engine');
      window.ipc?.postMessage(JSON.stringify({ version: 1, kind: 'state-applied', id: project.id }));
    } catch (error) {
      status(`Main editor state error: ${error.message}`);
    } finally {
      applyingEditorState = false;
    }
  };
  if (window.__manifoldPendingState) {
    window.manifoldEditorReceive(window.__manifoldPendingState);
    delete window.__manifoldPendingState;
  }
  window.ipc?.postMessage(JSON.stringify({ version: 1, kind: 'editor-ready' }));
  setInterval(() => window.ipc?.postMessage(JSON.stringify({ version: 1, kind: 'snapshot' })), 100);
}
