// Explicitly invoked, paid comparison on pinned PUBLIC VQA-RAD images only.
// No case database, uploads or application configuration is read or changed.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const dir=path.resolve('artifacts/gemini-vision-comparison-2026-11-12');
const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
const models=['google/gemini-3.8-flash','google/gemini-3.1-pro-preview','google/gemini-4-argon'];
if(process.argv.includes('--polza'))throw Error('Polza is disabled in this application.');
const provider='openrouter';
const execute=process.argv.includes('--execute');
const pilot=process.argv.includes('--pilot');
const maxTokens=6144;
const system='You are comparing image interpretation on public radiology teaching images. Use only the supplied pixels. Do not assume a full study, clinical history or findings outside the frame. Give a concise factual description in Russian (80–150 words), separating visible findings from uncertainty. Answer the supplied English control question with a short English answer; for yes/no questions use exactly yes, no, or uncertain. Do not guess invisible findings. Return only a JSON object: {"description_ru":"...","answer":"...","confidence":"high|medium|low","limitations_ru":"..."}. No markdown fences.';
const config={provider,models,temperature:0,reasoning:{effort:'low'},max_tokens:maxTokens,response_format:{type:'json_object'},system,caseCount:20,protocol:'One independent fresh request per image and model. No previous answers or reference answers in input. No automatic retries or model/provider substitution. Primary metric: normalized exact match on the preselected control question, with narrow explicitly listed English equivalents reported separately. No LLM judge or blinded radiologist assessment. Free descriptions are unvalidated supplementary material.',maximumEstimatedSpend:{polzaRub:300,openrouterUsd:5}};
await mkdir(path.join(dir,'responses',provider),{recursive:true});
await writeFile(path.join(dir,`protocol-${provider}.json`),JSON.stringify(config,null,2));
if(!execute){console.log(JSON.stringify(config,null,2));process.exit(0);}
process.loadEnvFile('.env.local');
const key=provider==='polza'?process.env.POLZA_API_KEY:process.env.OPENROUTER_API_KEY;
if(!key)throw Error('Provider key is not configured');
const catalogue=JSON.parse(await readFile(path.join(dir,`catalog-${provider}.json`),'utf8')).models;
for(const model of models){const c=catalogue.find(m=>m.id===model);if(!c?.architecture?.input_modalities?.includes('image'))throw Error('No advertised image support: '+model);}
function rate(model){const c=catalogue.find(m=>m.id===model);return provider==='polza'?{input:Number(c.top_provider.pricing.prompt_per_million)/1e6,output:Number(c.top_provider.pricing.completion_per_million)/1e6}: {input:Number(c.pricing.prompt),output:Number(c.pricing.completion)};}
let spend=0,reserved=0,stop=false;
const limit=provider==='polza'?300:5;
const selected=pilot?manifest.cases.slice(0,1):manifest.cases;
const jobs=selected.flatMap((c,i)=>models.map((_,j)=>({c,model:models[(j+i)%models.length]})));
let cursor=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length&&!stop){
 const {c,model}=jobs[cursor++];
 const file=path.join(dir,'responses',provider,`${c.id}--${model.split('/')[1]}.json`);
 try{await access(file);const previous=JSON.parse(await readFile(file,'utf8'));spend+=previous.estimatedCost??0;if(previous.status!=='ok')stop=true;console.log(JSON.stringify({case:c.id,model,status:'already-recorded'}));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
 const rates=rate(model),reservation=20000*rates.input+maxTokens*rates.output;
 if(spend+reserved+reservation>limit){stop=true;console.log('Budget guard reached');break;}
 reserved+=reservation;
 const image=await readFile(path.join(dir,c.image));
 if(createHash('sha256').update(image).digest('hex')!==c.sha256)throw Error('Image hash mismatch');
 const question=`Опишите представленное изображение. Затем ответьте на контрольный вопрос: ${c.question}`;
 const request={model,temperature:0,max_tokens:maxTokens,reasoning:{effort:'low'},response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:[{type:'text',text:question},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image.toString('base64')}}]}]};
 const started=Date.now();let result;
 try{
  const response=await fetch(`https://${provider==='polza'?'polza.ai':'openrouter.ai'}/api/v1/chat/completions`,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
  const rawText=await response.text();let raw;try{raw=JSON.parse(rawText);}catch{raw={nonJsonBody:rawText.slice(0,2000)};}
  const choice=raw.choices?.[0],text=choice?.message?.content??'';let parsed;try{parsed=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{}
  const valid=typeof parsed?.description_ru==='string'&&typeof parsed?.answer==='string'&&parsed.answer.trim().length>0;
  const usage=raw.usage??{};
  const estimatedCost=(Number(usage.prompt_tokens)||0)*rates.input+(Number(usage.completion_tokens)||0)*rates.output;
  result={caseId:c.id,requestedModel:model,returnedModel:raw.model??null,provider,startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,httpStatus:response.status,status:response.ok&&!raw.error&&choice?.finish_reason==='stop'&&valid?'ok':'failed',finishReason:choice?.finish_reason??null,imageSha256:c.sha256,question:c.question,usage,estimatedCost,estimatedCurrency:provider==='polza'?'RUB':'USD',parsed:parsed??null,raw};
 }catch(e){result={caseId:c.id,requestedModel:model,provider,status:'failed',startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,error:e.name+': '+e.message,estimatedCost:null,costUnknown:true};}
 reserved-=reservation;spend+=result.estimatedCost??reservation;
 await writeFile(file,JSON.stringify(result,null,2));
 console.log(JSON.stringify({case:c.id,model,status:result.status,httpStatus:result.httpStatus,ms:result.durationMs,cost:result.estimatedCost,usage:result.usage,error:result.raw?.error??result.error,totalEstimatedSpend:spend}));
 // Stop scheduling on failures; already in-flight requests are still recorded.
 if(result.status!=='ok')stop=true;
}}));
await writeFile(path.join(dir,`run-${provider}${pilot?'-pilot':''}.json`),JSON.stringify({finishedAt:new Date().toISOString(),pilot,stoppedOnErrorOrBudget:stop,estimatedCost:spend,currency:provider==='polza'?'RUB':'USD'},null,2));
if(stop)process.exitCode=2;
