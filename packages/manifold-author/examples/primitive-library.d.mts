export interface PrimitiveProgram {readonly id:string;readonly label:string;readonly description:string;readonly reference:string|null;readonly source:string;}
export const programs:readonly PrimitiveProgram[];
export function getProgram(id:string):PrimitiveProgram;
