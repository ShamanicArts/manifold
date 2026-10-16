// Reproducible public creator package, from the same authored source as the UI.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createProject} from '../packages/manifold-author/examples/live-oscillator-controller.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),check=process.argv.includes('--check');
const statePath=root+'projects/standalone-oscillator/live-project.json';
const state=JSON.stringify(createProject(null).toProject(),null,2)+'\n';
if(check){if(await readFile(statePath,'utf8')!==state)throw Error('Oscillator creator state is stale');}
else await writeFile(statePath,state);
const result=spawnSync(process.execPath,['scripts/build-project-package.mjs','manifold.oscillator-creator','0.4.2','projects/standalone-oscillator/live-controller.bundle.js','projects/standalone-oscillator/live-project.json','web/public/packages/oscillator-creator.manifold.json',...(check?['--check']:[])],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
