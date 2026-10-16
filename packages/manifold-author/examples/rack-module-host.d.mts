import type { CaptureWindowSettings, GraphWorkspace, GraphWorkspaceProject, LiveGraphSession,
  NodeHandle, ParameterEdit, PortRef, PreparedRoute } from '../index.js';
import type { StereoAnalysis } from '../analysis.js';
import type { CaptureWindow, RackSampleHost } from './rack-sample-eight-voice.mjs';

export function buildRackModuleHostGraph(options?: { selection?: 1 | 2 | 3 | 4 | 5 | 6;
  sampleSource?: { stereo: Float32Array; sourceRate?: number; label?: string } | null }): GraphWorkspace;
export function attachRackSampleLayerSource(graph: GraphWorkspace, layer: 1 | 2 | 3 | 4,
  sourceOutput: PortRef<'audio', 'outputs'>): NodeHandle<'retrospective-capture'>;
export function createProject(host: {
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  setParameterBatch?(edits: readonly ParameterEdit[]): Promise<void | boolean> | void | boolean;
  sendEvent?(event: { nodeId: number; kind: 0 | 1 | 2; note?: number; velocity?: number }): void;
} & Partial<Pick<RackSampleHost, 'captureWindow' | 'armFreeCapture' | 'cancelFreeCapture'
  | 'replaceSample' | 'analyzeSample'>>, graph?: GraphWorkspace): Readonly<{
  session: LiveGraphSession;
  toProject(): GraphWorkspaceProject;
  activate(): void;
  captureSample(window?: CaptureWindow | null): Promise<GraphWorkspaceProject>;
  applyDetectedRoot(): Promise<GraphWorkspaceProject>;
  analyzeSavedSample(): Promise<StereoAnalysis | null>;
  captureArmed(): boolean;
  cancelCapture(): void;
  configureCaptureWindow(settings: Readonly<CaptureWindowSettings>): Promise<GraphWorkspaceProject>;
  selectCaptureSource(id: number): Promise<GraphWorkspaceProject>;
  latestAnalysis(): StereoAnalysis | null;
  analysisError(): string | null;
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
}>;
