import type {ProjectFile, ProjectFileInfo} from './live-project.js';
export function projectFilePath(path:string):string;
export function projectFileType(path:string):{mediaType:string;encoding:'utf8'|'base64'};
export function validateProjectFiles(entries?:ProjectFile[]):ProjectFile[];
export function projectFileManifest(files:ProjectFile[],source:string,presentation?:string|null):ProjectFileInfo[];
export function projectFileDataUrl(file:ProjectFile):string;
