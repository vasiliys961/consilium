import {verifyPrivacy} from '@/lib/privacy-ticket';
import {operationStream} from "@/lib/stream-operation";
import {generateProtocol,PROTOCOL_KINDS} from '@/packages/protocol/generate';
import {parseLocale} from '@/lib/locale';
import {terminalEvent,writeTerminalEvent} from '@/lib/telemetry';
import {priceUsd} from '@/lib/cost';
export const maxDuration=300;
export async function POST(request:Request){
 const raw=await request.text();if(raw.length>120000)return Response.json({error:'size'},{status:413});let body:any;try{body=JSON.parse(raw);}catch{return Response.json({error:'input'},{status:400});}
 if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'input'},{status:400});
 if(typeof body.source!=='string'||!body.source.trim()||body.source.length>100000||!PROTOCOL_KINDS.some(([id])=>id===body.kind))return Response.json({error:'input'},{status:400});
 const mode=body.mode===undefined?'standalone':body.mode;
 const presentation=body.presentation===undefined?'formal':body.presentation;
 if(!['formal','narrative','soap'].includes(presentation)||((presentation==='narrative'||presentation==='soap')&&!['encounter','cardiology'].includes(body.kind)))return Response.json({error:'invalid_protocol_presentation'},{status:400});
 if(!['standalone','from-analysis','from-protocol'].includes(mode)||mode==='from-analysis'&&(typeof body.sourceAnalysisId!=='string'||!body.sourceAnalysisId.trim()||body.sourceAnalysisId.length>150)||mode==='from-protocol'&&(typeof body.sourceProtocolId!=='string'||!body.sourceProtocolId.trim()||body.sourceProtocolId.length>150))return Response.json({error:'invalid_protocol_mode'},{status:400});
 const {privacy,...reviewed}=body.privacyReview??{};if(!privacy?.consent||reviewed.text!==body.source||!verifyPrivacy(reviewed,privacy.token))return Response.json({error:'privacy_review_required'},{status:428});
 if(request.headers.get('accept')?.includes('text/event-stream'))return operationStream(request,async fetchImpl=>{const result=await generateProtocol({kind:body.kind,source:body.source,locale:parseLocale(body.locale),sourceAnalysisId:mode==='from-analysis'?body.sourceAnalysisId:undefined,sourceProtocolId:mode==='from-protocol'?body.sourceProtocolId:undefined,mode,presentation},{fetch:fetchImpl,reviewed:true});if(!result)throw Error('ProtocolGenerationError');return {document:result.document,cost:priceUsd(result.usage.model,result.usage.inputTokens,result.usage.outputTokens)};});
 const runId=crypto.randomUUID();writeTerminalEvent(terminalEvent(runId,'run.started',{requestedTask:'protocol'}));
 try{const result=await generateProtocol({kind:body.kind,source:body.source,locale:parseLocale(body.locale),sourceAnalysisId:mode==='from-analysis'?body.sourceAnalysisId:undefined,sourceProtocolId:mode==='from-protocol'?body.sourceProtocolId:undefined,mode,presentation},{reviewed:true});if(!result){writeTerminalEvent(terminalEvent(runId,'run.failed',{reason:'Error'}));return Response.json({error:'generation'},{status:502});}
 const usd=priceUsd(result.usage.model,result.usage.inputTokens,result.usage.outputTokens);writeTerminalEvent(terminalEvent(runId,'model.responded',{model:result.usage.model,httpStatus:200,finishReason:'stop',inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens,durationMs:result.usage.durationMs,estimatedUsd:usd}));writeTerminalEvent(terminalEvent(runId,'run.completed',{clinicalDraft:'generated',modelResponses:1,estimatedUsd:usd}));return Response.json({document:result.document,cost:usd});
 }catch{writeTerminalEvent(terminalEvent(runId,'run.failed',{reason:'Error'}));return Response.json({error:'generation'},{status:502});}
}
