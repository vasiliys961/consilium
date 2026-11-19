#!/usr/bin/env node
/**
 * W5 — real, $0 OpenRouter :free baseline on fabricated diagnostic vignettes.
 * DOES NOT validate clinical correctness, connect to local Preview, or use real
 * patient data. Never requests a paid model, a provider fallback, or tools.
 *
 * Defaults to DRY RUN (no HTTP). Only --run can send prompts.
 * Example:
 * node --experimental-strip-types scripts/w5-free-model-trial.mjs --run --model provider/model:free --max 5 > w5-free-results.jsonl
 * All output is JSONL; API key must be provided through OPENROUTER_API_KEY.
 */
import {W5_DIAGNOSTIC_CASES} from '../lib/w5-diagnostic-cases.ts';

const args=process.argv.slice(2);
const has=(flag)=>args.includes(flag);
function value(flag){
 const index=args.indexOf(flag);
 return index<0?null:args[index+1]??null;
}
function usage(){
 return [
  'W5 zero-extra-cost diagnostic LLM baseline; only fictional cases are sent.',
  'Default (no network): node --experimental-strip-types scripts/w5-free-model-trial.mjs',
  'Real free trial: OPENROUTER_API_KEY=... node --experimental-strip-types scripts/w5-free-model-trial.mjs --run --model vendor/model:free --max 5 > w5-free-results.jsonl',
  'Use --max 25 only after a five-case smoke test.',
  'Real runs are not a substitute for blinded clinician grading or Preview/3207 acceptance.',
 ].join('\n');
}
function error(message){
 process.stderr.write('W5 free-only trial stopped: '+message+'\n');
 process.exitCode=1;
}
function header(){
 return {kind:'W5-free-model-diagnostic-baseline',cases:W5_DIAGNOSTIC_CASES.length,
  status:'unassessed',modelCallsMade:0,costUsd:0,validation:'not-performed'};
}
const model=value('--model');
const maximum=value('--max')??'5';
const n=Number(maximum);
const legalName=/^[a-z0-9][a-z0-9._/-]*:free$/i;
if(has('--help')){
 process.stdout.write(usage()+'\n');
}else if(!has('--run')){
 // This path must NEVER access the network, tokens or a model key.
 process.stdout.write(JSON.stringify({...header(),mode:'dry-run',
  note:'No actual model answers: add --run and an exact current :free model ID.'})+'\n');
}else if(!model||!legalName.test(model)){
 error('Model must be an exact ID ending in :free; paid and auto-routing IDs are prohibited.');
}else if(!Number.isSafeInteger(n)||n<1||n>25){
 error('--max must be an integer in [1,25].');
}else if(!process.env.OPENROUTER_API_KEY){
 error('OPENROUTER_API_KEY is not set. The key is never printed or sent to logs.');
}else{
 try{
  const api='https://openrouter.ai/api/v1';
  const token=process.env.OPENROUTER_API_KEY;
  // Fail closed if the exact provider model is absent or any relevant pricing
  // component is not a finite numeric zero. No openrouter/free auto selection:
  // it would vary model identity and make A/B results incomparable.
  const listing=await fetch(api+'/models',{signal:AbortSignal.timeout(12000)});
  if(!listing.ok)throw Error('Unable to verify current free pricing (HTTP '+listing.status+').');
  const catalog=await listing.json();
  const selected=catalog.data?.find(item=>item.id===model);
  if(!selected)throw Error('Model not in live catalog; refuse to guess a paid replacement.');
  const pricing=selected.pricing??{};
  for(const key of ['prompt','completion','request','internal_reasoning']){
   if(pricing[key]!==undefined&&
      (typeof pricing[key]!=='string'&&typeof pricing[key]!=='number'
       || !Number.isFinite(Number(pricing[key])) || Number(pricing[key])!==0))
    throw Error('Model is not verified zero-cost for '+key+'.');
  }
  if(pricing.prompt===undefined||pricing.completion===undefined)
   throw Error('Current prompt and completion prices must be explicitly 0.');
  if(Number(pricing.prompt)!==0||Number(pricing.completion)!==0)
   throw Error('Model price is nonzero. Aborting before first inference.');
  const quotaResponse=await fetch(api+'/key',{
   headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
  if(!quotaResponse.ok)throw Error('Cannot verify remaining free request quota (HTTP '+quotaResponse.status+').');
  const quota=(await quotaResponse.json()).data?.free_model_daily_requests;
  if(!quota||!Number.isFinite(quota.remaining)||quota.remaining<n)
   throw Error('Remaining free quota cannot be confirmed sufficient for '+n+' requests.');

  // Print headers as JSON lines, never secrets, never clinical reference keys.
  process.stdout.write(JSON.stringify({kind:'W5-free-model-run',
   model,planned:n,freeQuotaBefore:quota.remaining,referenceRubricHidden:true,
   promptIncludes:'only fictional note and question',
   validation:'not-performed'})+'\n');
  const cases=W5_DIAGNOSTIC_CASES.slice(0,n);
  for(let i=0;i<cases.length;i++){
   const item=cases[i];
   if(i>0)await new Promise(resolve=>setTimeout(resolve,4000));
   const started=Date.now();
   const response=await fetch(api+'/chat/completions',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',
      'X-Title':'Doctor Opus synthetic W5 free-only trial'},
    body:JSON.stringify({
      model,provider:{allow_fallbacks:false},
      temperature:0.1,max_tokens:1200,
      messages:[
       {role:'system',content:'You are evaluating a FICTIONAL adult clinical vignette, not treating a patient. Answer the physician question in the language used. Distinguish documented data from hypotheses. Consider time-critical alternative diagnoses and missing evidence. Do not invent test results, doses, scans or certainty. Provide a concise clinical assessment for physician review; this is unsigned.'},
       {role:'user',content:'Fictional case '+item.id+'\nClinical note:\n'+item.note+'\n\nPhysician question:\n'+item.question}
      ]
    }),
    signal:AbortSignal.timeout(65000),
   });
   if(!response.ok){
    process.stdout.write(JSON.stringify({caseId:item.id,status:'provider-error',httpStatus:response.status,
      elapsedMs:Date.now()-started})+'\n');
    throw Error('Provider rejected '+item.id+' (HTTP '+response.status+'). No retries or paid fallback.');
   }
   const result=await response.json();
   const content=result.choices?.[0]?.message?.content;
   const usage=result.usage??{};
   const billed=usage.cost??usage.cost_details?.upstream_inference_cost;
   if(billed!==undefined&&Number(billed)>0)
    throw Error('Unexpected reported positive cost: stop immediately; review provider invoice.');
   process.stdout.write(JSON.stringify({caseId:item.id,status:typeof content==='string'&&content.trim()?'answered':'empty',
    requestedModel:model,returnedModel:result.model??null,answer:typeof content==='string'?content:'',
    usage:{prompt_tokens:usage.prompt_tokens??null,completion_tokens:usage.completion_tokens??null,
      total_tokens:usage.total_tokens??null,reportedCostUsd:billed??null},
    elapsedMs:Date.now()-started,reviewStatus:'not_assessed'})+'\n');
   if(typeof content!=='string'||!content.trim())
    throw Error('Empty result for '+item.id+'; do not retry automatically.');
  }
 }catch(e){
  error(e instanceof Error?e.message:String(e));
 }
}
