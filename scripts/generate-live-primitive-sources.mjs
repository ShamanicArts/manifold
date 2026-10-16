import { writeGeneratedFile as writeFile } from './write-generated-file.mjs';
// Generate before bundling: Function.toString() after minification would expose
// renamed local variables and break editable authored programs.
import{readFile}from 'node:fs/promises';
import{creatorSource as defaultSource}from '../packages/manifold-author/examples/dsp-live-scripting.mjs';
import{creatorSource as slotsSource}from '../packages/manifold-author/examples/fx-slot-swap.mjs';
import { creatorSource as oscillatorSource } from '../packages/manifold-author/examples/standalone-oscillator.mjs';
import { creatorSource as mainSource } from '../packages/manifold-author/examples/main-wave-creator.mjs';
import { formatProjectSource } from './format-project-source.mjs';
for(const [name,build]of [['dsp-live-creator-source',defaultSource],['fx-slot-creator-source',slotsSource],['standalone-oscillator-source',oscillatorSource],['main-wave-live-source',mainSource]]){
 const path=new URL(`../packages/manifold-author/examples/${name}.generated.mjs`,import.meta.url);
 const content='// Generated from the public legacy graph factories. Do not edit this copy.\nexport const source='+JSON.stringify(await formatProjectSource(build()))+';\n';
 if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==content)throw Error(`Stale creator source ${name}`);}else await writeFile(path,content);
}
// Preserve the actual module's readable source for the live editor; do not stringify
// a bundled function, which would remove imports and rename the author's variables.
const networkSource = await readFile(new URL('../packages/manifold-author/examples/network-instrument.mjs', import.meta.url), 'utf8');
const networkPath = new URL('../packages/manifold-author/examples/network-services.mjs', import.meta.url);
const networkContent = '// Generated from network-instrument.mjs. Edit that module, then run scripts/generate-live-primitive-sources.mjs.\nexport const source = ' + JSON.stringify(networkSource) + ';\n';
if (process.argv.includes('--check')) {
  if (await readFile(networkPath, 'utf8') !== networkContent) throw Error('Stale network instrument source');
} else await writeFile(networkPath, networkContent);
const filterSource = await readFile(new URL('../packages/manifold-author/examples/filter-instrument.mjs', import.meta.url), 'utf8');
const filterPath = new URL('../packages/manifold-author/examples/standalone-filter.mjs', import.meta.url);
const filterContent = '// Generated from filter-instrument.mjs. Edit that module, then regenerate live sources.\nexport const source = ' + JSON.stringify(filterSource) + ';\n';
if (process.argv.includes('--check')) {
  if (await readFile(filterPath, 'utf8') !== filterContent) throw Error('Stale filter instrument source');
} else await writeFile(filterPath, filterContent);

for (const name of ['ui-styled-tone', 'ui-reactive-tone', 'ui-three-tone', 'ui-orbit', 'ui-nacre']) {
  const source = await readFile(new URL(`../packages/manifold-author/examples/${name}.mjs`, import.meta.url), 'utf8');
  const path = new URL(`../packages/manifold-author/examples/${name}-source.generated.mjs`, import.meta.url);
  const content = `// Generated from ${name}.mjs; edit the original module.\nexport const source = ${JSON.stringify(source)};\n`;
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw Error(`Stale UI example ${name}`);
  } else await writeFile(path, content);
}
