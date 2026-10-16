import type { LiveSnapshot, LiveRequest, LiveProjectRuntime } from '@manifold/author/live-project';
import type { WebView, PresentationControl } from '@manifold/author/web-view';
/** Presentation telemetry only. Bands are 32 log-spaced values over 20 Hz–Nyquist, normalized -72…0 dB. */
export interface AudioAnalysis { rms:number; bands?:ArrayLike<number>; peakHz?:number; sampleRate?:number; }
export interface CustomViewAPI {
  readonly layout:PresentationControl[];
  subscribe(listener:(state:LiveSnapshot)=>void):()=>void;
  snapshot():LiveSnapshot;
  value(path:string):number|undefined;
  set(path:string,value:number):Promise<unknown>;
  setBatch(edits:{path:string,value:number}[]):Promise<unknown>;
  request(command:LiveRequest):Promise<unknown>;
  /** Resolve an embedded image or SVG to a URL in browser and native hosts. */
  assetUrl(path:string):Promise<string>;
  analysis():AudioAnalysis|null;
}
export interface CustomViewInstance {update?(state:LiveSnapshot):void;updateLayout?(state:LiveSnapshot):void;dispose():void;}
export function mountCustomView(element:HTMLElement,definition:WebView,runtime:Pick<LiveProjectRuntime,'snapshot'|'subscribe'> & Partial<Pick<LiveProjectRuntime,'request'>>,options?:{
  modules?:Record<string,{version:string;load:()=>Promise<Record<string,unknown>>}>;
  request?:(command:LiveRequest)=>Promise<unknown>;
  analysis?:()=>AudioAnalysis|null;
  onError?:(error:unknown)=>void;
}):Promise<{updateDefinition(definition:WebView):boolean;dispose():void}>;
