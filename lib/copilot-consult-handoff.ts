import {cleanChatText} from './privacy-chat.ts';
import {SPECIALIST_PROFILES,type SpecialistId} from './specialist-profiles.ts';

const KEY='doctor-opus-copilot-consult-v1';
const TTL=10*60*1000;
export type ConsultHandoff={text:string;specialty:SpecialistId;caseId?:string};
function validSpecialty(value:unknown):SpecialistId{
 return typeof value==='string'&&SPECIALIST_PROFILES.some(profile=>profile.id===value)
  ?value as SpecialistId:'universal';
}
function validCaseId(value:unknown):string|undefined{
 return typeof value==='string'&&/^[\w-]{1,80}$/.test(value)?value:undefined;
}
/** One-time local draft handoff. Never embed clinical text in a URL.
 * Clinical consultation is NOT launched until the physician explicitly asks.
 */
export function storeCopilotConsultDraft(
 question:string,now=Date.now(),options?:{specialty?:SpecialistId;caseId?:string},
):boolean{
 if(typeof window==='undefined')return false;
 const text=cleanChatText(question).text.trim().slice(0,3000);
 if(!text)return false;
 try{
  window.sessionStorage.setItem(KEY,JSON.stringify({
   text,created:now,specialty:validSpecialty(options?.specialty),caseId:validCaseId(options?.caseId),
  }));
  return true;
 }catch{return false}
}
export function consumeCopilotConsultDraft(now=Date.now()):ConsultHandoff|null{
 if(typeof window==='undefined')return null;
 try{
  const raw=window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const x=value as Record<string,unknown>;
  if(typeof x.text!=='string'||!x.text.trim()||x.text.length>3000||
     typeof x.created!=='number'||now-x.created<0||now-x.created>TTL)return null;
  return {text:x.text,specialty:validSpecialty(x.specialty),caseId:validCaseId(x.caseId)};
 }catch{return null}
}
