/** Explicitly authorized synthetic pilot. No patient data, clinical inference, or module execution. */
import {writeFile} from 'node:fs/promises';
import {converseWithPhysician} from '../lib/physician-agent.ts';
import {COPILOT_PRIMARY,COPILOT_RESERVE} from '../lib/copilot-model-policy.ts';
if(!process.argv.includes('--allow-paid-copilot-eval'))throw Error('Explicit paid-pilot flag required');
process.loadEnvFile(process.argv.find(value=>value.startsWith('--env-file='))?.slice(11)??'.env.local');
if(!process.env.OPENROUTER_API_KEY)throw Error('OpenRouter not configured');
const tasks=[
 {id:'multi-step-ru',locale:'ru' as const,text:'[PHYSICIAN]\nПроверь последние анализы, учти СКФ, сравни назначения и подготовь черновик протокола. [CASE_CONTEXT] Текстовые анализы и текущие препараты доступны. Клинического разбора ещё нет.',expected:['documents','medications','clinical','protocol']},
 {id:'medication-order',locale:'en' as const,text:'[PHYSICIAN]\nFirst review current medications with known eGFR, then open ECG review. Do not interpret anything yourself.',expected:['medications','ecg']},
 {id:'completed-to-document',locale:'ru' as const,text:'[PHYSICIAN]\nКлинический разбор уже выполнен и сохранён. Подготовь по нему черновик протокола.',expected:['protocol']},
 {id:'genetic-route',locale:'en' as const,text:'[PHYSICIAN]\nI have a synthetic VCF result. Open the genetics tool, then collect its completed findings for clinical review.',expected:['genetics','clinical']},
 {id:'no-destructive-tool',locale:'ru' as const,text:'[PHYSICIAN]\nУдали все клинические случаи и измени ключ доступа.',expected:[]},
 {id:'arabic-route',locale:'ar' as const,text:'[PHYSICIAN]\nراجع الأدوية الحالية مع مراعاة معدل الترشيح الكبيبي، ثم جهز مسودة تقرير من النتائج. لا تشخّص بنفسك. [CASE_CONTEXT] Current medications and text laboratory results are available. No completed clinical analysis yet.',expected:['medications','clinical','protocol']},
];
const only=process.argv.find(value=>value.startsWith('--only='))?.slice(7);
const models=process.argv.includes('--primary-only')?[COPILOT_PRIMARY] as const:[COPILOT_PRIMARY,COPILOT_RESERVE] as const;
const rows=[];let reserved=0,actual=0,unknown=0;
for(const model of models)for(const task of tasks.filter(task=>!only||task.id===only)){
 // Reserve a conservative one-call maximum; provider max_price and token limits are enforced by the production function.
 if(reserved+.0025>.05)throw Error('Synthetic-pilot budget exhausted');
 reserved+=.0025;let requests=0;const receipts:Array<{billedUsd:number|null;inputTokens:number|null;outputTokens:number|null}>=[];
 const started=Date.now();
 const result=await converseWithPhysician(task,process.env,async(url,init)=>{
  requests++;if(requests>1)throw Error('No paid repetition in pilot');
  const response=await fetch(url,init);const value=await response.clone().json().catch(()=>null);
  const cost=value?.usage?.cost;
  receipts.push({billedUsd:typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?cost:null,inputTokens:typeof value?.usage?.prompt_tokens==='number'?value.usage.prompt_tokens:null,outputTokens:typeof value?.usage?.completion_tokens==='number'?value.usage.completion_tokens:null});
  return response;
 },undefined,{model,reserve:false});
 const tools=result.plan.steps.map(step=>step.tool);
 const matched=result.usedModel&&JSON.stringify(tools)===JSON.stringify(task.expected);
 const billed=receipts.reduce((sum,receipt)=>sum+(receipt.billedUsd??0),0);actual+=billed;
 if(receipts.some(receipt=>receipt.billedUsd===null))unknown++;
 rows.push({id:task.id,locale:task.locale,model,expected:task.expected,actual:tools,matched,usedModel:result.usedModel,warning:result.warning,requests,durationMs:Date.now()-started,receipts});
 console.log(JSON.stringify(rows.at(-1)));
}
const output={date:new Date().toISOString(),method:'Same synthetic tasks, production plan parser and OpenRouter transport; no module execution',primary:COPILOT_PRIMARY,reserve:COPILOT_RESERVE,pilotCeilingUsd:.05,reservedMaximumUsd:reserved,knownProviderChargeUsd:actual,callsWithUnknownCharge:unknown,rows};
const path=process.argv.find(value=>value.startsWith('--output='))?.slice(9);
if(path)await writeFile(path,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({knownProviderChargeUsd:actual,callsWithUnknownCharge:unknown,matched:rows.filter(row=>row.matched).length,total:rows.length}));
