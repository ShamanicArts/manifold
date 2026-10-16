// Rebuild the shippable Nacre project from its readable authoring source while
// retaining the artwork assets. Audio and Prism Bend are explicit Device declarations.
import { readFile, writeFile } from 'node:fs/promises';
import { buildNacrePresentation } from './generate-nacre-composition.mjs';
import { validateProjectFiles } from '../packages/manifold-author/project-files.js';

const root = new URL('../', import.meta.url);
const projectUrl = new URL(
  'web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json',
  root,
);
const saved = JSON.parse(await readFile(projectUrl, 'utf8'));
const art = new URL('web/public/nacre/2026-10-10-graph/art/', root);
saved.files = saved.files.filter(
  (file) =>
    file.path !== '/assets/nacre-eye-open-up.webp' &&
    !file.path.startsWith('/assets/nacre-synaptic-reliquary'),
);
for (const name of [
  'nacre-cabinet-art.webp',
  'nacre-oracle-crab-rest.webp',
  'nacre-oracle-crab-step.webp',
  'nacre-oracle-crab-sing.webp',
  'nacre-mouth-relic.webp',
  'nacre-mouth-depth.webp',
  'nacre-eye-closed.webp',
  'nacre-eye-open-left.webp',
  'nacre-eye-open-right.webp',
  'nacre-reliquary-hand.webp',
  'nacre-hand-grasp-mid.webp',
  'nacre-hand-grasp-open.webp',
  'nacre-wrist-graft.webp',
]) {
  const content = (await readFile(new URL(name, art))).toString('base64');
  const path = `/assets/${name}`;
  const entry = saved.files.find((file) => file.path === path);
  if (entry) entry.content = content;
  else saved.files.push({ path, mediaType: 'image/webp', encoding: 'base64', content });
}
saved.files = validateProjectFiles(saved.files);
await writeFile(projectUrl, JSON.stringify(await buildNacrePresentation(saved), null, 2) + '\n');
console.log(`Updated Nacre Device and ${saved.files.length} artwork assets`);
