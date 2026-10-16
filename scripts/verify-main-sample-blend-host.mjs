import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BrowserAudioHost } from '../web/src/audio/browser-host.js';

const project = JSON.parse(readFileSync('projects/main-sample-blend/project.json', 'utf8'));
const messages = [];
const host = new BrowserAudioHost(() => {});
host.parameters = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
host.processor = { port: { postMessage: (message) => messages.push(message) } };
host.setParameter(0, 330);
assert.deepEqual(messages, [
  { type: 'parameter', nodeId: 3, id: 0, value: 330 },
  { type: 'parameter', nodeId: 13, id: 0, value: 330 },
]);
messages.length = 0;
host.setParameter(1, .4);
assert.deepEqual(messages, [
  { type: 'parameter', nodeId: 3, id: 1, value: .4 },
  { type: 'parameter', nodeId: 13, id: 1, value: .4 },
]);
messages.length = 0;
host.setParameter(17, -.5);
assert.deepEqual(messages, [{ type: 'parameter', nodeId: 14, id: 0, value: -.5 }]);
console.log('Main host: shared additive pitch/level reach both banks; Add position reaches crossfader');
