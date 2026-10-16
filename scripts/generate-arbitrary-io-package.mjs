import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createArbitraryIoGraph } from '../packages/manifold-author/examples/arbitrary-io.mjs';
const bundle = await readFile(new URL('../projects/graph-workspace/arbitrary-io-project.bundle.js', import.meta.url), 'utf8');
const state = createArbitraryIoGraph().toProject();
const packaged = { format: 'manifold.package', schemaVersion: 1,
  packageId: 'manifold.arbitrary-io', packageVersion: '1.0.0',
  control: { language: 'javascript', format: 'iife', bundle,
    sha256: createHash('sha256').update(bundle).digest('hex') }, state };
const check = process.argv[2] === '--check';
if (process.argv.length > (check ? 3 : 2)) throw new Error('usage: generate-arbitrary-io-package.mjs [--check]');
for (const [path, document] of [
  ['../projects/graph-workspace/arbitrary-io-project.json', state],
  ['../web/public/packages/arbitrary-io.manifold.json', packaged],
]) {
  const url = new URL(path, import.meta.url), text = JSON.stringify(document, null, 2) + '\n';
  if (check) { if (await readFile(url, 'utf8') !== text) throw new Error(`Stale I/O fixture: ${path}`); }
  else await writeFile(url, text);
}
