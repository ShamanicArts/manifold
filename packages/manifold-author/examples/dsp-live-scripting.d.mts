import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, ParameterEdit, PreparedRoute } from '../index.js';

export const parameters: Readonly<Record<'/dsp/live/input_gain' | '/dsp/live/width', Readonly<{
  nodeId: number; id: number; min: number; max: number; default: number;
}>>>;
export function buildGraph(): GraphWorkspace;
export type DspLiveHost = {
  readPublishedParameters?(): readonly ParameterEdit[] | Promise<readonly ParameterEdit[]>;
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  replaceGraph?(project: GraphWorkspaceProject): Promise<void | boolean> | void | boolean;
};
export function createProject(host: DspLiveHost, graph?: GraphWorkspace): Readonly<{
  session: LiveGraphSession;
  toProject(): GraphWorkspaceProject;
  adoptPublishedParameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  synchronizeParameters(): Promise<GraphWorkspaceProject>;
  set(path: keyof typeof parameters, value: number): Promise<GraphWorkspaceProject>;
  routeOutput(sourcePath: string): Promise<GraphWorkspaceProject>;
  setDistortion(enabled: boolean): Promise<GraphWorkspaceProject>;
}>;
export function restoreProject(host: DspLiveHost, saved: GraphWorkspaceProject): ReturnType<typeof createProject>;

export const source:string;
