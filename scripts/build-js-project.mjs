// Bundle an @manifold/author project into one self-contained control script.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = requireFromWeb('esbuild');
const [entry, output, mode] = process.argv.slice(2);
if (!entry || !output) {
  console.error('usage: node scripts/build-js-project.mjs ENTRY.mjs OUTPUT.js [--check]');
  process.exit(2);
}
if (mode && mode !== '--check') throw new Error(`Unknown mode: ${mode}`);
const result = await build({
  entryPoints: [resolve(entry)], outfile: resolve(output), bundle: true,
  platform: 'neutral', format: 'iife', globalName: 'ManifoldProject',
  target: 'es2020', legalComments: 'external', logLevel: 'silent',
  write: mode !== '--check',
});
if (mode === '--check') {
  const existing = await readFile(output);
  if (!existing.equals(Buffer.from(result.outputFiles[0].contents))) {
    throw new Error(`Bundled project is stale: ${output}`);
  }
} else console.log(`${output}: bundled ${entry}`);
