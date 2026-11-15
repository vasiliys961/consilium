import type {ConductInput,CaseFile} from './conductor.ts';
export type PrivacyPrepared={body:ConductInput;removed:number;warnings:string[];excluded:string[];audioAvailable:boolean;manualImages?:Array<CaseFile&{reference?:boolean}>;token?:string};
export type ReviewedInput=ConductInput&{privacy?:{consent:boolean;token:string}};
export function transferFile(file:CaseFile):CaseFile{return {name:file.name,...(file.librarySource?{librarySource:file.librarySource}:{}),...(file.parent?{parent:file.parent}:{}),...(file.image?{image:file.image}:{}),...(file.text!==undefined?{text:file.text}:{}),...(file.audio?{audio:file.audio}:{}),...(file.masks?{masks:file.masks}:{}),...(file.imageProfile?{imageProfile:file.imageProfile}:{}),...(file.intakeNote?{intakeNote:file.intakeNote}:{})};}
