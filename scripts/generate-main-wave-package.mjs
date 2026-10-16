import { readFile, writeFile } from 'node:fs/promises';
import { createProject } from '../examples/projects/main-wave-project.mjs';
const reject=()=>{throw new Error('Unexpected host command during construction');};
const result=JSON.stringify(createProject({setRoute:reject,setParameter:reject,setParameterBatch:reject,replaceGraph:reject}).toProject(),null,2)+'\n';
const path=new URL('../projects/graph-workspace/main-wave-author-project.json',import.meta.url);
if(process.argv.length===2)await writeFile(path,result);
else if(process.argv.length===3&&process.argv[2]==='--check'){
  if(await readFile(path,'utf8')!==result)throw new Error('Main Wave authored graph is stale');
}else throw new Error('usage: generate-main-wave-package.mjs [--check]');
