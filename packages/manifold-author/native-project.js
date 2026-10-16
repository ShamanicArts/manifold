// Shared native control adapter. Authored products supply their own source.
import { LiveProjectRuntime } from './live-project.js';
globalThis.performance ??= { now: () => Date.now() };
globalThis.console ??= { error() {} };
export function createLiveCreatorProject(host, defaultSource, saved = null) {
  const metadata = saved?.liveAuthoring;
  const runtime = new LiveProjectRuntime(
    {
      ready: true,
      sendEvent: (event) => host.sendEvent(event),
      setParameter: (edit) => host.setParameter(edit),
      setParameterBatch: (edits) => host.setParameterBatch(edits),
      replaceGraph: (project, metadata) =>
        host.replaceGraph({
          ...project,
          liveAuthoring: {
            format: 'manifold.live-project',
            version: 1,
            ...metadata,
          },
        }),
      updateMetadata: (project, metadata) =>
        host.updateMetadata({
          ...project,
          liveAuthoring: {
            format: 'manifold.live-project',
            version: 1,
            ...metadata,
          },
        }),
    },
    metadata?.source ?? defaultSource,
    metadata ? { ...metadata, graph: saved } : null,
  );
  const toProject = () => {
    const { graph, ...metadata } = runtime.save();
    return { ...graph, liveAuthoring: metadata };
  };
  return {
    toProject,
    async request(command) {
      await runtime.request(command);
      return toProject();
    },
    async set(path, value) {
      await runtime.request({
        operation: runtime.project.controls?.some((c) => c.path === path)
          ? 'control.set'
          : 'parameter.set',
        path,
        value,
        origin: 'native',
      });
      return toProject();
    },
    adoptPublishedParameters(edits) {
      runtime.adoptPublishedParameters(edits);
      return toProject();
    },
    presentation: () => runtime.presentation(),
  };
}
