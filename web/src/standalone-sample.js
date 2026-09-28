import './standalone-sample.css';
import descriptor from '../../projects/standalone-sample/project.json';
import layout from '../../projects/standalone-sample/ui.json';
import { BrowserAudioHost } from './audio/browser-host.js';
import { BrowserMidiInput, midiAvailability } from './audio/midi-input.js';
import { captureGraphProject, parseGraphBundle } from './graph/topology.js';
import { mountProjectUi } from './widgets/project-ui.js';

const $ = (id) => document.getElementById(id);
const editorMode = new URLSearchParams(location.search).has('editor');
if (editorMode) document.body.classList.add('plugin-editor');
const ui = mountProjectUi($('plugin-content'), layout);
const sourceSelect = ui.control('sample_source_dropdown');
const graph = ui.element('sample_graph');
const graphCanvas = graph.querySelector('canvas');
const originalShape = JSON.stringify([descriptor.signal.nodes, descriptor.signal.connections]);
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const voiceColors = ['#fb7185', '#f59e0b', '#10b981', '#38bdf8', '#a78bfa', '#f472b6', '#facc15', '#34d399'];
let signal = structuredClone(descriptor.signal);
let asset = null;
let voicePositions = Array(8).fill(-1);
let voiceCount = 0;
let meterTimer = null;
let busy = false;
let drag = null;
const pressed = new Set();
const audio = new BrowserAudioHost((message) => status(message), (nodeId, values) => {
  if (nodeId !== 5) return;
  voiceCount = Math.max(0, Math.round(values[0] ?? 0));
  voicePositions = Array.from({ length: 8 }, (_, index) => values[index + 1] ?? -1);
  paintGraph();
});
const midi = new BrowserMidiInput((_, kind, channel, note, velocity, time) => {
  audio.sendMidiEvent(5, kind === 'on' ? 0 : 1, note, velocity, channel, time);
}, () => audio.sendEvent(5, 2), (message) => { $('midi-status').textContent = message; },
() => {}, () => {}, () => {
  $('midi-connect').textContent = midi.listening ? 'Disconnect MIDI' : midi.pending ? 'Cancel MIDI request' : 'Connect MIDI';
});

function status(message) { $('status').textContent = message; }
function selectedSource() { return signal.captureSources.find((item) => item.id === signal.selectedCaptureSourceId); }
function currentParameter(id) { return signal.initialParameters.find((item) => item.nodeId === 5 && item.id === id)?.value ?? 0; }
function setParameter(id, value) {
  const entry = signal.initialParameters.find((item) => item.nodeId === 5 && item.id === id);
  if (!entry) return;
  entry.value = value;
  paintGraph();
  if (audio.running) audio.setNodeParameter(5, id, value).catch((error) => status(error.message));
}
function fitShell() {
  const scale = editorMode ? 1 : Math.max(.5, Math.min(1.7, ($('plugin-stage').clientWidth - 28) / 472));
  $('plugin-viewport').style.width = `${Math.round(472 * scale)}px`;
  $('plugin-viewport').style.height = `${Math.round(220 * scale)}px`;
  $('plugin-shell').style.width = '472px';
  $('plugin-shell').style.transform = `scale(${scale})`;
  ui.layout('split');
  paintGraph();
}

function peaksFor(source, bins) {
  const result = new Float32Array(bins);
  if (!source) return result;
  const frames = source.stereo.length / 2;
  for (let frame = 0; frame < frames; frame++) {
    const bin = Math.min(bins - 1, Math.floor(frame * bins / frames));
    const left = source.stereo[frame * 2], right = source.stereo[frame * 2 + 1];
    result[bin] = Math.max(result[bin], Math.abs(left), Math.abs(right));
  }
  return result;
}
function paintGraph() {
  const width = graph.clientWidth, height = graph.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(3, (devicePixelRatio || 1) * graph.getBoundingClientRect().width / width);
  graphCanvas.width = Math.round(width * scale);
  graphCanvas.height = Math.round(height * scale);
  const ctx = graphCanvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0d1420'; ctx.fillRect(0, 0, width, height);
  const barH = 16, barGap = 4, waveH = height - barH * 2 - barGap - 4;
  ctx.fillStyle = '#ffffff20'; ctx.fillRect(0, 0, width, waveH);
  const bins = Math.max(48, Math.min(width, 200));
  const peaks = peaksFor(asset, bins);
  if (asset) {
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let bin = 0; bin < bins; bin++) {
      const x = bin * width / (bins - 1);
      const amplitude = Math.min(1, peaks[bin]) * waveH * .375;
      if (bin === 0) ctx.moveTo(x, waveH / 2 - amplitude);
      else ctx.lineTo(x, waveH / 2 - amplitude);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let bin = 0; bin < bins; bin++) {
      const x = bin * width / (bins - 1);
      const amplitude = Math.min(1, peaks[bin]) * waveH * .375;
      if (bin === 0) ctx.moveTo(x, waveH / 2 + amplitude);
      else ctx.lineTo(x, waveH / 2 + amplitude);
    }
    ctx.stroke();
    voicePositions.forEach((position, index) => {
      if (position <= 0 || position > 1) return;
      const x = position * width;
      ctx.strokeStyle = voiceColors[index]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, waveH - 2); ctx.lineTo(x, waveH / 2); ctx.stroke();
    });
  }
  const playStart = currentParameter(6), loopStart = currentParameter(7), loopEnd = currentParameter(8);
  const crossfade = currentParameter(9);
  const bar1Y = waveH + 2, bar2Y = bar1Y + barH + barGap;
  for (const y of [bar1Y, bar2Y]) {
    ctx.fillStyle = '#0d1420'; ctx.fillRect(0, y, width, barH);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y + barH + .5); ctx.lineTo(width, y + barH + .5); ctx.stroke();
  }
  ctx.strokeStyle = '#cbd5e180'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(loopStart * width, bar2Y + 8); ctx.lineTo(loopEnd * width, bar2Y + 8); ctx.stroke();
  const fade = (loopEnd - loopStart) * crossfade;
  if (fade > 0) {
    ctx.fillStyle = '#4ade8050'; ctx.fillRect(loopStart * width, bar2Y + 2, fade * width, 12);
    ctx.fillStyle = '#f8717150'; ctx.fillRect((loopEnd - fade) * width, bar2Y + 2, fade * width, 12);
  }
  for (const [y, position, color] of [[bar1Y, playStart, '#e5e509'], [bar2Y, loopStart, '#4ade80'], [bar2Y, loopEnd, '#f87171']]) {
    const x = Math.round(position * width) - 4;
    ctx.fillStyle = color; ctx.fillRect(x, y + 2, 8, 12);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + 2.5, 7, 11);
  }
  ctx.font = '10px system-ui'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#a78bfa'; ctx.fillText('SAMPLE MODE', 4, 2);
  ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
  ctx.fillText(asset ? `${Math.round(asset.stereo.length / 2 / asset.sourceRate * 1000)}ms` : '0ms', width - 4, 2);
  if (!asset) { ctx.textAlign = 'center'; ctx.font = '11px system-ui'; ctx.fillText('No sample captured', width / 2, waveH / 2 - 8); }
}

function graphPosition(event) {
  const rect = graph.getBoundingClientRect();
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}
graph.addEventListener('pointerdown', (event) => {
  const rect = graph.getBoundingClientRect();
  const x = graphPosition(event), y = (event.clientY - rect.top) / rect.height * graph.clientHeight;
  const bar1 = graph.clientHeight - 40, bar2 = bar1 + 20;
  let options = [];
  if (y >= bar1 && y <= bar1 + 16) options = [6];
  else if (y >= bar2 && y <= bar2 + 16) options = [7, 8];
  if (!options.length) return;
  const id = options.reduce((best, next) => Math.abs(currentParameter(next) - x) < Math.abs(currentParameter(best) - x) ? next : best);
  if (Math.abs(currentParameter(id) - x) * rect.width > 14) return;
  drag = id;
  graph.setPointerCapture(event.pointerId);
  event.preventDefault();
});
graph.addEventListener('pointermove', (event) => {
  if (drag === null) return;
  const x = graphPosition(event);
  const entry = signal.initialParameters.find((item) => item.nodeId === 5 && item.id === drag);
  entry.value = drag === 7 ? Math.min(x, currentParameter(8) - .05)
    : drag === 8 ? Math.max(x, currentParameter(7) + .05) : x;
  paintGraph();
});
function finishDrag() {
  if (drag === null) return;
  const id = drag; drag = null;
  setParameter(id, currentParameter(id));
}
graph.addEventListener('pointerup', finishDrag);
graph.addEventListener('pointercancel', finishDrag);

sourceSelect.onChange((id) => {
  const selected = signal.captureSources.find((source) => source.id === id);
  if (!selected) return;
  signal.selectedCaptureSourceId = id;
  signal.selectedCaptureNodeId = selected.nodeId;
  status(`${selected.name} selected for the next capture.`);
});

function note(kind, pitch, velocity = 100) {
  if (!audio.running) { status('Start audio before playing notes.'); return; }
  audio.sendEvent(5, kind === 'on' ? 0 : 1, pitch, velocity);
}
for (let pitch = 60; pitch <= 72; pitch++) {
  const key = document.createElement('button');
  key.type = 'button'; key.className = 'sample-key';
  key.dataset.black = String([1, 3, 6, 8, 10].includes(pitch % 12));
  key.textContent = `${noteNames[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
  key.setAttribute('aria-label', `Play ${key.textContent}`);
  key.addEventListener('pointerdown', (event) => {
    if (pressed.has(pitch)) return;
    pressed.add(pitch); key.dataset.active = 'true';
    key.setPointerCapture(event.pointerId);
    note('on', pitch);
    event.preventDefault();
  });
  const release = () => {
    if (!pressed.delete(pitch)) return;
    key.dataset.active = 'false'; note('off', pitch, 0);
  };
  key.addEventListener('pointerup', release);
  key.addEventListener('pointercancel', release);
  key.addEventListener('lostpointercapture', release);
  $('keyboard').append(key);
}
function releaseNotes() {
  if (pressed.size) audio.sendEvent(5, 2);
  pressed.clear();
  $('keyboard').querySelectorAll('.sample-key').forEach((key) => { key.dataset.active = 'false'; });
}
window.addEventListener('blur', releaseNotes);

function renderMeter() {
  if (!audio.running || !audio.analyser) return;
  const samples = new Float32Array(1024);
  audio.analyser.getFloatTimeDomainData(samples);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  $('output-db').textContent = peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dB` : '−∞ dB';
}
function syncAudioButtons() {
  $('audio-toggle').textContent = audio.running ? 'Stop audio' : 'Start audio';
  $('capture-button').disabled = !audio.running || busy;
  $('engine-indicator').textContent = audio.running ? 'Running' : 'Idle';
  $('input-source').disabled = audio.running;
  $('sidechain-source').disabled = audio.running;
}
$('audio-toggle').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('audio-toggle').disabled = true;
  try {
    if (audio.running) {
      releaseNotes(); await audio.stop();
      clearInterval(meterTimer); meterTimer = null;
      voicePositions = Array(8).fill(-1); voiceCount = 0;
      $('output-db').textContent = '−∞ dB';
    } else {
      signal.sidechainSource = $('sidechain-source').value;
      await audio.start($('input-source').value, new Map(), {
        id: 'manifold.graph-workspace', parameters: [], signal,
      }, asset ? [asset] : null);
      meterTimer = setInterval(() => { audio.requestMeters(5, 9); renderMeter(); }, 100);
      audio.requestMeters(5, 9);
    }
  } catch (error) { status(`Audio unavailable: ${error.message ?? String(error)}`); }
  finally { busy = false; $('audio-toggle').disabled = false; syncAudioButtons(); paintGraph(); }
});
$('capture-button').addEventListener('click', async () => {
  if (!audio.running || busy) return;
  busy = true; syncAudioButtons();
  try {
    const selected = selectedSource();
    const windowSeconds = Number($('capture-seconds').value);
    status(`Publishing ${windowSeconds} s from ${selected.name}…`);
    const captured = await audio.publishLiveCapture(selected.nodeId, 5, windowSeconds);
    asset = { nodeId: 5, sourceRate: captured.sourceRate,
      stereo: captured.stereo, label: `${selected.name} · ${windowSeconds} s` };
    signal.captureWindowSeconds = windowSeconds;
    signal.captureWindowMode = 'seconds';
    $('sample-readout').textContent = `${asset.label} · ${asset.stereo.length / 2} frames`;
    status(`${selected.name} published. Play an on-screen key or connect MIDI.`);
    paintGraph();
  } catch (error) { status(`Capture failed: ${error.message ?? String(error)}`); }
  finally { busy = false; syncAudioButtons(); }
});
$('sample-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file || busy) return;
  busy = true; syncAudioButtons();
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose a file smaller than 32 MB.');
    const decoder = new OfflineAudioContext(2, 1, 48000);
    const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
    if (!buffer.length || buffer.duration > 30) throw new Error('Choose audio between 0 and 30 seconds.');
    const stereo = new Float32Array(buffer.length * 2);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
    for (let frame = 0; frame < buffer.length; frame++) {
      stereo[frame * 2] = left[frame]; stereo[frame * 2 + 1] = right[frame];
    }
    if (audio.running) await audio.replaceSample(5, buffer.sampleRate, stereo);
    asset = { nodeId: 5, sourceRate: buffer.sampleRate, stereo, label: file.name };
    $('sample-readout').textContent = `${file.name} · ${buffer.duration.toFixed(2)} s`;
    status(`${file.name} loaded. Play a key to hear it.`);
    paintGraph();
  } catch (error) { status(`File unavailable: ${error.message ?? String(error)}`); }
  finally { busy = false; syncAudioButtons(); event.target.value = ''; }
});
$('midi-connect').addEventListener('click', () => {
  if (midi.listening || midi.pending) midi.stop();
  else midi.connect();
});
$('save-project').addEventListener('click', () => {
  try {
    const bundle = captureGraphProject(signal, asset ? [asset] : []);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'manifold-standalone-sample.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Portable graph project downloaded with the selected source and sample PCM.');
  } catch (error) { status(`Save failed: ${error.message ?? String(error)}`); }
});
$('open-project').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (audio.running) throw new Error('Stop audio before opening a project.');
    const bundle = parseGraphBundle(JSON.parse(await file.text()));
    if (JSON.stringify([bundle.signal.nodes, bundle.signal.connections]) !== originalShape) {
      throw new Error('This project has a different graph than Standalone Sample.');
    }
    signal = bundle.signal;
    asset = bundle.assets.find((entry) => entry.nodeId === 5) ?? null;
    sourceSelect.setSelected(signal.selectedCaptureSourceId);
    $('sidechain-source').value = signal.sidechainSource;
    $('capture-seconds').value = String(signal.captureWindowSeconds);
    $('sample-readout').textContent = asset ? `${asset.label} · ${asset.stereo.length / 2} frames` : 'No sample captured';
    paintGraph();
    status(`${file.name} opened. Start audio to play its saved sample.`);
  } catch (error) { status(`Project unavailable: ${error.message ?? String(error)}`); }
  finally { event.target.value = ''; }
});
$('settings-toggle').addEventListener('click', () => { $('settings-overlay').hidden = false; });
$('settings-close').addEventListener('click', () => { $('settings-overlay').hidden = true; });
window.addEventListener('resize', fitShell);
fitShell();
syncAudioButtons();
if (midiAvailability()) $('midi-status').textContent = `${midiAvailability()} On-screen keys remain available.`;
