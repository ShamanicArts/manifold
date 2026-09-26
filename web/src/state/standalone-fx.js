const PROJECT = 'manifold.standalone-fx-slice';
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

export function parseStandaloneFxState(document) {
  if (document?.schemaVersion !== 1 || document?.projectId !== PROJECT) {
    throw new Error('This is not a Manifold v2 Standalone FX state (version 1).');
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
  return { schemaVersion: 1, projectId: PROJECT, hostParameters: {
    type: host.type, mix, 'p/0': active[0], 'p/1': active[1], 'p/2': active[2], 'p/3': active[3], 'p/4': active[4],
  }, typeParameters };
}

export function captureStandaloneFxState(values, typeValues) {
  const type = values.get(0);
  const controls = [2, 3, 4, 5, 6].map((id) => values.get(id));
  const typeParameters = Object.fromEntries(typeValues);
  typeParameters[type] = controls;
  return parseStandaloneFxState({ schemaVersion: 1, projectId: PROJECT, hostParameters: {
    type, mix: values.get(1), 'p/0': controls[0], 'p/1': controls[1], 'p/2': controls[2], 'p/3': controls[3], 'p/4': controls[4],
  }, typeParameters });
}
