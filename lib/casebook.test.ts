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

test('Radiology draft and ECGFounder measurements survive case export and enter follow-up with explicit provenance',()=>{
 const value=newCase(42);
 value.context='Synthetic cardiopulmonary case';
 value.files=[{name:'trace.csv',sha256:'f'.repeat(64),text:'synthetic digital sample'}];
 value.moduleReports=[{id:'r1',module:'radiology',fileKeys:[],sources:[],at:'2026-11-15T10:00:00Z',text:'Limited review of one frame'}];
 const ecg={module:'ecgfounder' as const,method:'digital-ecg-waveform' as const,source:'trace.csv',sha256:'f'.repeat(64),status:'read' as const,threshold:0.5,cleared:[{label:'SINUS RHYTHM',score:0.82}],top:{label:'SINUS RHYTHM',score:0.82},reason:null,measurements:{method:'digital',description:'Synthetic',lines:[{name:'RR',value:'810 ms'}],note:'Review calibration'}};
 value.analyses=[{id:'a1',at:value.created,context:value.context,result:{...conduct({text:value.context}),clinicalDraft:'generated',ecgEvidence:ecg,draft:{status:'unsigned',summary:'Preliminary interpretation',statements:[]}}}];
 const context=caseAnalysisInput(value).text;
 assert.match(context,/ECGFounder/);
 assert.match(context,/810 ms/);
 assert.match(context,/не калиброванные вероятности/);
 assert.match(context,/Полнота просмотра DICOM-серий/);
 assert.match(context,/привязки к исходному файлу нет/);
 const saved=exportCase(value);
 assert.match(saved,/810 ms/);
 assert.match(saved,/Limited review of one frame/);
 assert.match(saved,/неподписанный черновик/);
});

test('C2: replacing ECG and Radiology files preserves history without reusing stale evidence',()=>{
 const value=newCase(91);
 const oldEcg='a'.repeat(64),newEcg='b'.repeat(64);
 const oldCt='c'.repeat(64),newCt='d'.repeat(64);
 value.context='Non-patient longitudinal fixture';
 value.files=[
  {name:'same-name.csv',sha256:oldEcg,text:'sampling_rate,500\\nSYNTHETIC'},
  {name:'same-name.dcm',sha256:oldCt,processingModule:'radiology'},
 ];
 value.moduleReports=[{id:'rad-old',module:'radiology',fileKeys:[oldCt],
  sources:['same-name.dcm'],at:'2026-11-15T09:00:00Z',
  text:'OLD RADIOLOGY FINDING — HISTORICAL ONLY'}];
 const oldResult=conduct({text:'Synthetic old discussion'});
 value.analyses=[{id:'ecg-old',at:'2026-11-15T09:01:00Z',context:'Synthetic initial question',
  result:{...oldResult,clinicalDraft:'generated',
   ecgEvidence:{module:'ecgfounder',method:'digital-ecg-waveform',
    source:'same-name.csv',sha256:oldEcg,status:'read',threshold:0.5,
    top:{label:'ATRIAL FIBRILLATION',score:0.82},
    cleared:[{label:'ATRIAL FIBRILLATION',score:0.82}],reason:null,
    measurements:{method:'digital',description:'Synthetic old reading',
     lines:[{name:'OLD ECG INTERVAL',value:'730 ms'}],note:'Synthetic fixture'}},
   draft:{status:'unsigned',summary:'Earlier discussion (not a diagnosis)',statements:[]}}}];
 // Same original files: evidence may be reused, but no automatic paid inference.
 const unchanged=caseAnalysisInput(value);
 assert.match(unchanged.text,/OLD RADIOLOGY FINDING/);
 assert.match(unchanged.text,/OLD ECG INTERVAL/);
 assert.deepEqual(unchanged.pendingModules,[]);
 // Replace both under their original filenames: hashes, not names, control identity.
 value.files=[
  {...value.files[0],sha256:newEcg,text:'sampling_rate,500\\nREPLACED'},
  {...value.files[1],sha256:newCt},
 ];
 value.events.push({id:'followup',at:'2026-11-15T10:00:00Z',kind:'question',text:'What changed?'});
 const after=caseAnalysisInput(value);
 assert.match(after.text,/Исторический отчёт/);
 assert.match(after.text,/не подтверждённый текущим SHA-256/);
 assert.doesNotMatch(after.text,/OLD RADIOLOGY FINDING|OLD ECG INTERVAL|730 ms|0\\.82/);
 assert.equal(after.pendingModules.length,1);
 assert.equal(after.pendingModules[0].sha256,newCt);
 assert.ok(after.files.some(file=>file.name==='same-name.csv'&&file.sha256===newEcg));
 // Original immutable content stays available to the physician and exports.
 const exported=exportCase(value);
 assert.match(exported,/OLD RADIOLOGY FINDING/);
 assert.match(exported,/OLD ECG INTERVAL/);
 assert.match(exported,/What changed/);
 // Switching back to the exact original source recovers matching, never filename-only reuse.
 value.files=[
  {...value.files[0],sha256:oldEcg},
  {...value.files[1],sha256:oldCt},
 ];
 assert.match(caseAnalysisInput(value).text,/OLD RADIOLOGY FINDING/);
 assert.match(caseAnalysisInput(value).text,/OLD ECG INTERVAL/);
 assert.equal(caseAnalysisInput(value).pendingModules.length,0);
});

test('C2: ECG with absent SHA-256 is historical, never accepted solely by filename',()=>{
 const value=newCase(92);
 value.files=[{name:'trace.csv',text:'synthetic bytes',sha256:'e'.repeat(64)}];
 value.analyses=[{id:'legacy',at:value.created,context:'Legacy fixture',
  result:{...conduct({text:'Synthetic'}),clinicalDraft:'generated',
   ecgEvidence:{module:'ecgfounder',method:'digital-ecg-waveform',
    source:'trace.csv',sha256:null,status:'read',threshold:0.5,
    top:{label:'SINUS RHYTHM',score:0.96},
    cleared:[{label:'SINUS RHYTHM',score:0.96}],reason:null},
   draft:{status:'unsigned',summary:'Legacy analysis',statements:[]}}}];
 const input=caseAnalysisInput(value).text;
 assert.match(input,/не подтверждённый текущим SHA-256/);
 assert.doesNotMatch(input,/SINUS RHYTHM|0\\.96/);
 assert.match(exportCase(value),/SINUS RHYTHM/);
});

test('C2: filename-only Radiology binding cannot silence reading of a replaced file',()=>{
 const value=newCase(93);
 value.files=[{name:'chest.dcm',processingModule:'radiology'}];
 value.moduleReports=[{id:'legacy-name-key',module:'radiology',fileKeys:['chest.dcm'],
  sources:['chest.dcm'],at:'2026-11-15T10:00:00Z',text:'OLD DIAGNOSTIC DESCRIPTION'}];
 const current=caseAnalysisInput(value);
 assert.equal(current.pendingModules.length,1);
 assert.equal(current.pendingModules[0].name,'chest.dcm');
 assert.match(current.text,/Исторический отчёт/);
 assert.doesNotMatch(current.text,/OLD DIAGNOSTIC DESCRIPTION/);
 assert.match(exportCase(value),/OLD DIAGNOSTIC DESCRIPTION/);
});

test('C2: partial multi-series Radiology report cannot silently cover the remaining series',()=>{
 const a='a'.repeat(64),b='b'.repeat(64),replacement='c'.repeat(64);
 const value=newCase(94);
 value.files=[
   {name:'one.dcm',sha256:a,processingModule:'radiology'},
   {name:'two.dcm',sha256:b,processingModule:'radiology'},
 ];
 value.moduleReports=[{id:'two-slices',module:'radiology',fileKeys:[a,b],
  sources:['one.dcm','two.dcm'],at:'2026-11-15T10:00:00Z',text:'JOINT STUDY REPORT'}];
 assert.equal(caseAnalysisInput(value).pendingModules.length,0);
 value.files[1]={...value.files[1],sha256:replacement};
 const changed=caseAnalysisInput(value);
 assert.equal(changed.pendingModules.length,2);
 assert.match(changed.text,/Исторический отчёт/);
 assert.doesNotMatch(changed.text,/JOINT STUDY REPORT/);
});
