import {reviewBeforeSending} from './privacy-client.ts';
/** SSE transport adapted to the maternal Opus streaming contract. No telemetry contains text deltas. */
import type {CaseResult,ConductInput} from './conductor.ts';
export type AnalysisProgressEvent={event:string;runId:string;at:string;[key:string]:unknown};
export async function* sseEvents(body:ReadableStream<Uint8Array>):AsyncGenerator<{event:string;data:string}>{
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let at:number;while((at=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);const lines=block.split('\n');const data=lines.filter(x=>x.startsWith('data:')).map(x=>x.slice(5).replace(/^ /,'')).join('\n');if(data)yield {event:lines.find(x=>x.startsWith('event:'))?.slice(6).trim()||'message',data};}if(done)break;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function previewText(raw:string):string{
 const match=raw.match(/"(?:summary|reading|text)"\s*:\s*"((?:\\.|[^"\\])*)/);
 if(match){try{return JSON.parse('"'+match[1].replace(/\\(?:u[0-9a-f]{0,3})?$/i,'')+'"').slice(0,24000);}catch{return '';}}
 return /^[\s]*[\[{]/.test(raw)?'':raw.slice(0,24000);
}
export async function collectChatStream(response:Response,onText:(text:string)=>void):Promise<Response>{
 if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))return response;
 let text='',model='',finish:string|null=null,usage:Record<string,unknown>={};
 for await(const event of sseEvents(response.body)){
  if(event.data==='[DONE]'){break;}
  let value:any;try{value=JSON.parse(event.data);}catch{continue;}
  // Keep provider details available to the gateway's compatibility retry. Never
  // return previously accumulated text as a successful reply after an error.
  if(value.error||value.choices?.[0]?.finish_reason==='error')return Response.json({model:value.model||model,error:value.error??{code:'stream_error'},choices:[{message:{content:''},finish_reason:'error'}],usage:value.usage??usage});
  if(value.model)model=value.model;if(value.usage)usage=value.usage;
  const choice=value.choices?.[0];if(choice?.finish_reason)finish=choice.finish_reason;
  const content=choice?.delta?.content;if(typeof content==='string'){text+=content;onText(text);}
 }
 await response.body.cancel().catch(()=>{});
 return new Response(JSON.stringify({model,choices:[{message:{content:text},finish_reason:finish??'length'}],usage}),{status:200,headers:{'content-type':'application/json'}});
}
export async function requestStreamedJson<T>(url:string,body:unknown,options:{signal?:AbortSignal;onProgress?:(event:AnalysisProgressEvent)=>void;onPreview?:(text:string)=>void;fetch?:typeof fetch}={}):Promise<T>{
 if(url==='/api/protocol'){const value=body as Record<string,unknown>;const approved=await reviewBeforeSending({text:String(value.source??'')});body={...value,source:approved.text,privacyReview:approved};}
 const response=await (options.fetch??fetch)(url,{method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream'},body:JSON.stringify(body),signal:options.signal});
 if(response.status===428){const value=await response.clone().json().catch(()=>null);if(value?.error==='gemini_choice_required'){window.dispatchEvent(new CustomEvent('concilium-gemini-choice-required',{detail:value.policy}));throw new Error('Выберите модель Gemini в открывшемся окне и повторите разбор.');}}
 if(!response.ok)throw new Error(`Разбор не выполнен (HTTP ${response.status}).`);
 if(!response.headers.get('content-type')?.includes('text/event-stream'))return response.json();
 if(!response.body)throw new Error('Поток ответа недоступен.');
 let serverFailure:string|undefined;
 try {
  for await(const event of sseEvents(response.body)){
   let value:unknown;try{value=JSON.parse(event.data);}catch{continue;}
   if(event.event==='progress'&&value&&typeof value==='object')options.onProgress?.(value as AnalysisProgressEvent);
   if(event.event==='preview'&&value&&typeof value==='object')options.onPreview?.(String((value as {text?:unknown}).text??''));
   if(event.event==='result'){
    // The server emits result only after completing analysis. This is the terminal
    // commit point: a dropped TCP connection while closing the stream must not
    // discard a complete response or provoke a second paid inference.
    if(!value||typeof value!=='object'||Array.isArray(value)){serverFailure='Сервис вернул неверный формат результата.';break;}
    return value as T;
   }
   if(event.event==='error'){
    serverFailure=value&&typeof value==='object'&&(value as {code?:unknown}).code==='deadline'
      ? 'Превышено время разбора.'
      : 'Не удалось завершить разбор. Сохраните материалы и повторите запрос.';
    break;
   }
  }
 } catch(error) {
  if(options.signal?.aborted)throw error;
  throw new Error('Соединение прервалось до получения завершённого результата. Предварительный текст не является заключением.');
 }
 if(serverFailure)throw new Error(serverFailure);
 throw new Error('Соединение закрыто до получения итогового ответа. Предварительный текст не является заключением.');
}

/** Runtime check: TypeScript's generic T does not validate a network payload. */
export function isCaseResultEnvelope(value:unknown):value is CaseResult {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Partial<CaseResult>;
 return (v.clinicalDraft==='generated'||v.clinicalDraft==='unavailable')
  && v.draft?.status==='unsigned'&&typeof v.draft.summary==='string'
  && Array.isArray(v.draft.statements)&&Array.isArray(v.ledger)
  && Array.isArray(v.voices)&&Array.isArray(v.unassessed)
  && Array.isArray(v.citations)&&Array.isArray(v.readings)
  && typeof v.gateway?.called==='boolean'
  && typeof v.cost?.totalUsd==='number'&&Number.isFinite(v.cost.totalUsd);
}

export async function requestAnalysis(body:ConductInput,options:Parameters<typeof requestStreamedJson>[2]={}){
 const reviewed=await reviewBeforeSending(body);
 const result=await requestStreamedJson<unknown>('/api/v1/cases',reviewed,options);
 if(!isCaseResultEnvelope(result))throw new Error('Сервис вернул неполный результат разбора. Черновик не сохранён как заключение.');
 return result;
}
