import type { GraphWorkspace, GraphWorkspaceProject } from './index.js';
export interface StudioGraphEdits {
  nodes: { type:string; id:number; path:string }[];
  connections: { from:string|null; output?:string; to:string; input:string }[];
  removed: string[];
  layout: { path:string; x:number; y:number }[];
  audioGraphs?: StudioAudioGraphs;
  modules?: {id:number;path:string;definition:StudioModuleDefinition}[];
}
export interface StudioModuleDefinition {id:string;label:string;version:number;nodes:{key:string;type:string;config?:Record<string,unknown>}[];connections:{from:string;output:string;to:string;input:string}[];inputs:{name:string;node:string;port:string}[];outputs:{name:string;node:string;port:string}[];parameters?:{name:string;node:string;parameter:string;label?:string;min:number;max:number;default:number;choices?:string[]}[]}
export function validateStudioModule(definition:unknown):StudioModuleDefinition;
export function applyStudioGraph(graph:GraphWorkspace, edits:StudioGraphEdits):GraphWorkspace;
export function readStudioGraph(source:string):{ declaration:unknown; value:StudioGraphEdits };
export function planStudioGraphEdit(source:string, command:Record<string,unknown>, project:GraphWorkspaceProject):string;

/** Saved authoring hierarchy; flattened to the normal GraphWorkspace contract. */
export interface StudioAudioGraphs {
  version:1;
  definitions:StudioAudioGraphDefinition[];
  instances:{path:string;definition:string;label?:string;nodes?:Record<string,{id:number;path:string;adopt?:boolean}>}[];
}
export interface StudioAudioGraphDefinition {
  id:string;label:string;
  nodes:({key:string;type:string;config?:Record<string,number>;values?:{name:string;value:number}[]}|{key:string;definition:string})[];
  connections:{from:string;output:string;to:string;input:string}[];
  inputs:{name:string;node:string|null;port:string;signal:string}[];
  outputs:{name:string;node:string|null;port:string;signal:string}[];
  parameters:{name:string;node:string;parameter:string;label?:string;min?:number;max?:number;default?:number;choices?:string[]}[];
}
