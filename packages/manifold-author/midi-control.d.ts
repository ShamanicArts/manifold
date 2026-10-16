import type { ProjectEvent } from './live-project.js';
export function decodeMidiControl(data:ArrayLike<number>,owner?:string):ProjectEvent|null;
export class AuthoredMidiInput {
  constructor(send:(event:ProjectEvent)=>unknown|Promise<unknown>,onStatus?:(message:string)=>void);
  readonly input:MIDIInput|null;
  connect(requestAccess?:()=>Promise<MIDIAccess>):Promise<MIDIInput[]>;
  inputs():MIDIInput[];
  select(id:string|null):Promise<void>;
  disconnect():Promise<void>;
}
