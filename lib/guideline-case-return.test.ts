import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,persistCaseAutosave,persistCaseDraft,persistGuidelineDraft,persistGuidelineResult,createCaseFromGuideline,readCases,caseSignature,persistCopilotAnalysis,type ClinicalCase} from './casebook.ts';
import {emptyGuidelineDraft,guidelineResultFromResponse,guidelineWorkspaceForCase,validGuidelineDraft,validGuidelineResult,draftFromGuidelineReport,type GuidelineResult} from './guideline-case-return.ts';
import {createPortableCaseFile,restorePortableCaseFile} from './portable-case-file.ts';
import {guidelineUi} from './guideline-ui.ts';
import {WORKSPACE_LANGUAGES} from './workspace-i18n.ts';
import {conduct} from './conductor.ts';

const text='SYNTHETIC REFERENCE ONLY. This is a persistence fixture, not clinical guidance. Verify the original document at https://example.org/synthetic-source.';
function response(caseId?:string):GuidelineResult{
 return guidelineResultFromResponse({text,model:'synthetic-no-provider-call',estimatedUsd:0,inputTokens:0,outputTokens:0,searchMode:'standard'},
  {topic:'SYNTHETIC guidance persistence',specialty:'',language:'en',caseId});
}
async function reopened(id:string){return (await readCases()).find(item=>item.id===id)!;}

test('guideline response binds exact submitted topic/language/case and rejects malformed cost, mode or content',()=>{
 const result=response('case-A');assert.equal(validGuidelineResult(result,'case-A'),true);assert.equal(validGuidelineResult(result,'case-B'),false);
 assert.equal(result.originalText,result.text);assert.equal(result.language,'en');
 for(const changed of [{text:''},{model:undefined},{estimatedUsd:NaN},{inputTokens:-1},{outputTokens:1.5},{searchMode:'unknown'}]){
  const raw={text,model:'synthetic',estimatedUsd:0,inputTokens:1,outputTokens:1,searchMode:'standard',...changed};
  assert.throws(()=>guidelineResultFromResponse(raw,{topic:'Synthetic query',specialty:'',language:'en'}),/invalid_response/);
 }
});

test('guideline drafts reopen only their own case and cannot be erased by a same-timestamp editor snapshot',async()=>{
 const a=newCase(),b=newCase();await persistCase(a);await persistCase(b);
 const draft={...emptyGuidelineDraft('en'),query:'Synthetic A unsent query',result:response(a.id)};
 const saved=await persistGuidelineDraft(a.id,draft);
 assert.equal(await persistCaseAutosave({...a,updated:saved.updated}),false);
 assert.equal(guidelineWorkspaceForCase(await reopened(b.id),'ru').query,'');
 const restored=guidelineWorkspaceForCase(await reopened(a.id),'en');assert.equal(restored.query,draft.query);
 restored.result!.text='Changed locally';assert.equal((await reopened(a.id)).guidelineDraft?.result?.text,text);
 await assert.rejects(()=>persistGuidelineDraft(b.id,draft),/case_mismatch/);
 assert.equal(validGuidelineDraft({...draft,result:{...draft.result,text:''}},a.id),true,'an empty edit remains a recoverable draft, not a saved report');
});

test('explicit guideline save preserves patient facts/decisions, retains originals and adds a hash-bound reference only',async()=>{
 const value=newCase();value.context='Synthetic patient facts';value.files=[{name:'lab.txt',text:'Synthetic lab',sha256:'a'.repeat(64)}];
 value.events=[{id:'doctor-decision',kind:'decision',at:value.created,text:'Unchanged physician decision'}];
 await persistCase(value);const result=response(value.id);
 const editor={question:'New unsent question',note:'New observation',decision:'Pending decision',tab:'decision'};
 await Promise.all([persistGuidelineResult(value.id,result),persistCaseDraft(value.id,editor)]);
 let saved=await reopened(value.id);assert.deepEqual(saved.files,value.files);assert.deepEqual(saved.events,value.events);assert.equal(saved.context,value.context);assert.deepEqual(saved.workspaceDraft,editor);
 assert.equal(saved.analyses.length,0,'a guidance lookup is not a patient clinical analysis');
 assert.equal(saved.guidelineReports?.length,1);assert.equal(saved.library?.length,1);
 const ref=saved.library![0];assert.match(ref.text!,/reference material, not patient facts/);assert.match(ref.text!,/not been independently validated/);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ref.text!))),byte=>byte.toString(16).padStart(2,'0')).join('');
 assert.equal(ref.sha256,digest);assert.equal(saved.guidelineReports![0].referenceSha256,digest);
 await persistGuidelineResult(value.id,result);assert.equal((await reopened(value.id)).guidelineReports?.length,1,'repeat click is idempotent');
 await persistGuidelineResult(value.id,{...result,text:'SYNTHETIC physician revision — no actual advice.'});
 saved=await reopened(value.id);assert.equal(saved.guidelineReports?.length,2);assert.equal(saved.guidelineReports![0].result.originalText,text);assert.equal(saved.guidelineReports![1].result.text,text);
 assert.equal(saved.library?.length,1,'only one edit of the same response is an active reference');
 assert.equal(saved.library![0].sha256,saved.guidelineReports![0].referenceSha256);
 assert.notEqual(saved.library![0].sha256,saved.guidelineReports![1].referenceSha256);
 assert.notEqual(caseSignature(saved),caseSignature(value),'new reference material changes the next review inputs');
 const fake=conduct({text:'Synthetic fixture'});fake.clinicalDraft='generated';
 await assert.rejects(()=>persistCopilotAnalysis(value.id,caseSignature(value),{id:'stale-answer',at:value.created,context:'Old context',result:fake}),/Данные случая изменились/);
});

test('closed, missing, foreign-owner and empty results cannot append guidance',async()=>{
 const value=newCase();await persistCase(value);
 await assert.rejects(()=>persistGuidelineResult(value.id,response('foreign')),/case_mismatch/);
 await assert.rejects(()=>persistGuidelineResult(value.id,{...response(value.id),text:''}),/case_mismatch/);
 await persistCase({...value,status:'closed'});
 await assert.rejects(()=>persistGuidelineResult(value.id,response(value.id)),/not_active/);
 await assert.rejects(()=>persistGuidelineDraft(value.id,emptyGuidelineDraft('en')),/not_active/);
 await assert.rejects(()=>persistGuidelineResult(crypto.randomUUID(),response()),/not_active/);
 assert.equal((await reopened(value.id)).guidelineReports,undefined);
});

test('guidance and unfinished edits survive encrypted case copy with correctly rebound owners',async()=>{
 const value=newCase();await persistCase(value);const result=response(value.id);
 await persistGuidelineDraft(value.id,{...emptyGuidelineDraft('en'),query:result.topic,result:{...result,text:'SYNTHETIC unfinished edit'}});
 await persistGuidelineResult(value.id,result);
 const before=await reopened(value.id);
 const archive=await createPortableCaseFile(value.id,'synthetic guidelines transfer');
 const copy=await restorePortableCaseFile(archive,'synthetic guidelines transfer','copy'),restored=await reopened(copy.id);
 assert.equal(guidelineWorkspaceForCase(restored,'en').result?.caseId,copy.id);
 assert.equal(restored.guidelineReports![0].result.caseId,copy.id);
 assert.equal(restored.guidelineReports![0].result.originalText,text);assert.deepEqual(restored.library,before.library);
 const exact=draftFromGuidelineReport(restored.guidelineReports![0],copy.id);assert.equal(exact.result?.text,text,'explicit saved version differs from unfinished edit');
 assert.equal(restored.guidelineDraft?.result?.text,'SYNTHETIC unfinished edit');
 assert.equal((await reopened(value.id)).guidelineReports![0].result.caseId,value.id);
});

test('standalone guidance creates one complete reference-only case without fabricating patient facts',async()=>{
 const draft={...emptyGuidelineDraft('en'),query:'Synthetic standalone query',result:response()};
 const created=await createCaseFromGuideline(draft),saved=await reopened(created.id);
 assert.equal(saved.context,'');assert.equal(saved.question,'');assert.deepEqual(saved.files,[]);assert.deepEqual(saved.events,[]);assert.deepEqual(saved.analyses,[]);
 assert.equal(saved.library?.length,1);assert.equal(saved.guidelineReports?.length,1);assert.equal(saved.guidelineDraft?.result?.caseId,saved.id);
 await assert.rejects(()=>createCaseFromGuideline({...draft,result:response('existing-case')}),/standalone_result_required/);
});

test('guideline save restores a deliberately removed reference without duplicating the saved report',async()=>{
 const value=newCase();await persistCase(value);const result=response(value.id);
 const saved=await persistGuidelineResult(value.id,result);await persistCase({...saved,library:[]});
 const repaired=await persistGuidelineResult(value.id,result);assert.equal(repaired.guidelineReports?.length,1);assert.equal(repaired.library?.length,1);
});

test('new guideline case actions are translated in every supported UI language',()=>{
 for(const locale of WORKSPACE_LANGUAGES)for(const key of ['pickCase','save','saved','referenceHint','draftError','caseClosed','reportMissing','newCase','openSaved'] as const){
  const value=guidelineUi(locale.code,key);assert.ok(value.trim());if(locale.code!=='ru')assert.notEqual(value,guidelineUi('ru',key),`${locale.code}: ${key}`);
 }
});
