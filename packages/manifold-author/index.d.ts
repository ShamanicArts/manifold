import type { PORT_CATALOG, PrimitiveType, SignalType } from './catalog.generated.js';
import type { NamedParameters } from './parameter-names.generated.js';
export type { NamedParameters } from './parameter-names.generated.js';

type Direction = 'inputs' | 'outputs';
export type ConstructorConfiguration<T extends PrimitiveType> = T extends PrimitiveType
  ? keyof (typeof PORT_CATALOG)[T]['configuration'] extends never ? Readonly<Record<string, never>>
    : Readonly<{ [K in keyof (typeof PORT_CATALOG)[T]['configuration']]?: number }>
  : never;
type InputName<T extends PrimitiveType> = T extends 'mixer' ? `in-${number}` : (typeof PORT_CATALOG)[T]['inputs'][number]['name'];
type OutputName<T extends PrimitiveType> = (typeof PORT_CATALOG)[T]['outputs'][number]['name'];
type InputSignal<T extends PrimitiveType, N extends string> = T extends 'mixer' ? 'audio' :
  Extract<(typeof PORT_CATALOG)[T]['inputs'][number], { readonly name: N }>['signal'];
type OutputSignal<T extends PrimitiveType, N extends string> =
  Extract<(typeof PORT_CATALOG)[T]['outputs'][number], { readonly name: N }>['signal'];

export interface ParameterDescription {
  readonly id: number;
  readonly name?: string;
  readonly label: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly discrete: boolean;
  readonly choices?: readonly string[];
  readonly choiceValues?: readonly number[];
}
export type AuthorPrimitive<T extends PrimitiveType = PrimitiveType> = Readonly<{
  type: T;
  label: string;
  category: string;
  description: string;
  parameters?: readonly ParameterDescription[];
  inputs: (typeof PORT_CATALOG)[T]['inputs'];
  outputs: (typeof PORT_CATALOG)[T]['outputs'];
  code: (typeof PORT_CATALOG)[T]['code'];
  args: (typeof PORT_CATALOG)[T]['args'];
  configuration: (typeof PORT_CATALOG)[T]['configuration'];
}>;

export class GraphContractError extends Error {
  constructor(code: string, message: string, details?: Record<string, unknown>);
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PortRef<S extends SignalType = SignalType, D extends Direction = Direction> {
  readonly nodeId: number;
  readonly direction: D;
  readonly index: number;
  readonly name: string;
  readonly signal: S;
}

export class ParameterRef {
  readonly node: NodeHandle;
  readonly name: string;
  readonly description: ParameterDescription;
  set(value: number): this;
  expose(control: { path: string; min: number; max: number; default: number }): this;
}

export class NodeHandle<T extends PrimitiveType = PrimitiveType> {
  readonly id: number;
  readonly type: T;
  input<N extends InputName<T>>(name: N): PortRef<InputSignal<T, N>, 'inputs'>;
  output<N extends OutputName<T>>(name: N): PortRef<OutputSignal<T, N>, 'outputs'>;
  parameter(name: T extends keyof NamedParameters ? NamedParameters[T] : never): ParameterRef;
}

export interface GraphSnapshot {
  readonly revision: number;
  readonly nodes: readonly Readonly<{ id: number; type: PrimitiveType; a?: number; b?: number }>[];
  readonly connections: readonly Readonly<{ from: number; outputPort: number; to: number; inputPort: number }>[];
  readonly initialParameters: readonly Readonly<{ nodeId: number; id: number; value: number }>[];
  readonly endpoints: readonly ParameterEndpoint[];
  readonly hostBindings: readonly HostBinding[];
  readonly hostAssignments: readonly HostAssignment[];
  readonly controls: readonly ProjectControl[];
  readonly instances: readonly NamedInstance[];
}

export interface NamedInstance {
  readonly path: string;
  readonly nodeId: number;
}

export interface ProjectControl {
  readonly path: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly value: number;
  readonly discrete: boolean;
}

export interface CaptureWindowSettings {
  captureWindowSeconds?: number;
  captureWindowMode?: 'seconds' | 'bars' | 'free';
  captureWindowBars?: number;
  captureTempoBpm?: number;
  captureTimeSignatureNumerator?: number;
  captureTimeSignatureDenominator?: number;
}

export interface HostAssignment {
  readonly slot: number;
  readonly path?: string;
}

export interface HostBinding {
  readonly slot: number;
  readonly nodeId: number;
  readonly id: number;
}

export interface ParameterEndpoint {
  readonly path: string;
  readonly kind: 'parameter';
  readonly nodeId: number;
  readonly id: number;
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export interface AudioBus {
  readonly id: string; readonly name: string; readonly channels: number; readonly optional: boolean;
}
export interface IoLayout {
  readonly version: 1;
  readonly inputs: readonly AudioBus[]; readonly outputs: readonly AudioBus[];
  readonly inputBindings: readonly { readonly nodeId: number;
    readonly channels: readonly [Readonly<{bus:number;channel:number}> | null, Readonly<{bus:number;channel:number}> | null] }[];
  readonly outputBindings: readonly (Readonly<{nodeId:number;outputPort:number;channel:number}> | null)[];
}
export function validateIoLayout(layout: unknown, nodes: GraphSnapshot['nodes']): Readonly<IoLayout>;

export interface GraphWorkspaceProject {
  readonly format: 'manifold.project';
  readonly schemaVersion: 1;
  readonly projectId: 'manifold.graph-workspace';
  readonly endpoints?: readonly ParameterEndpoint[];
  readonly hostBindings?: readonly HostBinding[];
  readonly hostAssignments?: readonly HostAssignment[];
  readonly controls?: readonly ProjectControl[];
  readonly instances?: readonly NamedInstance[];
  readonly assets?: readonly SampleAsset[];
  readonly sampleBindings?: readonly SampleBinding[];
  readonly liveAuthoring?: Readonly<{format:'manifold.live-project';version:1;source:string;view:readonly unknown[]}>;
  readonly signal: Readonly<{
    inputs: number;
    outputs: number;
    io?: IoLayout;
    inputSource?: 'none' | 'external';
    sidechainSource?: 'none' | 'oscillator' | 'microphone';
    captureSources?: readonly CaptureSource[];
    defaultCaptureSourceId?: number;
    selectedCaptureSourceId?: number;
    selectedCaptureNodeId?: number;
    captureWindowSeconds?: number;
    captureWindowMode?: 'seconds' | 'bars' | 'free';
    captureWindowBars?: number;
    captureTempoBpm?: number;
    captureTimeSignatureNumerator?: number;
    captureTimeSignatureDenominator?: number;
    nodes: GraphSnapshot['nodes'];
    connections: GraphSnapshot['connections'];
    initialParameters: GraphSnapshot['initialParameters'];
  }>;
}

export interface CaptureSource {
  readonly id: number;
  readonly nodeId: number;
  readonly name: string;
  readonly kind: 'input' | 'sidechain' | 'layer' | 'custom';
}

export interface SampleAsset {
  readonly nodeId: number;
  readonly sourceRate: number;
  readonly frames: number;
  readonly label: string;
  readonly pcmF32Base64: string;
}

export interface SampleBinding {
  readonly sourceNodeId: number;
  readonly nodeId: number;
}

export function encodeSampleAsset(nodeId: number, stereo: Float32Array,
  sourceRate: number, label: string): SampleAsset;
export function decodeSampleAsset(asset: SampleAsset): {
  nodeId: number; sourceRate: number; stereo: Float32Array;
};

export class GraphWorkspace {
  readonly ioLayout: Readonly<IoLayout> | null;
  setIoLayout(layout: IoLayout): this;
  describeNode(handle: NodeHandle): Readonly<{ id: number; type: PrimitiveType;
    inputs: readonly Readonly<{ name: string; signal: SignalType }>[];
    outputs: readonly Readonly<{ name: string; signal: SignalType }>[];
    parameters: readonly ParameterDescription[] }>;
  static fromProject(project: unknown): GraphWorkspace;
  readonly revision: number;
  readonly input: NodeHandle<'input.raw'>;
  readonly output: NodeHandle<'output'>;
  fork(): GraphWorkspace;
  setInputSource(source: 'none' | 'external'): this;
  setSidechainSource(source: 'none' | 'oscillator' | 'microphone'): this;
  configureCaptureWindow(settings: Readonly<CaptureWindowSettings>): this;
  registerCaptureSource(handle: NodeHandle<'loop-capture' | 'retrospective-capture'>,
    name: string, kind?: CaptureSource['kind'], id?: number | null): this;
  selectCaptureSource(id: number): this;
  listCaptureSources(): readonly CaptureSource[];
  add<T extends PrimitiveType>(type: T, options: { id: number; config?: ConstructorConfiguration<NoInfer<T>> }): NodeHandle<T>;
  configure<T extends PrimitiveType>(handle: NodeHandle<T>, config: ConstructorConfiguration<NoInfer<T>>): this;
  captureRingBytes(sampleRate: number): number;
  find(id: number): NodeHandle | undefined;
  registerInstance(path: string, handle: NodeHandle): this;
  findInstance(path: string): NodeHandle | undefined;
  listInstances(): readonly NamedInstance[];
  unregisterInstance(path: string): this;
  connect<S extends SignalType>(from: PortRef<S, 'outputs'>, to: PortRef<NoInfer<S>, 'inputs'>): this;
  disconnect(to: PortRef<SignalType, 'inputs'>): this;
  remove(handle: NodeHandle): this;
  setSampleAsset(handle: NodeHandle, stereo: Float32Array, sourceRate: number, label?: string): this;
  removeSampleAsset(handle: NodeHandle): this;
  listSampleAssets(): readonly SampleAsset[];
  bindSampleAsset(source: NodeHandle<'sample-region'>, target: NodeHandle<'sample-region'>): this;
  unbindSampleAsset(target: NodeHandle<'sample-region'>): this;
  listSampleBindings(): readonly SampleBinding[];
  setParameter(handle: NodeHandle, id: number, value: number): this;
  registerParameter(path: string, handle: NodeHandle, id: number,
    range: { min: number; max: number; default: number }): this;
  findParameter(path: string): ParameterEndpoint | null;
  listParameters(): readonly ParameterEndpoint[];
  unregisterParameter(path: string): this;
  bindHostSlot(slot: number, handle: NodeHandle, id: number): this;
  reserveHostSlots(assignments: readonly HostAssignment[]): this;
  listHostAssignments(): readonly HostAssignment[];
  hostSlotForPath(path: string): number | null;
  listHostBindings(): readonly HostBinding[];
  unbindHostSlot(slot: number): this;
  registerControl(path: string, range: { min: number; max: number; default: number; discrete?: boolean }): this;
  setControl(path: string, value: number): this;
  findControl(path: string): ProjectControl | null;
  listControls(): readonly ProjectControl[];
  unregisterControl(path: string): this;
  snapshot(): GraphSnapshot;
  toProject(options?: { inputSource?: 'none' | 'external' }): GraphWorkspaceProject;
}

export function createGraphWorkspace(): GraphWorkspace;
export function parameterValue(project: GraphWorkspaceProject, path: string): number;
export interface RouteEdit {
  readonly to: number;
  readonly input: string;
  readonly from?: number | null;
  readonly output?: string;
}
export interface PreparedRoute {
  readonly to: number;
  readonly inputPort: number;
  readonly from: number | null;
  readonly outputPort: number;
}
export interface ParameterEdit {
  readonly nodeId: number;
  readonly id: number;
  readonly value: number;
}
export class LiveGraphSession {
  constructor(graph: GraphWorkspace, applyRoute: (route: PreparedRoute) => Promise<void | boolean> | void | boolean,
    applyParameter?: ((edit: ParameterEdit) => Promise<void | boolean> | void | boolean) | null,
    applyGraph?: ((project: GraphWorkspaceProject) => Promise<void | boolean> | void | boolean) | null,
    applyParameterBatch?: ((edits: readonly ParameterEdit[]) => Promise<void | boolean> | void | boolean) | null,
    readPublishedParameters?: (() => readonly ParameterEdit[] | Promise<readonly ParameterEdit[]>) | null);
  snapshot(): GraphSnapshot;
  toProject(): GraphWorkspaceProject;
  forkGraph(): GraphWorkspace;
  adoptPublishedParameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  sampleAsset(nodeId: number, stereo: Float32Array, sourceRate: number, label: string,
    applySample: (nodeId: number, sourceRate: number, stereo: Float32Array,
      bindingTargets: readonly number[]) => Promise<void | boolean> | void | boolean): Promise<GraphWorkspaceProject>;
  configureCaptureWindow(settings: Readonly<CaptureWindowSettings>): Promise<GraphWorkspaceProject>;
  selectCaptureSource(id: number): Promise<GraphWorkspaceProject>;
  route(edit: RouteEdit): Promise<GraphWorkspaceProject>;
  routeWithControl(edit: RouteEdit, control: Readonly<{ path: string; value: number }>): Promise<GraphWorkspaceProject>;
  parameterWithControl(edit: Readonly<{ nodeId: number; id: number; value: number }>,
    control: Readonly<{ path: string; value: number }>): Promise<GraphWorkspaceProject>;
  parameters(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  parametersWithControl(edits: readonly ParameterEdit[],
    control: Readonly<{ path: string; value: number }>): Promise<GraphWorkspaceProject>;
  parameter(edit: ParameterEdit): Promise<GraphWorkspaceProject>;
  parameterPath(path: string, value: number): Promise<GraphWorkspaceProject>;
  transaction(edit: (graph: GraphWorkspace) => void | Promise<void>): Promise<GraphWorkspaceProject>;
}
export function createLiveGraphSession(graph: GraphWorkspace,
  applyRoute: (route: PreparedRoute) => Promise<void | boolean> | void | boolean,
  applyParameter?: ((edit: ParameterEdit) => Promise<void | boolean> | void | boolean) | null,
  applyGraph?: ((project: GraphWorkspaceProject) => Promise<void | boolean> | void | boolean) | null,
  applyParameterBatch?: ((edits: readonly ParameterEdit[]) => Promise<void | boolean> | void | boolean) | null,
  readPublishedParameters?: (() => readonly ParameterEdit[] | Promise<readonly ParameterEdit[]>) | null): LiveGraphSession;
export function listPrimitives(): readonly AuthorPrimitive[];
export function getPrimitive<T extends PrimitiveType>(type: T): AuthorPrimitive<T>;
export function validateParameterEndpoints(signal: Pick<GraphSnapshot, 'nodes' | 'initialParameters'>,
  endpoints: readonly ParameterEndpoint[]): readonly ParameterEndpoint[];
export function validateHostBindings(signal: Pick<GraphSnapshot, 'initialParameters'>,
  bindings: readonly HostBinding[]): readonly HostBinding[];
export function validateProjectControls(controls: readonly ProjectControl[],
  endpoints?: readonly ParameterEndpoint[]): readonly ProjectControl[];
export function validateNamedInstances(signal: Pick<GraphSnapshot, 'nodes'>,
  instances: readonly NamedInstance[]): readonly NamedInstance[];
