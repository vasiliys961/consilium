import test from 'node:test';
import assert from 'node:assert/strict';
import { ecgModuleEvidence, ecgEvidenceText, radiologyEvidenceText } from './module-evidence.ts';

const hash = 'a'.repeat(64);

test('successful ECGFounder assessment keeps file identity, actual scores and measurement units',()=>{
 const evidence = ecgModuleEvidence({
  source:'synthetic-12-lead.csv',status:'read',reason:null,names:['SINUS RHYTHM','ATRIAL FIBRILLATION'],
  cleared:[{label:'SINUS RHYTHM',score:0.84}],top:{label:'SINUS RHYTHM',score:0.84},
  measurements:{method:'digital-signal',description:'Synthetic illustration',lines:[{name:'RR',value:'800 ms'}],note:'Approximate delineation'},
 },hash.toUpperCase());
 assert.equal(evidence.sha256,hash);
 assert.equal(evidence.status,'read');
 assert.deepEqual(evidence.cleared,[{label:'SINUS RHYTHM',score:0.84}]);
 const summary=ecgEvidenceText(evidence);
 assert.match(summary,/800 ms/);
 assert.match(summary,/не калиброванные вероятности/);
 assert.doesNotMatch(summary,/ЭКГ нормальная/);
});

test('an unavailable ECGFounder result is not converted into a normal ECG',()=>{
 const evidence=ecgModuleEvidence({
  source:'synthetic.csv',status:'not_assessed',reason:'Weights unavailable',names:[],
  cleared:[{label:'SINUS RHYTHM',score:0.90}],top:{label:'SINUS RHYTHM',score:0.90},
 },'not-a-hash');
 assert.equal(evidence.sha256,null);
 assert.deepEqual(evidence.cleared,[]);
 assert.equal(evidence.top,null);
 const summary=ecgEvidenceText(evidence);
 assert.match(summary,/Не оценено/);
 assert.match(summary,/Отсутствие ответа не является нормальной ЭКГ/);
 assert.doesNotMatch(summary,/0\.90/);
});

test('Radiology imports are unsigned, and missing image binding never becomes a complete-study claim',()=>{
 const report={id:'synthetic',module:'radiology' as const,fileKeys:[],sources:[],text:'Unsigned sample of a single CT slice',at:'2026-11-15T10:00:00Z'};
 const summary=radiologyEvidenceText(report);
 assert.match(summary,/привязки к исходному файлу нет/);
 assert.match(summary,/НЕ подтверждена/);
 assert.match(summary,/Unsigned sample of a single CT slice/);
 assert.doesNotMatch(summary,/всё исследование без патологии/);
});
