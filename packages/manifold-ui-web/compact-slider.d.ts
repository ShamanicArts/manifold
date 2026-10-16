export interface SliderSpec {label?:string;min?:number;max?:number;step?:number;value?:number;suffix?:string;showValue?:boolean;bidirectional?:boolean;fitLabel?:boolean;fontSize?:number;scale?:'linear'|'log';format?:(value:number)=>string;style:{colour:string;bg:string;text?:string};}
export function mountCompactSlider(element:HTMLElement,spec:SliderSpec):{
  setValue(value:number,emit?:boolean):void;setLabel(label:string):void;setStyle(style:SliderSpec['style']):void;onChange(callback:(value:number)=>void):void;paint():void;
};
export function rgba(colour:number|string):string;
export function brighten(hex:string,amount:number):string;
