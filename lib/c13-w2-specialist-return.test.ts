import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {
 newCase,persistCase,readCases,persistCaseAutosave,persistSpecialistCaseReport,
 exportCase,caseSignature,
} from './casebook.ts';
import {specialistCaseReport,validateSpecialistCaseReport} from './specialist-case-report.ts';
import type {ConsultReply} from './specialist-options.ts';
const {indexedDB}=createRequire(import.meta.url)('fake-indexeddb');
Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});

const syntheticReply:ConsultReply={
 text:'SYNTHETIC: assess urgency and repeat ECG; this is not a signed decision.',
 model:'anthropic/claude-sonnet-test',cost:0.0024,usageComplete:true,depth:'brief',
 sources:[],searched:false,
};

test('W2: only a completed specialist reply generates a bounded, hash-bound result',async()=>{
 const answer=await specialistCaseReport('cardiology','Synthetic patient with chest pain',
  '[QUESTION]\\nSynthetic patient with chest pain',syntheticReply,'2026-11-17T14:00:00Z');
 assert.equal(validateSpecialistCaseReport(answer),true);
 assert.equal(answer.inputSha256.length,64);
 assert.equal(answer.module,'specialist-chat');
 assert.equal(answer.status,'completed-unsigned');
 assert.equal(answer.model,syntheticReply.model);
 assert.equal(answer.costUsd,0.0024);
 assert.deepEqual(answer.sources,[]);
 const duplicate=await specialistCaseReport('cardiology','Synthetic patient with chest pain',
  '[QUESTION]\\nSynthetic patient with chest pain',syntheticReply,'2026-11-17T14:02:00Z');
 assert.equal(duplicate.id,answer.id,'retry must deduplicate the same completed tool result');
 const altered=await specialistCaseReport('cardiology','Synthetic patient with changed symptoms',
  '[QUESTION]\\nSynthetic patient with changed symptoms',syntheticReply);
 assert.notEqual(answer.inputSha256,altered.inputSha256);
 assert.notEqual(answer.id,altered.id);
 const withoutUsage=await specialistCaseReport('cardiology','Synthetic question',
  'synthetic approved request',{...syntheticReply,usageComplete:false});
 assert.equal(withoutUsage.costUsd,null,'do not claim provider cost when usage data is incomplete');
});

test('W2: save and reopen a real completed result without overwriting current notes or causing another analysis',async()=>{
 const original={...newCase(820),title:'Synthetic W2',context:'Synthetic case context',
  question:'Original question',workspaceDraft:{question:'Unsent new question',note:'Draft note',decision:'',tab:'analysis'},
  files:[{name:'synthetic.txt',text:'Synthetic material',sha256:'a'.repeat(64)}]};
 await persistCase(original);
 const report=await specialistCaseReport('cardiology','Interpret synthetic clinical question',
  'Approved text from synthetic case',syntheticReply);
 const saved=await persistSpecialistCaseReport(original.id,report);
 assert.equal(saved.specialistReports?.length,1);
 assert.deepEqual(saved.files,original.files);
 assert.equal(saved.context,original.context);
 assert.equal(saved.workspaceDraft?.question,'Unsent new question');
 assert.equal(saved.analyses.length,0,'saving a specialist result does not launch full case analysis');
 await persistSpecialistCaseReport(original.id,report);
 const reopened=(await readCases()).find(item=>item.id===original.id);
 assert.equal(reopened?.specialistReports?.length,1,'duplicate saves are idempotent');
 assert.equal(reopened?.specialistReports?.[0].answer,syntheticReply.text);
 assert.match(exportCase(reopened!),/SYNTHETIC: assess urgency/);
 assert.match(exportCase(reopened!),/SHA-256/);
 assert.notEqual(caseSignature(reopened!),caseSignature(original));
 assert.equal(await persistCaseAutosave(original),false,'old autosave cannot erase completed specialist output');
 const after=(await readCases()).find(item=>item.id===original.id);
 assert.equal(after?.specialistReports?.length,1);
});

test('W2: closed, deleted and nonexistent cases reject a specialist result',async()=>{
 const report=await specialistCaseReport('universal','Synthetic question',
  'Approved synthetic transcript',syntheticReply);
 await assert.rejects(persistSpecialistCaseReport('unknown-case-id',report),/не найден/);
 const closed={...newCase(821),status:'closed' as const};
 await persistCase(closed);
 await assert.rejects(persistSpecialistCaseReport(closed.id,report),/завершён/);
 const deleted={...newCase(822),deletedAt:'2026-11-17T14:00:00Z'};
 await persistCase(deleted);
 await assert.rejects(persistSpecialistCaseReport(deleted.id,report),/не найден/);
});

test('W2: UI only saves an already completed response after a physician click',()=>{
 const consult=readFileSync('app/consult/page.tsx','utf8');
 const workspace=readFileSync('app/components/clinical-workspace.tsx','utf8');
 const results=readFileSync('app/components/specialist-case-results.tsx','utf8');
 assert.match(consult,/if\(!turn\?\.text\?\.trim\(\)\|\|!turn\.transcript\?\.trim\(\)\)/);
 assert.match(consult,/await persistSpecialistCaseReport\(sourceCaseId,report\)/);
 assert.match(consult,/onClick=\{\(\)=>void saveCompletedSpecialistReply\(index\)\}/);
 assert.match(workspace,/<SpecialistCaseResults value=\{current\}/);
 assert.match(results,/specialist-case-report/);
 assert.doesNotMatch(results,/fetch\(/);
});
