import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createProject} from '../packages/manifold-author/examples/live-main-wave-controller.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),check=process.argv.includes('--check');
const statePath=root+'projects/main-wave/live-project.json';
const state=JSON.stringify(createProject(null).toProject(),null,2)+'\n';
if(check){if(await readFile(statePath,'utf8')!==state)throw Error('Main Wave creator state is stale');}
else {await mkdir(root+'projects/main-wave',{recursive:true});await writeFile(statePath,state);}
const result=spawnSync(process.execPath,['scripts/build-project-package.mjs','manifold.main-wave-creator','0.2.0','projects/main-wave/live-controller.bundle.js','projects/main-wave/live-project.json','web/public/packages/main-wave-creator.manifold.json',...(check?['--check']:[])],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
