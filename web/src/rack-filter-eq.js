import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject, buildRackModuleHostGraph } from '@manifold/author/examples/rack-module-host';
import { decodeSampleAsset, GraphWorkspace } from '@manifold/author';
import { analyzeStereo } from '@manifold/author/analysis';
import { createFourLayerLoopController, layerPath, snapshotWithLoopAudio } from
  '@manifold/author/examples/four-layer-loops';
import sampleFixture from '../../projects/graph-workspace/authored-sample-voice-chain.json';

const $ = id => document.getElementById(id);
const SELECT = '/rack_host/module/index';
const CUTOFF = '/midi/synth/rack/filter/1/cutoff';
const FX_MIX = '/midi/synth/rack/fx/1/mix';
const INPUT_MODE = '/rack_host/input_a/mode';
const INPUT_PITCH = '/rack_host/input_a/pitch';
const INPUT_LEVEL = '/rack_host/input_a/level';
const B_MODE = '/rack_host/input_b/mode';
const B_PITCH = '/rack_host/input_b/pitch';
const B_LEVEL = '/rack_host/input_b/level';
const BLEND_AMOUNT = '/midi/synth/rack/blend_simple/1/blendAmount';
const BLEND_MODE = '/midi/synth/rack/blend_simple/1/mode';
const BLEND_MOD_AMOUNT = '/midi/synth/rack/blend_simple/1/blendModAmount';
const OSC_BASE = '/midi/synth/rack/osc/1';
const SAMPLE_BASE = '/midi/synth/rack/sample/1';
let context = null;
let host = null;
let busy = false;
const adapters = {
  setRoute: route => host.setRoute(route),
  setParameter: edit => host.setParameter(edit),
  setParameterBatch: edits => host.setParameterBatch(edits),
  sendEvent: event => host.sendEvent(event),
  captureWindow: (...args) => host.captureWindow(...args),
  armFreeCapture: (...args) => host.armFreeCapture(...args),
  cancelFreeCapture: () => host.cancelFreeCapture(),
  replaceSample: (...args) => host.replaceSample(...args),
  analyzeSample: (stereo, sourceRate) => analyzeStereo(stereo, sourceRate),
};
let project = createProject(adapters, buildRackModuleHostGraph({ selection: 4,
  sampleSource: { ...decodeSampleAsset(sampleFixture.assets[0]), label: 'Rack Sample source' } }));
const expectedInstances = new Map(project.toProject().instances.map(entry =>
  [entry.path, entry.nodeId]));
const expectedControls = new Set(project.toProject().controls.map(entry => entry.path));

function display() {
  const documentState = project.toProject();
  $('project').textContent = JSON.stringify({ ...documentState,
    assets: documentState.assets?.map(({ pcmF32Base64: _pcm, ...metadata }) =>
      ({ ...metadata, pcm: 'embedded in downloaded project' })) }, null, 2);
  $('instances').replaceChildren(...documentState.instances.map(instance => {
    const item = document.createElement('li');
    item.textContent = `${instance.path} → node ${instance.nodeId}`;
    return item;
  }));
  const selected = documentState.controls.find(control => control.path === SELECT).value;
  $('oscillator').setAttribute('aria-pressed', String(selected === 1));
  $('sample').setAttribute('aria-pressed', String(selected === 2));
  $('filter').setAttribute('aria-pressed', String(selected === 4));
  $('blend').setAttribute('aria-pressed', String(selected === 3));
  $('fx').setAttribute('aria-pressed', String(selected === 5));
  $('eq').setAttribute('aria-pressed', String(selected === 6));
  for (const [id, path] of [['osc-manual-level', `${OSC_BASE}/manualLevel`],
    ['osc-waveform', `${OSC_BASE}/waveform`], ['osc-render-mode', `${OSC_BASE}/renderMode`]]) {
    const value = documentState.controls.find(control => control.path === path).value;
    $(id).value = String(value);
    if (id === 'osc-manual-level') $('osc-manual-level-value').textContent = `${Math.round(value * 100)}%`;
  }
  for (const [id, suffix] of [['osc-voice-pitch', 'vOct'], ['osc-voice-fm', 'fm'],
    ['osc-voice-pw', 'pwCv'], ['osc-voice-gate', 'gate']]) {
    const value = documentState.controls.find(control =>
      control.path === `${OSC_BASE}/voice/1/${suffix}`).value;
    $(id).value = String(value);
    $(`${id}-value`).textContent = suffix === 'vOct' ? `MIDI ${value}`
      : suffix === 'fm' ? `${Math.round(value * 12)} semitones`
        : `${Math.round(value * 100)}%`;
  }
  for (const voice of [1, 8]) {
    for (const [control, suffix] of [['gate', 'gate'], ['pitch', 'vOct']]) {
      const value = documentState.controls.find(entry =>
        entry.path === `${SAMPLE_BASE}/voice/${voice}/${suffix}`).value;
      $(`sample-${control}-${voice}`).value = String(value);
      $(`sample-${control}-${voice}-value`).textContent = suffix === 'vOct'
        ? `MIDI ${value}` : `${Math.round(value * 100)}%`;
    }
  }
  $('sample-mode').value = String(documentState.controls.find(entry =>
    entry.path === `${SAMPLE_BASE}/pitchMode`).value);
  const sampleRoot = documentState.controls.find(entry =>
    entry.path === `${SAMPLE_BASE}/rootNote`).value;
  $('sample-root').value = String(sampleRoot);
  $('sample-root-value').textContent = `MIDI ${sampleRoot}`;
  for (const [name, unit] of [['unison', ' voice'], ['detune', ' cents'], ['spread', '%']]) {
    const value = documentState.controls.find(entry => entry.path === `${SAMPLE_BASE}/${name}`).value;
    $(`sample-${name}`).value = String(value);
    $(`sample-${name}-value`).textContent = name === 'spread'
      ? `${Math.round(value * 100)}%` : `${value}${unit}${name === 'unison' && value !== 1 ? 's' : ''}`;
  }
  $('sample-capture-window').value = documentState.signal.captureWindowMode === 'free'
    ? 'free' : documentState.signal.captureWindowMode === 'bars'
      ? `bars:${documentState.signal.captureWindowBars}`
      : `seconds:${documentState.signal.captureWindowSeconds ?? 1}`;
  $('sample-capture-source').replaceChildren(...(documentState.signal.captureSources ?? []).map(source => {
    const option = document.createElement('option');
    option.value = String(source.id);
    option.textContent = source.name;
    return option;
  }));
  $('sample-capture-source').value = String(documentState.signal.selectedCaptureSourceId);
  const layerControls = $('layer-controls');
  const rows = [];
  for (let layer = 1; layer <= 4; layer++) {
    const instance = documentState.instances.find(entry => entry.path === layerPath(layer));
    if (!instance) continue;
    const state = id => documentState.signal.initialParameters.find(entry =>
      entry.nodeId === instance.nodeId && entry.id === id)?.value ?? 0;
    const row = document.createElement('div');
    row.textContent = `Layer ${layer} `;
    for (const [action, label] of [['record', state(0) >= 0.5 ? 'Stop & play' : 'Record'],
      ['play', state(1) >= 0.5 ? 'Pause' : 'Play']]) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.dataset.layer = String(layer);
      button.dataset.action = action;
      button.textContent = label;
      row.append(button);
    }
    rows.push(row);
  }
  layerControls.replaceChildren(...rows);
  layerControls.hidden = rows.length === 0;
  $('layer-save-note').hidden = rows.length === 0;
  $('download').textContent = rows.length ? 'Download project with loop takes' : 'Download project';
  $('sample-capture').textContent = project.captureArmed() ? 'Stop Free capture into Sample'
    : documentState.signal.captureWindowMode === 'free' ? 'Arm Free capture'
      : 'Capture window into Sample';
  const analysis = project.latestAnalysis();
  $('sample-analysis').textContent = analysis
    ? `Captured peak ${analysis.peak.toFixed(3)} · RMS ${analysis.rms.toFixed(3)} · ${analysis.pitchHz > 0
      ? `${analysis.pitchHz.toFixed(1)} Hz pitch (${Math.round(analysis.confidence * 100)}% confidence)`
      : 'pitch uncertain'}`
    : project.analysisError() ? `Capture analysis unavailable: ${project.analysisError()}`
      : 'No captured Sample analysis yet.';
  const canvas = $('sample-peaks');
  const paint = canvas.getContext('2d');
  paint.clearRect(0, 0, canvas.width, canvas.height);
  if (analysis?.peaks) {
    for (let bin = 0; bin < analysis.peaks.length / 2; bin++) {
      const x = Math.floor(bin * canvas.width / (analysis.peaks.length / 2));
      const left = Math.min(1, analysis.peaks[bin * 2]) * 42;
      const right = Math.min(1, analysis.peaks[bin * 2 + 1]) * 42;
      paint.fillStyle = '#9b8cff';
      paint.fillRect(x, 46 - left, 2, left);
      paint.fillStyle = '#5ad6ba';
      paint.fillRect(x, 50, 2, right);
    }
  }
  const cutoff = documentState.signal.initialParameters.find(entry => entry.nodeId === 5 && entry.id === 1).value;
  $('cutoff').value = String(cutoff);
  $('cutoff-value').textContent = `${Math.round(cutoff)} Hz`;
  const fxMix = documentState.signal.initialParameters.find(entry => entry.nodeId === 7 && entry.id === 1).value;
  $('fx-mix').value = String(fxMix);
  $('fx-mix-value').textContent = `${Math.round(fxMix * 100)}%`;
  const mode = documentState.controls.find(control => control.path === INPUT_MODE).value;
  const pitch = documentState.controls.find(control => control.path === INPUT_PITCH).value;
  const level = documentState.signal.initialParameters.find(entry => entry.nodeId === 8 && entry.id === 0).value;
  $('source-mode').value = String(mode);
  $('source-pitch').value = String(pitch);
  $('source-pitch-value').textContent = `MIDI ${pitch}`;
  $('source-level').value = String(level);
  $('source-level-value').textContent = `${Math.round(level * 100)}%`;
  for (const [path, id] of [[B_MODE, 'b-mode'], [B_PITCH, 'b-pitch'],
    [B_LEVEL, 'b-level'], [BLEND_AMOUNT, 'blend-amount'],
    [BLEND_MODE, 'blend-mode'], [BLEND_MOD_AMOUNT, 'blend-mod-amount']]) {
    const control = documentState.controls.find(entry => entry.path === path);
    const endpoint = documentState.endpoints.find(entry => entry.path === path);
    const value = control ? control.value : documentState.signal.initialParameters.find(
      entry => entry.nodeId === endpoint.nodeId && entry.id === endpoint.id).value;
    $(id).value = String(value);
    if (id === 'b-pitch') $(`${id}-value`).textContent = `MIDI ${value}`;
    if (id === 'b-level' || id === 'blend-amount' || id === 'blend-mod-amount')
      $(`${id}-value`).textContent = `${Math.round(value * 100)}%`;
  }
}

function controls() {
  $('start').disabled = busy || Boolean(host);
  $('project-open').disabled = busy || Boolean(host);
  for (const id of ['oscillator', 'sample', 'filter', 'fx', 'eq', 'blend', 'stop', 'cutoff', 'fx-mix',
    'sample-gate-1', 'sample-pitch-1', 'sample-gate-8', 'sample-pitch-8', 'sample-mode',
    'sample-root',
    'sample-unison', 'sample-detune', 'sample-spread', 'sample-capture', 'sample-capture-window',
    'sample-capture-source',
    'osc-manual-level', 'osc-waveform', 'osc-render-mode',
    'osc-voice-pitch', 'osc-voice-fm', 'osc-voice-pw', 'osc-voice-gate',
    'source-mode', 'source-pitch', 'source-level', 'b-mode', 'b-pitch',
    'b-level', 'blend-amount', 'blend-mode', 'blend-mod-amount']) $(id).disabled = busy || !host;
  $('sample-capture-source').disabled = busy || !host || project.captureArmed();
  for (const button of $('layer-controls').querySelectorAll('button')) button.disabled = busy || !host;
  $('sample-free-offset').disabled = busy || !host || project.captureArmed()
    || project.toProject().signal.captureWindowMode !== 'free';
  $('sample-read-cursor').disabled = $('sample-free-offset').disabled;
  const analysis = project.latestAnalysis();
  $('sample-use-detected-root').disabled = busy || !host || !analysis
    || !Number.isFinite(analysis.pitchHz) || analysis.pitchHz <= 0
    || !Number.isFinite(analysis.confidence) || analysis.confidence < 0.6;
}

async function start() {
  if (busy || host) return;
  busy = true;
  controls();
  $('status').textContent = 'Preparing the authored graph…';
  try {
    context = new AudioContext();
    host = new BrowserGraphHost(context);
    await host.prepare(project.toProject());
    const monitor = context.createGain();
    monitor.gain.value = 0.2;
    monitor.connect(context.destination);
    const externalTone = context.createOscillator();
    externalTone.frequency.value = 110;
    externalTone.start();
    const sidechainTone = context.createOscillator();
    sidechainTone.frequency.value = 220;
    sidechainTone.start();
    host.connect(externalTone, monitor, sidechainTone);
    await context.resume();
    project.activate();
    await project.analyzeSavedSample();
    display();
    $('status').textContent = 'Running. Oscillator, Sample, Blend, Filter, FX, and EQ switch through acknowledged graph routes.';
  } catch (error) {
    host?.close(); host = null;
    await context?.close(); context = null;
    $('status').textContent = `Could not start: ${error.message}`;
  } finally {
    busy = false;
    controls();
  }
}

async function select(index) {
  if (busy || !host) return;
  busy = true;
  controls();
  try {
    await project.set(SELECT, index);
    display();
    $('status').textContent = `${index === 1 ? 'Oscillator' : index === 2 ? 'Sample' : index === 3 ? 'Blend' : index === 4 ? 'Filter' : index === 5 ? 'FX' : 'EQ'} route accepted and saved.`;
  } catch (error) {
    $('status').textContent = `Route rejected: ${error.message}`;
  } finally {
    busy = false;
    controls();
  }
}

$('start').addEventListener('click', start);
$('sample-use-detected-root').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    const saved = await project.applyDetectedRoot();
    const root = saved.controls.find(entry => entry.path === `${SAMPLE_BASE}/rootNote`).value;
    display();
    $('status').textContent = `Sample root MIDI ${root} accepted across all eight voices.`;
  } catch (error) {
    $('status').textContent = `Detected root rejected: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('sample-read-cursor').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    const { selectedCaptureNodeId } = project.toProject().signal;
    const { startOffset, capacity } = await host.captureCursor(selectedCaptureNodeId);
    $('sample-free-offset').value = String(startOffset);
    $('status').textContent = `Selected source cursor ${startOffset} of ${capacity} frames. Capture from this offset when ready.`;
  } catch (error) {
    $('status').textContent = `Cursor read failed: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('sample-capture-source').addEventListener('change', async event => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    await project.selectCaptureSource(Number(event.target.value));
    display();
    $('status').textContent = 'Capture source saved in the authored project.';
  } catch (error) {
    display();
    $('status').textContent = `Capture source rejected: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('layer-controls').addEventListener('click', async event => {
  const button = event.target.closest('button[data-layer][data-action]');
  if (!button || busy || !host) return;
  const layer = Number(button.dataset.layer);
  const action = button.dataset.action;
  const instance = project.toProject().instances.find(entry => entry.path === layerPath(layer));
  if (!instance) return;
  const state = id => project.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === instance.nodeId && entry.id === id)?.value ?? 0;
  busy = true; controls();
  try {
    const layers = createFourLayerLoopController(project.session);
    if (action === 'record') {
      if (state(0) >= 0.5) {
        await layers.record(layer, false);
        await layers.play(layer, true);
      } else {
        await layers.play(layer, false);
        await layers.record(layer, true);
      }
    } else if (action === 'play') {
      await layers.play(layer, state(1) < 0.5);
    }
    display();
    $('status').textContent = `Layer ${layer} ${action} accepted and saved.`;
  } catch (error) {
    $('status').textContent = `Layer ${layer} rejected: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('sample-capture-window').addEventListener('change', async event => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    const [mode, raw] = event.target.value.split(':');
    await project.configureCaptureWindow(mode === 'free'
      ? { captureWindowMode: 'free' } : mode === 'bars'
      ? { captureWindowMode: 'bars', captureWindowBars: Number(raw), captureTempoBpm: 120,
        captureTimeSignatureNumerator: 4, captureTimeSignatureDenominator: 4 }
      : { captureWindowMode: 'seconds', captureWindowSeconds: Number(raw) });
    display();
    $('status').textContent = 'Capture window saved in the authored project.';
  } catch (error) {
    display();
    $('status').textContent = `Capture window rejected: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('sample-capture').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    const manualStartOffsetFrames = Number($('sample-free-offset').value);
    if (project.toProject().signal.captureWindowMode === 'free'
      && (!Number.isSafeInteger(manualStartOffsetFrames) || !$('sample-free-offset').validity.valid)) {
      throw new RangeError('Free start offset must be an integer inside the capture ring');
    }
    const manual = project.toProject().signal.captureWindowMode === 'free'
      && Number.isInteger(manualStartOffsetFrames) && manualStartOffsetFrames !== 0;
    const saved = await project.captureSample(manual ? { manualStartOffsetFrames } : null);
    if (manual) $('sample-free-offset').value = '0';
    display();
    $('status').textContent = project.captureArmed()
      ? 'Free capture armed. Press Stop after recording the desired span.'
      : `Captured ${saved.assets[0].frames} frames into all eight Sample voices. Download the project to save the take.`;
  } catch (error) {
    $('status').textContent = `Sample capture failed: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('oscillator').addEventListener('click', () => select(1));
$('sample').addEventListener('click', () => select(2));
$('filter').addEventListener('click', () => select(4));
$('blend').addEventListener('click', () => select(3));
$('fx').addEventListener('click', () => select(5));
$('eq').addEventListener('click', () => select(6));
$('stop').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  project.cancelCapture();
  host.close(); host = null;
  await context.close(); context = null;
  busy = false; controls();
  $('status').textContent = 'Stopped. The last accepted project state is retained.';
});
$('cutoff').addEventListener('change', async event => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    await project.set(CUTOFF, Number(event.target.value));
    display();
    $('status').textContent = 'Filter cutoff accepted and saved.';
  } catch (error) {
    display();
    $('status').textContent = `Cutoff rejected: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
$('fx-mix').addEventListener('change', async event => {
  if (busy || !host) return;
  busy = true; controls();
  try {
    await project.set(FX_MIX, Number(event.target.value));
    display();
    $('status').textContent = 'FX mix accepted and saved.';
  } catch (error) {
    display();
    $('status').textContent = `FX mix rejected: ${error.message}`;
  } finally {
    busy = false; controls();
  }
});
for (const [id, path, label] of [
  ['sample-gate-1', `${SAMPLE_BASE}/voice/1/gate`, 'Sample voice 1 gate'],
  ['sample-pitch-1', `${SAMPLE_BASE}/voice/1/vOct`, 'Sample voice 1 pitch'],
  ['sample-gate-8', `${SAMPLE_BASE}/voice/8/gate`, 'Sample voice 8 gate'],
  ['sample-pitch-8', `${SAMPLE_BASE}/voice/8/vOct`, 'Sample voice 8 pitch'],
  ['sample-mode', `${SAMPLE_BASE}/pitchMode`, 'Sample pitch mode'],
  ['sample-root', `${SAMPLE_BASE}/rootNote`, 'Sample root note'],
  ['sample-unison', `${SAMPLE_BASE}/unison`, 'Sample unison'],
  ['sample-detune', `${SAMPLE_BASE}/detune`, 'Sample detune'],
  ['sample-spread', `${SAMPLE_BASE}/spread`, 'Sample spread'],
  ['osc-manual-level', `${OSC_BASE}/manualLevel`, 'Oscillator manual level'],
  ['osc-waveform', `${OSC_BASE}/waveform`, 'Oscillator waveform'],
  ['osc-render-mode', `${OSC_BASE}/renderMode`, 'Oscillator render mode'],
  ['osc-voice-pitch', `${OSC_BASE}/voice/1/vOct`, 'Oscillator voice pitch'],
  ['osc-voice-fm', `${OSC_BASE}/voice/1/fm`, 'Oscillator voice FM'],
  ['osc-voice-pw', `${OSC_BASE}/voice/1/pwCv`, 'Oscillator voice pulse CV'],
  ['osc-voice-gate', `${OSC_BASE}/voice/1/gate`, 'Oscillator voice gate'],
  ['source-mode', INPUT_MODE, 'Input A mode'],
  ['source-pitch', INPUT_PITCH, 'Input A pitch'],
  ['source-level', INPUT_LEVEL, 'Input A level'],
  ['b-mode', B_MODE, 'Input B mode'],
  ['b-pitch', B_PITCH, 'Input B pitch'],
  ['b-level', B_LEVEL, 'Input B level'],
  ['blend-amount', BLEND_AMOUNT, 'Blend amount'],
  ['blend-mode', BLEND_MODE, 'Blend mode'],
  ['blend-mod-amount', BLEND_MOD_AMOUNT, 'Modulation depth'],
]) {
  $(id).addEventListener('change', async event => {
    if (busy || !host) return;
    busy = true; controls();
    try {
      await project.set(path, Number(event.target.value));
      display();
      $('status').textContent = `${label} accepted and saved.`;
    } catch (error) {
      display();
      $('status').textContent = `${label} rejected: ${error.message}`;
    } finally {
      busy = false; controls();
    }
  });
}
$('download').addEventListener('click', async () => {
  if (busy) return;
  busy = true; controls();
  try {
    const snapshot = project.toProject();
    const portable = host && snapshot.instances.some(entry => /^\/rack_host\/layers\/[1-4]\/loop$/.test(entry.path))
      ? await snapshotWithLoopAudio(snapshot, nodeId => host.snapshotLoop(nodeId)) : snapshot;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(portable, null, 2)}\n`], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rack-filter-eq.manifold.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('status').textContent = 'Downloaded project with recorded loop and Sample PCM.';
  } catch (error) {
    $('status').textContent = `Project save failed: ${error.message}`;
  } finally { busy = false; controls(); }
});
$('project-open').addEventListener('change', async event => {
  if (busy || host) return;
  const file = event.target.files?.[0];
  if (!file) return;
  busy = true; controls();
  try {
    const graph = GraphWorkspace.fromProject(JSON.parse(await file.text()));
    const saved = graph.toProject();
    if ([...expectedInstances].some(([path, nodeId]) =>
      !saved.instances.some(entry => entry.path === path && entry.nodeId === nodeId))
      || [...expectedControls].some(path =>
        !saved.controls.some(entry => entry.path === path))) {
      throw new Error('This page needs a compatible authored Rack module graph');
    }
    const staged = createProject(adapters, graph);
    staged.toProject();
    project = staged;
    display();
    $('status').textContent = `Opened ${file.name}. Start to hear and analyze the saved graph.`;
  } catch (error) {
    $('status').textContent = `Could not open Rack project: ${error.message}`;
  } finally {
    event.target.value = '';
    busy = false; controls();
  }
});
display();
controls();
