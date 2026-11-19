import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';

test('W5 eGFR unit: wrong denominator must not be read as mL/min',()=>{
 const wrong=[
  'eGFR: 25 mL/min/1.73 m3',
  'eGFR: 25 ml/min/1.73 m²/s',
  'eGFR: 25 mL/min/2 m2',
  'СКФ: 25 мл/мин/1,73 м3',
  'eGFR: 25 mL/min/banana',
  'eGFR: 25 mL/min/1.73 m2/other',
  'eGFR: 25 mL/minfoo',
 ];
 for(const note of wrong){
  const result=extractMedicationSafetyContext(note);
  assert.equal(result.context.egfr,undefined,note);
  assert.ok(result.issues.length>0,note);
  assert.ok(result.hints.some(h=>h.field==='egfr'&&h.kind==='units'),note);
  const safety=checkMedicationRegimen({current:'metformin',context:result.context});
  assert.ok(safety.missing.some(x=>x.includes('СКФ')),note);
  assert.equal(safety.organAlerts.some(x=>x.risk.includes('Метформин: СКФ')),false,note);
 }
});

test('W5 eGFR unit: known valid English and Russian formats remain accepted',()=>{
 for(const note of [
  'eGFR: 25 mL/min',
  'eGFR: 25 mL/min/1.73 m2',
  'eGFR: 25 mL/min/1.73 m²',
  'СКФ: 25 мл/мин',
  'СКФ: 25 мл/мин/1,73 м²',
  'eGFR: 25',
 ]){
  const result=extractMedicationSafetyContext(note);
  assert.equal(result.context.egfr,25,note);
  assert.deepEqual(result.issues,[],note);
 }
});

test('W5 eGFR unit: one malformed repeat poisons entire field instead of selecting another value',()=>{
 const result=extractMedicationSafetyContext('eGFR: 25 mL/min/1.73 m2\neGFR: 25 mL/min/1.73 m3');
 assert.equal(result.context.egfr,undefined);
 assert.ok(result.hints.some(h=>h.field==='egfr'&&h.kind==='units'));
 assert.ok(result.issues.some(i=>i.includes('СКФ')));
});

test('W5 eGFR unit: another valid safety parameter survives an invalid renal unit',()=>{
 const result=extractMedicationSafetyContext('eGFR: 25 mL/min/1.73 m3\nK+: 5.8 mmol/L');
 assert.equal(result.context.egfr,undefined);
 assert.equal(result.context.potassium,5.8);
 const safety=checkMedicationRegimen({current:'metformin\nspironolactone',context:result.context});
 assert.equal(safety.organAlerts.some(x=>x.risk.includes('Метформин: СКФ')),false);
 assert.ok(safety.organAlerts.some(x=>x.risk.includes('гиперкалиемия')));
});
