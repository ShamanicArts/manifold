import type { LiveProjectRuntime, LiveRequest } from '@manifold/author/live-project';
import type { AudioAnalysis } from './custom-view.js';
export interface VisualAPI {
  /** A detached render-time observation. Null when disconnected or audio is stopped. */
  input(name: string): PresentationValue | (AudioAnalysis & { observedAt: number });
  parameter(name: string): number | undefined;
  assetUrl(path: string): Promise<string>;
  value(path: string): number | undefined;
  set(path: string, value: number): Promise<unknown>;
  setBatch(edits: { path: string; value: number }[]): Promise<unknown>;
  snapshot(): ReturnType<LiveProjectRuntime['snapshot']>;
  subscribe(listener: Parameters<LiveProjectRuntime['subscribe']>[0]): () => void;
  request(command: LiveRequest): Promise<unknown>;
  resource<T extends object>(name: string): T | null;
  exportResource(type: `resource:${string}`, value: object): PresentationResource;
}
export interface PresentationResource {
  readonly type: `resource:${string}`;
}
export type PresentationValue = Field2D | number | readonly number[] | PresentationResource | null;
export interface Field2D {
  readonly width: number;
  readonly height: number;
  readonly values: readonly number[];
}
export interface PresentationFrame {
  readonly time: number;
  readonly delta: number;
}
export interface PresentationScript {
  evaluate(
    api: VisualAPI,
    frame: PresentationFrame,
  ): Record<string, Field2D | number | readonly number[] | null>;
  dispose?(): void;
}
export interface SceneObject {
  create(api: VisualAPI): {
    outputs?(): Record<string, PresentationValue>;
    update?(frame: PresentationFrame): void;
    dispose(): void;
  };
}
export type NodePreview = {
  output: string;
  unit: string;
  sampledAt: number;
} & (
  | { kind: 'value'; values: number[]; history: number[][] }
  | {
      kind: 'field';
      width: number;
      height: number;
      pixels: number[];
      min: number;
      max: number;
      resolution: [number, number];
    }
);
export interface CompositionObservation {
  revision: number;
  nodes: Record<string, { status: string; outputs: Record<string, string>; preview?: NodePreview }>;
}
export function mountCompositionView(
  element: HTMLElement,
  runtime: Pick<LiveProjectRuntime, 'snapshot' | 'subscribe'>,
  options?: {
    modules?: Record<string, { version: string; load: () => Promise<Record<string, unknown>> }>;
    /** Native hosts can advance hidden previews from their control/UI clock. */
    hostDrivenHidden?: boolean;
    target?: 'browser' | 'webview';
    analysis?: () => AudioAnalysis | null;
    request?: (command: LiveRequest) => Promise<unknown>;
    onError?: (error: unknown) => void;
    onIssues?: (issues: { id: number; label: string; message: string }[]) => void;
    onObservation?: (observation: CompositionObservation) => void;
  },
): { inspect(): CompositionObservation; setPreviewNodes(ids: number[]): void; dispose(): void };
