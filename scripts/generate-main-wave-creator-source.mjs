import { writeGeneratedFile as writeFile } from './write-generated-file.mjs';
// Embed the actual public Main factory as inspectable portable source.
import {readFile} from 'node:fs/promises';
import { authorImports } from './format-project-source.mjs';
const directory=new URL('../packages/manifold-author/examples/',import.meta.url);
const module=await readFile(new URL('main-wave-graph.mjs',directory),'utf8');
const factory=module.slice(module.indexOf('export const MAIN_SYNTH'),module.indexOf('export function createProject')).replaceAll('export ','');
const output=new URL('main-wave-creator-source.generated.mjs',directory);
const imports = authorImports(module);
const services = "import { chooseMainVoice } from '@manifold/author/examples/main-voice-control';\nimport { oscillatorPreviewCurves } from '@manifold/author/examples/oscillator-preview';\nimport { adsr as adsrDefinition } from '@manifold/author/primitives';\n";
const generated='// Generated from public Main graph factories; run scripts/generate-main-wave-creator-source.mjs.\nexport const mainWaveFactorySource = '+JSON.stringify('// Imports — public tools, primitive definitions and reusable orchestration.\n'+imports.join('\n')+'\n'+services+'\n// Reusable graph definition — original voice and routing composition.\n'+factory)+';\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==generated)throw Error('Main Wave creator source is stale');}
else await writeFile(output,generated);
