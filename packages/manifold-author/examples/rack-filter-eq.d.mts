import type { CaptureWindowSettings, GraphWorkspace, GraphWorkspaceProject, LiveGraphSession,
  ParameterEdit, PreparedRoute } from '../index.js';
import type { StereoAnalysis } from '../analysis.js';
import type { CaptureWindow, RackSampleHost } from './rack-sample-eight-voice.mjs';

export type RackFilterEqPath = '/rack_host/module/index'
  | '/rack_host/input_a/mode'
  | '/rack_host/input_a/pitch'
  | '/rack_host/input_a/level'
  | '/rack_host/input_b/mode'
  | '/rack_host/input_b/pitch'
  | '/rack_host/input_b/level'
  | '/midi/synth/rack/blend_simple/1/mode'
  | '/midi/synth/rack/blend_simple/1/blendAmount'
  | '/midi/synth/rack/blend_simple/1/blendModAmount'
  | '/midi/synth/rack/blend_simple/1/output'
  | '/midi/synth/rack/filter/1/type'
  | '/midi/synth/rack/filter/1/cutoff'
  | '/midi/synth/rack/filter/1/resonance'
  | '/midi/synth/rack/eq/1/output'
  | '/midi/synth/rack/eq/1/mix'
  | '/midi/synth/rack/fx/1/type'
  | '/midi/synth/rack/fx/1/mix'
  | `/midi/synth/rack/fx/1/p/${0 | 1 | 2 | 3 | 4}`;

export function buildGraph(): GraphWorkspace;
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
  set(path: RackFilterEqPath | `/midi/synth/rack/sample/1/${string}`
    | `/midi/synth/rack/osc/1/${string}`, value: number): Promise<GraphWorkspaceProject>;
}>;
