import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newCase, readCases, persistCase, caseAnalysisInput, type Analysis } from './casebook.ts';
import { commitClinicalAnalysis } from './case-result-commit.ts';
import { conduct } from './conductor.ts';
const require=createRequire(import.meta.url);

function step(id:string,clinicalDraft:'generated'|'unavailable'='generated',kind:Analysis['kind']='analysis'):Analysis {
  return {
    id,at:'2026-11-15T19:00:00Z',context:'Synthetic case',
    kind,question:'What changes the next step?',
    result:{...conduct({text:'Synthetic case'}),clinicalDraft,
      draft:{status:'unsigned',summary:'Completed synthetic answer '+id,statements:[]}},
  };
}
const pending={question:'',note:'Follow-up note kept in editor',decision:'',tab:'analysis'};

test('C2: the new case answer and new physician question are durable before commit returns',async()=>{
  const {indexedDB}=require('fake-indexeddb');
  Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
  const original=newCase(110);
  original.context='Synthetic case, no patient';
  original.events.push({id:'question-2',at:'2026-11-15T18:55:00Z',kind:'question',text:'What changes the next step?'});
  const entry=step('analysis-2');
  let sawPersisted=false;
  const committed=await commitClinicalAnalysis(original,entry,pending,async(value)=>{
    await persistCase(value);
    const opened=(await readCases()).find(c=>c.id===original.id);
    sawPersisted=Boolean(opened?.analyses.some(a=>a.id===entry.id)
      && opened?.events.some(e=>e.id==='question-2')
      && opened?.workspaceDraft?.question==='');
  });
  assert.equal(committed.stored,true);
  assert.equal(sawPersisted,true);
  assert.equal(committed.value.analyses.length,1);
  assert.match(caseAnalysisInput(committed.value).text,/What changes the next step/);
  assert.equal(original.analyses.length,0,'original case is not mutated');
});

test('C2: a failed IndexedDB write never discards completed result or pretends it is stored',async()=>{
  const original=newCase(111);
  const entry=step('analysis-durable-fallback');
  const saved=await commitClinicalAnalysis(original,entry,pending,async()=>{
    throw new Error('SYNTHETIC_LOCAL_QUOTA_EXCEEDED');
  });
  assert.equal(saved.stored,false);
  assert.equal(saved.value.analyses[0]?.id,entry.id);
  assert.match(saved.value.analyses[0]?.result.draft.summary??'',/Completed synthetic answer/);
  assert.equal(original.analyses.length,0);
});

test('C2: incomplete response cannot create an automatically editable summary decision',async()=>{
  const original=newCase(112);
  const result=await commitClinicalAnalysis(original,step('incomplete-summary','unavailable','summary'),pending,async()=>{});
  assert.equal(result.stored,true);
  assert.equal(result.value.decisionDraft,undefined);
  const accepted=await commitClinicalAnalysis(original,step('completed-summary','generated','summary'),pending,async()=>{});
  assert.equal(accepted.value.decisionDraft?.analysisId,'completed-summary');
});

test('C2: a second completed analysis retains the first and does not duplicate physician question events',async()=>{
  const original=newCase(113);
  original.events=[{id:'question-1',at:original.created,kind:'question',text:'First question'}];
  const first=await commitClinicalAnalysis(original,step('first'),pending,async()=>{});
  const second=await commitClinicalAnalysis(first.value,{...step('second'),at:'2026-11-15T20:00:00Z'},pending,async()=>{});
  assert.deepEqual(second.value.analyses.map(a=>a.id),['second','first']);
  assert.deepEqual(second.value.events.map(e=>e.id),['question-1']);
});
