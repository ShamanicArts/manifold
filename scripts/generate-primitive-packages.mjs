import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {programs} from '../packages/manifold-author/examples/primitive-library.mjs';
import {createLiveCreatorProject} from '../packages/manifold-author/examples/live-filter-controller.mjs';
const check=process.argv.includes('--check');
for(const dir of ['projects/dsp-live-scripting/primitives','web/public/packages/primitives'])await mkdir(dir,{recursive:true});
for(const program of programs){
  const statePath=`projects/dsp-live-scripting/primitives/${program.id}.json`;
  const content=JSON.stringify(createLiveCreatorProject(null,program.source).toProject(),null,2)+'\n';
  if(check){if(await readFile(statePath,'utf8')!==content)throw Error(`Stale primitive source: ${program.id}`);}
  else await writeFile(statePath,content);
  const result=spawnSync(process.execPath,['scripts/build-project-package.mjs','manifold.primitive.'+program.id,'0.1.0','projects/dsp-live-scripting/live-controller.bundle.js',statePath,`web/public/packages/primitives/${program.id}.manifold.json`,...(check?['--check']:[])],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
