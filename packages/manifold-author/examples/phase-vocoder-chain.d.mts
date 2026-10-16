import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, ParameterEdit, PreparedRoute } from '../index.js';

export function buildGraph(): GraphWorkspace;
export function createProject(host: {
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
}, graph?: GraphWorkspace): {
  set(path: '/sample/voice/pitch' | '/sample/voice/mix', value: number): Promise<GraphWorkspaceProject>;
  toProject(): GraphWorkspaceProject;
  session: LiveGraphSession;
};
