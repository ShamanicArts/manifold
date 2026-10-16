// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  gain as gainDefinition,
  inputRaw as inputRawDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace } from '@manifold/author';
/** Three main input channels plus optional mono input, with independent
 * four-channel and mono outputs. Every channel route is inspectable/editable. */
export function createArbitraryIoGraph() {
  const graph = createGraphWorkspace();
  const extra = graph.add(inputRawDefinition.type, { id: 10 });
  const mono = graph.add(gainDefinition.type, { id: 12 });
  mono.parameter('level').set(0.5);
  graph.connect(graph.input.output('out'), mono.input('audio'));
  graph.setIoLayout({
    version: 1,
    inputs: [
      { id: 'main', name: 'Three-channel input', channels: 3, optional: false },
      { id: 'aux', name: 'Optional mono input', channels: 1, optional: true },
    ],
    outputs: [
      {
        id: 'stems',
        name: 'Independent channels',
        channels: 4,
        optional: false,
      },
      { id: 'mono', name: 'Mono send', channels: 1, optional: false },
    ],
    inputBindings: [
      {
        nodeId: graph.input.id,
        channels: [
          { bus: 0, channel: 0 },
          { bus: 0, channel: 1 },
        ],
      },
      {
        nodeId: extra.id,
        channels: [
          { bus: 0, channel: 2 },
          { bus: 1, channel: 0 },
        ],
      },
    ],
    outputBindings: [
      { nodeId: 1, outputPort: 0, channel: 0 },
      { nodeId: 1, outputPort: 0, channel: 1 },
      { nodeId: 10, outputPort: 0, channel: 0 },
      { nodeId: 10, outputPort: 0, channel: 1 },
      { nodeId: 12, outputPort: 0, channel: 0 },
    ],
  });
  return graph;
}
