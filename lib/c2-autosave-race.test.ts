import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {
  newCase,readCases,persistCase,persistCaseAutosave,persistCaseDraft,caseAnalysisInput,
  type Analysis,type ClinicalCase,
} from './casebook.ts';
import {preservePendingQuestion,commitClinicalAnalysis} from './case-result-commit.ts';
import {conduct} from './conductor.ts';

const {indexedDB}=createRequire(import.meta.url)('fake-indexeddb');
Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
const t0='2026-11-15T18:00:00.000Z';
const t1='2026-11-15T19:00:00.000Z';
const draft={question:'New question',note:'Synthetic new observation',decision:'',tab:'analysis'};

function answer(id:string):Analysis{
 const result=conduct({text:'Synthetic reasoning test'});
 result.clinicalDraft='generated';
 result.draft={status:'unsigned',summary:'SYNTHETIC COMPLETED CONCLUSION '+id,statements:[]};
 return {id,at:t1,context:'Synthetic initial question',result};
}

test('C2: older editor autosave cannot erase a newer clinical result, ECG and image',async()=>{
 const initial:ClinicalCase={...newCase(310),updated:t0,title:'Synthetic C2',context:'Patient-free test fixture',
   files:[{name:'old.png',sha256:'a'.repeat(64),image:'data:image/png;base64,AAAA'}]};
 await persistCase(initial);
 const earlier={...initial,workspaceDraft:{question:'Old question',note:'Previous autosave',decision:'',tab:'analysis'}};
 const updated:ClinicalCase={...initial,updated:t1,
   files:[...initial.files,{name:'new.png',sha256:'b'.repeat(64),image:'data:image/png;base64,BBBB'}],
   analyses:[answer('confirmed')],
   events:[{id:'new-event',at:t1,kind:'note',text:'New clinical material'}]};
 await persistCase(updated);
 const applied=await persistCaseAutosave(earlier);
 assert.equal(applied,false);
 const latest=(await readCases()).find(x=>x.id===initial.id);
 assert.ok(latest);
 assert.deepEqual(latest.analyses.map(x=>x.id),['confirmed']);
 assert.equal(latest.files.length,2);
 assert.ok(latest.files.some(x=>x.name==='new.png'));
 assert.ok(latest.events.some(x=>x.id==='new-event'));
 assert.match(caseAnalysisInput(latest).text,/SYNTHETIC COMPLETED CONCLUSION/);
});

test('C2: queued autosave finishing before or after the final result cannot erase the result',async()=>{
 const initial:ClinicalCase={...newCase(311),updated:t0};
 await persistCase(initial);
 const stale={...initial,workspaceDraft:draft};
 const outcome={...initial,updated:t1,analyses:[answer('queue')],files:[{name:'trace.csv',sha256:'c'.repeat(64),text:'SYNTHETIC'}]};
 const [first,second]=await Promise.all([persistCaseAutosave(stale),persistCase(outcome)]);
 assert.equal(first,true);
 assert.equal(second,undefined);
 const lastApplied=await persistCaseAutosave(stale);
 assert.equal(lastApplied,false);
 const reopened=(await readCases()).find(x=>x.id===initial.id);
 assert.equal(reopened?.analyses[0]?.id,'queue');
 assert.equal(reopened?.files[0]?.name,'trace.csv');
});

test('C2: an editor-only patch rebases on newer source materials but checks the case version',async()=>{
 const original:ClinicalCase={...newCase(312),updated:t0};
 await persistCase(original);
 const newImage={...original,updated:t1,files:[{name:'new-CT.dcm',sha256:'d'.repeat(64),processingModule:'radiology' as const}]};
 await persistCase(newImage);
 assert.equal(await persistCaseDraft(original.id,draft,t0),false,
   'a stale component cannot reintroduce an old question after a confirmed result');
 assert.equal(await persistCaseDraft(original.id,draft,t1),true);
 const loaded=(await readCases()).find(x=>x.id===original.id);
 assert.equal(loaded?.files.length,1);
 assert.equal(loaded?.files[0]?.sha256,'d'.repeat(64));
 assert.equal(loaded?.workspaceDraft?.question,'New question');
});

test('C2: preflight question save retains in-memory changes to clinical context and pending attachments',async()=>{
 const original:ClinicalCase={...newCase(313),updated:t0};
 await persistCase(original);
 const edited:ClinicalCase={...original,updated:t1,context:'New clinical observation pending autosave',
   files:[{name:'synthetic-photo.png',sha256:'e'.repeat(64),image:'data:image/png;base64,EEEE'}]};
 await preservePendingQuestion(edited,'What changed?','Synthetic notes','');
 const reloaded=(await readCases()).find(x=>x.id===original.id);
 assert.equal(reloaded?.workspaceDraft?.question,'What changed?');
 assert.equal(reloaded?.context,'New clinical observation pending autosave');
 assert.equal(reloaded?.files[0]?.name,'synthetic-photo.png');
 assert.equal(reloaded?.analyses.length,0);
});

test('C2: same-millisecond stale autosave never deletes committed analysis or extra source',async()=>{
 const original:ClinicalCase={...newCase(314),updated:t0};
 await persistCase(original);
 const result=await commitClinicalAnalysis(original,answer('same-ms'),
   {question:'',note:'',decision:'',tab:'analysis'});
 assert.equal(result.stored,true);
 // Force identical updated stamps to check length guards independent of clock granularity.
 const stale={...original,updated:result.value.updated,workspaceDraft:draft};
 assert.equal(await persistCaseAutosave(stale),false);
 const found=(await readCases()).find(x=>x.id===original.id);
 assert.equal(found?.analyses[0]?.id,'same-ms');
});

test('C2: same-timestamp editor save cannot silently revert changed image content',async()=>{
 const initial:ClinicalCase={...newCase(315),updated:t0,
   files:[{name:'scan.png',sha256:'a'.repeat(64),image:'data:image/png;base64,AAAA'}]};
 await persistCase(initial);
 const replacement={...initial,files:[{name:'scan.png',sha256:'f'.repeat(64),image:'data:image/png;base64,FFFF'}]};
 await persistCase(replacement);
 // A date-resolution collision must favor safety, not stale same-name evidence.
 const older={...initial,workspaceDraft:draft};
 assert.equal(await persistCaseAutosave(older),false);
 const current=(await readCases()).find(c=>c.id===initial.id);
 assert.equal(current?.files[0]?.sha256,'f'.repeat(64));
});

test('C2: refreshing an editor-only draft must not discard saved physician decisions',async()=>{
 const original:ClinicalCase={...newCase(316),updated:t0,
   events:[{id:'decision',at:t0,kind:'decision',text:'SYNTHETIC REVIEWED PHYSICIAN DECISION'}]};
 await persistCase(original);
 assert.equal(await persistCaseDraft(original.id,draft,t0),true);
 const stored=(await readCases()).find(c=>c.id===original.id);
 assert.match(stored?.events[0]?.text??'',/REVIEWED PHYSICIAN DECISION/);
 assert.equal(stored?.workspaceDraft?.question,'New question');
});
