// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { createLiveCreatorProject } from './live-filter-controller.mjs';
import { getProgram } from './primitive-library.mjs';
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, saved = null) {
  return createLiveCreatorProject(host, getProgram('default').source, saved);
}
// Recall — validate portable state through the same graph contract.
export function restoreProject(host, saved) {
  return createProject(host, saved);
}
