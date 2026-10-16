import { BrowserGraphHost } from '@manifold/author/browser';
import { instantiateProjectPackage, saveProjectPackage } from '@manifold/author/package';

const element = id => document.getElementById(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let busy = false;
let lastReport = null;
const urls = new Map();

function download(id, value, type, filename) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  const url = URL.createObjectURL(new Blob([value], { type }));
  urls.set(id, url);
  const link = element(id);
  link.href = url; link.download = filename; link.hidden = false;
  return url;
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1] ?? 0;
}
function plot(values) {
  const canvas = element('timings'); const pen = canvas.getContext('2d');
  pen.clearRect(0, 0, canvas.width, canvas.height);
  const maximum = Math.max(1, ...values); const step = canvas.width / 24;
  pen.fillStyle = '#8adac4';
  values.forEach((value, index) => pen.fillRect(index * step + 3, 160 - value / maximum * 140, step - 6, value / maximum * 140));
  pen.fillStyle = '#e2e9ec'; pen.font = '14px system-ui';
  pen.fillText(`Total edit time · highest ${maximum.toFixed(1)} ms`, 12, 17);
}
function waveform(samples, id = 'waveform') {
  const canvas = element(id); const pen = canvas.getContext('2d');
  pen.clearRect(0, 0, canvas.width, canvas.height); pen.strokeStyle = '#8adac4'; pen.beginPath();
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  for (let pixel = 0; pixel < canvas.width; pixel++) {
    const start = Math.floor(pixel * samples.length / canvas.width / 2) * 2;
    const end = Math.floor((pixel + 1) * samples.length / canvas.width / 2) * 2;
    let low = 0, high = 0;
    for (let at = start; at < end; at += 2) { low = Math.min(low, samples[at]); high = Math.max(high, samples[at]); }
    pen.moveTo(pixel, 70 - low / (peak || 1) * 60); pen.lineTo(pixel, 70 - high / (peak || 1) * 60);
  }
  pen.stroke();
}
function wav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 4); const view = new DataView(buffer);
  const label = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  label(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 8, true);
  view.setUint16(32, 8, true); view.setUint16(34, 32, true); label(36, 'data'); view.setUint32(40, samples.length * 4, true);
  for (let i = 0; i < samples.length; i++) view.setFloat32(44 + i * 4, samples[i], true);
  return buffer;
}
function signalReport(samples, sampleRate) {
  let energy = 0, peak = 0, run = 0, runStart = 0; const zeroRuns = [];
  const finish = () => { if (run >= 128) zeroRuns.push({ startFrame: runStart, frames: run, seconds: run / sampleRate }); run = 0; };
  for (let frame = 0; frame < samples.length / 2; frame++) {
    const left = samples[frame * 2], right = samples[frame * 2 + 1];
    energy += left * left + right * right; peak = Math.max(peak, Math.abs(left), Math.abs(right));
    if (left === 0 && right === 0) { if (!run) runStart = frame; run++; } else finish();
  }
  finish();
  return { frames: samples.length / 2, seconds: samples.length / 2 / sampleRate,
    rms: Math.sqrt(energy / samples.length), peak, zeroRunsAtLeast128Frames: zeroRuns };
}
async function instance(context, name, profiling) {
  const response = await fetch(`/packages/${name}.manifold.json`);
  if (!response.ok) throw new Error(`Package HTTP ${response.status}`);
  const host = new BrowserGraphHost(context, { execution: 'worker', profiling });
  try {
    const loaded = await instantiateProjectPackage(await response.text(), {
      readPublishedParameters: () => host.readPublishedParameters(),
      setParameter: edit => host.setParameter(edit), setRoute: route => host.setRoute(route),
      replaceGraph: graph => host.replaceGraph(graph),
    });
    await host.prepare(loaded.controller.toProject());
    return { host, ...loaded };
  } catch (error) { host.close(); throw error; }
}

function recording(context, clockOriginUnixMs) {
  const capacityFrames = context.sampleRate * 45;
  const tape = new SharedArrayBuffer(capacityFrames * 2 * 4);
  const control = new Int32Array(new SharedArrayBuffer(7 * 4));
  const cadence = new Int32Array(new SharedArrayBuffer(Math.ceil(capacityFrames / 128) * 5 * 4));
  const node = new AudioWorkletNode(context, 'manifold-runtime-review-recorder', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    processorOptions: { tape, control: control.buffer, cadence: cadence.buffer, clockOriginUnixMs },
  });
  return { node, tape, control, cadence, clockOriginUnixMs };
}

function readRecording(recorded, sampleRate) {
  const samples = new Float32Array(recorded.tape, 0, Atomics.load(recorded.control, 0) * 2).slice();
  const count = Atomics.load(recorded.control, 5); const rows = [];
  for (let index = 0; index < count; index++) {
    const row = index * 5;
    rows.push({ contextFrame: recorded.cadence[row], recordedFrame: recorded.cadence[row + 1],
      elapsedMs: recorded.cadence[row + 2], copyMs: recorded.cadence[row + 3], frames: recorded.cadence[row + 4] });
  }
  const gaps = rows.slice(1).map((row, index) => row.elapsedMs - rows[index].elapsedMs);
  let burst = 1, maxSameMillisecondCallbacks = 1;
  for (let index = 1; index < rows.length; index++) {
    burst = rows[index].elapsedMs === rows[index - 1].elapsedMs ? burst + 1 : 1;
    maxSameMillisecondCallbacks = Math.max(maxSameMillisecondCallbacks, burst);
  }
  const firstContextFrame = Atomics.load(recorded.control, 3);
  const signal = signalReport(samples, sampleRate);
  signal.zeroRunsAtLeast128Frames = signal.zeroRunsAtLeast128Frames.map(run => ({ ...run, contextFrame: firstContextFrame + run.startFrame }));
  return { samples, signal, firstContextFrame, lastContextFrame: Atomics.load(recorded.control, 4),
    tapeOverflow: Atomics.load(recorded.control, 2) === 1,
    cadence: { clock: 'Date.now', resolutionMs: 1, clockOriginUnixMs: recorded.clockOriginUnixMs,
      overflow: Atomics.load(recorded.control, 6) === 1, callbacks: rows.length,
      gapP50Ms: percentile(gaps, .5), gapP95Ms: percentile(gaps, .95), maxGapMs: Math.max(0, ...gaps),
      maxSameMillisecondCallbacks, rows } };
}

async function run({ example = element('example').value, mainThreadWorkMs = element('load').checked ? 12 : 0,
  profiling = element('profile').checked } = {}) {
  if (busy) throw new Error('A review is already running');
  if (!['dsp-live-scripting', 'fx-slot-swap'].includes(example) || ![0, 12].includes(mainThreadWorkMs) || typeof profiling !== 'boolean') throw new Error('Unknown review recipe');
  busy = true; element('run').disabled = true; element('edits').replaceChildren();
  lastReport = null; element('report').textContent = '';
  for (const id of ['wav', 'wav-secondary', 'json', 'package']) element(id).hidden = true;
  for (const player of document.querySelectorAll('audio')) player.pause();
  let context, primary, secondary, oscillator;
  try {
    context = new AudioContext({ sampleRate: 48000 });
    element('status').textContent = 'Preparing two independent library instances…';
    // Resume during the user gesture, before asynchronous package fetches.
    await context.resume();
    primary = await instance(context, example, profiling);
    secondary = await instance(context, example === 'dsp-live-scripting' ? 'fx-slot-swap' : 'dsp-live-scripting', profiling);
    await context.audioWorklet.addModule(new URL('./runtime-review-recorder.js', import.meta.url));
    const clockOriginUnixMs = Date.now();
    const primaryRecording = recording(context, clockOriginUnixMs);
    const secondaryRecording = recording(context, clockOriginUnixMs);
    oscillator = context.createOscillator(); oscillator.frequency.value = 220;
    const level = context.createGain(); level.gain.value = 0.08; oscillator.connect(level);
    primary.host.connect(level, primaryRecording.node); primaryRecording.node.connect(context.destination);
    secondary.host.connect(level, secondaryRecording.node); secondaryRecording.node.connect(context.destination);
    oscillator.start(); await pause(1000);
    await primary.host.setParameter({ nodeId: 4, id: 0, value: 0.375 });
    await primary.controller.synchronizeParameters();
    const before = { primary: primary.host.diagnostics, secondary: secondary.host.diagnostics };
    const recordingStartSequence = before.primary.audioBlocks + 1;
    Atomics.store(primaryRecording.control, 1, 1);
    Atomics.store(secondaryRecording.control, 1, 1);
    const edits = [];
    for (let index = 0; index < 24; index++) {
      const startSequence = primary.host.diagnostics.audioBlocks;
      const started = performance.now();
      const operation = example === 'dsp-live-scripting'
        ? `distortion ${index % 2 === 0 ? 'insert' : 'remove'}`
        : `slot${Math.floor(index / 2) % 2 ? 'B' : 'A'} ${index % 2 ? 'Gain' : 'Width'}`;
      const pending = example === 'dsp-live-scripting'
        ? primary.controller.setDistortion(index % 2 === 0)
        : primary.controller.set(`/test/fxslot/slot${Math.floor(index / 2) % 2 ? 'B' : 'A'}/select`, index % 2 === 0 ? 1 : 0);
      const loadStart = performance.now();
      while (performance.now() - loadStart < mainThreadWorkMs) { /* bounded caller workload */ }
      await pending;
      const totalMs = performance.now() - started;
      const diagnostics = primary.host.diagnostics;
      const state = primary.controller.toProject();
      const acceptedGain = state.signal.initialParameters.find(parameter => parameter.nodeId === 4 && parameter.id === 0)?.value;
      if (acceptedGain !== 0.375) throw new Error('A graph edit lost accepted host gain');
      edits.push({ index: index + 1, operation, startSequence, endSequence: diagnostics.audioBlocks,
        nodes: state.signal.nodes.length, totalMs, preparationMs: diagnostics.lastPreparationMs,
        publicationMs: diagnostics.lastPublicationMs, diagnostics, workerProfile: primary.host.workerProfile,
        secondaryDiagnostics: secondary.host.diagnostics, secondaryWorkerProfile: secondary.host.workerProfile });
      const row = document.createElement('tr');
      for (const value of [operation, state.signal.nodes.length, diagnostics.lastPreparationMs?.toFixed(2),
        diagnostics.lastPublicationMs?.toFixed(2), totalMs.toFixed(2), diagnostics.underruns]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      element('edits').append(row); plot(edits.map(edit => edit.totalMs));
      element('misses').textContent = `${diagnostics.underruns} / ${secondary.host.diagnostics.underruns}`;
      element('latency').textContent = `${percentile(edits.map(edit => edit.totalMs), .95).toFixed(1)} ms`;
      element('dsp').textContent = `${primary.host.workerProfile?.p95Us ?? '—'} µs`;
      element('status').textContent = `Accepted ${index + 1} / 24 · ${operation}`;
      await pause(100);
    }
    await pause(750); await context.suspend();
    Atomics.store(primaryRecording.control, 1, 0); Atomics.store(secondaryRecording.control, 1, 0);
    const first = readRecording(primaryRecording, context.sampleRate);
    const second = readRecording(secondaryRecording, context.sampleRate);
    const saved = saveProjectPackage(primary.package, primary.controller.toProject());
    lastReport = { recordedAt: new Date().toISOString(), example, sourceHz: 220, sourceGain: .08, hostGain: .375,
      sampleRate: context.sampleRate, renderQuantum: 128, editCount: 24, mainThreadWorkMs,
      contextBaseLatencySeconds: context.baseLatency, contextOutputLatencySeconds: context.outputLatency,
      profiling, recordingStartSequence, tapeOverflow: first.tapeOverflow,
      recordingFirstContextFrame: first.firstContextFrame, recordingLastContextFrame: first.lastContextFrame,
      cadence: first.cadence,
      secondaryRecording: { signal: second.signal, firstContextFrame: second.firstContextFrame,
        lastContextFrame: second.lastContextFrame, tapeOverflow: second.tapeOverflow, cadence: second.cadence },
      workerTimingScope: 'Active Worker Wasm processing only; excludes scheduling and callback copying',
      before, after: { primary: primary.host.diagnostics, secondary: secondary.host.diagnostics },
      finalWorkerProfiles: { primary: primary.host.workerProfile, secondary: secondary.host.workerProfile },
      latency: { p50Ms: percentile(edits.map(edit => edit.totalMs), .5), p95Ms: percentile(edits.map(edit => edit.totalMs), .95), maxMs: Math.max(...edits.map(edit => edit.totalMs)) },
      signal: first.signal, edits, finalGraph: saved.state };
    const audioUrl = download('wav', wav(first.samples, context.sampleRate), 'audio/wav', `${example}-runtime.wav`);
    element('audio').src = audioUrl;
    element('audio-secondary').src = download('wav-secondary', wav(second.samples, context.sampleRate), 'audio/wav', `${example}-secondary.wav`);
    download('json', JSON.stringify(lastReport, null, 2), 'application/json', `${example}-runtime.json`);
    download('package', JSON.stringify(saved, null, 2), 'application/json', `${example}-runtime.manifold.json`);
    waveform(first.samples); waveform(second.samples, 'waveform-secondary'); element('report').textContent = JSON.stringify(lastReport, null, 2);
    element('recording-info').textContent = `${first.signal.seconds.toFixed(2)} s · zero runs ≥ 128 frames: ${first.signal.zeroRunsAtLeast128Frames.length} edited / ${second.signal.zeroRunsAtLeast128Frames.length} second graph · cadence clock: integer milliseconds`;
    element('misses').textContent = `${lastReport.after.primary.underruns} / ${lastReport.after.secondary.underruns}`;
    element('status').textContent = `Completed 24 edits. Missed blocks: ${lastReport.after.primary.underruns} edited / ${lastReport.after.secondary.underruns} second graph.`;
    return lastReport;
  } catch (error) { element('status').textContent = `Review failed: ${error.message}`; throw error; }
  finally {
    oscillator?.stop(); primary?.host.close(); secondary?.host.close();
    try { await context?.close(); } finally { busy = false; element('run').disabled = false; }
  }
}
element('run').addEventListener('click', () => { run().catch(console.error); });
window.manifoldRuntimeReview = Object.freeze({ run, get busy() { return busy; }, get report() { return lastReport; } });

document.addEventListener('play', event => {
  if (!(event.target instanceof HTMLMediaElement)) return;
  if (busy) { event.target.pause(); return; }
  for (const player of document.querySelectorAll('audio')) if (player !== event.target) player.pause();
}, true);

async function loadEvidence(url, containerId, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Evidence HTTP ${response.status}`);
  const summary = await response.json(); const container = element(containerId);
  const heading = document.createElement('h3'); heading.textContent = label; container.append(heading);
  for (const run of summary.runs) {
    const title = document.createElement('h3'); title.textContent = run.example;
    const text = document.createElement('p');
    text.textContent = `24 edits · ${run.signal.seconds.toFixed(2)} s recording · ${run.after.primary.underruns} missed edited / ${run.after.secondary.underruns} missed second graph · script edit p95 ${run.latency.p95Ms.toFixed(1)} ms`;
    const player = document.createElement('audio'); player.controls = true; player.preload = 'none'; player.src = run.audio;
    const links = document.createElement('p');
    for (const [label, url] of [['WAV', run.audio], ['Raw report', run.report], ['Authored package', run.package]]) {
      const link = document.createElement('a'); link.href = url; link.textContent = label; link.style.marginRight = '16px'; links.append(link);
    }
    container.append(title, text, player, links);
    if (run.secondaryAudio) {
      const caption = document.createElement('p');
      caption.textContent = `Unchanged second graph · ${run.secondarySignal.zeroRunsAtLeast128Frames.length} recorded zero runs ≥ 128 frames`;
      const second = document.createElement('audio'); second.controls = true; second.preload = 'none'; second.src = run.secondaryAudio;
      container.append(caption, second);
    }
  }
}
async function showEvidence() {
  element('captured').replaceChildren();
  await loadEvidence('/runtime-graph-proof/2026-09-30-retired-owned-workers/summary.json', 'captured', 'Worker service profiling on');
  await loadEvidence('/runtime-graph-proof/2026-09-30-retired-profiling-off/summary.json', 'captured', 'Worker service profiling off');
  await loadEvidence('/runtime-graph-proof/summary.json', 'earlier', 'Earlier run');
}
showEvidence().catch(error => { element('captured').append(document.createTextNode(`Evidence load failed: ${error.message}`)); });
