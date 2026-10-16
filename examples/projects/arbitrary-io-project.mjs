// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { GraphWorkspace, createLiveGraphSession } from '../../packages/manifold-author/author.js';
import { createArbitraryIoGraph } from '../../packages/manifold-author/examples/arbitrary-io.mjs';
export function createProject(host, graph = createArbitraryIoGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (document) => host.replaceGraph(document),
    (edits) => host.setParameterBatch(edits),
  );
  return {
    toProject: () => session.toProject(),
    session,
    swap: () =>
      session.transaction((g) => {
        const io = structuredClone(g.ioLayout);
        [io.outputBindings[0], io.outputBindings[1]] = [io.outputBindings[1], io.outputBindings[0]];
        g.setIoLayout(io);
      }),
    requestDifferentLayout: () =>
      session.transaction((g) => {
        const io = structuredClone(g.ioLayout);
        io.outputs[0].channels = 3;
        io.outputBindings.splice(3, 1);
        g.setIoLayout(io);
      }),
    requireAux: () =>
      session.transaction((g) => {
        const io = structuredClone(g.ioLayout);
        io.inputs[1].optional = false;
        g.setIoLayout(io);
      }),
  };
}
export function restoreProject(host, document) {
  return createProject(host, GraphWorkspace.fromProject(document));
}
