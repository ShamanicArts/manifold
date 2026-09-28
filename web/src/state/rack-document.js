// Shared control-side rack state. Layout and wire edits are pure and validated;
// the audio host must separately accept a compiled replacement before publishing one.
const ID = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
const MAX_MODULES = 128;
const MAX_CONNECTIONS = 256;

function fail(message) { throw new Error(`Invalid rack document: ${message}`); }
function key(endpoint) { return `${endpoint.moduleId}:${endpoint.portId}`; }
function isId(value) { return typeof value === 'string' && ID.test(value); }
function isGridInt(value, minimum) { return Number.isInteger(value) && value >= minimum; }

function port(catalog, modules, endpoint, direction) {
  const module = modules.get(endpoint.moduleId);
  const spec = module ? catalog.catalog[module.type] : catalog.endpoints[endpoint.moduleId];
  return spec?.ports?.[direction]?.find((candidate) => candidate.id === endpoint.portId);
}

function checkLayout(catalog, modules) {
  const cells = new Set();
  for (const module of modules) {
    const spec = catalog.catalog[module.type];
    if (!spec || !isId(module.id) || catalog.endpoints[module.id]
      || !isGridInt(module.nodeId, 1) || module.nodeId > 0xFFFF_FFFF
      || !isGridInt(module.row, 0) || !isGridInt(module.col, 0)
      || !isGridInt(module.w, 1) || !isGridInt(module.h, 1)
      || !spec.sizes.some(([w, h]) => module.w === w && module.h === h)
      || module.col + module.w > catalog.grid.columns
      || module.row + module.h > catalog.grid.maxRows) fail(`module ${module.id ?? '?'}`);
    for (let row = module.row; row < module.row + module.h; row++) {
      for (let col = module.col; col < module.col + module.w; col++) {
        const cell = `${row}:${col}`;
        if (cells.has(cell)) fail(`overlapping module at ${cell}`);
        cells.add(cell);
      }
    }
  }
}

function checkConnections(catalog, modules, connections) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const ids = new Set(), occupied = new Set();
  const descendants = new Map([...byId.keys(), ...Object.keys(catalog.endpoints)].map((id) => [id, []]));
  for (const connection of connections) {
    const from = connection?.from, to = connection?.to;
    if (!isId(connection?.id) || ids.has(connection.id)
      || !isId(from?.moduleId) || !isId(from?.portId)
      || !isId(to?.moduleId) || !isId(to?.portId)
      || !descendants.has(from.moduleId) || !descendants.has(to.moduleId)
      || from.moduleId === to.moduleId) fail(`connection ${connection?.id ?? '?'}`);
    const source = port(catalog, byId, from, 'outputs');
    const target = port(catalog, byId, to, 'inputs');
    if (!source || !target || source.kind !== target.kind) {
      fail(`port type or direction ${key(from)} → ${key(to)}`);
    }
    if (occupied.has(key(to))) fail(`occupied input ${key(to)}`);
    ids.add(connection.id);
    occupied.add(key(to));
    descendants.get(from.moduleId).push(to.moduleId);
  }
  // Every signal kind must be acyclic; this also rejects cross-kind feedback.
  const visited = new Set(), active = new Set();
  function visit(id) {
    if (active.has(id)) fail('cycle');
    if (visited.has(id)) return;
    active.add(id);
    for (const next of descendants.get(id)) visit(next);
    active.delete(id);
    visited.add(id);
  }
  for (const id of descendants.keys()) visit(id);
}

export function validateRackDocument(document, catalog) {
  if (document?.schemaVersion !== 1 || document?.projectId !== catalog?.projectId
    || !['rack', 'patch'].includes(document.viewMode)
    || !Array.isArray(document.modules) || document.modules.length > MAX_MODULES
    || !Array.isArray(document.connections) || document.connections.length > MAX_CONNECTIONS) {
    fail('header or size');
  }
  const modules = document.modules.map(({ id, nodeId, type, row, col, w, h }) =>
    ({ id, nodeId, type, row, col, w, h }));
  const ids = modules.map((module) => module.id);
  const nodeIds = [...modules.map((module) => module.nodeId),
    ...Object.values(catalog.endpoints).map((endpoint) => endpoint.nodeId)];
  if (new Set(ids).size !== ids.length || new Set(nodeIds).size !== nodeIds.length) {
    fail('duplicate module or DSP node id');
  }
  checkLayout(catalog, modules);
  const connections = document.connections.map(({ id, from, to }) => ({
    id, from: { moduleId: from?.moduleId, portId: from?.portId },
    to: { moduleId: to?.moduleId, portId: to?.portId },
  }));
  checkConnections(catalog, modules, connections);
  return { schemaVersion: 1, projectId: catalog.projectId, viewMode: document.viewMode,
    modules, connections };
}

export function initialRackDocument(catalog) {
  return validateRackDocument({ schemaVersion: 1, projectId: catalog.projectId,
    ...catalog.initial }, catalog);
}

export function setRackViewMode(document, mode, catalog) {
  return validateRackDocument({ ...document, viewMode: mode }, catalog);
}

export function placeRackModule(document, id, row, col, catalog) {
  if (!document.modules.some((module) => module.id === id)) fail(`missing module ${id}`);
  return validateRackDocument({ ...document, modules: document.modules.map((module) =>
    module.id === id ? { ...module, row, col } : module) }, catalog);
}

// Occupied drops insert into Main's constrained row flow. Free drops preserve
// sparse slots and fit later modules forward, as the old rack did.
export function moveRackModule(document, id, row, col, catalog, dropX) {
  const moving = document.modules.find(module => module.id === id);
  if (!moving) fail(`missing module ${id}`);
  if (!isGridInt(row, 0) || !isGridInt(col, 0)
    || row + moving.h > catalog.grid.maxRows) fail(`position for ${id}`);
  const columns = catalog.grid.columns;
  const maxRows = catalog.grid.maxRows;
  const targetCol = Math.min(col, columns - moving.w);
  const overlaps = (a, b) => a.row < b.row + b.h && b.row < a.row + a.h
    && a.col < b.col + b.w && b.col < a.col + a.w;
  const order = (a, b) => a.row - b.row || a.col - b.col || a.id.localeCompare(b.id);
  const others = document.modules.filter(module => module.id !== id).sort(order);
  const target = { ...moving, row, col: targetCol };
  if (others.some(module => overlaps(module, target))) {
    // Occupied drops use the original rack's constrained row flow. The
    // pointer's position relative to each module midpoint selects insertion.
    const centerX = Number.isFinite(dropX) ? dropX
      : (targetCol + moving.w / 2) * catalog.grid.cellWidth;
    const earlierRows = others.filter(module => module.row < row).length;
    const earlierInRow = others.filter(module => module.row === row
      && (module.col + module.w / 2) * catalog.grid.cellWidth < centerX).length;
    const flow = [...others];
    flow.splice(earlierRows + earlierInRow, 0, moving);
    const placed = [];
    let flowRow = 0, cursor = 0;
    for (const module of flow) {
      const minRow = module.id === id ? row : module.row;
      if (flowRow < minRow) { flowRow = minRow; cursor = 0; }
      if (cursor > 0 && cursor + module.w > columns) {
        flowRow = Math.max(flowRow + 1, minRow);
        cursor = 0;
      }
      if (flowRow + module.h > maxRows) fail('rack has no free placement');
      placed.push({ ...module, row: flowRow, col: cursor });
      cursor += module.w;
    }
    const positions = new Map(placed.map(module => [module.id, module]));
    return validateRackDocument({ ...document,
      modules: document.modules.map(module => positions.get(module.id)) }, catalog);
  }
  const fits = (module, atRow, atCol, placed) => atCol + module.w <= columns
    && atRow + module.h <= maxRows
    && !placed.some(item => overlaps(item, { ...module, row: atRow, col: atCol }));
  function firstFit(module, startRow, startCol, placed) {
    let atRow = startRow, atCol = startCol;
    if (atCol + module.w > columns) { atRow++; atCol = 0; }
    for (; atRow < maxRows; atRow++, atCol = 0) {
      for (; atCol + module.w <= columns; atCol++) {
        if (fits(module, atRow, atCol, placed)) return { ...module, row: atRow, col: atCol };
      }
    }
    fail('rack has no free placement');
  }
  function after(module) {
    const nextCol = module.col + module.w;
    return nextCol >= columns ? { row: module.row + Math.floor(nextCol / columns),
      col: nextCol % columns } : { row: module.row, col: nextCol };
  }
  const before = others.filter(module => module.row < row
    || (module.row === row && module.col + module.w <= targetCol));
  const suffix = others.filter(module => !before.includes(module));
  const placed = [...before];
  const moved = firstFit(moving, row, targetCol, placed);
  placed.push(moved);
  let cursor = after(moved);
  for (const module of suffix) {
    const earliest = module.row > cursor.row
      || (module.row === cursor.row && module.col > cursor.col)
      ? { row: module.row, col: module.col } : cursor;
    const next = firstFit(module, earliest.row, earliest.col, placed);
    placed.push(next);
    cursor = after(next);
  }
  const positions = new Map(placed.map(module => [module.id, module]));
  return validateRackDocument({ ...document,
    modules: document.modules.map(module => positions.get(module.id)) }, catalog);
}

export function resizeRackModule(document, id, w, h, catalog) {
  if (!document.modules.some((module) => module.id === id)) fail(`missing module ${id}`);
  return validateRackDocument({ ...document, modules: document.modules.map((module) =>
    module.id === id ? { ...module, w, h } : module) }, catalog);
}

// Resizing may consume an occupied cell. Start at the module's current cell,
// then fit or flow displaced modules using the same placement rule as a drag.
export function resizeRackModuleWithFlow(document, id, w, h, catalog) {
  const module = document.modules.find(item => item.id === id);
  if (!module) fail(`missing module ${id}`);
  const resized = { ...document, modules: document.modules.map(item =>
    item.id === id ? { ...item, w, h } : item) };
  return moveRackModule(resized, id, module.row, module.col, catalog,
    (module.col + .5) * catalog.grid.cellWidth);
}

export function addRackModule(document, module, catalog) {
  return validateRackDocument({ ...document, modules: [...document.modules, module] }, catalog);
}

export function removeRackModule(document, id, catalog) {
  if (!document.modules.some((module) => module.id === id)) fail(`missing module ${id}`);
  return validateRackDocument({ ...document,
    modules: document.modules.filter((module) => module.id !== id),
    connections: document.connections.filter((connection) =>
      connection.from.moduleId !== id && connection.to.moduleId !== id) }, catalog);
}

export function connectRackPorts(document, from, to, catalog) {
  const used = new Set(document.connections.map((connection) => connection.id));
  let next = 1;
  while (used.has(`connection_${next}`)) next++;
  const id = `connection_${next}`;
  return validateRackDocument({ ...document, connections: [...document.connections,
    { id, from, to }] }, catalog);
}

// A wire drag can replace one occupied input as a single control transaction.
// If validation fails, the caller retains the complete previous document.
export function replaceRackInput(document, from, to, catalog) {
  const withoutTarget = { ...document, connections: document.connections.filter((connection) =>
    connection.to.moduleId !== to.moduleId || connection.to.portId !== to.portId) };
  return connectRackPorts(withoutTarget, from, to, catalog);
}

export function disconnectRackInput(document, to, catalog) {
  return validateRackDocument({ ...document, connections: document.connections.filter((connection) =>
    connection.to.moduleId !== to.moduleId || connection.to.portId !== to.portId) }, catalog);
}
