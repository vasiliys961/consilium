// Explicit user-authorized comparison: 20 NEW direct Opus image calls only.
// Reuses the frozen Argon/Flash image-reading protocol and existing baseline receipts.
import{readFile,writeFile,mkdir,readdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import path from'node:path';
const base=path.resolve('artifacts/ecg-comparison-2026-11-14'),out=path.resolve('artifacts/ecg-direct-opus-2026-11-14');
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
const original=JSON.parse(await readFile(path.join(base,'protocol.json'),'utf8'));
const model='anthropic/claude-opus-5.5',limit=2,prices={prompt:4,completion:20};
if(createHash('sha256').update(await readFile(path.join(base,'manifest.json'))).digest('hex')!==original.manifestSha256)throw Error('Frozen manifest mismatch');
let priorSpend=0;const baselineFiles=await readdir(path.join(base,'responses'));
if(baselineFiles.length!==80)throw Error('Incomplete previous benchmark');
for(const file of baselineFiles){const r=JSON.parse(await readFile(path.join(base,'responses',file),'utf8'));if(r.status!=='ok'||typeof r.usage?.cost!=='number')throw Error('Unaccounted prior call');priorSpend+=r.usage.cost;}
for(const c of manifest.cases){const image=await readFile(path.join(base,c.image));if(createHash('sha256').update(image).digest('hex')!==c.imageSha256||image.length>1400000)throw Error('Pinned image mismatch');}
await mkdir(path.join(out,'responses'),{recursive:true});
const protocol={createdFor:'2026-11-14',model,provider:'openrouter',caseCount:20,newCalls:20,temperature:original.temperature,reasoning:original.reasoning,max_tokens:original.visionTokens,system:original.visionSystem,userText:'Опишите эту ЭКГ и сформулируйте заключение.',manifestSha256:original.manifestSha256,baselineDirectory:path.relative(out,base),priorSpendUsd:priorSpend,combinedBudgetUsd:limit,additionalBudgetUsd:limit-priorSpend,method:'Direct Opus on the exact same 20 images and the SAME first-stage protocol as Argon. No prior model answers, reference labels, source reports, waveforms or clinical metadata in input. No retries, substitutions or paid judge. Compare frozen primary-code agreement; assess text separately without regrading primary codes.'};
const protocolFile=path.join(out,'protocol.json');
try{const previous=JSON.parse(await readFile(protocolFile,'utf8'));if(JSON.stringify(previous)!==JSON.stringify(protocol))throw Error('Protocol changed');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(protocolFile,JSON.stringify(protocol,null,2));}
if(!process.argv.includes('--execute')){console.log(JSON.stringify({newCalls:20,priorSpendUsd:priorSpend,additionalBudgetUsd:limit-priorSpend,combinedLimitUsd:limit,imageHashesVerified:20}));process.exit(0);}
process.loadEnvFile('.env.local');const key=process.env.OPENROUTER_API_KEY;if(!key)throw Error('OpenRouter key missing');
const catalogueResponse=await fetch('https://openrouter.ai/api/v1/models',{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
if(!catalogueResponse.ok)throw Error('Catalogue unavailable; no paid calls made');
const catalogue=await catalogueResponse.json(),entry=catalogue.data?.find(m=>m.id===model);
if(!entry?.architecture?.input_modalities?.includes('image')||Number(entry.pricing?.prompt)*1e6>prices.prompt*1.001||Number(entry.pricing?.completion)*1e6>prices.completion*1.001)throw Error('Image support missing or tariff exceeds cap');
await writeFile(path.join(out,'catalog.json'),JSON.stringify({checkedAt:new Date().toISOString(),model:entry},null,2));
let newSpend=0,reserved=0,stop=false,cursor=0;
for(const file of await readdir(path.join(out,'responses'))){const r=JSON.parse(await readFile(path.join(out,'responses',file),'utf8'));newSpend+=typeof r.usage?.cost==='number'?r.usage.cost:r.reservationUsd;if(r.status!=='ok')throw Error('Failed/unknown previous receipt; refuse paid rerun');}
const reserve=(20000*prices.prompt+original.visionTokens*prices.completion)/1e6;
const classes=['NORM','AFIB','CRBBB','CLBBB','1AVB','LVH','MI','OTHER','UNCERTAIN'];
await Promise.all(Array.from({length:2},async()=>{while(cursor<manifest.cases.length&&!stop){
 const c=manifest.cases[cursor++],file=path.join(out,'responses',c.id+'.json');
 try{await readFile(file);console.log(JSON.stringify({case:c.id,status:'already-recorded'}));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(priorSpend+newSpend+reserved+reserve>limit){stop=true;console.log(JSON.stringify({event:'budget-stop',priorSpend,newSpend,reserved}));break;}
 reserved+=reserve;
 const request={model,temperature:original.temperature,max_tokens:original.visionTokens,reasoning:original.reasoning,response_format:{type:'json_object'},provider:{max_price:prices,allow_fallbacks:false},messages:[{role:'system',content:original.visionSystem},{role:'user',content:[{type:'text',text:protocol.userText},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+(await readFile(path.join(base,c.image))).toString('base64')}}]}]};
 const started=Date.now();let r={caseId:c.id,requestedModel:model,provider:'openrouter',imageSha256:c.imageSha256,status:'in_flight',reservationUsd:reserve,startedAt:new Date(started).toISOString()};
 await writeFile(file,JSON.stringify(r,null,2));
 try{
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(150000)});
  const text=await response.text();let raw;try{raw=JSON.parse(text);}catch{raw={nonJsonBody:text.slice(0,1000)};}
  const choice=raw.choices?.[0];let parsed;try{parsed=JSON.parse((choice?.message?.content??'').replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{}
  const valid=typeof parsed?.description_ru==='string'&&parsed.description_ru.trim()&&typeof parsed?.conclusion_ru==='string'&&parsed.conclusion_ru.trim()&&classes.includes(parsed.primary_pattern);
  r={...r,returnedModel:raw.model??null,httpStatus:response.status,finishReason:choice?.finish_reason??null,status:response.ok&&!raw.error&&choice?.finish_reason==='stop'&&valid&&raw.model===model?'ok':'failed',durationMs:Date.now()-started,usage:raw.usage??null,parsed:parsed??null,raw};
 }catch(e){r={...r,status:'failed',durationMs:Date.now()-started,error:e.name+': '+e.message,costUnknown:true};}
 reserved-=reserve;newSpend+=typeof r.usage?.cost==='number'?r.usage.cost:reserve;
 await writeFile(file,JSON.stringify(r,null,2));
 console.log(JSON.stringify({case:c.id,status:r.status,ms:r.durationMs,costUsd:r.usage?.cost??null,newSpendUsd:newSpend,combinedSpendUsd:priorSpend+newSpend,error:r.raw?.error??r.error}));
 if(r.status!=='ok')stop=true;
}}));
await writeFile(path.join(out,'run.json'),JSON.stringify({finishedAt:new Date().toISOString(),stopped:stop,priorSpendUsd:priorSpend,newSpendUsd:newSpend,combinedSpendUsd:priorSpend+newSpend,combinedLimitUsd:limit},null,2));
if(stop)process.exitCode=2;
