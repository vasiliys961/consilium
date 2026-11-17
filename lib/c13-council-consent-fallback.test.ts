import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparePrivacy} from './privacy-prepare.ts';
import {validCaseInput} from './input-validation.ts';
import {runOptionsKey} from './repeat-analysis.ts';
import {runConsilium} from './consilium.ts';
import {complete} from './gateway.ts';
import {MODELS} from './cost.ts';

test('C13: physician-selected specialty and fallback permission survive the signed data preparation',async()=>{
 const payload={text:'Синтетический пациент: ФП, одышка, СКФ 45 мл/мин.',consilium:true,councilSpecialty:'nephrology' as const,councilFallback:true,secondOpinion:true,locale:'ru' as const,retain:false};
 assert.equal(validCaseInput(payload),true);
 const reviewed=await preparePrivacy(payload);
 assert.equal(reviewed.body.councilSpecialty,'nephrology');
 assert.equal(reviewed.body.councilFallback,true);
 assert.equal(reviewed.body.consilium,true);
 assert.equal(reviewed.body.secondOpinion,true);
 assert.equal(validCaseInput({...payload,councilFallback:'true'}),false);
 const noCouncil=await preparePrivacy({...payload,consilium:false});
 assert.equal(noCouncil.body.councilSpecialty,undefined);
 assert.equal(noCouncil.body.councilFallback,false);
});

test('C13: duplicate billing guard differentiates fallback settings and specialty',()=>{
 const common={task:'auto',kind:'council' as const,consilium:true,councilSpecialty:'auto',councilFallback:false,secondOpinion:false,rereadImages:false,externalSearch:false,answerLocale:'ru',sourceLocale:'ru',retrievedSources:[]};
 assert.notEqual(runOptionsKey(common),runOptionsKey({...common,councilFallback:true}));
 assert.notEqual(runOptionsKey(common),runOptionsKey({...common,councilSpecialty:'cardiology'}));
});

test('C13: explicit model-unavailable error triggers a single opt-in backup, not extra roles',async()=>{
 const models:string[]=[];
 const voices=await runConsilium({OPENROUTER_API_KEY:'synthetic'},{
  note:'Atrial fibrillation and breathlessness',locale:'en',draft:'Synthetic clinical draft',citations:[],modalities:['ecg'],allowModelFallback:true,
 },async(_url,init)=>{
  const req=JSON.parse(String(init?.body));models.push(req.model);
  if(req.model===MODELS.pro)return Response.json({error:{message:'Model not found'}},{status:404});
  return Response.json({choices:[{message:{content:JSON.stringify({text:'Synthetic reviewed hypothesis',source:null})},finish_reason:'stop'}]});
 });
 assert.equal(models.length,6);
 assert.equal(voices.length,5);
 assert.equal(voices.find(v=>v.id==='hypothesis')?.fallbackFrom,MODELS.pro);
 assert.equal(voices.find(v=>v.id==='hypothesis')?.model,MODELS.hydrogen);
 assert.equal(voices.every(v=>v.status==='done'),true);
});

test('C13: no backup without consent and no automatic second billing on uncertain errors',async()=>{
 for(const [response,allow] of [
  [()=>Response.json({error:{message:'upstream unavailable'}},{status:502}),true],
  [()=>Response.json({error:{message:'insufficient funds'}},{status:402}),true],
  [()=>Response.json({choices:[{message:{content:'not valid JSON'}}]}),true],
  [()=>Response.json({error:{message:'Model not found'}},{status:404}),false],
 ] as const){
  let calls=0;const result=await complete({OPENROUTER_API_KEY:'synthetic'},{
   model:MODELS.pro,pinModel:true,...(allow?{fallbackModel:MODELS.hydrogen}:{}),fallbackOnlyIfUnavailable:true,
   maxTokens:100,retryInvalidResponse:false,validate:s=>s==='valid',messages:[{role:'user',content:'Synthetic'}],
  },async()=>{calls++;return response()});
  assert.equal(result,null);
  assert.equal(calls,1);
 }
});

test('C13: concise per-request privacy consent is still explicit and audio is separately gated',()=>{
 const panel=readFileSync('app/components/privacy-review.tsx','utf8');
 const workspace=readFileSync('app/components/clinical-workspace.tsx','utf8');
 const results=readFileSync('app/components/case-feed.tsx','utf8');
 assert.match(panel,/const readyToSend=voice\?audioConsent:true/);
 assert.match(panel,/Проверил данные · отправить/);
 assert.match(panel,/Отдельно разрешаю отправить исходное аудио/);
 assert.match(workspace,/council-model-roster/);
 assert.match(workspace,/councilFallback:withCouncil&&councilFallback/);
 assert.match(workspace,/Лечебная тактика/);
 assert.match(results,/council-actual-models/);
 assert.match(results,/fallbackFrom/);
});
