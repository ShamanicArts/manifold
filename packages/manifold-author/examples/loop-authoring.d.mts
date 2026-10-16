import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession, ParameterEdit } from '../index.js';
import type { BrowserGraphHost } from '../browser.js';
import type { createFourLayerLoopController } from './four-layer-loops.mjs';
export function buildGraph(): GraphWorkspace;
type LoopHost = Pick<BrowserGraphHost, 'setRoute' | 'setParameter' | 'replaceGraph'>
  & Partial<Pick<BrowserGraphHost, 'setParameterBatch' | 'readPublishedParameters' | 'snapshotLoop'>>;
export function createProject(host: LoopHost, graph?: GraphWorkspace): Readonly<{
  session: LiveGraphSession; layers: ReturnType<typeof createFourLayerLoopController>;
  toProject(): GraphWorkspaceProject; synchronizeParameters(): Promise<GraphWorkspaceProject>;
  snapshot(): Promise<GraphWorkspaceProject>; setInsert(enabled: boolean, mix?: number): Promise<GraphWorkspaceProject>;
  adoptPublishedParameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  record(layer: number, enabled: boolean): Promise<GraphWorkspaceProject>;
  play(layer: number, enabled: boolean): Promise<GraphWorkspaceProject>;
  overdub(layer: number, enabled: boolean): Promise<GraphWorkspaceProject>;
  speed(layer: number, value: number): Promise<GraphWorkspaceProject>;
  reverse(layer: number, enabled: boolean): Promise<GraphWorkspaceProject>;
  setLayerCapacity(layer: number, capacitySeconds: number): Promise<GraphWorkspaceProject>;
}>;
export function restoreProject(host: LoopHost, saved: GraphWorkspaceProject): ReturnType<typeof createProject>;
