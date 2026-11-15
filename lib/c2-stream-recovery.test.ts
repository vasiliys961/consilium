import test from 'node:test';
import assert from 'node:assert/strict';
import { requestStreamedJson, isCaseResultEnvelope } from './analysis-stream.ts';
import { conduct } from './conductor.ts';

function sse(event:string, data:unknown):string {
  return 'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n';
}
function streamResponse(body:ReadableStream<Uint8Array>):Response {
  return new Response(body,{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
function finiteStream(chunks:string[]):ReadableStream<Uint8Array> {
  const encoder=new TextEncoder();
  return new ReadableStream({start(controller){
    for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));
    controller.close();
  }});
}
const fakeFetch=(response:Response):typeof fetch=>async()=>response;

test('C2: a complete terminal result survives loss of stream teardown after the result event',async()=>{
  const encoder=new TextEncoder();
  let pulls=0,cancelled=false;
  const resultPayload={draft:{status:'unsigned',summary:'Synthetic final answer'},gateway:{provider:'openrouter',called:true}};
  const body=new ReadableStream<Uint8Array>({
    pull(controller){
      pulls++;
      if(pulls===1)controller.enqueue(encoder.encode(sse('result',resultPayload)));
      else controller.error(new Error('connection interrupted after terminal result'));
    },
    cancel(){cancelled=true;},
  },{highWaterMark:0});
  const result=await requestStreamedJson<typeof resultPayload>('/api/v1/cases',{synthetic:true},{
    fetch:fakeFetch(streamResponse(body)),
  });
  assert.deepEqual(result,resultPayload);
  assert.equal(cancelled,true,'client must release the stream as soon as the valid result is received');
  assert.equal(pulls,1,'must not read beyond the terminal result event');
});

test('C2: progress and partial preview never certify a clinical result after a closed connection',async()=>{
  const previews:string[]=[];
  const progress:string[]=[];
  const response=streamResponse(finiteStream([
    sse('progress',{event:'stage.started',runId:'fixture',at:'synthetic',stage:'synthesis'}),
    sse('preview',{text:'Provisional draft, INCOMPLETE'}),
  ]));
  await assert.rejects(requestStreamedJson('/api/v1/cases',{synthetic:true},{
    fetch:fakeFetch(response),
    onProgress:e=>progress.push(e.event),
    onPreview:t=>previews.push(t),
  }),/Соединение закрыто до получения итогового ответа/);
  assert.deepEqual(progress,['stage.started']);
  assert.deepEqual(previews,['Provisional draft, INCOMPLETE']);
});

test('C2: abrupt transport failure before terminal event never returns partial contents',async()=>{
  const encoder=new TextEncoder();
  let reads=0;
  const response=streamResponse(new ReadableStream<Uint8Array>({
    pull(controller){
      if(++reads===1)controller.enqueue(encoder.encode(sse('preview',{text:'UNVERIFIED_OUTPUT'})));
      else controller.error(new Error('synthetic TCP reset'));
    },
  },{highWaterMark:0}));
  await assert.rejects(requestStreamedJson('/api/v1/cases',{synthetic:true},{fetch:fakeFetch(response)}),
    /Соединение прервалось до получения завершённого результата/);
});

test('C2: server error and invalid terminal result cannot silently become successful analysis',async()=>{
  const err=streamResponse(finiteStream([sse('error',{code:'deadline'})]));
  await assert.rejects(requestStreamedJson('/api/v1/cases',{synthetic:true},{fetch:fakeFetch(err)}),/Превышено время разбора/);
  const malformed=streamResponse(finiteStream([sse('result','incomplete string instead of object')]));
  await assert.rejects(requestStreamedJson('/api/v1/cases',{synthetic:true},{fetch:fakeFetch(malformed)}),
    /неверный формат результата/);
});

test('C2: partial multibyte SSE frame is ignored when connection closes without terminal result',async()=>{
  const partial='event: result\ndata: {"draft":{"summary":"Синтетическое заключение"';
  const response=streamResponse(finiteStream([partial.slice(0,18),partial.slice(18)]));
  await assert.rejects(requestStreamedJson('/api/v1/cases',{synthetic:true},{fetch:fakeFetch(response)}),
    /Соединение закрыто до получения итогового ответа/);
});

test('C2: a terminal JSON object without a complete clinical response envelope must not be stored',()=>{
 const partial={draft:{status:'unsigned',summary:'Provisional token text'},gateway:{called:true}};
 assert.equal(isCaseResultEnvelope(partial),false);
 assert.equal(isCaseResultEnvelope({}),false);
 assert.equal(isCaseResultEnvelope(null),false);
 const full=conduct({text:'Synthetic clinical fixture'});
 full.clinicalDraft='unavailable';
 assert.equal(isCaseResultEnvelope(full),true,'explicitly incomplete synthesis is a valid result if its status is preserved');
 full.clinicalDraft='generated';
 assert.equal(isCaseResultEnvelope(full),true);
 const corrupted={...full,cost:{...full.cost,totalUsd:NaN}};
 assert.equal(isCaseResultEnvelope(corrupted),false);
});
