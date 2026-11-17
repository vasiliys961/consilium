import {cleanChatText} from './privacy-chat.ts';
import {SPECIALIST_PROFILES,type SpecialistId} from './specialist-profiles.ts';
import type {ConsultReply} from './specialist-options.ts';

/** The completed specialist-chat response, not a page-open or a proposed diagnosis.
 * Its SHA identifies the physician-approved text transcript, NOT original files. */
export interface SpecialistCaseReport{
 id:string;
 module:'specialist-chat';
 status:'completed-unsigned';
 specialty:SpecialistId;
 at:string;
 question:string;
 answer:string;
 model:string;
 inputKind:'reviewed-text';
 inputSha256:string;
 costUsd:number|null;
 costComplete:boolean;
 sources:Array<{title:string;url?:string;year?:number;pmid?:string}>;
}

const SHA=/^[a-f0-9]{64}$/;
export function validateSpecialistCaseReport(value:SpecialistCaseReport):boolean{
 return value.module==='specialist-chat'&&value.status==='completed-unsigned'
  &&SPECIALIST_PROFILES.some(item=>item.id===value.specialty)
  &&typeof value.id==='string'&&value.id.startsWith('specialist-')&&value.id.length<=80
  &&typeof value.question==='string'&&Boolean(value.question.trim())&&value.question.length<=3000
  &&typeof value.answer==='string'&&Boolean(value.answer.trim())&&value.answer.length<=48000
  &&typeof value.model==='string'&&value.model.length>0&&value.model.length<=200
  &&value.inputKind==='reviewed-text'&&SHA.test(value.inputSha256)
  &&Number.isFinite(Date.parse(value.at))
  &&(value.costUsd===null||(Number.isFinite(value.costUsd)&&value.costUsd>=0))
  &&typeof value.costComplete==='boolean'
  &&Array.isArray(value.sources)&&value.sources.length<=25
  &&value.sources.every(source=>typeof source.title==='string'&&source.title.length>0&&source.title.length<=500
   &&(source.url===undefined||(typeof source.url==='string'&&source.url.startsWith('https://')&&source.url.length<=2000))
   &&(source.year===undefined||(Number.isInteger(source.year)&&source.year>=1800&&source.year<=2200))
   &&(source.pmid===undefined&&(typeof source.pmid==='string'&&source.pmid.length<=50)));
}

export async function specialistCaseReport(
 specialty:SpecialistId,question:string,approvedTranscript:string,
 reply:ConsultReply,at=new Date().toISOString(),
):Promise<SpecialistCaseReport>{
 const cleanQuestion=cleanChatText(question).text.trim().slice(0,3000);
 const cleanAnswer=cleanChatText(reply.text).text.trim().slice(0,48000);
 if(!cleanQuestion||!cleanAnswer||!approvedTranscript.trim())throw Error('Ответ специалиста или проверенный вопрос отсутствует.');
 const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(approvedTranscript));
 const hash=Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');
 const idBuffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([hash,reply.model,cleanAnswer].join('\n')));
 const id='specialist-'+Array.from(new Uint8Array(idBuffer),byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32);
 const report:SpecialistCaseReport={
  id,module:'specialist-chat',status:'completed-unsigned',specialty,at,
  question:cleanQuestion,answer:cleanAnswer,model:reply.model,
  inputKind:'reviewed-text',inputSha256:hash,
  costUsd:reply.usageComplete&&Number.isFinite(reply.cost)&&reply.cost>=0?reply.cost:null,
  costComplete:reply.usageComplete,
  sources:reply.sources.slice(0,25).map(source=>({
   title:source.title.slice(0,500),
   ...(source.url?.startsWith('https://')?{url:source.url.slice(0,2000)}:{}),
   ...(typeof source.year==='number'?{year:source.year}:{}),
   ...(source.pmid?{pmid:String(source.pmid).slice(0,50)}:{}),
  })),
 };
 if(!validateSpecialistCaseReport(report))throw Error('Ответ специалиста не прошёл проверку для сохранения.');
 return report;
}
