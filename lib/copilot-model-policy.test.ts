import test from 'node:test';
import assert from 'node:assert/strict';
import {converseWithPhysician} from './physician-agent.ts';
import {COPILOT_PRIMARY,COPILOT_RESERVE,COPILOT_MAX_INPUT_BYTES,COPILOT_MAX_OUTPUT_TOKENS,COPILOT_TASK_LIMIT_USD,copilotMaximumCharge} from './copilot-model-policy.ts';
const input={text:'[PHYSICIAN]\nReview the provided laboratory results, check medication safety and prepare a draft report.',locale:'en' as const};
const env:NodeJS.ProcessEnv={NODE_ENV:'test',OPENROUTER_API_KEY:'synthetic-key'};
function answer(){return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'Review the results and medicines, then prepare a draft.',translatedReply:null,question:null,translatedQuestion:null,tools:['documents','medications','clinical','protocol']})}}],usage:{prompt_tokens:1700,completion_tokens:120,cost:.00023}});}
test('coordinator requests enforce price, token, reasoning and provider limits and preserve actual billed cost',async()=>{
 const result=await converseWithPhysician(input,env,async(url,init)=>{
  assert.equal(String(url),'https://openrouter.ai/api/v1/chat/completions');
  const body=JSON.parse(String(init?.body));assert.equal(body.model,COPILOT_PRIMARY);
  assert.equal(body.temperature,undefined);assert.equal(body.max_tokens,COPILOT_MAX_OUTPUT_TOKENS);
  assert.deepEqual(body.reasoning,{effort:'none'});assert.deepEqual(body.provider,{require_parameters:true,allow_fallbacks:false,max_price:{prompt:.10,completion:.50}});
  assert.deepEqual(body.usage,{include:true});return answer();
 });
 assert.equal(result.billedUsd,.00023);assert.equal(result.model,COPILOT_PRIMARY);
 assert.ok(copilotMaximumCharge(COPILOT_MAX_INPUT_BYTES)<=COPILOT_TASK_LIMIT_USD);
});
test('only explicit unavailability with no usage permits one reserve call',async()=>{
 const models:string[]=[];
 const result=await converseWithPhysician(input,env,async(_url,init)=>{models.push(JSON.parse(String(init?.body)).model);return models.length===1?Response.json({error:{message:'No endpoints found for this model'}},{status:404}):answer();});
 assert.deepEqual(models,[COPILOT_PRIMARY,COPILOT_RESERVE]);assert.equal(result.model,COPILOT_RESERVE);
});
test('uncertain, paid, invalid and payment failures never trigger another model or schema retry',async()=>{
 for(const response of [Response.json({error:{message:'unknown'}},{status:502}),Response.json({error:{message:'No endpoints found'},usage:{prompt_tokens:1,cost:.00001}},{status:404}),Response.json({choices:[{finish_reason:'stop',message:{content:'invalid'}}],usage:{cost:.0001}}),Response.json({error:{message:'payment required'}},{status:402})]){
  let calls=0;const result=await converseWithPhysician(input,env,async()=>{calls++;return response;});assert.equal(calls,1);assert.equal(result.usedModel,false);
 }
 let calls=0;await converseWithPhysician({...input,text:'x'.repeat(19000)},env,async()=>{calls++;return answer();});assert.equal(calls,0);
});
