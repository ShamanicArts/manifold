import type { GraphWorkspaceProject, PreparedRoute, ParameterEdit } from './index.js';

export type PreparedGraphDiagnostics = Readonly<{
  execution: 'prepared'; audioBlocks: number; rustProcessedBlocks: number; publications: number;
  rustProcessingFailures: number; rustCallbackAllocations: number; rustCallbackDeallocations: number;
  lastTransferredNodes: number; lastPublicationContextFrame: number; outputLatencyBlocks: 0;
  memoryBytes: number; lastPreparationMs: number | null; lastPublicationMs: number | null;
  compilerFailed: boolean; processorFailed: boolean;
  eventsAdmitted: number; eventsConsumed: number; eventsCancelled: number; eventsRejected: number;
  eventsPending: number; lastEventContextFrame: number; renderQuantum: number;
}>;

export type GraphEvent = Readonly<{ nodeId: number; kind: 0 | 1 | 2 | 3; channel?: number;
  note?: number; velocity?: number; offset?: number }>;
export type EventAdmission = Readonly<{ requestId: number; admittedEvents: number;
  pendingEvents: number; publicationId: number }>;
export type MidiTrace = Readonly<{ requestId: number; publicationId: number;
  entries: readonly Readonly<{ sequence: number; nodeId: number; offset: number; kind: 0 | 1 | 2 | 3;
    channel: number; note: number; velocity: number; emitted: boolean }>[] }>;

export class BrowserGraphHost {
  readonly ioLayout: import('./index.js').IoLayout | null;
  connectInput(busId: string, source: AudioNode | null, sourceOutput?: number): this;
  connectOutput(busId: string, destination: AudioNode, destinationInput?: number): this;
  constructor(context: AudioContext, options?: { workletUrl?: string | URL; wasmUrl?: string | URL;
    execution?: 'worklet' | 'worker' | 'prepared'; workerUrl?: string | URL; workerWorkletUrl?: string | URL; profiling?: boolean;
    preparedWasmUrl?: string | URL; preparedWorkletUrl?: string | URL; preparedCompilerUrl?: string | URL });
  readonly ready: boolean;
  readonly diagnostics: PreparedGraphDiagnostics | Readonly<{ execution: 'worker'; audioBlocks: number; underruns: number;
    pendingRetirements: number; lastRetirementMs: number | null;
    activeSlot: number; outputLatencyBlocks: number;
    deferredPublicationBlocks: number; publications: number; lastPublicationTarget: number;
    maxRenderLagBlocks: number; workerLateBlocks: number; missingOutputBlocks: number;
    frameMismatchBlocks: number; startupMutedBlocks: number;
    recentUnderruns: readonly Readonly<{ audioSequence: number; target: number; activeSlot: number;
      outputTag: number; renderedSequence: number; reason: string; pendingPublication: number; contextFrame: number }>[];
    lastPreparationMs: number | null; lastPublicationMs: number | null;
    lastTransferredNodes: number | null }> | null;
  readonly workerProfile: Readonly<{ blocks: number; p50Us: number; p95Us: number;
    p99Us: number; maxUs: number; service: Readonly<{ blocks: number; p50Us: number;
      p95Us: number; p99Us: number; maxUs: number }> | null }> | null;
  prepare(project: GraphWorkspaceProject, options?: { patchable?: boolean }): Promise<this>;
  connect(source: AudioNode | null, destination?: AudioNode, sidechainSource?: AudioNode | null): this;
  readPublishedParameters(): ParameterEdit[];
  setRoute(route: PreparedRoute): Promise<void>;
  setParameter(edit: ParameterEdit): Promise<void>;
  setParameterBatch(edits: readonly ParameterEdit[]): Promise<void>;
  replaceGraph(project: GraphWorkspaceProject): Promise<void>;
  captureWindow(captureId: number, window?: number | Readonly<{
    windowSeconds?: number; windowBars?: number; tempoBpm?: number; freeStop?: boolean;
    meterNumerator?: number; meterDenominator?: number; manualStartOffsetFrames?: number;
  }>): Promise<{
    sourceRate: number; stereo: Float32Array;
  }>;
  snapshotLoop(captureId: number): Promise<{ sourceRate: number; stereo: Float32Array }>;
  armFreeCapture(captureId: number): Promise<{ startOffset: number; capacity: number }>;
  captureCursor(captureId: number): Promise<{ startOffset: number; capacity: number }>;
  cancelFreeCapture(): void;
  replaceSample(nodeId: number, sourceRate: number, stereo: Float32Array,
    bindingTargets?: readonly number[]): Promise<void>;
  sendEvent(event: GraphEvent): void | Promise<EventAdmission>;
  sendEventBatch(events: readonly GraphEvent[]): Promise<EventAdmission>;
  readMidiTrace(): Promise<MidiTrace>;
  close(): void | Promise<void>;
}
