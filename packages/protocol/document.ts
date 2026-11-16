import type {Locale} from '../../lib/locale.ts';
export const PROTOCOL_KINDS=[['encounter','Протокол приёма'],['cardiology','Кардиологический приём'],['ecg','Заключение ЭКГ'],['radiology','Протокол лучевого исследования'],['ultrasound','Протокол УЗИ'],['endoscopy','Протокол эндоскопии']] as const;
export type ProtocolKind=typeof PROTOCOL_KINDS[number][0];
/** Independent print/read layouts from one validated case interpretation. */
export type ProtocolPresentation='original-analysis'|'narrative'|'formal'|'soap';
export interface ProtocolDocument{id:string;created:string;locale:Locale;kind:ProtocolKind;sourceAnalysisId?:string;sourceSnapshot?:string;ambientSource?:{kind:'transcript';speakerAssignment:'unverified';segments:{id:string;text:string}[]};generationMode?:'from-analysis'|'standalone'|'from-protocol';sourceProtocolId?:string;presentation?:ProtocolPresentation;sections:{id:string;title:string;text:string}[];edited?:boolean;edition?:'ru'|'global';format?:'original'|'reasoning-draft'|'soap'|'diagnostic-report';nativeState?:Record<string,string>}
export function protocolText(document:ProtocolDocument){return document.sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');}
