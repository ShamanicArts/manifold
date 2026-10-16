import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, ParameterEdit, PreparedRoute } from '../index.js';

export const SAMPLE_BASE: '/midi/synth/rack/sample/1';
export function buildGraph(stereo?: Float32Array, sourceRate?: number, label?: string): GraphWorkspace;
export function createProject(host: {
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  setParameterBatch(edits: readonly ParameterEdit[]): Promise<void | boolean> | void | boolean;
  sendEvent(event: { nodeId: number; kind: 0 | 1 | 2; note?: number; velocity?: number }): void;
}, graph: GraphWorkspace): {
  activate(): void;
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
  toProject(): GraphWorkspaceProject;
  session: LiveGraphSession;
};
