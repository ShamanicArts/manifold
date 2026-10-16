import type { GraphWorkspaceProject } from './index.js';
import type { ProjectFile } from './live-project.js';
export type PresentationType =
  | 'analysis'
  | 'scalar'
  | 'field2d'
  | 'image2d'
  | 'image-sequence'
  | 'vector2'
  | 'vector3'
  | `resource:${string}`;
export interface VisualDefinition {
  id: string;
  version: number;
  label: string;
  description?: string;
  category?:
    | 'Sound analysis'
    | 'Values & motion'
    | 'Fields'
    | 'Colour & layers'
    | 'Objects & layout'
    | 'Reusable graphs'
    | 'Custom scripts';
  keywords?: string[];
  /** Output shown on the node face. Defaults to the first scalar, vector, field or image. */
  preview?: string;
  implementation:
    | {
        kind: 'web-surface' | 'presentation-script' | 'scene-object';
        entry: string;
        dependencies: Record<string, string>;
        targets: ('browser' | 'webview')[];
      }
    | { kind: 'visual-primitive'; name: string; frames?: string[] }
    | { kind: 'parameter'; path: string }
    | { kind: 'composition'; graph: CompositionGraph & { bindings: ParameterBinding[] } };
  inputs: { name: string; type: PresentationType; unit?: string }[];
  outputs?: { name: string; type: PresentationType; unit?: string }[];
  parameters: { name: string; label: string; min: number; max: number; default: number }[];
}
export interface VisualInstance {
  id: number;
  definition: string;
  label: string;
  parameters: Record<string, number>;
  position: [number, number];
  bounds?: { x: number; y: number; width: number; height: number };
}
export interface ParameterBinding {
  name: string;
  to: number;
  parameter: string;
}
export interface CompositionGraph {
  groups?: { id: string; label: string; nodes: number[] }[];
  nodes: VisualInstance[];
  connections: { from: number; output: string; to: number; input: string }[];
}
export interface Composition extends CompositionGraph {
  version: 1 | 2 | 3 | 4;
  definitions: VisualDefinition[];
}
export function emptyComposition(): Composition;
export function validateComposition(
  value: unknown,
  files: ProjectFile[],
  graph: GraphWorkspaceProject,
): Composition;
export const visualStarterSource: string;
export function compositionOrder(composition: CompositionGraph): number[];
export interface PresentationObject extends VisualInstance {
  path: string;
  scope: string;
  localId: number;
  ownerDefinition: string;
  boundParameters: Record<string, string>;
  interface?: 'input' | 'output';
  inputs?: { name: string; type: PresentationType; unit?: string }[];
  outputs?: { name: string; type: PresentationType; unit?: string }[];
}
export interface PresentationExecution {
  nodes: PresentationObject[];
  connections: CompositionGraph['connections'];
  compositeOutputs: Record<string, Record<string, { from: number; output: string } | null>>;
  compositeMembers: Record<string, number[]>;
}
export function expandComposition(
  composition: Composition,
  reservedIds?: number[],
): PresentationExecution & {
  objects: PresentationObject[];
  groups: {
    id: string;
    localId: string;
    scope: string;
    ownerDefinition: string;
    kind: string;
    label: string;
    ids: number[];
  }[];
  edges: { from: number; to: number; outputPort: number; inputPort: number }[];
};
