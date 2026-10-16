import type { LiveProjectRuntime, LiveRequest, LiveSnapshot } from '@manifold/author/live-project';
export function createParameterGesture(runtime: Pick<LiveProjectRuntime,'snapshot'|'presentation'|'subscribe'>, request:(command:LiveRequest)=>Promise<unknown>, onError?:(error:unknown)=>void):{
  set(path:string,value:number,origin?:string,operation?:'parameter.set'|'control.set'):Promise<unknown>;
  setBatch(edits:{path:string,value:number}[],origin?:string,operation?:'parameter.set'|'control.set'):Promise<unknown>;
  present<T extends LiveSnapshot>(state:T):T;
  snapshot():LiveSnapshot;
  presentation():ReturnType<LiveProjectRuntime['presentation']>;
  subscribe(listener:(state:LiveSnapshot)=>void):()=>void;
  settled():Promise<void>;
  destroy():void;
};
