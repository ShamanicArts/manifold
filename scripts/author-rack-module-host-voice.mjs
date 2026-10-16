import { writeFileSync } from 'node:fs';
import { buildRackModuleHostGraph, createProject } from '../packages/manifold-author/examples/rack-module-host.mjs';

const project = createProject({
  setRoute: () => true,
  setParameter: () => true,
  setParameterBatch: () => true,
}, buildRackModuleHostGraph({ selection: 1 }));

const base = '/midi/synth/rack/osc/1';
for (const [path, value] of [
  [`${base}/waveform`, 6],
  [`${base}/voice/1/vOct`, 69],
  [`${base}/voice/1/fm`, 0.5],
  [`${base}/voice/1/pwCv`, 0.75],
  [`${base}/voice/1/gate`, 0.4],
]) await project.set(path, value);

const destination = new URL('../projects/graph-workspace/authored-rack-module-host-voice.json', import.meta.url);
writeFileSync(destination, `${JSON.stringify(project.toProject(), null, 2)}\n`);
