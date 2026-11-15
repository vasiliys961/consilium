import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
import{openRouterRuntime}from'./provider-runtime.ts';import{complete}from'./gateway.ts';
test('current-app child environment masks Polza and legacy aliases without modifying source values',()=>{
 const source={POLZA_API_KEY:'synthetic-polza',OPENROUTER_API_KEY:'synthetic-router',LLM_API_KEY:'old-polza',LLM_BASE_URL:'https://polza.ai/api/v1',RADIOLOGY_POLZA_API_KEY:'old',NODE_ENV:'test' as const};
 const current=openRouterRuntime(source);assert.equal(source.POLZA_API_KEY,'synthetic-polza');assert.equal(current.POLZA_API_KEY,'');assert.equal(current.RADIOLOGY_POLZA_API_KEY,'');assert.equal(current.LLM_API_KEY,'synthetic-router');assert.equal(current.LLM_BASE_URL,'https://openrouter.ai/api/v1');assert.match(current.NODE_OPTIONS!,/openrouter-only.cjs/);
});
test('runtime guard blocks Polza before transport and permits OpenRouter with mocked transport only',async()=>{
 const original=globalThis.fetch,saved={...process.env};const calls:string[]=[];
 globalThis.fetch=async input=>{calls.push(String(input));return Response.json({ok:true});};
 try{createRequire(import.meta.url)('../scripts/openrouter-only.cjs');await assert.rejects(fetch('https://polza.ai/api/v1/chat/completions'),/disabled/);await assert.rejects(fetch('https://api.polza.ai/v1/models'),/disabled/);await fetch('https://openrouter.ai/api/v1/models');assert.deepEqual(calls,['https://openrouter.ai/api/v1/models']);}
 finally{globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('main gateway never calls Polza, even when it has a key or OpenRouter fails',async()=>{
 const urls:string[]=[];const result=await complete({POLZA_API_KEY:'synthetic-polza',OPENROUTER_API_KEY:'synthetic-router'},{model:'synthetic',maxTokens:10,messages:[]},async input=>{urls.push(String(input));return Response.json({error:{message:'synthetic payment error'}},{status:402});});assert.equal(result,null);assert.deepEqual(urls,['https://openrouter.ai/api/v1/chat/completions']);
 const absent=await complete({POLZA_API_KEY:'synthetic-polza'},{model:'synthetic',maxTokens:10,messages:[]},async()=>{throw Error('must not call');});assert.equal(absent,null);
});
test('integrated protocol adapters ignore legacy Polza selection while standalone defaults remain available',async()=>{
 const ru=await import('../integrations/protocol/ru/lib/llm-provider.ts');const en=await import('../integrations/protocol/en/lib/llm-provider.ts');
 const saved={...process.env};Object.assign(process.env,{CONCILIUM_OPENROUTER_ONLY:'1',POLZA_API_KEY:'synthetic-polza',OPENROUTER_API_KEY:'synthetic-router',LLM_API_KEY:'synthetic-old-polza',LLM_BASE_URL:'https://polza.ai/api/v1'});
 try{assert.deepEqual(await ru.runWithLlmProvider('polza',async()=>ru.getLlmEndpointChain().map(e=>e.provider)),['openrouter']);assert.equal(en.getLlmApiKey(),'synthetic-router');assert.equal(en.getLlmBaseUrl(),'https://openrouter.ai/api/v1');delete process.env.CONCILIUM_OPENROUTER_ONLY;assert.equal(en.getLlmApiKey(),'synthetic-old-polza');assert.equal(en.getLlmBaseUrl(),'https://polza.ai/api/v1');}
 finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
