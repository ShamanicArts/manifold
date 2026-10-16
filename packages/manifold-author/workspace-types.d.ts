import type { PrimitiveType, SignalType } from './catalog.generated.js';
import type { ParameterDescription } from './index.js';

export interface WorkspaceType {
  readonly label: string;
  readonly category: string;
  readonly description: string;
  readonly fixedId?: number;
  readonly code: number;
  readonly args: Readonly<{ a?: number; b?: number }>;
  readonly inputs: readonly SignalType[];
  readonly inputNames: readonly string[];
  readonly output: SignalType | null;
  readonly outputs: readonly SignalType[];
  readonly outputNames: readonly string[];
  readonly parameters?: readonly ParameterDescription[];
}

export const WORKSPACE_TYPES: Readonly<Record<PrimitiveType, WorkspaceType>>;
export const VISUAL_NAMES: readonly string[];
export function validMixerInputs(inputs: number): boolean;
export function configuredWorkspaceType(node: { type: PrimitiveType; a?: number }): WorkspaceType;
