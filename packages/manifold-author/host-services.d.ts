import type { LiveSnapshot, ProjectEvent } from './live-project.js';

export interface SocketHandle { id: number; address: string; peer?: string }
export interface ServiceEvent { type: string; id?: number; peer?: string; data?: number[]; path?: string; args?: unknown[]; state?: LinkState }
export interface LinkState { enabled: boolean; peers: number; tempo: number; beat: number; phase: number; quantum: number; playing: boolean; tempoSync: boolean; startStopSync: boolean; clockMicros: number }
export class HostServices {
  constructor(options?: { session?: string; endpoint?: string; request?: (command: object) => Promise<any> });
  request(operation: string, options?: object): Promise<any>;
  capabilities(): Promise<Record<string, boolean | number>>;
  bindUdp(address: string): Promise<SocketHandle>;
  listenTcp(address: string): Promise<SocketHandle>;
  connectTcp(address: string): Promise<SocketHandle>;
  sendUdp(id: number, address: string, data: Uint8Array): Promise<{ written: number }>;
  writeTcp(id: number, data: Uint8Array): Promise<{ queued: number }>;
  closeSocket(id: number): Promise<{ closed: number }>;
  poll(): Promise<{ events: ServiceEvent[]; dropped: number }>;
  bindOsc(address: string): Promise<SocketHandle>;
  sendOsc(id: number, address: string, path: string, args: (number | string | boolean)[]): Promise<{ written: number }>;
  publishEndpoints(endpoints: object[]): Promise<{ published: number }>;
  startOscQuery(address: string, oscPort: number): Promise<{ address: string }>;
  configureLink(settings: Partial<LinkState>): Promise<LinkState>;
  inspectLink(): Promise<LinkState>;
  close(): Promise<void>;
}
export class JsonLineDecoder { constructor(limit?: number); push(chunk: ArrayLike<number>): unknown[] }
export class ProjectServices {
  constructor(runtime: any, services?: HostServices, onStatus?: (status: any) => void);
  start(): Promise<this>;
  close(): Promise<void>;
  receive(event: ServiceEvent): Promise<void>;
}

export interface NetworkSettings {
  tcp?: string;
  udp?: string;
  osc?: string;
  oscQuery?: string;
  link?: Partial<Pick<LinkState, 'enabled' | 'tempo' | 'quantum' | 'playing' | 'tempoSync' | 'startStopSync'>>;
}
export type NetworkHandler = (event: ProjectEvent, accepted: LiveSnapshot) => unknown;
export interface NetworkDefinition {
  readonly settings: NetworkSettings;
  readonly handler: NetworkHandler | null;
  /** Register one synchronous event mapper. Replaces the previous mapper. */
  onEvent(handler: NetworkHandler): this;
}
/** Declare host services; connections are opened by the host's lifecycle. */
export function defineNetwork(settings: NetworkSettings): NetworkDefinition;
