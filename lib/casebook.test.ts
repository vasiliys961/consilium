import test from 'node:test';
import assert from 'node:assert/strict';
import { caseAnalysisInput, caseContext, newCase, exportCase, caseSignature, caseTitle, analysisQuestion, decisionDraftFrom, finishClinicalCase, reviseCaseEvent, decisionDocument } from './casebook.ts';
import {conduct} from './conductor.ts';
test('follow-up and physician decision enter the next analysis context without overwriting the initial note', () => {
 const value = newCase(); value.context = 'Initial data'; value.question = 'Clinical question';
 value.events = [{id:'1',at:'2026-11-07',kind:'note',text:'Follow-up result'},{id:'2',at:'2026-11-08',kind:'decision',text:'Physician plan'}];
 const context = caseContext(value);
 for (const text of ['Initial data','Clinical question','Follow-up result','Physician plan']) assert.ok(context.includes(text));
 assert.ok(context.indexOf('Follow-up result') < context.indexOf('Physician plan'));
 assert.equal(value.context,'Initial data');
});

test('finishing captures the editor, and later corrections preserve the prior physician decision',()=>{
 const value=newCase();assert.throws(()=>finishClinicalCase(value,''));
 const completed=finishClinicalCase(value,'Reviewed synthetic decision',undefined,'2026-11-12T10:00:00Z');
 assert.equal(completed.status,'closed');assert.equal(completed.events.length,1);assert.match(decisionDocument(completed),/Reviewed synthetic decision/);
 const reopened={...completed,status:'active' as const};
 const revised=reviseCaseEvent(reopened,completed.events[0].id,'Corrected synthetic decision','2026-11-12T11:00:00Z');
 assert.equal(revised.events[0].at,'2026-11-12T10:00:00Z');assert.equal(revised.events[0].editedAt,'2026-11-12T11:00:00Z');assert.equal(revised.events[0].revisions?.[0].text,'Reviewed synthetic decision');assert.match(decisionDocument(revised),/Corrected synthetic decision/);
});

test('adding a new image reuses only unchanged readings and preserves the full prior discussion',()=>{
 const value=newCase();value.context='Initial context';value.question='First question';
 value.files=[{name:'xray.png',sha256:'a'.repeat(64),image:'data:image/png;base64,AAAA'},{name:'labs.txt',sha256:'b'.repeat(64),text:'Synthetic copied value'}];
 const first=caseAnalysisInput(value);const reading={source:'material-a.png',status:'read' as const,seen:['Synthetic finding'],reading:'Prior image interpretation'};
 value.analyses=[{id:'first',at:value.created,context:first.text,question:'First question',visualEvidence:first.visualEvidence([reading]),result:{...conduct({text:'Synthetic context'}),clinicalDraft:'generated',draft:{status:'unsigned',summary:'Prior clinical answer',statements:[]}}}];
 value.files.push({name:'new.png',sha256:'c'.repeat(64),image:'data:image/png;base64,BBBB'});
 const next=caseAnalysisInput(value);
 assert.deepEqual(next.files.map(file=>file.name),['labs.txt','new.png']);assert.deepEqual(next.reusedSources,['material-a.png']);assert.match(next.text,/Prior image interpretation/);assert.match(next.text,/First question/);assert.match(next.text,/Prior clinical answer/);
 value.files[0]={...value.files[0],masks:[{x:0,y:0,width:10,height:10}]};
 assert.equal(caseAnalysisInput(value).files.length,3);
 assert.equal(caseAnalysisInput(value,true).reusedSources.length,0);
});

test('a summary prepares an editable decision proposal without recording a physician decision',()=>{
 const value=newCase();const result=conduct({text:'Synthetic'});result.draft.summary='Summary of discussion';
 result.draft.report={problem:'Test',facts:[],differential:[],investigations:[],management:[],questions:['Missing test?'],limitations:['No measurements'],followUp:[],tactics:{nextStep:'Review test',timing:'',reassess:'Follow-up',escalate:''}};
 const analysis={id:'summary',at:value.created,context:'Synthetic',question:'Резюме разбора',result};
 assert.equal(analysisQuestion(analysis),'Резюме разбора');const text=decisionDraftFrom(analysis);
 assert.match(text,/Summary of discussion/);assert.match(text,/Missing test/);assert.match(text,/Review test/);assert.equal(value.events.length,0);
});
test('new cases are independent and start without invented medical data', () => {
 const a = newCase(), b = newCase(); assert.notEqual(a.id,b.id); assert.equal(a.context,'');
 a.events.push({id:'a',at:'2026-11-07',kind:'decision',text:'Plan'}); assert.equal(b.events.length,0);
});
test('export retains physician decisions and the identity of attached evidence', () => {
 const value=newCase();value.title='Synthetic case';value.files=[{name:'report.txt',bytes:40}];
 value.events=[{id:'a',at:'2026-11-07',kind:'decision',text:'Recorded plan'}];
 const report=exportCase(value);for(const text of ['Synthetic case','report.txt','Recorded plan',value.id]) assert.ok(report.includes(text));
});

test('a new physician question and findings continue the case, while replaced images invalidate reused readings', () => {
 const value=newCase(1);
 assert.equal(caseTitle(value,'Untitled'),'1');
 value.context='Prior documented symptoms';
 value.question='Initial diagnosis';
 value.files=[{name:'ecg.png',image:'data:image/png;base64,AAAA',sha256:'original'}];
 const old=caseAnalysisInput(value);
 const readings=[{source:'ecg-1.png',seen:['Regular complexes'],reading:'Provisional tracing report',status:'read' as const}];
 value.analyses=[{id:'analysis',at:value.updated,context:old.text,inputSignature:caseSignature(value),materialsKey:old.materialsKey,
  visualEvidence:old.visualEvidence(readings),result:{...conduct({text:value.context}),clinicalDraft:'generated',draft:{status:'unsigned',summary:'Previous synthesis',statements:[]}}}];
 value.events.push({id:'note',at:value.updated,kind:'note',text:'New clinical observation'},{id:'question',at:value.updated,kind:'question',text:'Possible treatment?'});
 const followup=caseAnalysisInput(value);
 assert.match(followup.text,/^Вопрос врача: Possible treatment\?/);
 assert.match(followup.text,/New clinical observation/);
 assert.match(followup.text,/Provisional tracing report/);
 assert.equal(followup.files.length,0);
 value.files=[{...value.files[0],sha256:'replacement'}];
 assert.doesNotMatch(caseAnalysisInput(value).text,/CACHED PRIOR IMAGE INTERPRETATIONS|Provisional tracing report/);
 assert.equal(caseAnalysisInput(value).files.length,1);
});
