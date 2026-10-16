// Assemble the bundled Nacre example. Studio saves remain independent documents.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LiveProjectRuntime } from '../packages/manifold-author/live-project.js';
import { evaluateProjectModules } from '../packages/manifold-author/project-modules.js';
import * as manifold from '../packages/manifold-author/creative.js';
const assembly = await readFile(
  new URL('../projects/nacre/composition.mjs', import.meta.url),
  'utf8',
);
const { assemblePresentation } = evaluateProjectModules(
  '/nacre/composition.mjs',
  {
    '/nacre/composition.mjs': assembly,
  },
  { manifold },
);

export async function buildNacrePresentation(saved) {
  const source = await readFile(
    new URL('../packages/manifold-author/examples/ui-nacre.mjs', import.meta.url),
    'utf8',
  );
  const authored = new LiveProjectRuntime(null, source).save();
  const project = {
    ...authored,
    files: saved.files.filter((file) => !file.path.startsWith('/nacre/')),
  };
  const runtime = new LiveProjectRuntime(null, source, project);
  const files = await Promise.all(
    [
      'scene',
      'field',
      'energy',
      'modes',
      'controls',
      'creature-motion',
      'creature',
      'eye-motion',
      'eye',
      'cabinet',
      'relic',
      'image-texture',
      'hand-motion',
      'hand',
      'halo-motion',
      'halo',
      'composition',
    ].map(async (name) => ({
      path: `/nacre/${name}.mjs`,
      mediaType: 'text/javascript',
      encoding: 'utf8',
      content: await readFile(new URL(`../projects/nacre/${name}.mjs`, import.meta.url), 'utf8'),
    })),
  );
  await assemblePresentation(runtime, files);
  return runtime.save();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const projectPath = new URL(
    '../web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json',
    import.meta.url,
  );
  const existing = await readFile(projectPath, 'utf8');
  const result = JSON.stringify(await buildNacrePresentation(JSON.parse(existing)), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (result !== existing)
      throw new Error(
        'Nacre presentation is stale; run node scripts/generate-nacre-composition.mjs',
      );
  } else await writeFile(projectPath, result);
  console.log('Nacre: shared scene, standing-wave field and enterable Oracle creature image graph');
}
