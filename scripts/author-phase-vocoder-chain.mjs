import { writeFileSync } from 'node:fs';
import { buildGraph } from '../packages/manifold-author/examples/phase-vocoder-chain.mjs';

const destination = new URL('../projects/graph-workspace/authored-phase-vocoder-chain.json', import.meta.url);
writeFileSync(destination, `${JSON.stringify(buildGraph().toProject(), null, 2)}\n`);
