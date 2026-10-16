import {readFile, writeFile} from 'node:fs/promises';
import {createProject as rack} from '../examples/projects/rack-sample-project.mjs';
import {createProject as instrument} from '../examples/projects/sample-instrument-project.mjs';
const reject=()=>{throw new Error('Unexpected host command during project construction');};
const host={setParameter:reject,setParameterBatch:reject,setRoute:reject,replaceGraph:reject,sendEvent:reject};
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--check')) throw new Error('usage: generate-sample-author-packages.mjs [--check]');
for(const [name,create]of [['rack-sample',rack],['sample-instrument',instrument]]){
  const path = new URL(`../projects/graph-workspace/${name}-author-project.json`,import.meta.url);
  const output = JSON.stringify(create(host).toProject(),null,2)+'\n';
  if (args[0] === '--check') {
    if (await readFile(path,'utf8') !== output) throw new Error(`Sample author project is stale: ${path}`);
  } else await writeFile(path,output);
}
