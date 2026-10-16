import type { Composition } from './composition.js';
import type { WebView } from './web-view.js';
import { GraphWorkspace, GraphWorkspaceProject } from './index.js';
export interface ControlMappingSession {
  toProject(): GraphWorkspaceProject;
  /** Synchronous candidate mutation; host publication is awaited atomically. */
  transaction(update:(graph:GraphWorkspace)=>void):void;
  parameterWithControl(edit:{nodeId:number;id:number;value:number},control:{path:string;value:number}):void;
  parametersWithControl(edits:{nodeId:number;id:number;value:number}[],control:{path:string;value:number}):void;
}
export interface EventMappingSession extends Omit<ControlMappingSession,'transaction'> { parameters(edits:{nodeId:number;id:number;value:number}[]):void; }
export interface ProjectEvent {type:string;note?:number;velocity?:number;channel?:number;owner?:string;[field:string]:unknown;}
export type EventMapping=(session:EventMappingSession,event:ProjectEvent,state:unknown)=>unknown;
export type ControlMapping=(session:ControlMappingSession,path:string,value:number)=>void;
export interface ComponentStyle { accent?:string; background?:string; text?:string; }
export interface PaintUI {
  parameter(path:string, options?:Partial<Component>):void;
  control(path:string, options?:Partial<Component>):void;
  label(text:string, id?:string, options?:Partial<Component>):void;
  curve(options:Omit<Component,'type'> & {points:[number,number][] }):void;
  keyboard(options?:Partial<Component>):void;
  filterResponse(base?:string, id?:string):void;
}
export interface Component { style?:ComponentStyle; height?:number; fontSize?:number; id: string; type: 'parameter' | 'control' | 'label' | 'filter-response' | 'keyboard' | 'curve'; path?: string; base?: string; label?: string; choices?: string[]; choiceValues?: number[]; unit?: string; group?: string; firstNote?:number; noteCount?:number; activeNotes?:number[]; points?:[number,number][]; color?:string; }
export interface ProjectFile {path:string; mediaType:string; encoding:'utf8'|'base64'; content:string;}
export interface ProjectFileInfo {path:string; mediaType:string; bytes:number; virtual?:boolean;}
export interface LiveProjectSave { format: 'manifold.live-project'; version: 1; source: string; files?:ProjectFile[]; composition?:Composition; graph: GraphWorkspaceProject; view: Component[]; network?:Record<string,unknown>; eventState?:unknown; eventStateSchema?:string|null; }
export interface LiveSnapshot { audioNodes:unknown[];audioEdges:unknown[];audioPalette:unknown[]; nodeSources: Record<string, import('./node-sources.js').NodeSource[]>; composition:Composition; presentationExecution:import('./composition.js').PresentationExecution; visualDefinitions:unknown[]; componentNodes:unknown[]; componentEdges:unknown[]; componentGroups:unknown[]; componentReferences:unknown[]; componentPalette:unknown[]; webView:WebView|null; editorGraph: Record<string,unknown>|null; files:ProjectFileInfo[]; network: Record<string,unknown> | null; revision: number; observationRevision: number; source: string; graph: GraphWorkspaceProject; view: Component[]; eventState:unknown; eventStateSchema:string|null; history: { origin: string; operation: string; revision: number; publicationMs: number; at: string }[]; undoDepth: number; running: boolean; diagnostics: unknown; }
export type LiveRequest = { operation: 'component.reference' | 'component.group' | 'component.ungroup' | 'component.wrap' | 'component.create' | 'component.define' | 'component.add' | 'component.remove' | 'component.update' | 'component.connect' | 'component.disconnect' | 'project.inspect' | 'project.save' | 'catalog.list' | 'file.list' | 'file.read' | 'file.write' | 'file.remove' | 'parameter.set' | 'parameter.batch' | 'control.set' | 'control.batch' | 'event.send' | 'event.midi' | 'network.configure' | 'network.receive' | 'source.apply' | 'project.restore' | 'project.undo' | 'graph.wrap' | 'graph.addInstance' | 'graph.add' | 'graph.addModule' | 'graph.remove' | 'graph.connect' | 'graph.disconnect' | 'graph.position' | 'graph.group' | 'graph.ungroup' | 'parameter.expose' | 'presentation.insert' | 'presentation.update'; scope?:string; group?:string; ids?:number[]; exposeParameters?:{id:number;parameter:string}[]; definitionId?:string; files?:ProjectFile[]; expectedContent?:string; expectedRevision?: number; origin?: string; type?:string; id?:number|string; paths?:string[]; label?:string; from?:string|number; output?:string; to?:string|number; input?:string; x?:number; y?:number; space?:'world'; definition?:Record<string,unknown>; changes?:Record<string,unknown>; accent?:string; width?:number; settings?:Record<string,unknown>; event?:ProjectEvent; bytes?:ArrayLike<number>; owner?:string; path?: string; value?: number; edits?:{path:string;value:number}[]; source?: string; project?: LiveProjectSave | GraphWorkspaceProject; newDocument?: boolean; mediaType?:string; encoding?:'utf8'|'base64'; content?:string; };
export interface LiveHost { ready: boolean; diagnostics?: unknown; setParameter(edit: { nodeId: number; id: number; value: number }): Promise<unknown>; setParameterBatch?(edits:{nodeId:number;id:number;value:number}[]):Promise<unknown>; replaceGraph(project: GraphWorkspaceProject): Promise<unknown>; updateMetadata?(project:GraphWorkspaceProject):Promise<unknown>; readPublishedParameters?(): { nodeId: number; id: number; value: number }[]; }
export function evaluateProjectSource(source: string, options?: { previous?: GraphWorkspaceProject }): { webView:WebView|null; graph: GraphWorkspace; project: GraphWorkspaceProject; view: Component[]; network: Record<string,unknown> | null; onNetwork: ((event:ProjectEvent, accepted:LiveSnapshot)=>unknown)|null; paint: unknown; onControl: ControlMapping | null;reconcile:((graph:GraphWorkspace,previous:GraphWorkspaceProject)=>void)|null;onEvent:EventMapping|null;eventState:unknown;eventStateSchema:string|null };
export class LiveProjectRuntime {
  constructor(host: LiveHost | null, source: string, saved?: LiveProjectSave | null);
  readonly revision: number; readonly source: string; readonly project: GraphWorkspaceProject;
  subscribe(listener: (state: LiveSnapshot) => void): () => void;
  snapshot(): LiveSnapshot; frame(): Component[];
  /** Reuse an accepted subscription snapshot for read-only frame rendering. */
  presentation(accepted?: LiveSnapshot): LiveSnapshot & {catalog:Record<string,unknown>;components:Component[];parameters:{path:string;min:number;max:number;default:number;value:number;operation?:string;discrete?:boolean}[]};
  request(request: LiveRequest): Promise<LiveSnapshot | unknown>;
  save(): LiveProjectSave;
  adoptPublishedParameters(edits: { nodeId: number; id: number; value: number }[]): GraphWorkspaceProject;
}
