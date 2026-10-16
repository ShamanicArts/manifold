import type { GraphWorkspaceProject } from './index.js';
import type { Composition, VisualDefinition } from './composition.js';
export interface NodeSource {
  role: string;
  label: string;
  path: string;
  from?: number;
  to?: number;
  excerpt?: string;
  sharedInstances?: number;
}
export function nodeDeclaration(
  source: string,
  node: { id: number; type: string },
  graph: GraphWorkspaceProject,
): NodeSource;
export function describeNodeSources(
  source: string,
  graph: GraphWorkspaceProject,
  composition: Composition,
  definitions: (VisualDefinition & { sources: Record<string, string> })[],
): Record<string, NodeSource[]>;
export function sourceSelection(
  text: string,
  link: NodeSource,
): { anchor: number; head: number } | null;
