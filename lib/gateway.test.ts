import assert from "node:assert/strict";
import test from "node:test";
import { complete } from "./gateway.ts";
import { collectChatStream } from './analysis-stream.ts';

test("a finished call records its own duration and a failed call does not", async () => {
  let calls = 0;
  const result = await complete(
    { POLZA_API_KEY: "local-test", OPENROUTER_API_KEY: "local-test" },
    { model: "openai/gpt-6.1-sol", maxTokens: 8, messages: [{ role: "user", content: "hello" }] },
    async () => {
      calls += 1;
      
      await new Promise((resolve) => setTimeout(resolve, 20));
      return Response.json({
        choices: [{ message: { content: "hello" } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      });
    },
  );

  assert.equal(calls, 1);
  assert.equal(result?.inputTokens, 3);
  assert.equal(result?.outputTokens, 1);
  assert.equal(typeof result?.durationMs, "number");
  assert.ok((result?.durationMs ?? 0) >= 15);
  assert.ok((result?.durationMs ?? 0) < 2000);
});

test('a length-limited response is retried and cannot be accepted as a completed clinical answer',async()=>{
 let calls=0;const result=await complete({ OPENROUTER_API_KEY: 'test' }, {model:'test',maxTokens:50,messages:[{role:'user',content:'test'}],validate:text=>text==='complete'},async(input,init)=>{
  calls++;const request=JSON.parse(String(init?.body));assert.equal(request.max_tokens,calls===1?50:100);
  return Response.json({choices:[{finish_reason:calls===1?'length':'stop',message:{content:calls===1?'cut off':'complete'}}]});
 });assert.equal(calls,2);assert.equal(result?.text,'complete');
});

for (const streamed of [false, true]) test(`oversized grammar uses one validated JSON retry (${streamed ? 'SSE error with HTTP 200' : 'HTTP 400'})`, async () => {
 const requests:any[]=[];const failures:string[]=[];
 const result=await complete({ OPENROUTER_API_KEY: 'test' }, {
  model:'test',maxTokens:50,retryInvalidResponse:false,messages:[{role:'user',content:'Synthetic JSON test'}],
  jsonSchema:{name:'test',schema:{type:'object'}},validate:text=>JSON.parse(text).summary==='complete',onFailure:reason=>failures.push(reason),
 },async(_input,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  if(requests.length===1){
   const value={error:{message:'Provider returned error',metadata:{raw:'The compiled grammar is too large, which would cause performance issues.'}},choices:[{finish_reason:'error'}]};
   if(!streamed)return Response.json(value,{status:400});
   return collectChatStream(new Response('data: '+JSON.stringify(value)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}),()=>{});
  }
  return Response.json({choices:[{finish_reason:'stop',message:{content:'{"summary":"complete"}'}}]});
 });
 assert.equal(result?.text,'{"summary":"complete"}');assert.equal(requests.length,2);
 assert.equal(requests[0].response_format.type,'json_schema');assert.deepEqual(requests[1].response_format,{type:'json_object'});
 assert.match(requests[1].messages[0].content,/output contract/);assert.deepEqual(failures,['schema_rejected']);
});

test('JSON compatibility retry still rejects invalid output and stays bounded',async()=>{
 let calls=0;
 const result=await complete({ OPENROUTER_API_KEY: 'test' },{model:'test',maxTokens:20,retryInvalidResponse:false,messages:[],jsonSchema:{name:'test',schema:{type:'object'}},validate:()=>false},async()=>{
  calls++;return calls===1?Response.json({error:{message:'The compiled grammar is too large'}},{status:400}):Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]});
 });assert.equal(result,null);assert.equal(calls,2);
});

test('payment failure stops without contacting Polza',async()=>{
 const failures:string[]=[];const urls:string[]=[];
 const result=await complete({POLZA_API_KEY:'test',OPENROUTER_API_KEY:'test'},{model:'test',maxTokens:20,messages:[],onFailure:reason=>failures.push(reason)},async(input)=>{
  urls.push(String(input));return urls.length===1?Response.json({error:{message:'Insufficient credits'}},{status:402}):Response.json({choices:[{finish_reason:'stop',message:{content:'complete'}}]});
 });assert.equal(result,null);assert.equal(urls.length,1);assert.match(urls[0],/openrouter/);assert.deepEqual(failures,['payment_required']);
});
