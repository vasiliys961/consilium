import type {Locale} from '../../lib/locale.ts';
export const PROTOCOL_KINDS=[['encounter','Протокол приёма'],['cardiology','Кардиологический приём'],['ecg','Заключение ЭКГ'],['radiology','Протокол лучевого исследования'],['ultrasound','Протокол УЗИ'],['endoscopy','Протокол эндоскопии']] as const;
export type ProtocolKind=typeof PROTOCOL_KINDS[number][0];
export interface ProtocolDocument{id:string;created:string;locale:Locale;kind:ProtocolKind;sourceAnalysisId?:string;sourceSnapshot?:string;sections:{id:string;title:string;text:string}[];edited?:boolean;edition?:'ru'|'global';format?:'original'|'reasoning-draft'|'soap'|'diagnostic-report';nativeState?:Record<string,string>}
export function protocolText(document:ProtocolDocument){return document.sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');}
