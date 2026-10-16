export interface PresentationControl {path:string;x:number;y:number;width:number;id?:string;label?:string;accent?:string;compact?:{x:number;y:number;width:number};}
export interface WebView {version:1;source:string;dependencies:Record<string,string>;height?:number;role?:'visual'|'instrument';layout?:PresentationControl[];}
export function validateWebView(value:WebView|null|undefined):WebView|null;
export function replaceWebViewSource(projectSource:string,viewSource:string):string;
export function replacePresentationLayout(projectSource:string,layout:PresentationControl[]):string;
