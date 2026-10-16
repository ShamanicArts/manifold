import { BrowserGraphHost, type EventAdmission, type GraphEvent, type MidiTrace } from '@manifold/author/browser';
import { createProject } from '@manifold/author/examples/transpose-audition';
declare const context: AudioContext;
const host = new BrowserGraphHost(context, { execution: 'prepared' });
const project = createProject(host);
const receipt: Promise<EventAdmission> = project.sendEvents([{ kind: 0, note: 60, offset: 64 }]);
const bend: GraphEvent = { nodeId: 4, kind: 3, note: 0, velocity: 64 };
const trace: Promise<MidiTrace> = host.readMidiTrace();
host.sendEventBatch([bend]);
// @ts-expect-error unsupported event kind
project.sendEvents([{ kind: 4 }]);
