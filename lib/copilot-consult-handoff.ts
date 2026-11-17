import {cleanChatText} from './privacy-chat.ts';

const KEY='doctor-opus-copilot-consult-v1';
const TTL=10*60*1000;

/** One-time local draft handoff. Never embed a patient question in a URL.
 * No clinical model is called until the physician explicitly submits on /consult.
 */
export function storeCopilotConsultDraft(question:string,now=Date.now()):boolean{
 if(typeof window==='undefined')return false;
 const text=cleanChatText(question).text.trim().slice(0,3000);
 if(!text)return false;
 try{window.sessionStorage.setItem(KEY,JSON.stringify({text,created:now}));return true;}
 catch{return false}
}
export function consumeCopilotConsultDraft(now=Date.now()):string|null{
 if(typeof window==='undefined')return null;
 try{
  const raw=window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  if(!raw)return null;
  const data:unknown=JSON.parse(raw);
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  const x=data as Record<string,unknown>;
  if(typeof x.text!=='string'||!x.text.trim()||x.text.length>3000||
     typeof x.created!=='number'||now-x.created<0||now-x.created>TTL)return null;
  return x.text;
 }catch{return null}
}
