import './graph-module.css';
import noteVoice from '../../projects/graph-workspace/note-voice.json';
import toneTexture from '../../projects/graph-workspace/tone-texture.json';
import fxLayout from '../../projects/standalone-fx-module/ui.json';
import { NODE_TYPES, parseGraphBundle } from './graph/topology.js';
import { mountCompactSlider } from './widgets/compact-slider.js';
import { mountDropdown } from './widgets/dropdown.js';

const byId = (id) => document.getElementById(id);
const editorMode = new URLSearchParams(location.search).has('editor');
if (editorMode) document.body.classList.add('plugin-editor');
const HOST_SLOT_BASE = 0x0100_0000;
const widgetStyles = fxLayout.module.children.filter((item) => item.type === 'Slider').map((item) => item.style);
const dropdownStyle = fxLayout.module.children.find((item) => item.id === 'type_dropdown')?.style;
let signature = '';
let active = null;
const controls = new Map();
const gestures = new Set();
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
        const slot = document.createElement('span');
        slot.className = 'graph-slot';
        slot.textContent = String(item.id - HOST_SLOT_BASE + 1).padStart(2, '0');
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
  status(editorMode ? 'Host automation and widget gestures use fixed graph slots.'
    : 'Inspect the original widgets here. Open the workbench to hear this graph.');
}

window.manifoldEditorReceive = (snapshot) => paint(snapshot);
if (window.__manifoldPendingState) {
  paint(window.__manifoldPendingState);
  delete window.__manifoldPendingState;
} else {
  paint(snapshotFromProject(noteVoice));
}
if (editorMode) send('editor-ready');
byId('graph-note').addEventListener('click', () => paint(snapshotFromProject(noteVoice)));
byId('graph-tone').addEventListener('click', () => paint(snapshotFromProject(toneTexture)));
byId('graph-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 45 * 1024 * 1024) throw new Error('Project exceeds 45 MB.');
    paint(snapshotFromProject(JSON.parse(await file.text())));
    status(`Inspecting ${file.name}. Load an exported preset in a DAW to hear it there.`);
  } catch (error) { status(`Project unchanged: ${error.message}`); }
  finally { event.target.value = ''; }
});
