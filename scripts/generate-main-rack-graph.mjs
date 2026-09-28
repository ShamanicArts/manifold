// Materialize a portable Graph host fixture from the authored Main rack.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialRackDocument } from '../web/src/state/rack-document.js';
import { compileMainRackAudio } from '../web/src/state/main-rack-graph.js';

const catalog = JSON.parse(readFileSync(resolve('projects/main-looper/rack.json'), 'utf8'));
const reference = JSON.parse(readFileSync(resolve('projects/graph-workspace/main-bank.json'), 'utf8'));
const signal = compileMainRackAudio(initialRackDocument(catalog), catalog);
const document = { format: 'manifold.project', schemaVersion: 1,
  projectId: 'manifold.graph-workspace', signal, targets: reference.targets };
const encoded = `${JSON.stringify(document, null, 2)}\n`;
for (const path of ['projects/main-looper/default-rack-graph.json',
  'web/public/main-rack-audio-project.json']) writeFileSync(resolve(path), encoded);
console.log(`Generated Main rack Graph project: ${signal.nodes.length} nodes, ${signal.connections.length} edges, ${signal.initialParameters.length} parameters`);
