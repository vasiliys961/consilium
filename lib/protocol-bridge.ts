import {LOCALES,parseLocale} from './locale.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';
export type ProtocolEdition='ru'|'en';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function protocolDocumentMessage(input:unknown,session:string,edition:ProtocolEdition):ProtocolDocument|null{
 if(!input||typeof input!=='object'||!UUID.test(session))return null;
 const value=input as Record<string,unknown>;
 if(value.type!=='concilium.protocol.document'||value.session!==session||typeof value.id!=='string'||!UUID.test(value.id)||typeof value.text!=='string'||!value.text.trim()||value.text.length>100000||/^(Ошибка|Error):/i.test(value.text.trim()))return null;
 if(typeof value.source!=='string'||value.source.length>100000)return null;
 if(edition==='en'&&value.locale!==undefined&&!LOCALES.some(item=>item.code===value.locale&&item.code!=='ru'))return null;
 if(edition==='en'&&value.format!==undefined&&!['reasoning-draft','soap','diagnostic-report'].includes(String(value.format)))return null;
 const localeValue=edition==='ru'?'ru':parseLocale(value.locale??'en');if(edition==='en'&&localeValue==='ru')return null;
 let nativeState:Record<string,string>|undefined;if(edition==='en'&&value.state&&typeof value.state==='object'&&!Array.isArray(value.state)){nativeState={};for(const key of ['reasoningDraft','finalNote','physicianAdditions','templateId','specialistName','customTemplate','universalPrompt']){const field=(value.state as Record<string,unknown>)[key];if(typeof field!=='string'||field.length>100000)return null;nativeState[key]=field;}if(Object.values(nativeState).reduce((n,s)=>n+s.length,0)>200000)return null;}
 const format=edition==='ru'?'original':value.format==='soap'?'soap':value.format==='diagnostic-report'?'diagnostic-report':'reasoning-draft';
 return {edition:edition==='ru'?'ru':'global',format,...(nativeState?{nativeState}:{}),id:value.id,created:new Date().toISOString(),kind:'encounter',locale:localeValue,sourceSnapshot:value.source,sections:[{id:'native',title:edition==='ru'?'Протокол приёма':format==='soap'?'SOAP note':format==='diagnostic-report'?'Diagnostic report':'Diagnostic reasoning draft',text:value.text.trim()}],edited:true};
}
/** A saved whole-text note must not acquire another wrapper heading on every reopening. */
export function nativeProtocolText(document:ProtocolDocument|undefined):string{
 if(!document)return '';
 if(document.sections.length===1&&document.sections[0].id==='native')return document.sections[0].text;
 return document.sections.map(section=>section.title+'\n'+section.text).join('\n\n');
}

export function protocolForEdition(documents:readonly ProtocolDocument[]|undefined,edition:ProtocolEdition,locale?:string):ProtocolDocument|undefined{
 return documents?.find(doc=>{
  if(edition==='ru')return doc.locale==='ru'&&(doc.edition==='ru'||!doc.edition);
  if(doc.edition==='ru'||doc.locale==='ru')return false;
  return (doc.edition==='global'||!doc.edition)&&(!locale||doc.locale===locale);
 });
}

export function shouldSwitchProtocolLanguage(next:string,currentLanguage:string,edition:ProtocolEdition,documentLanguage:string):boolean{return next!==currentLanguage||(next==='ru'?'ru':'en')!==edition||next!==documentLanguage;}
