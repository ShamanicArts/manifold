import { readFile, writeFile } from 'node:fs/promises';
import { LiveProjectRuntime } from '../packages/manifold-author/live-project.js';
import { evaluateProjectModules } from '../packages/manifold-author/project-modules.js';
import * as manifold from '../packages/manifold-author/creative.js';
const assembly = await readFile(
  new URL('../examples/visuals/image-composition.mjs', import.meta.url),
  'utf8',
);
const { assembleImageComposition } = evaluateProjectModules(
  '/image-composition.mjs',
  { '/image-composition.mjs': assembly },
  { manifold },
);
const nacre = JSON.parse(
  await readFile(
    new URL('../web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json', import.meta.url),
    'utf8',
  ),
);
const source = `import { createEffect } from 'manifold';

// This effect passes host audio through. The separate image graph studies visuals.
const effect = createEffect({ id: 'image-composition', name: 'Image composition' });
effect.connect(effect.inputs.audio, effect.outputs.audio);
export default effect;
`;
const files = nacre.files.filter((file) => file.path.includes('nacre-oracle-crab-'));
for (const [name, path] of [
  ['creature-motion', '/nodes/creature-motion.mjs'],
  ['image-composition', '/examples/image-composition.mjs'],
])
  files.push({
    path,
    mediaType: 'text/javascript',
    encoding: 'utf8',
    content: await readFile(new URL(`../examples/visuals/${name}.mjs`, import.meta.url), 'utf8'),
  });
const runtime = new LiveProjectRuntime(null, source);
await assembleImageComposition(runtime, files);
const path = new URL('../web/public/studio/image-composition.manifold.json', import.meta.url);
const content = JSON.stringify(runtime.save(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== content)
    throw new Error('Image composition example is stale');
} else await writeFile(path, content);
console.log(
  'Image composition: enterable creature, three image poses, frame selection, transform and layer',
);
