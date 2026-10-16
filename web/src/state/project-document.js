// Portable envelope around an authored graph and its validated runtime snapshot.
// Graph replacement is not supported yet; imports must name the graph this view can run.
const FORMAT = 'manifold.project';
const VERSION = 1;
const MAX_PRESETS = 32;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function presetFields(snapshot) {
  return snapshot.targets ? ['parameters', 'targetControls', 'targets'] : ['parameters', 'target'];
}

function checkPresets(presets, snapshot, project, parseSnapshot) {
  if (!Array.isArray(presets) || presets.length > MAX_PRESETS) throw new Error('Project preset limit exceeded.');
  const ids = new Set();
  return presets.map((preset) => {
    const fields = presetFields(snapshot);
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)
      || Object.keys(preset).sort().join('|') !== ['id', 'name', ...fields].sort().join('|')
      || typeof preset.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(preset.id)
      || ids.has(preset.id) || typeof preset.name !== 'string'
      || preset.name.trim() !== preset.name || preset.name.length < 1 || preset.name.length > 80
      || /[\x00-\x1f\x7f]/.test(preset.name)) throw new Error('Invalid project preset.');
    ids.add(preset.id);
    const selected = Object.fromEntries(fields.map((field) => [field, preset[field]]));
    // A preset shares its project's source; validate sound settings without decoding PCM again.
    parseSnapshot({ ...snapshot, ...selected, source: { kind: 'builtin' } }, project);
    return { id: preset.id, name: preset.name, ...structuredClone(selected) };
  });
}

export function captureProjectPreset(id, name, snapshot, project, parseSnapshot) {
  const preset = { id, name, ...Object.fromEntries(presetFields(snapshot)
    .map((field) => [field, structuredClone(snapshot[field])])) };
  return checkPresets([preset], snapshot, project, parseSnapshot)[0];
}

export function applyProjectPreset(snapshot, preset, project, parseSnapshot) {
  const checked = checkPresets([preset], snapshot, project, parseSnapshot)[0];
  return parseSnapshot({ ...snapshot, ...Object.fromEntries(presetFields(snapshot)
    .map((field) => [field, checked[field]])) }, project);
}

export function captureProjectDocument(project, snapshot, presets = [], parseSnapshot) {
  if (!project?.id || !project.signal || snapshot?.projectId !== project.id) {
    throw new Error('Project and snapshot do not match.');
  }
  if (typeof parseSnapshot !== 'function') throw new Error('Project snapshot reader unavailable.');
  parseSnapshot(snapshot, project);
  return { format: FORMAT, schemaVersion: VERSION, projectId: project.id,
    signal: structuredClone(project.signal), snapshot: structuredClone(snapshot),
    presets: checkPresets(presets, snapshot, project, parseSnapshot) };
}

export function parseProjectDocument(document, project, parseSnapshot) {
  if (typeof parseSnapshot !== 'function') throw new Error('Project snapshot reader unavailable.');
  // Previously downloaded Main states remain directly importable.
  if (document?.format === undefined) {
    return { bundled: false, state: parseSnapshot(document, project), presets: [] };
  }
  if (document.format !== FORMAT || document.schemaVersion !== VERSION
    || document.projectId !== project.id || !document.signal
    || JSON.stringify(canonical(document.signal)) !== JSON.stringify(canonical(project.signal))) {
    throw new Error('Project graph does not match this Manifold v2 view.');
  }
  const state = parseSnapshot(document.snapshot, project);
  return { bundled: true, state,
    presets: checkPresets(document.presets ?? [], document.snapshot, project, parseSnapshot) };
}
