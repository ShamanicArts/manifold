// Build one self-contained project package from a controller and its saved graph.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { GraphWorkspace } from '../packages/manifold-author/index.js';

const [packageId, packageVersion, bundlePath, statePath, outputPath, mode] = process.argv.slice(2);
if (![packageId, packageVersion, bundlePath, statePath, outputPath].every(Boolean)) {
  console.error('usage: node scripts/build-project-package.mjs ID VERSION BUNDLE.js STATE.json OUTPUT.manifold.json [--check]');
  process.exit(2);
}
if (mode && mode !== '--check') throw new Error(`Unknown mode: ${mode}`);
const bundle = await readFile(bundlePath, 'utf8');
const state = JSON.parse(await readFile(statePath, 'utf8'));
GraphWorkspace.fromProject(state);
const packageDocument = {
  format: 'manifold.package', schemaVersion: 1,
  packageId, packageVersion,
  control: { language: 'javascript', format: 'iife', bundle,
    sha256: createHash('sha256').update(bundle).digest('hex') },
  state,
};
const output = `${JSON.stringify(packageDocument)}\n`;
if (mode === '--check') {
  if (await readFile(outputPath, 'utf8') !== output) {
    throw new Error(`Project package is stale: ${outputPath}`);
  }
} else {
  await writeFile(outputPath, output);
  console.log(`${outputPath}: ${packageId}@${packageVersion} (${bundle.length} JS bytes)`);
}
