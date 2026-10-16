import type { CaptureWindowSettings, GraphWorkspace, GraphWorkspaceProject, LiveGraphSession,
  ParameterEdit, PreparedRoute } from '../index.js';
import type { StereoAnalysis } from '../analysis.js';

export type CaptureWindow = number | Readonly<{ windowSeconds?: number; windowBars?: number;
  tempoBpm?: number; meterNumerator?: number; meterDenominator?: number; freeStop?: boolean;
  manualStartOffsetFrames?: number }>;
export interface RackSampleHost {
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  setParameterBatch(edits: readonly ParameterEdit[]): Promise<void | boolean> | void | boolean;
  sendEvent(event: { nodeId: number; kind: 0 | 1 | 2; note?: number; velocity?: number }): void | Promise<unknown>;
  captureWindow?(captureId: number, window: CaptureWindow): Promise<{
    sourceRate: number; stereo: Float32Array }>;
  armFreeCapture?(captureId: number): Promise<{ startOffset: number; capacity: number }>;
  cancelFreeCapture?(): void;
  replaceSample?(nodeId: number, sourceRate: number, stereo: Float32Array,
    bindingTargets: readonly number[]): Promise<void | boolean> | void | boolean;
  analyzeSample?(stereo: Float32Array, sourceRate: number): Promise<StereoAnalysis>;
}

export const VOICES: 8;
export function buildGraph(stereo?: Float32Array, sourceRate?: number, label?: string): GraphWorkspace;
export function addRackSampleModule(graph: GraphWorkspace, options?: { firstVoiceId?: number;
  mixerId?: number; outputId?: number; stereo?: Float32Array; sourceRate?: number;
  label?: string }): import('../index.js').NodeHandle<'gain'>;
export function createProject(host: RackSampleHost,
  graph: GraphWorkspace, sharedSession?: LiveGraphSession | null): {
  activate(): Promise<void>;
  captureSample(window?: CaptureWindow | null): Promise<GraphWorkspaceProject>;
  captureArmed(): boolean;
  applyDetectedRoot(): Promise<GraphWorkspaceProject>;
  analyzeSavedSample(): Promise<StereoAnalysis | null>;
  cancelCapture(): void;
  configureCaptureWindow(settings: Readonly<CaptureWindowSettings>): Promise<GraphWorkspaceProject>;
  selectCaptureSource(id: number): Promise<GraphWorkspaceProject>;
  latestAnalysis(): StereoAnalysis | null;
  analysisError(): string | null;
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
  adoptPublishedParameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  toProject(): GraphWorkspaceProject;
  session: LiveGraphSession;
};
