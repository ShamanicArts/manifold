import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, NodeHandle, ParameterEdit, PreparedRoute } from '../index.js';

export const OSC_BASE: '/midi/synth/rack/osc/1';
export function addRackOscillatorModule(graph: GraphWorkspace, options?: {
  firstVoiceId?: number; mixerId?: number; outputId?: number; connectOutput?: boolean;
}): NodeHandle<'gain'>;
export function setRackOscillatorControl(session: LiveGraphSession, path: string,
  value: number): Promise<GraphWorkspaceProject>;
export function buildGraph(): GraphWorkspace;
export function createProject(host: {
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  setParameterBatch?(edits: readonly ParameterEdit[]): Promise<void | boolean> | void | boolean;
  replaceGraph?(project: GraphWorkspaceProject): Promise<void | boolean> | void | boolean;
  readPublishedParameters?(): readonly ParameterEdit[] | Promise<readonly ParameterEdit[]>;
}, graph?: GraphWorkspace): {
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
  toProject(): GraphWorkspaceProject;
  session: LiveGraphSession;
};
