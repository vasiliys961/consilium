import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCase,type AnalysisDependencies} from './analyze-case.ts';
import {terminalEvent,formatTerminalEvent,type RunEvent} from './telemetry.ts';

const env={OPENROUTER_API_KEY:'synthetic-no-network-key'};
// The local digital reader pins synthesis to one model, with no second paid draft.
const input={text:'Explain the supplied synthetic digital ECG.',task:'interpret' as const,locale:'en' as const,
 externalSearch:false,consilium:false,files:[{name:'synthetic-ecg.csv',text:'sampling_rate,500\nI,II,III,aVR,aVL,aVF,V1,V2,V3,V4,V5,V6\n'+Array(12).fill('0').join(',')}]};
const reader:AnalysisDependencies['assessDigitalTracing']=async()=>({source:'synthetic-ecg.csv',status:'read',cleared:[],top:null,names:[],reason:null});
const answer={model:'google/gemini-4-argon',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'Synthetic complete draft.',statements:[]})}}],usage:{prompt_tokens:30,completion_tokens:20,cost:.031234}};

test('A transport failure retains the attempted call with unknown billing, never a confirmed free analysis',async()=>{
 const events:RunEvent[]=[];let attempts=0;
 const result=await analyzeCase(input,{env,reviewed:true,assessDigitalTracing:reader,onEvent:e=>events.push(e),fetch:async()=>{attempts++;throw new TypeError('PRIVATE_TRANSPORT_DETAILS');}});
 assert.equal(attempts,1);assert.equal(result.clinicalDraft,'unavailable');
 assert.equal(result.ecgEvidence?.status,'read');
 assert.equal(result.cost.calls?.length,1);assert.equal(result.cost.calls[0].status,'failed');
 assert.equal(result.cost.usageComplete,false);assert.equal(result.cost.billingComplete,false);
 const end=events.find(e=>e.event==='run.completed')!;
 assert.equal(end.modelResponses,0);assert.equal(end.usageComplete,false);
 assert.doesNotMatch(formatTerminalEvent(end),/\$0\.000000/);
 assert.doesNotMatch(JSON.stringify(events),/PRIVATE_TRANSPORT_DETAILS|synthetic-no-network-key/);
});

test('A failed billing clone leaves the original complete clinical response readable and forbids invented receipts',async()=>{
 let attempts=0;
 const result=await analyzeCase(input,{env,reviewed:true,assessDigitalTracing:reader,fetch:async()=>{
  attempts++;const response=Response.json(answer);
  response.clone=()=>{throw new TypeError('Uncloneable transport response');};
  return response;
 }});
 assert.equal(attempts,1);assert.equal(result.clinicalDraft,'generated');
 assert.equal(result.draft.summary,'Synthetic complete draft.');
 assert.equal(result.cost.calls?.length,1);assert.equal(result.cost.calls[0].usageAvailable,false);
 assert.equal(result.cost.billingComplete,false);assert.equal(result.cost.usageComplete,false);
});

test('A broken provider stream keeps the received HTTP response separate from unknown billing and incomplete clinical output',async()=>{
 const events:RunEvent[]=[];let attempts=0;
 const result=await analyzeCase(input,{env,streaming:true,reviewed:true,assessDigitalTracing:reader,onEvent:e=>events.push(e),fetch:async()=>{
  attempts++;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));controller.error(new TypeError('PRIVATE_BROKEN_STREAM'));}}),{headers:{'content-type':'text/event-stream'}});
 }});
 assert.equal(attempts,1);assert.equal(result.clinicalDraft,'unavailable');
 assert.equal(result.cost.calls?.[0].status,'failed');assert.equal(result.cost.usageComplete,false);
 assert.equal(events.find(e=>e.event==='run.completed')?.modelResponses,1);
 assert.doesNotMatch(JSON.stringify(events),/PRIVATE_BROKEN_STREAM|partial/);
});

test('Sanitized telemetry preserves the actual OpenRouter receipt and distinguishes a token estimate',async()=>{
 const events:RunEvent[]=[];
 const result=await analyzeCase(input,{env,reviewed:true,assessDigitalTracing:reader,onEvent:e=>events.push(e),fetch:async()=>Response.json(answer)});
 assert.equal(result.cost.billingComplete,true);
 const event=events.find(e=>e.event==='model.responded')!;
 assert.equal(event.billedUsd,.031234);
 assert.match(formatTerminalEvent(event),/OpenRouter \$0\.031234/);
 assert.doesNotMatch(formatTerminalEvent(event),/≈/);
 assert.equal(events.find(e=>e.event==='run.completed')?.billedUsd,.031234);
 const estimate=terminalEvent('synthetic','model.responded',{estimatedUsd:.001,inputTokens:10,outputTokens:20});
 assert.match(formatTerminalEvent(estimate),/≈ \$0\.001000/);
});
