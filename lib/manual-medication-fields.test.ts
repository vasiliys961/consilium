import test from 'node:test';
import assert from 'node:assert/strict';
import {readManualMedicationFields,type ManualMedicationFieldInput} from './manual-medication-fields.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';

const input=(values:Partial<ManualMedicationFieldInput>):ManualMedicationFieldInput=>({
 egfr:'',potassium:'',ageYears:'',qtcMs:'',...values,
});

test('W5 numeric form: empty is unknown, never a zero or negative clinical finding',()=>{
 const result=readManualMedicationFields(input({}));
 assert.deepEqual(result.context,{egfr:null,potassium:null,ageYears:null,qtcMs:null});
 assert.deepEqual(result.issues,[]);
});
test('W5 numeric form: validated manual values preserve true renal, electrolyte and QTc alerts',()=>{
 const result=readManualMedicationFields(input({egfr:'25',potassium:'5.8',qtcMs:'520',ageYears:'63'}));
 assert.deepEqual(result.issues,[]);
 assert.deepEqual(result.context,{egfr:25,potassium:5.8,ageYears:63,qtcMs:520});
 const safety=checkMedicationRegimen({current:'metformin\nspironolactone\nmoxifloxacin',context:result.context});
 assert.ok(safety.organAlerts.some(x=>x.risk.includes('Метформин: СКФ')));
 assert.ok(safety.organAlerts.some(x=>x.risk.includes('гиперкалиемия')));
 assert.ok(safety.organAlerts.some(x=>x.risk.includes('QTc')));
});
test('W5 numeric form: invalid eGFR is visible and cannot cause an unsupported renal contraindication',()=>{
 for(const bad of ['-5','999','1e309','NaN','25 mg/dL','25 mL/min','1e1','025','25.3.4']){
  const checked=readManualMedicationFields(input({egfr:bad}));
  assert.equal(checked.context.egfr,null,bad);
  assert.deepEqual(checked.issues.map(i=>i.field),['egfr'],bad);
  const safety=checkMedicationRegimen({current:'metformin',context:checked.context});
  assert.ok(safety.missing.some(s=>s.includes('СКФ')),bad);
  assert.equal(safety.organAlerts.some(a=>a.risk.includes('Метформин: СКФ')),false,bad);
 }
});
test('W5 numeric form: invalid potassium cannot masquerade as hyper- or hypokalemia',()=>{
 for(const bad of ['0','1.2','-1','11','Infinity','5.8mg/dL','5.8 mmol/L','9e0']){
  const checked=readManualMedicationFields(input({potassium:bad}));
  assert.equal(checked.context.potassium,null,bad);
  assert.ok(checked.issues.some(i=>i.field==='potassium'),bad);
  const safety=checkMedicationRegimen({current:'spironolactone\nmoxifloxacin',context:checked.context});
  assert.equal(safety.organAlerts.some(a=>a.risk.includes('гиперкалиемия')||a.risk.includes('гипокалиемия')),false,bad);
 }
});
test('W5 numeric form: QTc seconds/exponent/outliers do not create confirmed ms values',()=>{
 for(const bad of ['0.520','520 s','999','2e3','249','800.1','-520']){
  const checked=readManualMedicationFields(input({qtcMs:bad}));
  assert.equal(checked.context.qtcMs,null,bad);
  assert.ok(checked.issues.some(i=>i.field==='qtcMs'));
  assert.equal(checkMedicationRegimen({current:'moxifloxacin',context:checked.context})
   .organAlerts.some(a=>a.risk.includes('QTc')),false);
 }
});
test('W5 numeric form: age cannot silently convert months or fractional years',()=>{
 for(const bad of ['75 months','120.1','121','-1','63.5']){
  const checked=readManualMedicationFields(input({ageYears:bad}));
  assert.equal(checked.context.ageYears,null,bad);
  assert.ok(checked.issues.some(i=>i.field==='ageYears'));
 }
});
test('W5 numeric form: a bad field does not erase independent valid fields',()=>{
 const checked=readManualMedicationFields(input({egfr:'25 mg/dL',potassium:'5,8',qtcMs:'520 s',ageYears:'60'}));
 assert.deepEqual(checked.issues.map(i=>i.field),['egfr','qtcMs']);
 assert.deepEqual(checked.context,{egfr:null,potassium:5.8,ageYears:60,qtcMs:null});
 const safety=checkMedicationRegimen({current:'metformin',alternatives:'spironolactone\nmoxifloxacin',context:checked.context});
 assert.equal(safety.organAlerts.some(x=>x.risk.includes('СКФ')),false);
 assert.ok(safety.alternatives[0].organAlerts.some(x=>x.risk.includes('гиперкалиемия')));
 assert.equal(safety.alternatives[1].organAlerts.some(x=>x.risk.includes('QTc')),false);
});
test('W5 numeric form: engineering ranges do not prevent legitimate edge inputs',()=>{
 const checked=readManualMedicationFields(input({egfr:'130',potassium:'1.50',qtcMs:'800',ageYears:'120'}));
 assert.deepEqual(checked.issues,[]);
 assert.deepEqual(checked.context,{egfr:130,potassium:1.5,qtcMs:800,ageYears:120});
});
