import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,readCases,type Analysis} from './casebook.ts';
import {conduct} from './conductor.ts';
import {commitClinicalAnalysis,stagePhysicianQuestion} from './case-result-commit.ts';
const draft={question:'',note:'At request time',decision:'',tab:'analysis'};
function answer(id:string):Analysis{return {id,at:'2026-11-17T12:30:00.000Z',question:'Synthetic question',context:'Synthetic input at request time',result:{...conduct({text:'Synthetic only'}),clinicalDraft:'generated'}};}

test('a delayed analysis preserves new documents, physician decisions and the other window draft',async()=>{
 const original={...newCase(),updated:'2026-11-17T12:00:00.000Z'};
 await persistCase(original);
 const snapshot=stagePhysicianQuestion(original,'Synthetic question','submitted-question');
 const latest={...original,updated:'2026-11-17T12:20:00.000Z',title:'Changed while waiting',
  context:'New physician facts while analysis is pending',
  files:[{name:'synthetic-follow-up.txt',text:'new laboratory report',sha256:'a'.repeat(64)}],
  protocolScratch:{ru:{source:'synthetic',text:'New protocol draft',at:'2026-11-17T12:20:00.000Z'}},
  events:[{id:'doctor-decision',kind:'decision' as const,at:'2026-11-17T12:20:00.000Z',text:'Physician decision preserved'}],
  workspaceDraft:{question:'Different question not yet sent',note:'New note',decision:'New decision draft',tab:'decision'}};
 await persistCase(latest);
 const committed=await commitClinicalAnalysis(snapshot,answer('late-answer'),draft);
 assert.equal(committed.stored,true);
 const reopened=(await readCases()).find(c=>c.id===original.id)!;
 assert.equal(reopened.title,latest.title);
 assert.equal(reopened.context,latest.context);
 assert.deepEqual(reopened.files,latest.files);
 assert.deepEqual(reopened.protocolScratch,latest.protocolScratch);
 assert.deepEqual(reopened.events.map(e=>e.id),['doctor-decision','submitted-question']);
 assert.equal(reopened.workspaceDraft?.question,latest.workspaceDraft.question);
 assert.equal(reopened.workspaceDraft?.decision,'New decision draft');
 assert.equal(reopened.workspaceDraft?.note,'New note');
 assert.equal(reopened.analyses[0].context,'Synthetic input at request time','Do not reattribute an old answer to new facts');
 const repeated=await commitClinicalAnalysis(snapshot,answer('late-answer'),draft);
 assert.equal(repeated.value.analyses.length,1);
});

test('two completed results arriving together retain both histories',async()=>{
 const original=newCase();await persistCase(original);
 const results=await Promise.all([commitClinicalAnalysis(original,answer('first'),draft),commitClinicalAnalysis(original,answer('second'),draft)]);
 assert.ok(results.every(r=>r.stored));
 assert.deepEqual(new Set((await readCases()).find(c=>c.id===original.id)!.analyses.map(a=>a.id)),new Set(['first','second']));
});

test('a response cannot reopen or recreate a case closed or removed while waiting',async()=>{
 for(const removed of [false,true]){
  const original=newCase();await persistCase(original);
  if(removed)await persistCase(original,true);
  else await persistCase({...original,status:'closed'});
  const result=await commitClinicalAnalysis(original,answer('uncommitted'),draft);
  assert.equal(result.stored,false);
  assert.equal(result.value.analyses[0].id,'uncommitted','Completed text remains available for export');
  const latest=(await readCases()).find(c=>c.id===original.id);
  if(removed)assert.equal(latest,undefined);
  else {assert.equal(latest?.status,'closed');assert.equal(latest?.analyses.length,0);}
 }
});
