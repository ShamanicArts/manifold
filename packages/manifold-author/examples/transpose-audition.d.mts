import type { GraphWorkspace, GraphWorkspaceProject, LiveGraphSession } from '../index.js';
import type { BrowserGraphHost, GraphEvent, EventAdmission } from '../browser.js';
export const TRANSPOSE_PATH: '/midi/synth/rack/transpose/1/semitones';
export const INPUT_PATH: '/transpose/audition/nodes/midi_input';
export const EFFECT_PATH: '/midi/synth/rack/transpose/1/nodes/effect';
export const VOICE_PATH: '/transpose/audition/nodes/voice';
export function buildGraph(): GraphWorkspace;
export function createProject(host: Pick<BrowserGraphHost, 'setRoute' | 'setParameter' | 'setParameterBatch' |
  'replaceGraph' | 'readPublishedParameters' | 'sendEventBatch'>, graph?: GraphWorkspace): Readonly<{
  session: LiveGraphSession;
  toProject(): GraphWorkspaceProject;
  synchronizeParameters(): Promise<GraphWorkspaceProject>;
  set(path: string, value: number): Promise<GraphWorkspaceProject>;
  sendEvents(events: readonly Omit<GraphEvent, 'nodeId'>[]): Promise<EventAdmission>;
  setInsert(enabled: boolean, mix?: number): Promise<GraphWorkspaceProject>;
}>;
