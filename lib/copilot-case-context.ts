import type {ClinicalCase} from './casebook.ts';
import {caseContext,caseSignature} from './casebook.ts';
import {cleanChatText} from './privacy-chat.ts';
/** Identity matching is local only. No patient name or search term is sent to a model. */
export function localCaseCommand(text:string):string|null{
 const match=text.trim().match(/^(?:открой(?:те)?|найди(?:те)?|open|find)\s+(?:пациента?|случай|карту|patient|case)\s*(.*)$/i);
 return match?match[1].trim():null;
}
export function matchingLocalCases(query:string,cases:readonly ClinicalCase[]):ClinicalCase[]{
 const needle=query.toLocaleLowerCase().replace(/[.,!?]+$/,'').trim();
 if(!needle)return [];
 return cases.filter(value=>!value.deletedAt&&[value.id,value.number?.toString(),value.title,value.privatePatient?.name,value.privatePatient?.identifiers].some(part=>part?.toLocaleLowerCase().includes(needle)));
}
export function withoutCaseIdentity(text:string,value:ClinicalCase):string{
 let clean=text;
 const identity=value.privatePatient;
 for(const item of [identity?.name,identity?.birthDate,identity?.identifiers,identity?.dates]){
  if(!item?.trim())continue;
  for(const part of [item,...item.split(/[\s,;]+/).filter(part=>part.length>=3)])clean=clean.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'),'[patient]');
 }
 return cleanChatText(clean).text;
}
export function copilotCaseContext(value:ClinicalCase):string{
 const context=withoutCaseIdentity(caseContext(value),value).slice(0,2200);
 return ['Active case: '+(value.status==='active'?'open':'closed'),context,
  'Available materials: '+value.files.slice(0,20).map((file,i)=>`material-${i+1}: ${file.text?'text':file.image?'image':'module file'}`).join('; '),
  'Completed clinical analysis: '+(value.analyses[0]?.result.clinicalDraft==='generated'&&value.analyses[0]?.inputSignature===caseSignature(value)?'yes':'no')].join('\n');
}
