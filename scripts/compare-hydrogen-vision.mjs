// Explicit user-authorized paid run: pinned public images only; no app defaults change.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const base=path.resolve('artifacts/gemini-vision-comparison-2026-11-12');
const out=path.resolve('artifacts/gemini-hydrogen-vision-2026-11-14');
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
const original=JSON.parse(await readFile(path.join(base,'protocol-openrouter.json'),'utf8'));
const model='google/gemini-4-hydrogen',budgetUsd=1;
if(original.temperature!==0||original.reasoning?.effort!=='low'||original.max_tokens!==6144||manifest.cases.length!==20)throw Error('Frozen comparison protocol mismatch');
for(const c of manifest.cases){const image=await readFile(path.join(base,c.image));if(createHash('sha256').update(image).digest('hex')!==c.sha256)throw Error('Pinned public image mismatch: '+c.id);}
await mkdir(path.join(out,'responses'),{recursive:true});
await writeFile(path.join(out,'protocol.json'),JSON.stringify({...original,provider:'openrouter',models:[model],budgetUsd,baselineDirectory:path.relative(out,base),baselineRunDate:'2026-11-12',newRunDate:'2026-11-14',additionalCalls:20,maximumEstimatedSpend:{openrouterUsd:budgetUsd},comparisonCaveat:'Historical baseline, not a contemporaneous randomized comparison. Identical image bytes, questions, prompts and requested low reasoning; model reasoning levels need not have identical compute.'},null,2));
if(!process.argv.includes('--execute')){console.log(JSON.stringify({model,cases:20,budgetUsd,execute:false,verifiedImageHashes:20}));process.exit(0);}
process.loadEnvFile('.env.local');const key=process.env.OPENROUTER_API_KEY;if(!key)throw Error('OpenRouter key missing');
const catalogueResponse=await fetch('https://openrouter.ai/api/v1/models',{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
if(!catalogueResponse.ok)throw Error('Catalogue unavailable; no paid calls made');
const catalogue=await catalogueResponse.json(),entry=catalogue.data?.find(item=>item.id===model);
if(!entry?.architecture?.input_modalities?.includes('image'))throw Error('Image support not advertised');
const inputRate=Number(entry.pricing?.prompt),outputRate=Number(entry.pricing?.completion);
if(!(inputRate>0&&inputRate<=.000002&&outputRate>0&&outputRate<=.00001))throw Error('Unexpected tariff; no paid calls made');
await writeFile(path.join(out,'catalog.json'),JSON.stringify({checkedAt:new Date().toISOString(),model:entry},null,2));
let spend=0,reserved=0,cursor=0,stop=false;
const reserve=30000*inputRate+original.max_tokens*outputRate;
await Promise.all(Array.from({length:2},async()=>{while(cursor<manifest.cases.length&&!stop){
 const c=manifest.cases[cursor++],file=path.join(out,'responses',c.id+'.json');
 try{await access(file);const saved=JSON.parse(await readFile(file,'utf8'));spend+=typeof saved.usage?.cost==='number'?saved.usage.cost:saved.estimatedCost??reserve;if(saved.status!=='ok')stop=true;console.log(JSON.stringify({case:c.id,status:'already-recorded'}));continue;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(spend+reserved+reserve>budgetUsd){stop=true;console.log('Budget guard reached');break;}
 reserved+=reserve;
 const image=await readFile(path.join(base,c.image));
 const request={model,temperature:original.temperature,max_tokens:original.max_tokens,reasoning:original.reasoning,response_format:original.response_format,messages:[{role:'system',content:original.system},{role:'user',content:[{type:'text',text:`Опишите представленное изображение. Затем ответьте на контрольный вопрос: ${c.question}`},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image.toString('base64')}}]}]};
 const started=Date.now();let record={caseId:c.id,requestedModel:model,provider:'openrouter',status:'in_flight',startedAt:new Date(started).toISOString(),imageSha256:c.sha256,question:c.question};
 // Persist before transport; a resumed run never repeats even an uncertain in-flight call.
 await writeFile(file,JSON.stringify(record,null,2));
 try{
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
  const text=await response.text();let raw;try{raw=JSON.parse(text);}catch{raw={nonJsonBody:text.slice(0,1200)};}
  const choice=raw.choices?.[0];let parsed;try{parsed=JSON.parse((choice?.message?.content??'').replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{}
  const valid=typeof parsed?.description_ru==='string'&&typeof parsed?.answer==='string'&&parsed.answer.trim();
  const usage=raw.usage??{};
  record={...record,returnedModel:raw.model??null,httpStatus:response.status,status:response.ok&&!raw.error&&choice?.finish_reason==='stop'&&valid&&raw.model===model?'ok':'failed',finishReason:choice?.finish_reason??null,durationMs:Date.now()-started,parsed:parsed??null,usage,estimatedCost:(Number(usage.prompt_tokens)||0)*inputRate+(Number(usage.completion_tokens)||0)*outputRate,raw};
 }catch(error){record={...record,status:'failed',durationMs:Date.now()-started,error:error.name+': '+error.message,costUnknown:true};}
 reserved-=reserve;spend+=typeof record.usage?.cost==='number'?record.usage.cost:record.estimatedCost??reserve;
 await writeFile(file,JSON.stringify(record,null,2));
 console.log(JSON.stringify({case:c.id,status:record.status,ms:record.durationMs,billedUsd:record.usage?.cost??null,estimatedCost:record.estimatedCost??null,accountedSpend:spend,error:record.raw?.error??record.error}));
 if(record.status!=='ok')stop=true;
}}));
await writeFile(path.join(out,'run.json'),JSON.stringify({finishedAt:new Date().toISOString(),stoppedOnErrorOrBudget:stop,accountedSpend:spend,budgetUsd},null,2));
if(stop)process.exitCode=2;
