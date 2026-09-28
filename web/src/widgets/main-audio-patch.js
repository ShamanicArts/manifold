import { compileMainRackInsert } from '../state/main-rack-graph.js';
import { initialRackDocument, replaceRackInput, disconnectRackInput,
  setRackViewMode } from '../state/rack-document.js';

const SHELLS = {
  adsr: '.rack-adsr', oscillator: '.rack-source', filter: '.rack-filter',
  fx1: '.rack-fx1', fx2: '.rack-fx2', eq: '.rack-eq',
};
const AUDIO_INPUTS = new Set(['filter:in', 'fx1:in', 'fx2:in', 'eq:in', '__rackOutput:main']);
const AUDIO_OUTPUTS = new Set(['oscillator:out', 'filter:out', 'fx1:out', 'fx2:out', 'eq:out']);
const NS = 'http://www.w3.org/2000/svg';
const endpointKey = endpoint => `${endpoint.moduleId}:${endpoint.portId}`;

export function mountMainAudioPatch({ content, catalog, toggle, onRoute, onError }) {
  let rack = initialRackDocument(catalog);
  let pending = false;
  let source = null;
  let drag = null;
  const portButtons = new Map();
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('main-rack-wires');
  svg.setAttribute('viewBox', '0 0 1280 460');
  svg.setAttribute('aria-hidden', 'true');
  content.append(svg);

  function makePort(moduleId, port, direction, host) {
    const endpoint = { moduleId, portId: port.id };
    const active = port.kind === 'audio' && (direction === 'input'
      ? AUDIO_INPUTS.has(endpointKey(endpoint)) : AUDIO_OUTPUTS.has(endpointKey(endpoint)));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `main-patch-port main-patch-${port.kind} ${active ? '' : 'main-patch-unavailable'}`;
    button.dataset.module = moduleId;
    button.dataset.port = port.id;
    button.dataset.direction = direction;
    button.disabled = !active;
    button.title = active ? `${moduleId} ${port.id} ${direction}${direction === 'input' ? ' · right-click or double-click to unplug' : ''}`
      : `${moduleId} ${port.id}: routing pending`;
    button.setAttribute('aria-label', button.title);
    const label = document.createElement('span');
    label.textContent = port.id.replaceAll('_', ' ').toUpperCase();
    const socket = document.createElement('i');
    socket.setAttribute('aria-hidden', 'true');
    if (direction === 'input') button.append(socket, label);
    else button.append(label, socket);
    host.append(button);
    portButtons.set(`${direction}:${endpointKey(endpoint)}`, button);
    if (active && direction === 'output') {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        source = endpoint;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        button.setPointerCapture(event.pointerId);
        paintWires();
      });
      button.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        drag.x = event.clientX; drag.y = event.clientY;
        paintWires();
      });
      button.addEventListener('pointerup', event => {
        if (drag?.id !== event.pointerId) return;
        drag = null;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.main-patch-port[data-direction="input"]');
        if (target && !target.disabled) void connect(source, {
          moduleId: target.dataset.module, portId: target.dataset.port,
        });
        paintWires();
      });
    } else if (active) {
      button.addEventListener('click', () => {
        if (source) void connect(source, endpoint);
      });
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        void unpatch(endpoint);
      });
      button.addEventListener('dblclick', () => void unpatch(endpoint));
    }
  }

  for (const module of rack.modules) {
    const shell = content.querySelector(SHELLS[module.id]);
    if (!shell) continue;
    const face = document.createElement('div');
    face.className = 'main-patch-face';
    face.setAttribute('aria-label', `${catalog.catalog[module.type].name} patch ports`);
    for (const [direction, ports] of [['input', catalog.catalog[module.type].ports.inputs],
      ['output', catalog.catalog[module.type].ports.outputs]]) {
      const column = document.createElement('div');
      column.className = `main-patch-column main-patch-${direction}s`;
      const heading = document.createElement('strong');
      heading.textContent = direction === 'input' ? 'INPUTS' : 'OUTPUTS';
      column.append(heading);
      for (const port of ports) makePort(module.id, port, direction, column);
      face.append(column);
    }
    shell.append(face);
  }
  const outputRail = document.createElement('div');
  outputRail.className = 'main-patch-output-rail';
  const railTitle = document.createElement('strong'); railTitle.textContent = 'MAIN OUT';
  outputRail.append(railTitle);
  makePort('__rackOutput', { id: 'main', kind: 'audio' }, 'input', outputRail);
  content.append(outputRail);
  const midiRail = document.createElement('div');
  midiRail.className = 'main-patch-midi-rail';
  makePort('__midiInput', { id: 'voice', kind: 'voice' }, 'output', midiRail);
  content.append(midiRail);

  function anchor(button) {
    const bounds = button.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const scale = contentBounds.width / content.offsetWidth;
    const socket = button.querySelector('i').getBoundingClientRect();
    return { x: (socket.left + socket.width / 2 - contentBounds.left) / scale,
      y: (socket.top + socket.height / 2 - contentBounds.top) / scale };
  }
  function drawWire(a, b, kind, preview = false) {
    const path = document.createElementNS(NS, 'path');
    const bend = Math.max(28, Math.abs(b.x - a.x) * .45);
    path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`);
    path.setAttribute('class', `main-rack-wire main-rack-wire-${kind}${preview ? ' preview' : ''}`);
    svg.append(path);
  }
  function paintWires() {
    svg.replaceChildren();
    if (rack.viewMode !== 'patch') return;
    for (const edge of rack.connections) {
      const from = portButtons.get(`output:${endpointKey(edge.from)}`);
      const to = portButtons.get(`input:${endpointKey(edge.to)}`);
      if (!from || !to) continue;
      const kind = catalog.catalog[rack.modules.find(module => module.id === edge.from.moduleId)?.type]
        ?.ports.outputs.find(port => port.id === edge.from.portId)?.kind ?? 'voice';
      drawWire(anchor(from), anchor(to), kind);
    }
    if (source && drag) {
      const from = portButtons.get(`output:${endpointKey(source)}`);
      const bounds = content.getBoundingClientRect();
      const scale = bounds.width / content.offsetWidth;
      drawWire(anchor(from), { x: (drag.x - bounds.left) / scale,
        y: (drag.y - bounds.top) / scale }, 'audio', true);
    }
  }
  async function apply(next, to, from) {
    if (pending) return;
    try {
      compileMainRackInsert(next, catalog);
      const target = to.moduleId === '__rackOutput' ? catalog.endpoints.__rackOutput.nodeId
        : next.modules.find(module => module.id === to.moduleId).nodeId;
      const sourceId = !from ? 0 : from.moduleId === 'oscillator' ? 1
        : next.modules.find(module => module.id === from.moduleId).nodeId;
      pending = true;
      const accepted = await onRoute({ to: target, port: 0, from: sourceId });
      if (!accepted) throw new Error('The Rust rack rejected this cable.');
      rack = next;
      source = null;
      paintWires();
    } catch (error) { onError(error.message); }
    finally { pending = false; }
  }
  async function connect(from, to) {
    try { await apply(replaceRackInput(rack, from, to, catalog), to, from); }
    catch (error) { onError(error.message); }
  }
  async function unpatch(to) {
    try { await apply(disconnectRackInput(rack, to, catalog), to, null); }
    catch (error) { onError(error.message); }
  }
  toggle.addEventListener('click', () => {
    if (pending) return;
    rack = setRackViewMode(rack, rack.viewMode === 'rack' ? 'patch' : 'rack', catalog);
    content.classList.toggle('main-rack-patch-active', rack.viewMode === 'patch');
    toggle.textContent = rack.viewMode === 'patch' ? 'RACK' : 'AUDIO PATCH';
    toggle.setAttribute('aria-pressed', String(rack.viewMode === 'patch'));
    source = null; drag = null;
    requestAnimationFrame(paintWires);
  });
  content.closest('.rack-scroll')?.addEventListener('scroll', () => requestAnimationFrame(paintWires));
  window.addEventListener('resize', () => requestAnimationFrame(paintWires));
  return {
    document: () => rack,
    isEdited: () => rack.connections.some(edge => !catalog.initial.connections.some(initial =>
      endpointKey(initial.from) === endpointKey(edge.from) && endpointKey(initial.to) === endpointKey(edge.to)))
      || rack.connections.length !== catalog.initial.connections.length,
    repaint: paintWires,
  };
}
