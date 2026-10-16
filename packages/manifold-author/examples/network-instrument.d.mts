import type { GraphWorkspace } from '../index.js';
import type { Component } from '../live-project.js';
import type { NetworkDefinition } from '../host-services.js';

export default function createProject(): {
  graph: GraphWorkspace;
  view: Component[];
  network: NetworkDefinition;
};
