import type { ProjectFile } from './live-project.js';

/** Validate static imports and syntax without running presentation code. */
export function prepareProjectModules(
  entry: string,
  files: ProjectFile[],
  dependencies?: Record<string, string>,
): Record<string, string>;

/** Evaluate prepared modules in a presentation host. This is not a sandbox. */
export function evaluateProjectModules(
  entry: string,
  sources: Record<string, string>,
  dependencies?: Record<string, Record<string, unknown>>,
): Readonly<Record<string, unknown>>;
