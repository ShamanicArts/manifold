const PROJECT = 'manifold.standalone-fx-slice';
const ROUTING_PROJECT = 'manifold.standalone-fx-routing';
const TYPE_COUNT = 21;
const NORMALIZED_COUNT = 5;

function unit(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number from 0 to 1.`);
  }
  return value;
}

function controls(values, label) {
  if (!Array.isArray(values) || values.length !== NORMALIZED_COUNT) {
    throw new Error(`${label} needs five normalized controls.`);
  }
  return values.map((value, index) => unit(value, `${label}[${index}]`));
}

function parseState(document, routing) {
  const schemaVersion = routing ? 2 : 1;
  const projectId = routing ? ROUTING_PROJECT : PROJECT;
  if (document?.schemaVersion !== schemaVersion || document?.projectId !== projectId
    || routing && document?.routingMode !== 'persistent') {
    throw new Error(`This is not a Manifold v2 ${routing ? 'persistent routing' : 'Standalone FX'} state (version ${schemaVersion}).`);
  }
  const host = document.hostParameters;
  if (!Number.isInteger(host?.type) || host.type < 0 || host.type >= TYPE_COUNT) {
    throw new Error('Effect type must be an integer from 0 to 20.');
  }
  const mix = unit(host.mix, 'Wet mix');
  const active = controls([host['p/0'], host['p/1'], host['p/2'], host['p/3'], host['p/4']], 'Host controls');
  const perType = document.typeParameters;
  if (!perType || typeof perType !== 'object' || Array.isArray(perType)
    || Object.keys(perType).length !== TYPE_COUNT) {
    throw new Error('State needs remembered controls for all 21 effect types.');
  }
  const typeParameters = {};
  for (let type = 0; type < TYPE_COUNT; type++) {
    typeParameters[type] = controls(perType[type], `Type ${type}`);
  }
  typeParameters[host.type] = active;
  return { schemaVersion, projectId, ...(routing ? { routingMode: 'persistent' } : {}), hostParameters: {
    type: host.type, mix, 'p/0': active[0], 'p/1': active[1], 'p/2': active[2], 'p/3': active[3], 'p/4': active[4],
  }, typeParameters };
}

function captureState(values, typeValues, routing) {
  const type = values.get(0);
  const controls = [2, 3, 4, 5, 6].map((id) => values.get(id));
  const typeParameters = Object.fromEntries(typeValues);
  typeParameters[type] = controls;
  return parseState({ schemaVersion: routing ? 2 : 1, projectId: routing ? ROUTING_PROJECT : PROJECT,
    ...(routing ? { routingMode: 'persistent' } : {}), hostParameters: {
    type, mix: values.get(1), 'p/0': controls[0], 'p/1': controls[1], 'p/2': controls[2], 'p/3': controls[3], 'p/4': controls[4],
  }, typeParameters }, routing);
}

export const parseStandaloneFxState = (document) => parseState(document, false);
export const captureStandaloneFxState = (values, typeValues) => captureState(values, typeValues, false);
export const parsePersistentFxState = (document) => parseState(document, true);
export const capturePersistentFxState = (values, typeValues) => captureState(values, typeValues, true);

// The authored graph project is also the CLAP stream state. Keep its public
// control IDs and the browser's per-type memory in one portable JSON envelope.
export function captureFxProjectState(template, values, typeValues) {
  const state = captureStandaloneFxState(values, typeValues);
  const document = structuredClone(template);
  document.signal.initialParameters = Array.from({ length: 7 }, (_, id) => ({
    nodeId: 2,
    id,
    value: id === 0 ? state.hostParameters.type : id === 1
      ? state.hostParameters.mix : state.hostParameters[`p/${id - 2}`],
  }));
  document.typeParameters = state.typeParameters;
  return document;
}

export function parseFxProjectState(document) {
  if (document?.schemaVersion !== 1 || document?.id !== "manifold.standalone-fx-module") {
    throw new Error("This is not a Standalone FX host project.");
  }
  const entries = document.signal?.initialParameters;
  if (!Array.isArray(entries) || entries.length !== 7) {
    throw new Error("The host project needs seven public controls.");
  }
  const controls = new Map();
  for (const entry of entries) {
    if (entry?.nodeId !== 2 || !Number.isInteger(entry.id) || entry.id < 0 || entry.id > 6
      || controls.has(entry.id)) throw new Error("Invalid host control ID.");
    controls.set(entry.id, entry.value);
  }
  return parseStandaloneFxState({
    schemaVersion: 1,
    projectId: PROJECT,
    hostParameters: {
      type: controls.get(0), mix: controls.get(1),
      "p/0": controls.get(2), "p/1": controls.get(3), "p/2": controls.get(4),
      "p/3": controls.get(5), "p/4": controls.get(6),
    },
    typeParameters: document.typeParameters,
  });
}
