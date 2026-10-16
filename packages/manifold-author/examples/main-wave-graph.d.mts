import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, NodeHandle, PortRef,
  ParameterEdit, PreparedRoute } from '../index.js';
export const MAIN_SYNTH: '/midi/synth';
export interface MainWaveVoice { oscillator: NodeHandle<'extended-oscillator'>;
  mix: NodeHandle<'crossfader'>; direction: NodeHandle<'crossfader'>; select: NodeHandle<'crossfader'>;
  branches: NodeHandle<'mixer'>; output: NodeHandle<'mixer'>; }
export function addMainWaveVoice(graph: GraphWorkspace, options: { index: number; firstNodeId: number;
  sample?: PortRef<'audio', 'outputs'> | null }): MainWaveVoice;
export function addMainWaveVoices(graph: GraphWorkspace, options?: { firstNodeId?: number; mixerId?: number }):
  { voices: MainWaveVoice[]; output: NodeHandle<'mixer'> };
export function addMainSynthFilter(graph: GraphWorkspace, options: {
  input: PortRef<'audio','outputs'>; nodeId?: number;
}): NodeHandle<'svf'>;
export function addMainSignalBranches(graph: GraphWorkspace, options: {
  synth: PortRef<'audio', 'outputs'>; layerInputs?: readonly PortRef<'audio', 'inputs'>[];
  layerOutputs?: readonly PortRef<'audio', 'outputs'>[]; firstNodeId?: number; connectOutput?: boolean;
}): { trim: NodeHandle<'gain'>; monitor: NodeHandle<'gain'>; synthMonitor: NodeHandle<'gain'>;
  send: NodeHandle<'gain'>; layers: NodeHandle<'mixer'>; mix: NodeHandle<'mixer'>; master: NodeHandle<'gain'> };
export function buildGraph(options?: { captureLayers?: boolean }): GraphWorkspace;
export interface MainWaveProject { session: LiveGraphSession; toProject(): GraphWorkspaceProject;
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
  adoptPublishedParameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  setVoices(values: readonly { index: number; frequency?: number; amplitude?: number }[]): Promise<GraphWorkspaceProject>;
  setInsert(enabled: boolean): Promise<GraphWorkspaceProject>; }
export interface MainWaveHost {
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  setParameterBatch(edits: readonly ParameterEdit[]): Promise<void | boolean> | void | boolean;
  replaceGraph(project: GraphWorkspaceProject): Promise<void | boolean> | void | boolean;
}
export function createProject(host: MainWaveHost, graph?: GraphWorkspace): MainWaveProject;
export function restoreProject(host: MainWaveHost, saved: GraphWorkspaceProject): MainWaveProject;
