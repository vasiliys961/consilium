import type {ConductInput} from './conductor.ts';
import type {ReviewedInput} from './privacy-types.ts';
import {CHAT_TEXT_PURPOSE} from './privacy-chat.ts';
export type ReviewRequest={body:ConductInput;purpose?:'chat-audio';resolve:(body:ReviewedInput)=>void;reject:(error:Error)=>void};
export function reviewBeforeSending(body:ConductInput,purpose?:ReviewRequest['purpose']):Promise<ReviewedInput>{
 if(typeof window==='undefined')return Promise.reject(Error('Для отправки требуется проверка врачом.'));
 return new Promise((resolve,reject)=>{const event=new CustomEvent<ReviewRequest>('concilium-privacy-review',{cancelable:true,detail:{body,purpose,resolve,reject}});window.dispatchEvent(event);if(!event.defaultPrevented)reject(Error('Окно проверки данных недоступно. Перезагрузите приложение.'));});
}

export async function prepareChatSend(body: Pick<ConductInput,'text'|'locale'|'sourceLocale'|'externalSearch'>, signal: AbortSignal): Promise<ReviewedInput> {
 const response=await fetch('/api/privacy/prepare',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({body,purpose:CHAT_TEXT_PURPOSE,consent:true}),
  signal,
 });
 if(!response.ok)throw Error('Не удалось подготовить текст к отправке.');
 const prepared=await response.json() as {body?:ConductInput;token?:string};
 if(!prepared.body||typeof prepared.token!=='string')throw Error('Не удалось подготовить текст к отправке.');
 return {...prepared.body,privacy:{consent:true,token:prepared.token}};
}
