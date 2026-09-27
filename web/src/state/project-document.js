// Portable envelope around an authored graph and its validated runtime snapshot.
// Graph replacement is not supported yet; imports must name the graph this view can run.
const FORMAT = 'manifold.project';
const VERSION = 1;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function captureProjectDocument(project, snapshot) {
  if (!project?.id || !project.signal || snapshot?.projectId !== project.id) {
    throw new Error('Project and snapshot do not match.');
  }
  return { format: FORMAT, schemaVersion: VERSION, projectId: project.id,
    signal: structuredClone(project.signal), snapshot: structuredClone(snapshot) };
}

export function parseProjectDocument(document, project, parseSnapshot) {
  if (typeof parseSnapshot !== 'function') throw new Error('Project snapshot reader unavailable.');
  // Previously downloaded Main states remain directly importable.
  if (document?.format === undefined) {
    return { bundled: false, state: parseSnapshot(document, project) };
  }
  if (document.format !== FORMAT || document.schemaVersion !== VERSION
    || document.projectId !== project.id || !document.signal
    || JSON.stringify(canonical(document.signal)) !== JSON.stringify(canonical(project.signal))) {
    throw new Error('Project graph does not match this Manifold v2 view.');
  }
  return { bundled: true, state: parseSnapshot(document.snapshot, project) };
}
