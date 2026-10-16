import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, ParameterEdit, PreparedRoute } from '../index.js';

export function buildGraph(): GraphWorkspace;
export type FxSlotHost = {
  readPublishedParameters?(): readonly ParameterEdit[] | Promise<readonly ParameterEdit[]>;
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  replaceGraph(project: GraphWorkspaceProject): Promise<void | boolean> | void | boolean;
};
export function createProject(host: FxSlotHost, graph?: GraphWorkspace): Readonly<{
  session: LiveGraphSession;
  toProject(): GraphWorkspaceProject;
  adoptPublishedParameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  synchronizeParameters(): Promise<GraphWorkspaceProject>;
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
}>;
export function restoreProject(host: FxSlotHost, saved: GraphWorkspaceProject): ReturnType<typeof createProject>;

export const source:string;
export function applySlot(graph:GraphWorkspace,path:string,value:number):void;
export function reconcileSlots(graph:GraphWorkspace,previous:GraphWorkspaceProject):void;
