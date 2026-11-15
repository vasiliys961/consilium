import {MODELS,priceUsd} from './cost.ts';
import {terminalEvent,type RunEvent} from './telemetry.ts';
/** Only the owned gateway's fixed, nonclinical receipt schema crosses the process boundary. */
export function radiologyTelemetry(line:string,module:'opus-radiology'|'protocol-ru'|'protocol-en'='opus-radiology'):RunEvent|null{
 const marker='CONCILIUM_MODEL ';const at=line.indexOf(marker);if(at<0||line.length>6000)return null;
 try{const value=JSON.parse(line.slice(at+marker.length));if(!/^[a-f0-9-]{36}$/.test(value.runId)||!['model.started','model.responded','model.failed'].includes(value.event))return null;
 const knownRate=Object.values(MODELS).includes(value.model);const model=knownRate||['x-ai/grok-4.5','anthropic/claude-haiku-4.5','openai/gpt-5.4','assemblyai/speech'].includes(value.model)?value.model:'other';
 const numeric=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:0;
 const inputTokens=numeric(value.inputTokens),outputTokens=numeric(value.outputTokens);
 return terminalEvent(value.runId,value.event,{module,model,provider:value.provider==='assemblyai'?'assemblyai':value.provider==='polza'?'polza':'openrouter',durationMs:numeric(value.durationMs),httpStatus:numeric(value.httpStatus),inputTokens,outputTokens,usageAvailable:value.usageAvailable===true,finishReason:['stop','length','content_filter'].includes(value.finishReason)?value.finishReason:null,...(value.event==='model.responded'&&knownRate?{estimatedUsd:priceUsd(model,inputTokens,outputTokens)}:{}),...(value.event==='model.failed'?{reason:'transport_error'}:{})});
 }catch{return null;}
}
