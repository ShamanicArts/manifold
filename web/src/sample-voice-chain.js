import { GraphWorkspace } from '@manifold/author';
import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject, SAMPLE_BASE } from '@manifold/author/examples/sample-voice-chain';
import fixture from '../../projects/graph-workspace/authored-sample-voice-chain.json';

const $ = id => document.getElementById(id);
let context = null;
let host = null;
let busy = false;
let analyser = null;
let meterSamples = null;
let meterFrame = 0;
let peakRms = 0;
Object.defineProperty(window, 'manifoldSample', { configurable: true, value: Object.freeze({
  Host: BrowserGraphHost,
  get host() { return host; },
  get context() { return context; },
  get controller() { return project; },
  get peakRms() { return peakRms; },
}) });
const project = createProject({
  setRoute: route => host.setRoute(route),
  setParameter: edit => host.setParameter(edit),
  setParameterBatch: edits => host.setParameterBatch(edits),
  sendEvent: event => host.sendEvent(event),
}, GraphWorkspace.fromProject(fixture));

function display() {
  const state = project.toProject();
  const value = path => state.controls.find(control => control.path === path).value;
  const gate = value(`${SAMPLE_BASE}/voice/1/gate`);
  const pitch = value(`${SAMPLE_BASE}/voice/1/vOct`);
  const mode = value(`${SAMPLE_BASE}/pitchMode`);
  $('gate').value = String(gate);
  $('gate-value').textContent = `${Math.round(gate * 100)}%`;
  $('pitch').value = String(pitch);
  $('pitch-value').textContent = `MIDI ${pitch}`;
  $('mode').value = String(mode);
  $('project').textContent = JSON.stringify({ ...state,
    assets: state.assets.map(({ pcmF32Base64: _pcm, ...metadata }) =>
      ({ ...metadata, pcm: 'embedded in downloaded project' })) }, null, 2);
}

function controls() {
  $('start').disabled = busy || Boolean(host);
  for (const id of ['stop', 'gate', 'pitch', 'mode']) $(id).disabled = busy || !host;
}

function updateMeter() {
  if (!analyser || !host || !meterSamples) return;
  analyser.getFloatTimeDomainData(meterSamples);
  let energy = 0;
  for (const sample of meterSamples) energy += sample * sample;
  const rms = Math.sqrt(energy / meterSamples.length);
  peakRms = Math.max(peakRms, rms);
  const health = host.diagnostics;
  $('meter').textContent = `${rms.toFixed(4)} RMS · peak ${peakRms.toFixed(4)} · `
    + `${health?.underruns ?? 0} missed / ${health?.audioBlocks ?? 0} blocks`;
  if (!host.ready) $('status').textContent = 'Graph audio worker stopped';
  meterFrame = requestAnimationFrame(updateMeter);
}

$('start').addEventListener('click', async () => {
  if (busy || host) return;
  busy = true; controls();
  $('status').textContent = 'Preparing the authored sample graph…';
  try {
    context = new AudioContext();
    host = new BrowserGraphHost(context, { execution: 'worker' });
    await host.prepare(project.toProject());
    const monitor = context.createGain();
    monitor.gain.value = 0.5;
    monitor.connect(context.destination);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    meterSamples = new Float32Array(analyser.fftSize);
    peakRms = 0;
    analyser.connect(monitor);
    host.connect(null, analyser);
    await context.resume();
    project.activate();
    updateMeter();
    $('status').textContent = 'Running. Raise the gate to play the saved sample.';
  } catch (error) {
    host?.close(); host = null;
    cancelAnimationFrame(meterFrame);
    analyser = null; meterSamples = null;
    await context?.close(); context = null;
    $('status').textContent = `Could not start: ${error.message}`;
  } finally { busy = false; controls(); }
});

for (const [id, path] of [
  ['gate', `${SAMPLE_BASE}/voice/1/gate`],
  ['pitch', `${SAMPLE_BASE}/voice/1/vOct`],
  ['mode', `${SAMPLE_BASE}/pitchMode`],
]) {
  $(id).addEventListener('change', async event => {
    if (busy || !host) return;
    busy = true; controls();
    try {
      await project.set(path, Number(event.target.value));
      display();
      $('status').textContent = `${id === 'gate' ? 'Gate' : id === 'pitch' ? 'Pitch' : 'Mode'} accepted and saved.`;
    } catch (error) {
      display();
      $('status').textContent = `Edit rejected: ${error.message}`;
    } finally { busy = false; controls(); }
  });
}

$('stop').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  cancelAnimationFrame(meterFrame);
  analyser = null; meterSamples = null;
  $('meter').textContent = '—';
  host.close(); host = null;
  await context.close(); context = null;
  busy = false; controls();
  $('status').textContent = 'Stopped. Accepted settings are retained.';
});

$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(project.toProject(), null, 2)}\n`],
    { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'authored-sample-voice.manifold.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

display();
controls();
