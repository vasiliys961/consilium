import test from 'node:test';import assert from 'node:assert/strict';
import {collectChatStream,previewText,sseEvents} from './analysis-stream.ts';
function stream(text:string,step=2){const bytes=new TextEncoder().encode(text);return new ReadableStream<Uint8Array>({start(c){for(let i=0;i<bytes.length;i+=step)c.enqueue(bytes.slice(i,i+step));c.close();}});}
test('SSE preserves UTF-8 across tiny chunks, concatenates real deltas and usage without changing finish status',async()=>{
 const chunks=['{"summary":"','Описание ритма','"}'];const records=chunks.map(content=>'data: '+JSON.stringify({choices:[{delta:{content},finish_reason:null}]})+'\r\n\r\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:17,completion_tokens:8}})+'\n\ndata: [DONE]\n\n';
 const previews:string[]=[];const result=await collectChatStream(new Response(stream(records),{headers:{'content-type':'text/event-stream'}}),raw=>previews.push(previewText(raw)));const json=await result.json();assert.equal(json.choices[0].message.content,'{"summary":"Описание ритма"}');assert.equal(json.choices[0].finish_reason,'stop');assert.equal(json.usage.prompt_tokens,17);assert.ok(previews.includes('Описание ритма'));
});
test('an interrupted model stream is incomplete; partial JSON is never promoted to a completed model reply',async()=>{
 const result=await collectChatStream(new Response(stream('data: '+JSON.stringify({choices:[{delta:{content:'{"summary":"partial'}}]})+'\n\n'),{headers:{'content-type':'text/event-stream'}}),()=>{});assert.equal((await result.json()).choices[0].finish_reason,'length');assert.equal(previewText('{"seen":['),'');
});
test('SSE result and progress remain separate, and escaped preview text is decoded as text',async()=>{
 const events=[];for await(const e of sseEvents(stream('event: progress\ndata: {"event":"model.started"}\n\nevent: result\ndata: {"ok":true}\n\n')))events.push(e);assert.deepEqual(events.map(e=>e.event),['progress','result']);assert.equal(previewText('{"reading":"A\\nB\\"C"'),'A\nB"C');
});

test('a late stream error discards partial content and preserves provider diagnostics',async()=>{
 const error={code:'BAD_REQUEST',metadata:{raw:'The compiled grammar is too large'}};
 const records=[{choices:[{delta:{content:'partial answer'}}]},{error,choices:[{finish_reason:'error'}]}].map(value=>'data: '+JSON.stringify(value)+'\n\n').join('');
 const result=await collectChatStream(new Response(stream(records),{headers:{'content-type':'text/event-stream'}}),()=>{});const value=await result.json();
 assert.deepEqual(value.error,error);assert.equal(value.choices[0].finish_reason,'error');assert.equal(value.choices[0].message.content,'');
});

test('DONE without a model finish reason cannot certify a complete answer',async()=>{
 const records='data: '+JSON.stringify({choices:[{delta:{content:'{"summary":"looks complete"}'}}]})+'\n\ndata: [DONE]\n\n';
 const value=await (await collectChatStream(new Response(stream(records),{headers:{'content-type':'text/event-stream'}}),()=>{})).json();assert.equal(value.choices[0].finish_reason,'length');
});
