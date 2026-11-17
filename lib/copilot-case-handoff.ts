import {cleanChatText} from './privacy-chat.ts';

const KEY='doctor-opus-consult-case-draft-v1';
const TTL=10*60*1000;
export type CaseDraftHandoff={question:string;caseId?:string};
export function storeSpecialistCaseDraft(question:string,caseId?:string,now=Date.now()):boolean{
 if(typeof window==='undefined')return false;
 // Only a local physician-reviewed draft. No automatic case analysis or upload.
 const cleaned=cleanChatText(question).text.trim().slice(0,6000);
 if(!cleaned)return false;
 const id=caseId&&/^[\w-]{1,80}$/.test(caseId)?caseId:undefined;
 try{window.sessionStorage.setItem(KEY,JSON.stringify({question:cleaned,caseId:id,created:now}));return true}
 catch{return false}
}
export function consumeSpecialistCaseDraft(expectedCaseId:string,now=Date.now()):CaseDraftHandoff|null{
 if(typeof window==='undefined')return null;
 try{
  const raw=window.sessionStorage.getItem(KEY);
  if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const x=value as Record<string,unknown>;
  if(typeof x.question!=='string'||!x.question.trim()||x.question.length>6000||
     typeof x.created!=='number'||now-x.created<0||now-x.created>TTL){
   window.sessionStorage.removeItem(KEY);return null;
  }
  if(typeof x.caseId==='string'&&x.caseId!==expectedCaseId)return null;
  window.sessionStorage.removeItem(KEY);
  return {question:x.question,caseId:typeof x.caseId==='string'?x.caseId:undefined};
 }catch{return null}
}
