import test from 'node:test';import assert from 'node:assert/strict';
import {withProtocolFactuality} from '../integrations/protocol/ru/lib/concilium-factuality.ts';
import {installProtocolObserver} from '../integrations/protocol/ru/lib/concilium-server.ts';
test('native original app receives a higher-priority factual recording rule without losing its model or template',()=>{const value=withProtocolFactuality({model:'configured-model',messages:[{role:'user',content:'Keep template structure; missing examination -> normal'}]}) as any;assert.equal(value.model,'configured-model');assert.equal(value.messages[0].role,'user');assert.equal(value.messages[1].role,'system');assert.match(value.messages[1].content,/Never invent a normal examination/);assert.match(value.messages[1].content,/informed consent/);});
test('original gateway responses stream unchanged while metadata-only receipts reach the log observer',async()=>{
 const originalFetch=globalThis.fetch,originalLog=console.log;const lines:string[]=[];let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;const value=JSON.parse(String(init?.body));assert.equal(value.messages.at(-1).role,'system');assert.ok(value.messages.some((m:any)=>m.content==='SYNTHETIC_PRIVATE_TEXT'));if(calls===1)return Response.json({choices:[{finish_reason:'stop',message:{content:'SYNTHETIC_PRIVATE_TEXT'}}],usage:{prompt_tokens:10,completion_tokens:8}});return new Response('data: '+JSON.stringify({choices:[{delta:{content:'SYNTHETIC_PRIVATE_TEXT'},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:9}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});};
 console.log=(line:unknown)=>lines.push(String(line));
 try{installProtocolObserver();for(let i=0;i<2;i++){const response=await fetch('https://polza.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'openai/gpt-6.1-sol',messages:[{role:'user',content:'SYNTHETIC_PRIVATE_TEXT'}]})});assert.match(await response.text(),/SYNTHETIC_PRIVATE_TEXT/);}for(let i=0;i<100&&!lines.some(line=>line.includes('"outputTokens":9'));i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(lines.filter(line=>line.includes('model.responded')).length,2);assert.ok(lines.some(line=>line.includes('"inputTokens":12')));assert.ok(!lines.join('').includes('SYNTHETIC_PRIVATE_TEXT'));}
 finally{globalThis.fetch=originalFetch;console.log=originalLog;delete (globalThis as typeof globalThis&{__conciliumProtocolFetch?:boolean}).__conciliumProtocolFetch;}
});

test('the selected original-app gateway is tried first, while retaining its configured fallback',async()=>{
 const {getLlmEndpointChain,runWithLlmProvider}=await import('../integrations/protocol/ru/lib/llm-provider.ts');
 const saved={polza:process.env.POLZA_API_KEY,router:process.env.OPENROUTER_API_KEY};process.env.POLZA_API_KEY='synthetic-polza';process.env.OPENROUTER_API_KEY='synthetic-router';
 try{assert.deepEqual(await runWithLlmProvider('openrouter',async()=>getLlmEndpointChain().map(e=>e.provider)),['openrouter','polza']);assert.deepEqual(await runWithLlmProvider('polza',async()=>getLlmEndpointChain().map(e=>e.provider)),['polza','openrouter']);}
 finally{if(saved.polza===undefined)delete process.env.POLZA_API_KEY;else process.env.POLZA_API_KEY=saved.polza;if(saved.router===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=saved.router;}
});
