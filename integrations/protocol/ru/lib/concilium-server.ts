import {withProtocolFactuality} from './concilium-factuality.ts';
/** Server-only receipt observer. Original clinical response bodies are never logged. */
export function installProtocolObserver(){
 const state=globalThis as typeof globalThis&{__conciliumProtocolFetch?:boolean};if(state.__conciliumProtocolFetch)return;state.__conciliumProtocolFetch=true;
 const original=fetch;
 globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(!url.includes('/chat/completions')||typeof init?.body!=='string')return original(input,init);
  let payload:any;try{payload=JSON.parse(init.body);}catch{return original(input,init);}
  const runId=crypto.randomUUID(),started=Date.now(),model=String(payload.model??'other'),provider=url.includes('polza.ai')?'polza':'openrouter';
  const emit=(event:string,fields:Record<string,unknown>={})=>console.log('CONCILIUM_MODEL '+JSON.stringify({event,runId,model,provider,...fields}));
  emit('model.started');
  try{const response=await original(input,{...init,body:JSON.stringify(withProtocolFactuality(payload))});
   if(!response.ok){emit('model.responded',{httpStatus:response.status,durationMs:Date.now()-started,usageAvailable:false});return response;}
   const copy=response.clone();void (async()=>{
    let usage:any=null,finishReason:string|null=null;
    if(copy.headers.get('content-type')?.includes('text/event-stream')){
     const reader=copy.body?.getReader();if(reader){const decoder=new TextDecoder();let buffer='',bytes=0;
      try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2000000)break;buffer+=decoder.decode(part.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let at:number;
       while((at=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,at);buffer=buffer.slice(at+2);const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');try{const v=JSON.parse(data);if(v.usage)usage=v.usage;if(v.choices?.[0]?.finish_reason)finishReason=v.choices[0].finish_reason;}catch{}}
      }}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
     }
    }else{const reader=copy.body?.getReader();if(reader){const chunks:Uint8Array[]=[];let length=0;try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2000000)break;chunks.push(part.value);}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}if(length<=2000000){const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{const v=JSON.parse(new TextDecoder().decode(bytes));usage=v.usage;finishReason=v.choices?.[0]?.finish_reason??null;}catch{}}}}
    emit('model.responded',{httpStatus:response.status,durationMs:Date.now()-started,finishReason,inputTokens:usage?.prompt_tokens??0,outputTokens:usage?.completion_tokens??0,usageAvailable:typeof usage?.prompt_tokens==='number'&&typeof usage?.completion_tokens==='number'});
   })().catch(()=>emit('model.failed',{durationMs:Date.now()-started}));return response;
  }catch(error){emit('model.failed',{durationMs:Date.now()-started});throw error;}
 };
}
