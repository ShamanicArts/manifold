import './graph-module.css';
import noteVoice from '../../projects/graph-workspace/note-voice.json';
import toneTexture from '../../projects/graph-workspace/tone-texture.json';
import fxLayout from '../../projects/standalone-fx-module/ui.json';
import { NODE_TYPES, parseGraphBundle } from './graph/topology.js';
import { mountCompactSlider } from './widgets/compact-slider.js';
import { mountDropdown } from './widgets/dropdown.js';

const byId = (id) => document.getElementById(id);
const editorMode = new URLSearchParams(location.search).has('editor');
if (editorMode) {
  document.body.classList.add('plugin-editor');
  document.getElementById('graph-import-label').textContent = 'Import project JSON';
  document.querySelector('footer').textContent += ' Edit a slot number to reassign it; this reloads the graph, resets active voices and effect tails, and can redirect existing DAW automation.';
}
const HOST_SLOT_BASE = 0x0100_0000;
const widgetStyles = fxLayout.module.children.filter((item) => item.type === 'Slider').map((item) => item.style);
const dropdownStyle = fxLayout.module.children.find((item) => item.id === 'type_dropdown')?.style;
let signature = '';
let active = null;
const controls = new Map();
const gestures = new Set();
let captureTimer = null;
let captureInstrument = null;
let captureStarted = false;
let freeCaptureArmed = false;
const status = (message) => { byId('graph-status').textContent = message; };
const send = (kind, id, value) => {
  if (!editorMode) return;
  window.ipc?.postMessage(JSON.stringify({ version: 1, kind, id, ...(value === undefined ? {} : { value }) }));
};
const begin = (id) => { if (!gestures.has(id)) { gestures.add(id); send('gesture-begin', id); } };
const end = (id) => { if (gestures.delete(id)) send('gesture-end', id); };

function snapshotFromProject(document) {
  const { signal, hostBindings } = parseGraphBundle(document);
  const nodes = signal.nodes.map(({ id, type }) => ({ id, type }));
  const controls = hostBindings.map(({ slot, nodeId, id }) => {
    const node = signal.nodes.find((item) => item.id === nodeId);
    const parameter = NODE_TYPES[node.type]?.parameters?.find((item) => item.id === id);
    const entry = signal.initialParameters.find((item) => item.nodeId === nodeId && item.id === id);
    if (!parameter || !entry) throw new Error(`Unbound parameter ${nodeId}:${id}`);
    const min = parameter.choices ? 0 : parameter.min;
    const max = parameter.choices ? parameter.choices.length - 1 : parameter.max;
    return { id: HOST_SLOT_BASE + slot, nodeId, parameterId: id, min, max,
      discrete: Boolean(parameter.choices), normalized: (entry.value - min) / (max - min) };
  });
  return { schemaVersion: 1, id: 'manifold.graph', nodes, controls };
}

function paint(snapshot) {
  if (snapshot?.schemaVersion !== 1 || snapshot.id !== 'manifold.graph'
    || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.controls)) {
    status('The host supplied an unsupported graph control snapshot.');
    return;
  }
  active = snapshot;
  const nextSignature = JSON.stringify([snapshot.nodes, snapshot.controls.map(({ id, nodeId, parameterId, min, max, discrete }) =>
    [id, nodeId, parameterId, min, max, discrete])]);
  if ((captureTimer || freeCaptureArmed) && nextSignature !== signature) {
    clearInterval(captureTimer);
    captureTimer = null;
    captureStarted = false;
    freeCaptureArmed = false;
    byId('graph-capture-go').disabled = false;
    byId('graph-capture-source').disabled = false;
    byId('graph-capture-mode').disabled = false;
    byId('graph-capture-go').textContent = 'Capture to instrument';
    status('Capture interrupted by a project change.');
  }
  const sources = snapshot.nodes.filter(({ type }) => type === 'retrospective-capture' || type === 'loop-capture');
  const instrument = snapshot.nodes.find(({ type }) => type === 'sample-instrument');
  const capture = byId('graph-capture');
  capture.hidden = !(editorMode && snapshot.captureGesture && sources.length && instrument);
  if (!capture.hidden) {
    captureInstrument = instrument.id;
    const select = byId('graph-capture-source');
    const selected = Number(select.value);
    select.replaceChildren(...sources.map(({ id }) => {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = `Capture node ${id}`;
      return option;
    }));
    if (sources.some(({ id }) => id === selected)) select.value = String(selected);
  }
  if (nextSignature !== signature) {
    signature = nextSignature;
    for (const { control } of controls.values()) control.destroy?.();
    controls.clear();
    gestures.clear();
    const root = byId('graph-widget-root');
    root.replaceChildren();
    for (const node of snapshot.nodes) {
      const items = snapshot.controls.filter((control) => control.nodeId === node.id);
      if (!items.length) continue;
      const card = document.createElement('article');
      card.className = 'graph-card';
      const title = document.createElement('h2');
      title.textContent = `${node.id} · ${NODE_TYPES[node.type]?.label ?? node.type}`;
      const count = document.createElement('small');
      count.textContent = `${items.length} controls`;
      title.append(count);
      card.append(title);
      for (const item of items) {
        const spec = NODE_TYPES[node.type]?.parameters?.find((parameter) => parameter.id === item.parameterId);
        const label = spec?.label ?? `Parameter ${item.parameterId}`;
        const row = document.createElement('div');
        row.className = 'graph-parameter-row';
        const slotNumber = item.id - HOST_SLOT_BASE + 1;
        const slot = document.createElement(editorMode ? 'input' : 'span');
        slot.className = editorMode ? 'graph-slot graph-slot-edit' : 'graph-slot';
        if (editorMode) {
          slot.type = 'number';
          slot.min = '1';
          slot.max = '128';
          slot.step = '1';
          slot.value = String(slotNumber);
          slot.setAttribute('aria-label', `Host slot for ${NODE_TYPES[node.type]?.label ?? node.type} ${node.id} ${label}`);
          slot.title = 'Change the host slot. An occupied slot swaps its two controls.';
          slot.addEventListener('change', () => {
            const selected = Number(slot.value);
            slot.value = String(slotNumber);
            if (!Number.isInteger(selected) || selected < 1 || selected > 128) {
              status('Enter a host slot from 1 to 128.');
              return;
            }
            if (selected === slotNumber) return;
            if (!window.ipc?.postMessage) {
              status('DAW editor bridge unavailable.');
              return;
            }
            window.ipc?.postMessage(JSON.stringify({ version: 1, kind: 'slot-assign', id: item.id, slot: selected - 1 }));
            status(`Assigning host slot ${slotNumber} to ${selected}…`);
          });
        } else {
          slot.textContent = String(slotNumber).padStart(2, '0');
        }
        const element = document.createElement('div');
        element.className = 'graph-control';
        const physical = item.min + item.normalized * (item.max - item.min);
        let control;
        if (spec?.choices) {
          element.classList.add('graph-dropdown');
          control = mountDropdown(element, { id: `${node.type}_${label}`, options: spec.choices,
            style: dropdownStyle }, card);
          control.setSelected(Math.round(physical));
          control.onChange((value) => {
            begin(item.id);
            send('parameter', item.id, value / (item.max - item.min));
            end(item.id);
          });
        } else {
          control = mountCompactSlider(element, { label, min: item.min, max: item.max,
            value: physical, step: item.discrete ? 1 : 0, showValue: true,
            style: widgetStyles[(item.id - HOST_SLOT_BASE) % widgetStyles.length] });
          control.onChange((value) => send('parameter', item.id, (value - item.min) / (item.max - item.min)));
          element.addEventListener('pointerdown', () => begin(item.id), true);
          for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            element.addEventListener(event, () => end(item.id), true);
          }
          element.addEventListener('keydown', () => begin(item.id), true);
          element.addEventListener('keyup', () => end(item.id), true);
          element.addEventListener('blur', () => end(item.id), true);
        }
        controls.set(item.id, { control, discrete: Boolean(spec?.choices), element, item });
        row.append(slot, element);
        card.append(row);
      }
      root.append(card);
    }
  }
  for (const item of snapshot.controls) {
    const mounted = controls.get(item.id);
    if (!mounted || gestures.has(item.id)) continue;
    const physical = item.min + item.normalized * (item.max - item.min);
    if (mounted.discrete) mounted.control.setSelected(Math.round(physical));
    else mounted.control.setValue(physical);
    mounted.control.paint();
  }
  byId('graph-count').textContent = `${snapshot.nodes.length} nodes · ${snapshot.controls.length} bound controls`;
  byId('graph-source').textContent = editorMode ? 'DAW host' : 'Browser preview';
  if (!captureTimer && !freeCaptureArmed) status(editorMode ? 'Host automation and widget gestures use fixed graph slots.'
    : 'Inspect the original widgets here. Open the workbench to hear this graph.');
}

window.manifoldEditorReceive = (snapshot) => paint(snapshot);
window.manifoldEditorStatus = (message) => {
  status(message);
  if (message.startsWith('Free capture armed')) {
    freeCaptureArmed = true;
    byId('graph-capture-go').disabled = false;
    byId('graph-capture-go').textContent = 'Stop free capture';
    byId('graph-capture-source').disabled = true;
    byId('graph-capture-mode').disabled = true;
  }
  if (captureTimer && message.startsWith('Freezing')) captureStarted = true;
};
window.manifoldCaptureResult = (ok, message) => {
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = null;
  captureStarted = false;
  freeCaptureArmed = false;
  byId('graph-capture-go').disabled = false;
  byId('graph-capture-source').disabled = false;
  byId('graph-capture-mode').disabled = false;
  byId('graph-capture-go').textContent = byId('graph-capture-mode').value === 'free' ? 'Arm free capture' : 'Capture to instrument';
  status(message || (ok ? 'Capture published.' : 'Capture failed.'));
};
if (window.__manifoldPendingState) {
  paint(window.__manifoldPendingState);
  delete window.__manifoldPendingState;
} else {
  paint(snapshotFromProject(noteVoice));
}
byId('graph-note').addEventListener('click', () => paint(snapshotFromProject(noteVoice)));
byId('graph-tone').addEventListener('click', () => paint(snapshotFromProject(toneTexture)));
byId('graph-capture-mode').addEventListener('change', () => {
  const bars = byId('graph-capture-mode').value === 'bars';
  const free = byId('graph-capture-mode').value === 'free';
  const input = byId('graph-capture-seconds');
  input.hidden = free;
  byId('graph-capture-window-label').textContent = free ? 'Mode' : 'Window';
  byId('graph-capture-go').textContent = free ? 'Arm free capture' : 'Capture to instrument';
  input.min = bars ? '0.0625' : '0.05';
  input.max = bars ? '16' : '30';
  input.step = bars ? '0.0625' : '0.05';
  input.value = bars ? '1' : '2';
});
byId('graph-capture-go').addEventListener('click', () => {
  const nodeId = Number(byId('graph-capture-source').value);
  const duration = Number(byId('graph-capture-seconds').value);
  const bars = byId('graph-capture-mode').value === 'bars';
  const free = byId('graph-capture-mode').value === 'free';
  if (!Number.isInteger(nodeId) || !Number.isInteger(captureInstrument)
    || (!free && (!Number.isFinite(duration) || duration < (bars ? 0.0625 : 0.05)
    || duration > (bars ? 16 : 30))) || !window.ipc?.postMessage) {
    status(`Choose a source and a window from ${bars ? '1/16 to 16 bars' : '0.05 to 30 seconds'}.`);
    return;
  }
  if (captureTimer) clearInterval(captureTimer);
  byId('graph-capture-go').disabled = true;
  captureStarted = false;
  if (free && !freeCaptureArmed) {
    window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'capture-free-arm', nodeId }));
    status(`Arming free capture from node ${nodeId}…`);
    return;
  }
  if (free) {
    window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'capture-free-stop', nodeId }));
    status(`Marking the end of free capture from node ${nodeId}…`);
  } else {
  window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'capture-start', nodeId,
    ...(bars ? { bars: duration } : { seconds: duration }) }));
  status(`Capturing ${duration} ${bars ? 'bars' : 'seconds'} from node ${nodeId}…`);
  }
  const deadline = Date.now() + 15_000;
  captureTimer = setInterval(() => {
    if (Date.now() > deadline) {
      window.manifoldCaptureResult(false, 'Capture timed out. Keep the DAW processing audio and try again.');
      return;
    }
    if (captureStarted) {
      window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'capture-finish', instrumentId: captureInstrument }));
    }
  }, 100);
});
byId('graph-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 45 * 1024 * 1024) throw new Error('Project exceeds 45 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = snapshotFromProject(JSON.parse(new TextDecoder().decode(bytes)));
    if (editorMode) {
      if (!window.ipc?.postMessage) throw new Error('DAW editor bridge unavailable');
      status(`Importing ${file.name}…`);
      window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'import-start', size: bytes.length,
        name: file.name.slice(0, 128) }));
      for (let offset = 0; offset < bytes.length; offset += 2046) {
        const data = btoa(String.fromCharCode(...bytes.subarray(offset, offset + 2046)));
        window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'import-chunk', data }));
        if (offset && offset % (2046 * 32) === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      window.ipc.postMessage(JSON.stringify({ version: 1, kind: 'import-end' }));
    } else {
      paint(preview);
      status(`Inspecting ${file.name}. Export a VST3 preset to hear it in a DAW.`);
    }
  } catch (error) { status(`Project unchanged: ${error.message}`); }
  finally { event.target.value = ''; }
});
if (editorMode) send('editor-ready');
