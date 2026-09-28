import { compileMainRackInsert, validateMainRackInsertDocument } from '../state/main-rack-graph.js';
import { initialRackDocument, moveRackModule, replaceRackInput, disconnectRackInput,
  setRackViewMode } from '../state/rack-document.js';

const SHELLS = {
  adsr: '.rack-adsr', oscillator: '.rack-source', filter: '.rack-filter',
  fx1: '.rack-fx1', fx2: '.rack-fx2', eq: '.rack-eq',
};
const AUDIO_INPUTS = new Set(['filter:in', 'fx1:in', 'fx2:in', 'eq:in', '__rackOutput:main']);
const AUDIO_OUTPUTS = new Set(['oscillator:out', 'filter:out', 'fx1:out', 'fx2:out', 'eq:out']);
const NS = 'http://www.w3.org/2000/svg';
const endpointKey = endpoint => `${endpoint.moduleId}:${endpoint.portId}`;

export function mountMainAudioPatch({ content, catalog, toggle, onRoute, onRoutes, onError, readOnly = false }) {
  let rack = initialRackDocument(catalog);
  let pending = false;
  let source = null;
  let drag = null;
  let shellDrag = null;
  const portButtons = new Map();
  const shells = new Map();
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
    button.disabled = !active || readOnly;
    button.title = readOnly && active ? `${moduleId} ${port.id}: native cable editing pending`
      : active ? `${moduleId} ${port.id} ${direction}${direction === 'input' ? ' · right-click or double-click to unplug' : ''}`
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
    if (active && !readOnly && direction === 'output') {
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
    } else if (active && !readOnly) {
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
    shells.set(module.id, shell);
    const header = shell.querySelector('.rack-shell-head');
    if (header && !readOnly) {
      header.title = `Drag ${catalog.catalog[module.type].name} to another rack cell`;
      header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || pending) return;
        event.preventDefault();
        const bounds = shell.getBoundingClientRect();
        const scale = content.getBoundingClientRect().width / content.offsetWidth;
        shellDrag = { id: event.pointerId, moduleId: module.id,
          startX: event.clientX, startY: event.clientY,
          offsetX: (event.clientX - bounds.left) / scale,
          offsetY: (event.clientY - bounds.top) / scale };
        header.setPointerCapture(event.pointerId);
        shell.classList.add('rack-shell-moving');
      });
      header.addEventListener('pointermove', event => {
        if (shellDrag?.id !== event.pointerId || shellDrag.moduleId !== module.id) return;
        const scale = content.getBoundingClientRect().width / content.offsetWidth;
        shell.style.transform = `translate(${(event.clientX - shellDrag.startX) / scale}px, ${(event.clientY - shellDrag.startY) / scale}px)`;
        paintWires();
      });
      const finishDrag = (event, commit) => {
        if (shellDrag?.id !== event.pointerId || shellDrag.moduleId !== module.id) return;
        const current = shellDrag;
        shellDrag = null;
        shell.style.transform = '';
        shell.classList.remove('rack-shell-moving');
        if (commit && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 4) {
          const bounds = content.getBoundingClientRect();
          const scale = bounds.width / content.offsetWidth;
          const left = (event.clientX - bounds.left) / scale - current.offsetX;
          const top = (event.clientY - bounds.top) / scale - current.offsetY;
          const nextRow = Math.max(0, Math.round((top - 12) / catalog.grid.cellHeight));
          const nextCol = Math.max(0, Math.round(left / catalog.grid.cellWidth));
          try {
            rack = validateMainRackInsertDocument(moveRackModule(rack, module.id,
              nextRow, nextCol, catalog), catalog);
            placeShells();
          } catch (error) { onError(error.message); }
        }
        requestAnimationFrame(paintWires);
      };
      header.addEventListener('pointerup', event => finishDrag(event, true));
      header.addEventListener('pointercancel', event => finishDrag(event, false));
    }
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

  function placeShells() {
    const height = Math.max(460, ...rack.modules.map(module =>
      12 + (module.row + module.h) * catalog.grid.cellHeight));
    content.style.height = `${Math.max(2553, height)}px`;
    svg.style.height = `${height}px`;
    svg.setAttribute('viewBox', `0 0 1280 ${height}`);
    for (const module of rack.modules) {
      const shell = shells.get(module.id);
      if (!shell) continue;
      shell.style.position = 'absolute';
      shell.style.left = `${module.col * catalog.grid.cellWidth}px`;
      shell.style.top = `${module.row === 0 ? 25 : 12 + module.row * catalog.grid.cellHeight}px`;
    }
    requestAnimationFrame(paintWires);
  }
  placeShells();

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
  function showMode() {
    content.classList.toggle('main-rack-patch-active', rack.viewMode === 'patch');
    toggle.textContent = rack.viewMode === 'patch' ? 'RACK' : 'AUDIO PATCH';
    toggle.setAttribute('aria-pressed', String(rack.viewMode === 'patch'));
    source = null; drag = null;
    requestAnimationFrame(paintWires);
  }
  const audioTargets = ['filter', 'fx1', 'fx2', 'eq', '__rackOutput'];
  function routeFor(document, moduleId) {
    const portId = moduleId === '__rackOutput' ? 'main' : 'in';
    const edge = document.connections.find(item => item.to.moduleId === moduleId && item.to.portId === portId);
    const from = !edge ? 0 : edge.from.moduleId === 'oscillator' ? 1
      : document.modules.find(module => module.id === edge.from.moduleId).nodeId;
    const to = moduleId === '__rackOutput' ? catalog.endpoints.__rackOutput.nodeId
      : document.modules.find(module => module.id === moduleId).nodeId;
    return { to, port: 0, from };
  }
  async function restore(document, alreadyApplied = false) {
    if (pending) throw new Error('A cable edit is still pending.');
    const next = validateMainRackInsertDocument(document ?? initialRackDocument(catalog), catalog);
    const routes = audioTargets.map(moduleId => ({ ...routeFor(next, moduleId),
      previous: routeFor(rack, moduleId).from }))
      .filter(route => route.from !== route.previous);
    pending = true;
    try {
      if (!alreadyApplied && routes.length && !await onRoutes(routes)) {
        throw new Error('The Rust rack rejected the saved cables.');
      }
      rack = next;
      placeShells();
      showMode();
    } finally { pending = false; }
  }
  toggle.addEventListener('click', () => {
    if (pending) return;
    rack = setRackViewMode(rack, rack.viewMode === 'rack' ? 'patch' : 'rack', catalog);
    showMode();
  });
  content.closest('.rack-scroll')?.addEventListener('scroll', () => requestAnimationFrame(paintWires));
  window.addEventListener('resize', () => requestAnimationFrame(paintWires));
  return {
    document: () => rack,
    restore,
    pending: () => pending,
    isEdited: () => rack.connections.some(edge => !catalog.initial.connections.some(initial =>
      endpointKey(initial.from) === endpointKey(edge.from) && endpointKey(initial.to) === endpointKey(edge.to)))
      || rack.connections.length !== catalog.initial.connections.length,
    repaint: paintWires,
  };
}
