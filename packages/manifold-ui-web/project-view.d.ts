import type { LiveProjectRuntime, LiveRequest } from '@manifold/author/live-project';
export function mountProjectView(element:HTMLElement,runtime:LiveProjectRuntime,options?:{
  request?:(command:LiveRequest)=>Promise<unknown>;onError?:(error:Error)=>void;
}):{paint():void;destroy():void};
