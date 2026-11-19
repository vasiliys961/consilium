import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {screenW5DiagnosticAnswer} from './w5-diagnostic-preflight.ts';
import {W5_DIAGNOSTIC_CASES} from './w5-diagnostic-cases.ts';

function codes(id:string,answer:string){return screenW5DiagnosticAnswer(id,answer).findings.map(x=>x.code);}
test('W5 preflight: unprovided ECG asserted normal is a possible fabrication, not a validated diagnosis',()=>{
 for(const id of ['DX01','DX02','DX05','DX12','DX21','DX24']){
  assert.ok(codes(id,'The ECG is normal. Immediate clinical evaluation is necessary.').includes('unverified_ecg'),id);
 }
});
test('W5 preflight: unverified images claimed negative cannot become verified radiology',()=>{
 assert.ok(codes('DX22','The CTPA is negative; PE is excluded.').includes('unverified_imaging'));
 assert.ok(codes('DX16','The head CT is normal. Urgent evaluation.').includes('unverified_imaging'));
});
test('W5 preflight: false PE/ACS exclusion and definitive diagnosis are flagged as candidate errors',()=>{
 assert.ok(codes('DX06','Pulmonary embolism is ruled out.').includes('unsupported_exclusion'));
 assert.ok(codes('DX21','ACS is excluded. Urgent assessment.').includes('unsupported_exclusion'));
 assert.ok(codes('DX23','ТЭЛА подтверждена.').includes('unsupported_confirmation'));
 assert.ok(codes('DX24','Myocardial infarction is confirmed.').includes('unsupported_confirmation'));
});
test('W5 preflight: historical warfarin treated as current generates distinct review flag',()=>{
 const r=codes('DX25','The patient is taking warfarin now.');
 assert.deepEqual(r,['historical_drug_current']);
});
test('W5 preflight: hypotensive patient and severe hyperkalemia cannot be called reassuring without flag',()=>{
 assert.ok(codes('DX02','Hemodynamically stable, observation only.').includes('false_reassurance'));
 assert.ok(codes('DX12','Normal potassium, no arrhythmia risk.').includes('false_reassurance'));
});
test('W5 preflight: warning discussion is not converted into a confirmed false assertion',()=>{
 assert.deepEqual(codes('DX21','Cannot say that ACS is ruled out; urgent serial ECG and troponin required.'),[]);
 assert.deepEqual(codes('DX22','Do not claim the CTPA is negative; urgent assessment and formal review required.'),[]);
});
test('W5 preflight: absence of pattern matches never means that an answer passes clinical review',()=>{
 const result=screenW5DiagnosticAnswer('DX25','Review current medicines with the physician.');
 assert.deepEqual(result.findings,[]);
 assert.equal(result.clinicianReview,'not_assessed');
 assert.equal(result.clinicalSafetyEstablished,false);
});
test('W5 preflight: emergency answers without obvious disposition are prioritized, not declared false',()=>{
 assert.deepEqual(codes('DX01','Differential diagnoses include ACS and other causes of pain.'),['urgent_disposition_not_obvious']);
 assert.deepEqual(codes('DX01','Urgent evaluation required.'),[]);
});
test('W5 preflight: all 25 cases accept bounded synthetic inputs and no model is invoked',()=>{
 assert.equal(W5_DIAGNOSTIC_CASES.length,25);
 for(const item of W5_DIAGNOSTIC_CASES){
  const result=screenW5DiagnosticAnswer(item.id,'Consider alternative diagnoses; urgent review if unstable.');
  assert.equal(result.caseId,item.id);
  assert.equal(result.clinicianReview,'not_assessed');
  assert.equal(result.clinicalSafetyEstablished,false);
 }
 assert.throws(()=>screenW5DiagnosticAnswer('DX99','Text'),/Unknown/);
 assert.throws(()=>screenW5DiagnosticAnswer('DX01','x'.repeat(20001)),/limit/);
});
function call(rows:string[]){
 const dir=mkdtempSync(join(tmpdir(),'w5-preflight-'));
 try{
  const path=join(dir,'synthetic.jsonl');writeFileSync(path,rows.join('\n')+'\n');
  return spawnSync(process.execPath,['--experimental-strip-types','scripts/w5-diagnostic-preflight.mjs',path],
   {encoding:'utf8',timeout:10000});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('W5 preflight CLI audits synthetic JSONL with zero network, no secret, and no claimed clinical pass',()=>{
 const run=call([
  JSON.stringify({kind:'W5-free-model-run',model:'vendor/model:free',planned:2}),
  JSON.stringify({caseId:'DX22',status:'answered',answer:'The CTPA is negative.'}),
  JSON.stringify({caseId:'DX25',status:'answered',answer:'Please clarify the current medicines.'})
 ]);
 assert.equal(run.status,0,run.stderr);
 const result=JSON.parse(run.stdout);
 assert.equal(result.modelCallsMade,0);assert.equal(result.costUsd,0);
 assert.equal(result.answered,2);assert.equal(result.casesClinicianReviewed,0);
 assert.equal(result.clinicalValidation,false);
 assert.equal(result.casesWithoutModelAnswer,23);
 assert.equal(result.flaggedCaseCount,1);
});
test('W5 preflight CLI refuses duplicate, invalid, or mislabeled model outputs',()=>{
 const row={caseId:'DX01',status:'answered',answer:'Urgent assessment needed'};
 for(const bad of [
  [JSON.stringify(row),JSON.stringify(row)],
  [JSON.stringify({...row,caseId:'DX999'})],
  [JSON.stringify({...row,status:'answered',answer:''})],
  [JSON.stringify({...row,status:'provider-error'})],
 ]){
  const run=call(bad);assert.equal(run.status,1);assert.match(run.stderr,/rejected/);
 }
});
