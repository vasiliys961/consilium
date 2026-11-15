import test from'node:test';
import assert from'node:assert/strict';
import{GEMINI_ARGON,GEMINI_FLASH,GEMINI_BASELINES,geminiModel,readGeminiChoice,resolveGeminiPolicy,type GeminiPrice}from'./gemini-policy.ts';
import{geminiPolicy,parseGeminiRate}from'./gemini-pricing.ts';
import{complete}from'./gateway.ts';
import{priceUsd}from'./cost.ts';
const november=Date.parse('2026-11-30T23:59:59Z'),december=november+1000;
const revision='1234567890abcdef';
const price=(input=2,output=10):GeminiPrice=>({provider:'openrouter',baseline:GEMINI_BASELINES.openrouter,argon:{input,output,currency:'USD'},flash:{input:.75,output:3.75,currency:'USD'}});
test('Argon replaces Pro by default; only allowed model choices are accepted',()=>{
 assert.equal(geminiModel(),GEMINI_ARGON);assert.equal(geminiModel({GEMINI_MODEL:GEMINI_FLASH}),GEMINI_FLASH);assert.equal(geminiModel({GEMINI_MODEL:'arbitrary/model'}),GEMINI_ARGON);
 assert.equal(readGeminiChoice('concilium-gemini-choice=other.1234567890abcdef'),null);assert.equal(readGeminiChoice('concilium-gemini-choice=hydrogen.1234567890abcdef'),null);
 assert.equal(readGeminiChoice('concilium-gemini-choice=flash.invalid'),null);
});
test('price increase keeps Argon under the quality-first decision',()=>{
 assert.equal(resolveGeminiPolicy([price(4,20)],'',revision,null,november).needsChoice,false);
 const changed=resolveGeminiPolicy([price(4,20)],'',revision,null,december);
 assert.equal(changed.priceIncreased,true);assert.equal(changed.needsChoice,false);assert.equal(changed.selected,'argon');
 assert.equal(resolveGeminiPolicy([price()], '',revision,null,december).needsChoice,false);
 assert.equal(resolveGeminiPolicy([price(2,20)],'',revision,null,december).selected,'argon');
 assert.equal(resolveGeminiPolicy([price(4,20)],'',revision,null,november).selected,'argon');
});
test('fresh manual choices survive; stale choices return to Argon',()=>{
 for(const choice of ['argon','flash']){const p=resolveGeminiPolicy([price(4,20)],'',revision,`concilium-gemini-choice=${choice}.${revision}`,december);assert.equal(p.selected,choice);assert.equal(p.needsChoice,false);}
 assert.equal(resolveGeminiPolicy([price(4,20)],'',revision,'concilium-gemini-choice=argon.ffffffffffffffff',december).selected,'argon');
 assert.equal(resolveGeminiPolicy([price(4,20)],'',revision,'concilium-gemini-choice=flash.ffffffffffffffff',december).needsChoice,false);
});
test('missing catalogue does not downgrade or block the reader; availability stays truthful',()=>{
 const missing={...price(),argon:null};assert.equal(resolveGeminiPolicy([missing],'',revision,null,december).needsChoice,false);assert.equal(resolveGeminiPolicy([missing],'',revision,null,december).checkAvailable,false);
});
test('catalogue rate parsers preserve currency, reject missing and invalid values',()=>{
 assert.deepEqual(parseGeminiRate({pricing:{prompt:'0.000002',completion:'0.00001'}},'openrouter'),{input:2,output:10,currency:'USD'});
 assert.deepEqual(parseGeminiRate({top_provider:{pricing:{prompt_per_million:'120',completion_per_million:'600'}}},'polza'),{input:120,output:600,currency:'RUB'});
 assert.equal(parseGeminiRate({pricing:{prompt:'oops',completion:1}},'openrouter'),null);assert.equal(parseGeminiRate({},'polza'),null);
});
test('cached November prices expire exactly at December boundary; concurrent refreshes are deduplicated',async()=>{
 let calls=0;let doubled=false;
 const fetcher:typeof fetch=async()=>{calls++;return Response.json({data:[{id:GEMINI_ARGON,pricing:{prompt:doubled?'0.000004':'0.000002',completion:doubled?'0.00002':'0.00001'}},{id:GEMINI_FLASH,pricing:{prompt:'0.00000075',completion:'0.00000375'}}]});};
 const env={OPENROUTER_API_KEY:'synthetic-price-test-not-a-real-key'};
 const before=await geminiPolicy(env,null,{now:november,fetch:fetcher});assert.equal(before.needsChoice,false);assert.equal(calls,1);doubled=true;
 const after=await Promise.all([geminiPolicy(env,null,{now:december,fetch:fetcher}),geminiPolicy(env,null,{now:december,fetch:fetcher})]);assert.equal(calls,2);assert.ok(after.every(p=>!p.needsChoice&&p.selected==='argon'&&p.prices[0].argon?.input===4));
});
test('selected Flash is sent to the provider and recorded as Flash, while default is Argon',async()=>{
 for(const selected of [undefined,GEMINI_FLASH]){let sent='';const r=await complete({OPENROUTER_API_KEY:'synthetic',GEMINI_MODEL:selected},{model:GEMINI_ARGON,maxTokens:100,messages:[]},async(_url,init)=>{sent=JSON.parse(String(init?.body)).model;return Response.json({choices:[{finish_reason:'stop',message:{content:'synthetic complete'}}]});});assert.equal(sent,selected??GEMINI_ARGON);assert.equal(r?.model,sent);}
});
test('Argon cost estimate reflects announced December doubling without changing historical Pro prices',()=>{
 assert.equal(priceUsd(GEMINI_ARGON,1000000,1000000,november),12);assert.equal(priceUsd(GEMINI_ARGON,1000000,1000000,december),24);assert.equal(priceUsd('google/gemini-3.1-pro-preview',1000000,1000000,december),14);
});

test('vision does not send an unavailable Flash replacement without a model choice',()=>{
 const missing={...price(4,20),flash:null};
 const policy=resolveGeminiPolicy([missing],'',revision,null,december);
 assert.equal(policy.selected,'argon');assert.equal(policy.checkAvailable,true);assert.equal(policy.needsChoice,false);
});
