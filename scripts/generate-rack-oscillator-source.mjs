import { writeGeneratedFile as writeFile } from './write-generated-file.mjs';
// Preserve the actual library factory as inspectable creator source. Bundler
// renaming makes Function.toString() unsuitable for portable project programs.
import { readFile } from 'node:fs/promises';
import { authorImports } from './format-project-source.mjs';
const input = new URL('../packages/manifold-author/examples/rack-oscillator.mjs', import.meta.url);
const output = new URL('../packages/manifold-author/examples/rack-oscillator-source.generated.mjs', import.meta.url);
const module = await readFile(input, 'utf8');
const body = module.slice(module.indexOf('export const OSC_BASE'), module.indexOf('export function createProject')).replaceAll('export ', '');
const imports = authorImports(module);
const services = "import { chooseMainVoice } from '@manifold/author/examples/main-voice-control';\nimport { oscillatorPreviewCurves } from '@manifold/author/examples/oscillator-preview';\nimport { adsr as adsrDefinition } from '@manifold/author/primitives';\n";
const generated = '// Generated from rack-oscillator.mjs; run scripts/generate-rack-oscillator-source.mjs.\nexport const rackOscillatorSource = ' + JSON.stringify('// Imports — public tools, primitive definitions and reusable orchestration.\n' + imports.join('\n') + '\n' + services + '\n// Reusable graph definition — inspect and edit the authored voice factory below.\n' + body) + ';\n';
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== generated) throw new Error('Stale oscillator creator source');
} else await writeFile(output, generated);
