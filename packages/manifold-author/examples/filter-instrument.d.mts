import type { GraphWorkspace } from '../index.js';
import type { Component } from '../live-project.js';
export default function createProject(): {
  graph: GraphWorkspace;
  view: Component[];
  paint(ui: { filterResponse(): void; parameter(path: string, options: Partial<Component>): void }): void;
};
