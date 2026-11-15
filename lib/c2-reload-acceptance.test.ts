import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {newCase,readCases,persistCase,exportCase,caseAnalysisInput,type Analysis} from './casebook.ts';
import {preservePendingQuestion,stagePhysicianQuestion,commitClinicalAnalysis} from './case-result-commit.ts';
import {createLocalVault,openLocalVault,lockVault,vaultDatabase} from './local-vault.ts';
import {conduct} from './conductor.ts';

const {indexedDB}=createRequire(import.meta.url)('fake-indexeddb');
const question='What changed after the synthetic ECG observation?';
const password='QA-local-vault-long-password-not-a-secret';

test('C2: encrypted IndexedDB survives simulated reload, failed network, and successful subsequent answer',async()=>{
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:indexedDB});
 await createLocalVault(password);
 const before=newCase(215);
 before.title='Synthetic reloaded case';
 before.context='Synthetic QA example, no patient data';
 await persistCase(before);

 // The first analysis attempt is interrupted before the server returns a result.
 const previous=before;
 const staged=stagePhysicianQuestion(previous,question,'question-qa','2026-11-15T20:01:00Z');
 assert.equal(previous.events.length,0);
 assert.equal(staged.events.length,1);
 await preservePendingQuestion(previous,question,'Note written but not sent','Unapproved decision draft');
 lockVault(); // Equivalent to losing the in-memory key on a browser reload.
 await assert.rejects(readCases(),/заблокировано/);
 await openLocalVault(password);
 const recovered=(await readCases()).find(c=>c.id===before.id);
 assert.ok(recovered);
 assert.equal(recovered.workspaceDraft?.question,question);
 assert.equal(recovered.workspaceDraft?.note,'Note written but not sent');
 assert.equal(recovered.workspaceDraft?.decision,'Unapproved decision draft');
 assert.equal(recovered.events.length,0,'failed request does not append a false completed question');
 assert.equal(recovered.analyses.length,0);
 const safeExport=exportCase(recovered);
 assert.match(safeExport,/не отправлен в завершённый разбор/);
 assert.match(safeExport,/не является заключением/);
 assert.match(safeExport,/Unapproved decision draft/);

 // On retry the exact same question is promoted only after a full server result.
 const nextSnapshot=stagePhysicianQuestion(recovered,recovered.workspaceDraft!.question,'question-confirmed','2026-11-15T20:02:00Z');
 const result=conduct({text:'Synthetic repeat request after reload'});
 result.clinicalDraft='generated';
 result.draft={status:'unsigned',summary:'Completed synthetic follow-up conclusion',statements:[]};
 const entry:Analysis={
   id:'analysis-after-reload',at:'2026-11-15T20:03:00Z',kind:'analysis',question,
   context:caseAnalysisInput(nextSnapshot).text,result,
 };
 const saved=await commitClinicalAnalysis(nextSnapshot,entry,{
    question:'',note:recovered.workspaceDraft?.note??'',decision:recovered.workspaceDraft?.decision??'',tab:'analysis',
 });
 assert.equal(saved.stored,true);
 assert.equal(saved.value.events.length,1);
 assert.equal(saved.value.analyses.length,1);

 // Reopen the encrypted database again and confirm the actual durable content.
 lockVault();
 await openLocalVault(password);
 const opened=(await readCases()).find(c=>c.id===before.id);
 assert.ok(opened);
 assert.equal(opened.workspaceDraft?.question,'');
 assert.deepEqual(opened.events.map(e=>e.id),['question-confirmed']);
 assert.deepEqual(opened.analyses.map(a=>a.id),['analysis-after-reload']);
 assert.match(opened.analyses[0].result.draft.summary,/Completed synthetic follow-up conclusion/);
 const returnedContext=caseAnalysisInput(opened).text;
 assert.match(returnedContext,/Completed synthetic follow-up conclusion/);
 assert.match(returnedContext,/What changed after the synthetic ECG/);
 assert.match(exportCase(opened),/Completed synthetic follow-up conclusion/);
 assert.doesNotMatch(exportCase(opened),/не отправлен в завершённый разбор/);
 
 // The durable IndexedDB record must be encrypted, not a plain clinical object.
 const db=await vaultDatabase();
 const raw=await new Promise<unknown>((resolve,reject)=>{
   const request=db.transaction('cases').objectStore('cases').get(before.id);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
 });
 db.close();
 const rawText=JSON.stringify(raw);
 assert.match(rawText,/"sealed"/);
 for(const secret of [question,'Completed synthetic follow-up conclusion','Unapproved decision draft']){
   assert.ok(!rawText.includes(secret),'no clinical text may be stored in plaintext IndexedDB');
 }
});

test('C2: staging the same failed question repeatedly does not mutate the actual case or duplicate durable events',async()=>{
 const original=newCase(216);
 const first=stagePhysicianQuestion(original,question,'staged-first','2026-11-15T20:01:00Z');
 const second=stagePhysicianQuestion(original,question,'staged-second','2026-11-15T20:02:00Z');
 assert.equal(first.events.length,1);
 assert.equal(second.events.length,1);
 assert.equal(original.events.length,0);
 assert.equal(stagePhysicianQuestion(original,'   '),original);
 const savedSnapshots:unknown[]=[];
 await preservePendingQuestion(original,question,'QA note','',async value=>{savedSnapshots.push(value);});
 assert.equal(savedSnapshots.length,1);
 const saved=savedSnapshots[0] as typeof original;
 assert.equal(saved.events.length,0);
 assert.equal(saved.workspaceDraft?.question,question);
 assert.equal(original.workspaceDraft,undefined);
 assert.equal(original.events.length,0);
});

test('C2: write failures before sending a paid request are visible to caller and cannot claim a saved question',async()=>{
 const original=newCase(217);
 await assert.rejects(preservePendingQuestion(original,question,'','',async()=>{throw Error('QA synthetic storage failure');}),
   /QA synthetic storage failure/);
 assert.equal(original.workspaceDraft,undefined);
 assert.equal(original.events.length,0);
});
