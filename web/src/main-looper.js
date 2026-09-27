import './main-looper.css';
import project from '../../projects/main-looper/project.json';
import { encodePcm, decodePcm } from './state/stereo-source.js';

const $ = (id) => document.getElementById(id);
const bars = project.segments;
const labels = ['16', '8', '4', '2', '1', '1/2', '1/4', '1/8', '1/16'];
const layerColors = ['#22d3ee', '#a78bfa', '#f59e0b', '#34d399'];
let context = null, processor = null, stream = null, sourceNode = null, inputGain = null;
let latest = null, poll = null, dragging = null;
let transferJob = null, nextRequest = 1;
const status = (message) => { $('status').textContent = message; };
function formatBars(value) {
  if (!value) return '';
  if (value < 1) {
    const index = bars.findIndex(bar => Math.abs(bar - value) < .001);
    return `${index >= 0 ? labels[index] : value.toFixed(2)} bar`;
  }
  return `${Math.round(value)} ${Math.round(value) === 1 ? 'bar' : 'bars'}`;
}
const post = (message) => processor?.port.postMessage(message);
const control = (id, value) => post({ type: 'control', id, value });
const layerControl = (layer, id, value) => post({ type: 'layer-control', layer, id, value });
const command = (id, value = 0) => post({ type: 'command', id, value });

function drawKnob(canvas, value, min, max, label, color) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h * 0.42, r = Math.min(w, h) * 0.32;
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const start = -135, end = start + fraction * 270;
  const arc = (radius, a, b, stroke, width = 1) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.beginPath();
    for (let deg = a; deg <= b + 0.01; deg += 2) {
      const theta = (deg - 90) * Math.PI / 180;
      const x = cx + Math.cos(theta) * radius, y = cy + Math.sin(theta) * radius;
      if (deg === a) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const theta = (b - 90) * Math.PI / 180;
    ctx.lineTo(cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius);
    ctx.stroke();
  };
  ctx.clearRect(0, 0, w, h);
  arc(r * 1.02, -135, 225, '#172337'); arc(r, -135, 225, '#1e293b');
  arc(r * .66, -135, 225, '#263448');
  for (const radius of [.96, .91, .86]) arc(r * radius, -135, 135, '#172337', 1.4);
  if (fraction > 0) for (const radius of [.96, .91, .86]) arc(r * radius, -135, end, color, 1.4);
  const a = (end - 90) * Math.PI / 180;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * r * .2, cy + Math.sin(a) * r * .2);
  ctx.lineTo(cx + Math.cos(a) * r * .78, cy + Math.sin(a) * r * .78); ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * .78, cy + Math.sin(a) * r * .78, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#344155'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#cbd5e1'; ctx.font = '11px sans-serif';
  ctx.fillText(value.toFixed(2), cx, h * .81);
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.fillText(label, cx, h * .95);
}

function drawWave(canvas, peaks, position, color, pending = 0) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0e1828'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < peaks.length; i++) {
    const x = Math.floor(i * w / peaks.length), y = Math.max(1, peaks[i] * h * .44);
    ctx.beginPath(); ctx.moveTo(x + .5, h / 2 - y); ctx.lineTo(x + .5, h / 2 + y); ctx.stroke();
  }
  if (peaks.length) {
    ctx.strokeStyle = '#f8fafc'; const x = position * w;
    ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke();
  }
  if (pending > 0) { ctx.fillStyle = '#84cc1655'; ctx.fillRect(0, h - 3, pending * w, 3); }
}

function drawSegment(canvas, peaks) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#ffffff22';
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.strokeStyle = '#22d3ee';
  for (let i = 0; i < peaks.length; i++) {
    const x = 2 + i * (w - 4) / peaks.length, y = Math.max(1, peaks[i] * h * .45);
    ctx.beginPath(); ctx.moveTo(x, h / 2 - y); ctx.lineTo(x, h / 2 + y); ctx.stroke();
  }
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
    drawKnob(canvas, value, min, max, label, color); layerControl(layer, id, value);
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
  drawKnob(canvas, initial, min, max, label, color);
  return canvas;
}

const layerElements = [], segmentElements = [], donutElements = [];
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
for (let index = 0; index < bars.length; index++) {
  const segment = document.createElement('div'); segment.className = 'segment';
  segment.innerHTML = `<canvas width="140" height="122"></canvas><span>${labels[index]}</span>`;
  segment.title = `${labels[index]} bars — click to ${$('mode').value === '2' ? 'arm' : 'commit'} recent audio`;
  segment.onclick = () => command(project.commands.segment, bars[index]);
  segment.onmouseenter = () => segmentElements.forEach((item, itemIndex) => item.classList.toggle('hovered', itemIndex >= index));
  segment.onmouseleave = () => segmentElements.forEach(item => item.classList.remove('hovered'));
  $('capture').append(segment); segmentElements.push(segment);
}

const stateNames = ['Empty', 'Playing', 'Recording', 'Stopped', 'Paused'];
const stateColors = ['#64748b', '#34d399', '#ef4444', '#fde047', '#a78bfa'];
function render(data) {
  latest = data;
  if (document.activeElement !== $('tempo')) $('tempo').value = Math.round(data.tempo);
  if (document.activeElement !== $('mode')) $('mode').value = String(data.mode);
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
    if (dragging !== ui.volume) { ui.volume.dataset.value = layer.volume; drawKnob(ui.volume, layer.volume, 0, 2, 'Vol', '#a78bfa'); }
    if (dragging !== ui.speed) { ui.speed.dataset.value = layer.speed; drawKnob(ui.speed, layer.speed, -4, 4, 'Speed', '#22d3ee'); }
    drawDonut(donutElements[index].querySelector('canvas'), layer, index === data.active, layerColors[index]);
  }
  for (let index = 0; index < bars.length; index++) {
    const segment = segmentElements[index];
    segment.classList.toggle('armed', data.forwardBars === bars[index]);
    drawSegment(segment.querySelector('canvas'), data.segments[index]);
  }
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
  post({ type: 'save-end', requestId: job.id });
  for (let index = 0; index < project.layers; index++) {
    const layer = job.state.layers[index];
    layer.pcmF32Base64 = layer.frames ? encodePcm(job.audio[index]) : '';
  }
  const blob = new Blob([JSON.stringify(job.state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'manifold-main-looper.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Downloaded the four-layer looper session.');
  transferJob = null; $('save-session').disabled = false;
}

function nextImportLayer() {
  const job = transferJob;
  if (!job || job.kind !== 'import') return;
  while (job.layer < project.layers && !job.state.layers[job.layer].frames) job.layer++;
  if (job.layer === project.layers) {
    post({ type: 'import-end', requestId: job.id }); return;
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
    job.audio = data.state.layers.map(layer => new Float32Array(layer.frames * 2));
    nextSaveChunk();
  } else if (data.type === 'save-chunk' && job.kind === 'save') {
    job.audio[data.layer].set(data.stereo, data.offset * 2);
    job.offset = data.offset + data.stereo.length / 2;
    nextSaveChunk();
  } else if (data.type === 'import-started' && job.kind === 'import') {
    nextImportLayer();
  } else if (data.type === 'import-progress' && job.kind === 'import') {
    if (data.done) { job.layer++; nextImportLayer(); }
    else post({ type: 'import-step', requestId: job.id, layer: data.layer });
  } else if (data.type === 'import-complete' && job.kind === 'import') {
    $('target').value = Math.round(job.state.targetBpm);
    status('Opened the four-layer looper session.');
    transferJob = null;
  }
}

$('save-session').onclick = () => {
  if (!processor) { status('Start audio before downloading a looper session.'); return; }
  if (transferJob) return;
  const id = nextRequest++;
  transferJob = { kind: 'save', id, state: null, audio: null, layer: 0, offset: 0 };
  $('save-session').disabled = true; status('Collecting loop audio for download…');
  post({ type: 'save-start', requestId: id });
};
$('open-session').onchange = async () => {
  if (!processor) { status('Start audio before opening a looper session.'); return; }
  if (transferJob) return;
  const file = $('open-session').files[0];
  if (!file) return;
  try {
    const state = JSON.parse(await file.text());
    if (state.format !== project.format || state.version !== project.version || state.id !== project.id
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
    const id = nextRequest++;
    const metadata = { ...state, layers: state.layers.map(({ pcmF32Base64: _pcm, ...layer }) => layer) };
    transferJob = { kind: 'import', id, state: metadata, audio, layer: 0 };
    status('Opening looper session…');
    post({ type: 'import-start', requestId: id, state: metadata });
  } catch (error) { status(error.message); }
  $('open-session').value = '';
};

async function start() {
  if (context) return;
  const sourceKind = $('source').value;
  if (sourceKind === 'file' && !$('file').files[0]) { status('Choose an audio file first.'); return; }
  const button = $('audio-button'); button.disabled = true; status('Preparing Main looper…');
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
      processor.port.postMessage({ type: 'init', wasmBytes, project }, [wasmBytes]);
    });
    processor.port.onmessage = ({ data }) => {
      if (data.type === 'snapshot') render(data);
      else if (data.type === 'error') {
        if (transferJob) { transferJob = null; $('save-session').disabled = false; }
        status(`Audio error: ${data.message}`);
      }
      else if (data.type === 'rejected') status('That looper action could not be applied.');
      else handleTransfer(data);
    };
    if (sourceKind === 'microphone') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      sourceNode = context.createMediaStreamSource(stream);
    } else if (sourceKind === 'file') {
      const bytes = await $('file').files[0].arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      sourceNode = context.createBufferSource(); sourceNode.buffer = buffer; sourceNode.loop = true; sourceNode.start();
    } else {
      sourceNode = context.createOscillator(); sourceNode.type = 'sine';
      sourceNode.frequency.value = Number($('pitch').value) || 220; sourceNode.start();
    }
    inputGain = context.createGain(); inputGain.gain.value = sourceKind === 'oscillator' ? .18 : 1;
    sourceNode.connect(inputGain).connect(processor);
    poll = setInterval(() => post({ type: 'snapshot' }), 100);
    post({ type: 'snapshot' });
    button.textContent = 'Stop audio'; button.disabled = false; button.onclick = stop;
    status(`Running · ${sourceKind === 'oscillator' ? 'test tone' : sourceKind === 'file' ? 'looping audio file' : 'microphone'} · all four layers capturing`);
  } catch (error) {
    status(error.message); await stop();
  }
}
async function stop() {
  if (transferJob?.kind === 'import') post({ type: 'import-cancel' });
  transferJob = null; $('save-session').disabled = false;
  clearInterval(poll); poll = null;
  sourceNode?.disconnect(); if (sourceNode?.stop) { try { sourceNode.stop(); } catch { /* already stopped */ } }
  inputGain?.disconnect(); processor?.disconnect(); stream?.getTracks().forEach(track => track.stop());
  await context?.close(); sourceNode = null; inputGain = null; processor = null; stream = null; context = null;
  $('audio-button').textContent = 'Start audio'; $('audio-button').disabled = false; $('audio-button').onclick = start;
}
$('audio-button').onclick = start;
$('source').onchange = () => { $('file-label').hidden = $('source').value !== 'file'; $('pitch-label').hidden = $('source').value !== 'oscillator'; };
$('pitch').onchange = () => { if (sourceNode?.frequency) sourceNode.frequency.setTargetAtTime(Math.max(60, Math.min(1200, Number($('pitch').value))), context.currentTime, .01); };
$('mode').onchange = () => control(project.controls.mode, Number($('mode').value));
$('tempo').onchange = () => control(project.controls.tempo, Number($('tempo').value));
$('target').onchange = () => control(project.controls.targetBpm, Number($('target').value));
$('rec').onclick = () => command(latest?.recording ? project.commands.stopRecord : project.commands.record);
$('play').onclick = () => command(latest?.layers.some(layer => layer.playing) ? project.commands.pause : project.commands.play);
$('stop').onclick = () => command(project.commands.stop);
$('overdub').onclick = () => control(project.controls.overdub, latest?.overdub ? 0 : 1);
$('clear-all').onclick = () => command(project.commands.clearAll);
$('fire').onclick = () => command(project.commands.fireForward);
