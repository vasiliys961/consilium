import {caseAnalysisInput,caseSignature,persistCopilotAnalysis,persistNativeProtocol,protocolSource,type ClinicalCase,type Analysis} from './casebook.ts';
import {readVaultCaseById} from './local-vault.ts';
import {requestStreamedJson,isCaseResultEnvelope} from './analysis-stream.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {withoutCaseIdentity} from './copilot-case-context.ts';
import type {PhysicianTool,PhysicianTaskPlan} from './physician-task-router.ts';
import type {ConductInput,CaseResult} from './conductor.ts';
import type {Locale} from './locale.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';
export type CopilotPendingResult={analysis?:Analysis;document?:ProtocolDocument};
export type CopilotStepReceipt={tool:PhysicianTool;status:'running'|'completed';detail:string};
const AUTOMATED=new Set<PhysicianTool>(['documents','medications','clinical','protocol']);
export function copilotExecutablePlan(plan:PhysicianTaskPlan,hasClinicalResult:boolean):PhysicianTool[]|null{
 const steps=[...new Set(plan.steps.map(step=>step.tool))];
 if(!steps.length||steps.length>4||steps.some(tool=>!AUTOMATED.has(tool)))return null;
 if(steps.includes('protocol')&&!hasClinicalResult&&!steps.includes('clinical'))steps.splice(steps.indexOf('protocol'),0,'clinical');
 return steps.length<=4?steps:null;
}
export async function prepareCopilotDisclosure(body:ConductInput,fetchImpl:typeof fetch,signal:AbortSignal){
 const response=await fetchImpl('/api/privacy/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,finalize:true}),signal});
 if(!response.ok)throw Error('Не удалось подготовить данные.');
 const result=await response.json();
 if(!result.body||typeof result.token!=='string')throw Error('Не удалось подготовить данные.');
 return {...result.body,privacy:{consent:true,token:result.token}};
}
/** Small controller over existing APIs. It cannot create orders, sign, delete, or choose another patient. */
export async function executeCopilotTask(input:{caseId:string;signature:string;question:string;steps:readonly PhysicianTool[];locale:Locale;signal:AbortSignal;onStep?:(receipt:CopilotStepReceipt)=>void;onPendingResult?:(result:CopilotPendingResult|null)=>void},deps:{fetch?:typeof fetch;readCase?:(id:string)=>Promise<ClinicalCase|null>;saveAnalysis?:typeof persistCopilotAnalysis;saveProtocol?:typeof persistNativeProtocol}={}):Promise<{caseId:string;completed:CopilotStepReceipt[]}>{
 const fetchImpl=deps.fetch??fetch,read=deps.readCase??readVaultCaseById;
 let value=await read(input.caseId);
 if(!value||value.deletedAt||value.status==='closed'||caseSignature(value)!==input.signature)throw Error('Сначала сохраните актуальные данные случая.');
 if(!input.steps.length||input.steps.length>4||input.steps.some(tool=>!AUTOMATED.has(tool)))throw Error('Этот маршрут продолжите в профильном модуле.');
 if(value.files.some(file=>file.image||file.audio||file.frames?.length||file.binary&&!file.text))throw Error('Сначала проверьте изображения и записи в профильном модуле.');
 const runId=crypto.randomUUID(),completed:CopilotStepReceipt[]=[];
 let medicationText='';
 const fresh=async()=>{input.signal.throwIfAborted();const current=await read(input.caseId);if(!current||current.deletedAt||current.status!=='active'||caseSignature(current)!==input.signature)throw Error('Данные случая изменились. Задача остановлена.');return current;};
 for(const tool of input.steps){
  value=await fresh();input.onStep?.({tool,status:'running',detail:''});
  let detail='';
  if(tool==='documents'){
   if(!value.context.trim()&&!value.files.some(file=>file.text?.trim()))throw Error('Добавьте клинические данные или результаты анализов.');
   detail=value.files.filter(file=>file.text?.trim()).map(file=>file.name).join(', ')||'Данные из карточки';
  }else if(tool==='medications'){
   if(!value.currentMedications?.trim())throw Error('Укажите текущие препараты в карточке случая.');
   const extracted=extractMedicationSafetyContext(value.context);
   const result=checkMedicationRegimen({current:value.currentMedications,context:extracted.context});
   medicationText=['Local medication rules; reported current regimen only.',...result.alerts.map(alert=>`${alert.first} + ${alert.second}: ${alert.risk} Source: ${alert.url}`),...result.organAlerts.map(alert=>`${alert.drug}: ${alert.risk} Source: ${alert.url}`),...extracted.issues,...result.missing,
    result.coverage.unrecognized.length?'Not covered by local rules: '+result.coverage.unrecognized.join(', '):''].filter(Boolean).join('\n');
   detail=medicationText;
  }else if(tool==='clinical'&&value.analyses.some(item=>item.question===input.question&&item.inputSignature===input.signature&&item.result.clinicalDraft==='generated')){
   detail='Использован сохранённый разбор';
  }else if(tool==='clinical'){
   const source=caseAnalysisInput(value),question=withoutCaseIdentity(input.question,value);
   const text=withoutCaseIdentity(source.text+'\n\nPhysician task: '+question+'\n\n'+medicationText,value);
   if(new TextEncoder().encode(text+JSON.stringify(source.files)).byteLength>24000)throw Error('Для этой задачи выберите меньше материалов.');
   const body=await prepareCopilotDisclosure({caseId:value.id,text,files:source.files.map((file,index)=>({...file,name:`material-${index+1}.txt`,text:file.text?withoutCaseIdentity(file.text,value!):undefined})),locale:input.locale,externalSearch:false,consilium:false,task:'clinical',retain:false},fetchImpl,input.signal);
   const result=await requestStreamedJson<CaseResult>('/api/v1/cases',body,{fetch:fetchImpl,signal:input.signal});
   if(!isCaseResultEnvelope(result)||result.clinicalDraft!=='generated')throw Error('Клинический разбор не завершён.');
   const entry:Analysis={id:runId,at:new Date().toISOString(),kind:'analysis',question:input.question,context:source.text,inputSignature:input.signature,materialsKey:source.materialsKey,visualEvidence:source.visualEvidence(result.visualReadings),result};
   input.onPendingResult?.({analysis:entry});
   input.signal.throwIfAborted();
   value=await (deps.saveAnalysis??persistCopilotAnalysis)(value.id,input.signature,entry);
   input.onPendingResult?.(null);detail='Клинический разбор сохранён';
  }else if(tool==='protocol'&&value.protocols?.some(document=>document.locale===input.locale&&document.generationMode==='from-analysis'&&document.sourceAnalysisId===value!.analyses[0]?.id&&value!.analyses[0]?.inputSignature===input.signature)){
   detail='Использован сохранённый протокол';
  }else if(tool==='protocol'){
   const analysis=value.analyses[0];
   if(!analysis||analysis.result.clinicalDraft!=='generated'||analysis.inputSignature!==input.signature)throw Error('Сначала нужен завершённый клинический разбор.');
   const source=withoutCaseIdentity(protocolSource(value),value);
   if(source.length>24000)throw Error('Для протокола выберите последнее заключение.');
   const reviewed=await prepareCopilotDisclosure({text:source,locale:input.locale,externalSearch:false,retain:false},fetchImpl,input.signal);
   const output=await requestStreamedJson<{document:ProtocolDocument}>('/api/protocol',{kind:'encounter',source:reviewed.text,locale:input.locale,mode:'from-analysis',sourceAnalysisId:analysis.id,privacyReview:reviewed},{fetch:fetchImpl,signal:input.signal});
   if(!output.document?.sections?.length||output.document.sourceAnalysisId!==analysis.id||output.document.locale!==input.locale)throw Error('Протокол не завершён.');
   input.onPendingResult?.({document:output.document});
   input.signal.throwIfAborted();await fresh();
   await (deps.saveProtocol??persistNativeProtocol)(value.id,{...output.document,edition:input.locale==='ru'?'ru':'global'},input.locale==='ru'?'ru':'en',input.locale,new Date().toISOString(),input.signature);
   input.onPendingResult?.(null);detail='Черновик протокола сохранён';
  }
  const receipt={tool,status:'completed' as const,detail};completed.push(receipt);input.onStep?.(receipt);
 }
 return {caseId:input.caseId,completed};
}
