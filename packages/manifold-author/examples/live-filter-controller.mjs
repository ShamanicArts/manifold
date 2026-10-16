import { createLiveCreatorProject } from '../native-project.js';
import { source } from './standalone-filter.mjs';
export { createLiveCreatorProject };
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, saved = null) {
  return createLiveCreatorProject(host, source, saved);
}
// Recall — validate portable state through the same graph contract.
export function restoreProject(host, saved) {
  return createProject(host, saved);
}
