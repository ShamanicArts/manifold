// Materialize a portable Graph host fixture from the authored Main rack.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialRackDocument, addRackModule, connectRackPorts } from '../web/src/state/rack-document.js';
import { compileMainRackAudio, compileMainRackInsert } from '../web/src/state/main-rack-graph.js';

const catalog = JSON.parse(readFileSync(resolve('projects/main-looper/rack.json'), 'utf8'));
const reference = JSON.parse(readFileSync(resolve('projects/graph-workspace/main-bank.json'), 'utf8'));
function writeProject(rack, paths, insert = false) {
  const signal = insert ? compileMainRackInsert(rack, catalog) : compileMainRackAudio(rack, catalog);
  const document = { format: 'manifold.project', schemaVersion: 1,
    projectId: 'manifold.graph-workspace', signal,
    ...(!insert ? { targets: reference.targets } : {}) };
  const encoded = `${JSON.stringify(document, null, 2)}\n`;
  for (const path of paths) writeFileSync(resolve(path), encoded);
  console.log(`Generated Main rack Graph project: ${signal.nodes.length} nodes, ${signal.connections.length} edges, ${signal.initialParameters.length} parameters`);
}

const baseRack = initialRackDocument(catalog);
writeProject(baseRack, ['projects/main-looper/default-rack-graph.json',
  'web/public/main-rack-audio-project.json']);
writeProject(baseRack, ['projects/main-looper/default-rack-insert.json',
  'web/public/main-rack-insert-project.json'], true);

let cvRack = addRackModule(baseRack,
  { id: 'lfo1', nodeId: 11, type: 'lfo', row: 2, col: 0, w: 1, h: 1 }, catalog);
cvRack = connectRackPorts(cvRack, { moduleId: 'lfo1', portId: 'out' },
  { moduleId: 'filter', portId: 'cutoff' }, catalog);
for (const path of ['projects/main-looper/lfo-filter-rack.json',
  'web/public/main-rack-cv-rack.json']) {
  writeFileSync(resolve(path), `${JSON.stringify(cvRack, null, 2)}\n`);
}
writeProject(cvRack, ['projects/main-looper/lfo-filter-rack-graph.json',
  'web/public/main-rack-cv-project.json']);
writeProject(cvRack, ['projects/main-looper/lfo-filter-rack-insert.json',
  'web/public/main-rack-cv-insert-project.json'], true);
