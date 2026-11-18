import {collectChatStream,previewText} from './analysis-stream.ts';
import {terminalEvent,writeTerminalEvent} from './telemetry.ts';
import {caseQueue} from './queue.ts';
import {priceUsd,chargeForCall} from './cost.ts';
type ReportProgress = (name:string,fields?:Record<string,unknown>)=>void;
/** A local bounded operation stream; clinical text deltas go to this response only, never to logs. */
export function operationStream(request:Request,operation:(fetchImpl:typeof fetch,quietFetch:typeof fetch,report:ReportProgress)=>Promise<Record<string,unknown>>,task:'protocol'|'specialist-chat'|'specialist-review'|'specialist-voice'='protocol'):Response{
 const release=caseQueue.tryEnter();if(!release)return Response.json({error:'queue'},{status:429});const runId=crypto.randomUUID(),abort=new AbortController(),encoder=new TextEncoder();let closed=false,total=0,count=0,usageComplete=true;
 const body=new ReadableStream<Uint8Array>({start(output){
  const send=(event:string,value:unknown)=>{if(!closed)try{output.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));}catch{closed=true;abort.abort();}};
  const progress=(name:string,fields:Record<string,unknown>={})=>{const event=terminalEvent(runId,name,fields);writeTerminalEvent(event);send('progress',event);};
  const abortInput=()=>abort.abort();if(request.signal.aborted)abortInput();request.signal.addEventListener('abort',abortInput,{once:true});
  const timeout=setTimeout(()=>{abort.abort();send('error',{code:'deadline'});if(!closed){closed=true;output.close();}},300000);const beat=setInterval(()=>send('keepalive',{}),15000);
  const modelFetch=(publish:boolean):typeof fetch=>async(input,init)=>{
   abort.signal.throwIfAborted();
   const signal=AbortSignal.any([abort.signal,...(init?.signal?[init.signal]:[])]);
   const isModel=String(input).includes('/chat/completions');if(!isModel)return fetch(input,{...init,signal});
   const payload=JSON.parse(String(init?.body??'{}'));const started=Date.now();const provider=String(input).includes('polza.ai')?'polza':'openrouter';progress('model.started',{model:payload.model,provider});if(publish)send('preview',{text:''});
   try{
    let response=await fetch(input,{...init,body:JSON.stringify({...payload,usage:{include:true},stream:true,stream_options:{include_usage:true}}),signal});
    let last=0;response=await collectChatStream(response,text=>{if(publish&&Date.now()-last>100){last=Date.now();send('preview',{text:task==='protocol'?previewText(text):text.slice(0,24000)});}});
    const value=await response.clone().json().catch(()=>null);const inputTokens=Number(value?.usage?.prompt_tokens)||0,outputTokens=Number(value?.usage?.completion_tokens)||0;const available=Boolean(value?.usage&&typeof value.usage.prompt_tokens==='number'&&typeof value.usage.completion_tokens==='number');usageComplete&&=available;const usd=priceUsd(payload.model,inputTokens,outputTokens);total+=usd;count++;
    progress('model.responded',{model:payload.model,provider,httpStatus:response.status,finishReason:value?.choices?.[0]?.finish_reason??null,inputTokens,outputTokens,durationMs:Date.now()-started,estimatedUsd:usd,usageAvailable:available,...(chargeForCall(String(payload.model),value?.usage).source==='openrouter'?{billedUsd:chargeForCall(String(payload.model),value?.usage).usd}:{})});return response;
   }catch(error){progress('model.failed',{model:payload.model,provider,reason:error instanceof Error?error.name:'unknown',durationMs:Date.now()-started});throw error;}
  };
  progress('run.started',{requestedTask:task});
  void operation(modelFetch(true),modelFetch(false),progress).then(result=>{if(abort.signal.aborted)return;progress('run.completed',{clinicalDraft:'generated',modelResponses:count,estimatedUsd:total,usageComplete});send('result',{...result,cost:total,usageComplete});}).catch(()=>{progress('run.failed',{reason:'Error'});send('error',{code:'generation'});}).finally(()=>{clearTimeout(timeout);clearInterval(beat);request.signal.removeEventListener('abort',abortInput);release();if(!closed){closed=true;output.close();}});
 },cancel(){closed=true;abort.abort();}});
 return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
