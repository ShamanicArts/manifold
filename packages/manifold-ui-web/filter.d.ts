export interface FilterState { mode:number; cutoff:number; resonance:number; }
export function mountFilterResponse(canvas:HTMLCanvasElement,parameter:(value:{cutoff:number;resonance:number})=>void):{paint():void;sync(state:FilterState):void;destroy():void};
export function mountMainFilter(get:(id:string)=>HTMLElement, parameter:(id:number,value:number)=>void,
  ids:{filterMode:number;filterCutoff:number;filterResonance:number}): {
    paint():void;snapshot():FilterState;sync(state:FilterState):void;restore(state:FilterState):void;sendDefaults():void;
  };
