import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, NodeHandle,
  PortRef } from '../index.js';

export function layerPath(layer: 1 | 2 | 3 | 4): string;
export function addFourLayerLoopSources(graph: GraphWorkspace, options?: {
  firstNodeId?: number;
  registerSampleSources?: boolean;
  input?: PortRef<'audio', 'outputs'>;
}): NodeHandle<'loop-capture'>[];
export function createFourLayerLoopController(session: LiveGraphSession): Readonly<{
  record(layer: 1 | 2 | 3 | 4, enabled: boolean): Promise<GraphWorkspaceProject>;
  play(layer: 1 | 2 | 3 | 4, enabled: boolean): Promise<GraphWorkspaceProject>;
  overdub(layer: 1 | 2 | 3 | 4, enabled: boolean): Promise<GraphWorkspaceProject>;
  speed(layer: 1 | 2 | 3 | 4, value: number): Promise<GraphWorkspaceProject>;
  reverse(layer: 1 | 2 | 3 | 4, enabled: boolean): Promise<GraphWorkspaceProject>;
}>;
export function snapshotWithoutLoopAudio(project: GraphWorkspaceProject): GraphWorkspaceProject;
export function snapshotWithLoopAudio(project: GraphWorkspaceProject,
  snapshotLoop: (nodeId: number) => Promise<{ sourceRate: number; stereo: Float32Array }>
): Promise<GraphWorkspaceProject>;
