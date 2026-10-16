import type {
  AuthorPrimitive,
  ConstructorConfiguration,
  GraphWorkspace,
  GraphWorkspaceProject,
  ParameterDescription,
} from './index.js';
import type { PORT_CATALOG, PrimitiveType, SignalType } from './catalog.generated.js';
import type { NamedParameters } from './parameter-names.generated.js';

export interface DeviceIdentity {
  readonly id: string;
  readonly name: string;
}
export interface Boundary<S extends SignalType> {
  readonly signal: S;
}
export const audio: { readonly stereo: Boundary<'audio'> & { readonly channels: 2 } };
export const midi: { readonly events: Boundary<'midi'> };
export const sawOscillator: AuthorPrimitive<'oscillator'>;
export const sineOscillator: AuthorPrimitive<'oscillator'>;
export const lowPassFilter: AuthorPrimitive<'svf'>;
declare const direction: unique symbol;
export interface DevicePort<S extends SignalType, D extends 'inputs' | 'outputs'> {
  readonly name: string;
  readonly signal: S;
  readonly [direction]: D;
}
export interface DeviceParameter extends ParameterDescription {
  readonly name: string;
}
type Parameters<T extends PrimitiveType> = T extends keyof NamedParameters
  ? NamedParameters[T]
  : never;
type Ports<T extends PrimitiveType, D extends 'inputs' | 'outputs'> = T extends 'mixer'
  ? D extends 'inputs' ? Readonly<Record<`in-${number}`, DevicePort<'audio', 'inputs'>>>
    : { readonly out: DevicePort<'audio', 'outputs'> }
  : {
  readonly [P in (typeof PORT_CATALOG)[T][D][number] as P['name']]: DevicePort<P['signal'], D>;
};
export interface DeviceProcessor<T extends PrimitiveType> {
  readonly name: string;
  readonly definition: AuthorPrimitive<T>;
  readonly parameters: { readonly [K in Parameters<T>]: DeviceParameter };
  readonly inputs: Ports<T, 'inputs'>;
  readonly outputs: Ports<T, 'outputs'>;
  /** Declare initial state. Does not mutate a running processor. */
  configure(values: Partial<Record<Parameters<T>, number>>): this;
}
export interface DeviceControlOptions {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly unit?: string;
  readonly style?: {
    readonly accent?: string;
    readonly background?: string;
    readonly text?: string;
  };
}
export interface DeviceControl extends DeviceControlOptions {
  readonly id: string;
  readonly path: string;
  readonly parameter: DeviceParameter;
}
type ReversePorts<P, D extends 'inputs' | 'outputs'> = {
  readonly [K in keyof P]: P[K] extends DevicePort<infer S, any> ? DevicePort<S, D> : never;
};
export interface DeviceInstance<I, O> {
  readonly name: string;
  readonly definition: Device<I, O>;
  readonly inputs: ReversePorts<I, 'inputs'>;
  readonly outputs: ReversePorts<O, 'outputs'>;
  readonly controls: Readonly<Record<string, DeviceControl>>;
  readonly parameters: Readonly<Record<string, DeviceControl>>;
  configure(values: Record<string, number>): this;
}
export interface Device<I = Record<never, never>, O = Record<never, never>> extends DeviceIdentity {
  readonly inputs: Readonly<I>;
  readonly outputs: Readonly<O>;
  input<S extends 'audio' | 'midi'>(name: string, kind: Boundary<S>): DevicePort<S, 'outputs'>;
  output(name: string, kind: Boundary<'audio'>): DevicePort<'audio', 'inputs'>;
  add<T extends PrimitiveType>(
    name: string,
    definition: AuthorPrimitive<T>,
    options?: { config?: ConstructorConfiguration<NoInfer<T>> },
  ): DeviceProcessor<T>;
  add<I, O>(name: string, definition: Device<I, O>): DeviceInstance<I, O>;
  group(
    id: string,
    instances: readonly (DeviceProcessor<any> | DeviceInstance<any, any>)[],
    options: { label: string },
  ): this;
  place(
    instance: DeviceProcessor<any> | DeviceInstance<any, any>,
    position: { x: number; y: number; space?: 'world' },
  ): this;
  control(
    name: string,
    parameter: DeviceParameter | DeviceControl,
    options?: DeviceControlOptions,
  ): DeviceControl;
  connect<S extends SignalType>(
    from: DevicePort<S, 'outputs'>,
    to: DevicePort<NoInfer<S>, 'inputs'>,
  ): this;
}
export function createDevice(identity: DeviceIdentity): Device;
export function createEffect(
  identity: DeviceIdentity,
): Device<{ audio: DevicePort<'audio', 'outputs'> }, { audio: DevicePort<'audio', 'inputs'> }>;
export function createInstrument(
  identity: DeviceIdentity,
): Device<{ midi: DevicePort<'midi', 'outputs'> }, { audio: DevicePort<'audio', 'inputs'> }>;
export function isDevice(value: unknown): value is Device;
/** A detached expert draft in the existing contract. No live DSP state is owned here. */
export function lowerDevice(
  device: Device,
  options?: { previous?: GraphWorkspaceProject },
): {
  graph: GraphWorkspace;
  project: GraphWorkspaceProject;
  identity: Readonly<DeviceIdentity>;
  view: { id: string; type: 'parameter'; path: string; label: string; unit?: string }[];
};
