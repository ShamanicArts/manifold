import type {CustomViewAPI} from './custom-view';
/** Existing kit sliders/choices bound to the authored presentation layout. */
export function mountControlPanel(element:HTMLElement,api:CustomViewAPI,options?:{variant?:'default'|'compact';accent?:string;background?:string;text?:string;fontSize?:number;showChoiceLabels?:boolean;height?:number;scales?:Record<string,'linear'|'log'>;formatters?:Record<string,(value:number)=>string>}):{dispose():void};

/** Renderer-projected CSS panel; corners are TL, TR, BR, BL in CSS pixels. */
export function placeProjectedPanel(element:HTMLElement,corners:readonly (readonly [number,number])[],dimensions:{width:number;height:number}):boolean;
