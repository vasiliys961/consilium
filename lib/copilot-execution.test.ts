import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,caseSignature} from './casebook.ts';
import {readVaultCaseById} from './local-vault.ts';
import {executeCopilotTask,copilotExecutablePlan,type CopilotPendingResult} from './copilot-execution.ts';
import {conduct} from './conductor.ts';
import {copilotCaseContext,withoutCaseIdentity,matchingLocalCases} from './copilot-case-context.ts';
import {physicianToolSteps} from './physician-task-router.ts';
function fixture(){const value=newCase();value.title='Synthetic Copilot';value.context='СКФ: 42\nКалий: 5.3\nВозраст: 68';value.currentMedications='ramipril; spironolactone';value.files=[{name:'SyntheticTestov-lab.txt',text:'SyntheticTestov: eGFR 42; potassium 5.3'}];value.privatePatient={name:'SyntheticTestov',birthDate:'1960-01-01',identifiers:'FAKE-ID-9911',dates:''};value.events=[{id:'decision',kind:'decision' as const,text:'Original physician decision',at:value.created}];return value;}
function transport(calls:string[],inspect?:(url:string,body:any)=>Promise<void>){return (async(url,init)=>{
 const body=JSON.parse(String(init?.body));calls.push(String(url));await inspect?.(String(url),body);
 assert.doesNotMatch(JSON.stringify(body),/SyntheticTestov|FAKE-ID-9911|1960-01-01/);
 if(url==='/api/privacy/prepare')return Response.json({body:body.body,token:'synthetic-token'});
 if(url==='/api/v1/cases'){const result=conduct({text:'Synthetic clinical result'});return Response.json({...result,clinicalDraft:'generated',gateway:{...result.gateway,called:true}});}
 if(url==='/api/protocol')return Response.json({document:{id:'synthetic-protocol',created:new Date().toISOString(),kind:'encounter',locale:body.locale,sourceAnalysisId:body.sourceAnalysisId,generationMode:'from-analysis',sourceSnapshot:body.source,sections:[{id:'Assessment',title:'Synthetic assessment',text:'Completed synthetic draft, no real patient'}]}});
 throw Error('Unexpected request');
 }) as typeof fetch;}
async function clean(id:string){const value=await readVaultCaseById(id);if(value)await persistCase(value,true);}

test('approved four-step task uses existing APIs and saves clinical result and protocol into exactly the same case',async()=>{
 const value=fixture(),other=fixture();await persistCase(value);await persistCase(other);const calls:string[]=[];
 try{
  const input={caseId:value.id,signature:caseSignature(value),question:'Review labs, renal function and medications; draft a note',steps:['documents','medications','clinical','protocol'] as const,locale:'ru' as const,signal:new AbortController().signal};
  const result=await executeCopilotTask(input,{fetch:transport(calls)});
  assert.equal(result.caseId,value.id);assert.equal(result.completed.length,4);
  const reopened=(await readVaultCaseById(value.id))!;
  assert.equal(reopened.analyses.length,1);assert.equal(reopened.protocols?.length,1);
  assert.equal(reopened.protocols?.[0].sourceAnalysisId,reopened.analyses[0].id);
  assert.deepEqual(reopened.privatePatient,value.privatePatient);assert.deepEqual(reopened.events,value.events);
  assert.equal((await readVaultCaseById(other.id))?.analyses.length,0);
  assert.deepEqual(calls,['/api/privacy/prepare','/api/v1/cases','/api/privacy/prepare','/api/protocol']);
  calls.length=0;await executeCopilotTask(input,{fetch:transport(calls)});assert.equal(calls.length,0,'completed identical work is reused without paying again');
 }finally{await clean(value.id);await clean(other.id);}
});
test('changed clinical source cannot receive a stale result and the completed answer remains available for recovery',async()=>{
 const value=fixture();await persistCase(value);let pending:CopilotPendingResult|null=null;
 try{
  await assert.rejects(()=>executeCopilotTask({caseId:value.id,signature:caseSignature(value),question:'Synthetic check',steps:['clinical'],locale:'ru',signal:new AbortController().signal,onPendingResult:result=>{pending=result;}},{fetch:transport([],async(url)=>{if(url==='/api/v1/cases')await persistCase({...value,context:'Changed source while request was running'});})}),/изменились/);
  assert.ok((pending as CopilotPendingResult|null)?.analysis);assert.equal((await readVaultCaseById(value.id))?.analyses.length,0);
 }finally{await clean(value.id);}
});
test('unreviewed pixels, closed case and unsupported tool stop before any model request',async()=>{
 const value=fixture();value.files=[{name:'synthetic.png',image:'data:image/png;base64,AAAA'}];await persistCase(value);let calls=0;
 try{await assert.rejects(()=>executeCopilotTask({caseId:value.id,signature:caseSignature(value),question:'Synthetic',steps:['clinical'],locale:'en',signal:new AbortController().signal},{fetch:async()=>{calls++;throw Error();}}),/изображения/);assert.equal(calls,0);}
 finally{await clean(value.id);}
 const plan={intent:'route' as const,message:'',steps:physicianToolSteps(['medications','protocol'])};
 assert.deepEqual(copilotExecutablePlan(plan,false),['medications','clinical','protocol']);
 assert.equal(copilotExecutablePlan({...plan,steps:physicianToolSteps(['radiology'])},false),null);
});
test('patient matching stays local and known identities never enter the coordinator context',()=>{
 const value=fixture();assert.deepEqual(matchingLocalCases('SyntheticTestov',[value]).map(v=>v.id),[value.id]);
 assert.doesNotMatch(copilotCaseContext(value),/SyntheticTestov|FAKE-ID-9911/);
 assert.equal(withoutCaseIdentity('SyntheticTestov eGFR 42 FAKE-ID-9911',value),'[patient] eGFR 42 [patient]');
});

test('protocol source guard is atomic with the case write and preserves the completed draft on a race',async()=>{
 const value=fixture();await persistCase(value);let pending:CopilotPendingResult|null=null;
 try{
  await assert.rejects(()=>executeCopilotTask({caseId:value.id,signature:caseSignature(value),question:'Synthetic atomic save',steps:['clinical','protocol'],locale:'ru',signal:new AbortController().signal,onPendingResult:result=>{pending=result;}},{fetch:transport([]),saveProtocol:async(...args)=>{const current=(await readVaultCaseById(value.id))!;await persistCase({...current,context:'Changed immediately before serialized protocol write'});const {persistNativeProtocol}=await import('./casebook.ts');return persistNativeProtocol(...args);}}),/изменились/);
  const saved=(await readVaultCaseById(value.id))!;assert.equal(saved.analyses.length,1);assert.equal(saved.protocols?.length??0,0);assert.ok((pending as CopilotPendingResult|null)?.document);
 }finally{await clean(value.id);}
});
test('closed cases are rejected before any external request',async()=>{
 const value=fixture();value.status='closed';await persistCase(value);let calls=0;
 try{await assert.rejects(()=>executeCopilotTask({caseId:value.id,signature:caseSignature(value),question:'Synthetic',steps:['clinical'],locale:'en',signal:new AbortController().signal},{fetch:async()=>{calls++;throw Error();}}));assert.equal(calls,0);}finally{await clean(value.id);}
});
