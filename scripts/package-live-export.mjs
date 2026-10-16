import { deviceProject } from '../web/src/authoring/studio-document.js';
// Package accepted creator state without executing the supplied author's code
// in Node. Native QuickJS loads the same generic controller inside the product.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GraphWorkspace } from '../packages/manifold-author/index.js';
import { validateWebView } from '../packages/manifold-author/web-view.js';
import { validateProjectFiles } from '../packages/manifold-author/project-files.js';
import { validateComposition } from '../packages/manifold-author/composition.js';

const [input, output] = process.argv.slice(2);
const { project, product, webView } = JSON.parse(await readFile(input, 'utf8'));
if (project?.format !== 'manifold.live-project' || project.version !== 1
    || typeof project.source !== 'string' || project.source.length > 256_000)
  throw new Error('Export requires an accepted live project with source');
GraphWorkspace.fromProject(project.graph);
const composition=validateComposition(project.composition,validateProjectFiles(project.files??[]),project.graph);
const definition = validateWebView(webView);
const nativeViewModules = { three: '0.184.0', '@manifold/ui-web/control-panel': '0.1.0', '@manifold/ui-web/diegetic': '0.1.0' };
for (const [name, version] of Object.entries(definition?.dependencies ?? {})) {
  if (nativeViewModules[name] !== version)
    throw new Error(`Native export does not yet bundle ${name}@${version}`);
}
for (const definition of composition.definitions) {
  if (!definition.implementation.targets.includes('webview')) throw new Error(`${definition.label} does not support native webview export`);
  for (const [name,version] of Object.entries(definition.implementation.dependencies))
    if (nativeViewModules[name]!==version) throw new Error(`Native export does not yet bundle ${name}@${version}`);
}
const { graph, ...liveAuthoring } = deviceProject(project);
const bundle = await readFile(new URL('../projects/standalone-filter/live-controller.bundle.js', import.meta.url), 'utf8');
const document = {
  format: 'manifold.package', schemaVersion: 1,
  packageId: product.id, packageVersion: product.pluginVersion,
  control: { language: 'javascript', format: 'iife', bundle,
    sha256: createHash('sha256').update(bundle).digest('hex') },
  state: { ...graph, liveAuthoring },
};
await writeFile(output, JSON.stringify(document) + '\n');
