import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';

/**
 * W5 stacked integration rehearsal (#106 + #107 + #104).
 * Synthetic inputs, no provider/model calls, no patient data.
 * Expected signals concern existing deterministic local rules only,
 * not estimates of clinical sensitivity, specificity or safe prescribing.
 */
const check=(source:string,alternatives:string,current='')=>{
 const extracted=extractMedicationSafetyContext(source);
 const medication=checkMedicationRegimen({current,alternatives,context:extracted.context});
 return {extracted,medication};
};
const hasRisk=(alerts:ReadonlyArray<{risk:string}>,term:string)=>alerts.some(alert=>alert.risk.includes(term));

test('W5 integration: wrong eGFR unit does not fabricate a metformin renal contraindication',()=>{
 const {extracted,medication}=check('eGFR: 25 mg/dL','metformin');
 assert.equal(extracted.context.egfr,undefined);
 assert.ok(extracted.hints.some(h=>h.field==='egfr'&&h.kind==='units'));
 assert.ok(medication.alternatives[0].missing.some(s=>s.includes('СКФ')));
 assert.equal(hasRisk(medication.alternatives[0].organAlerts,'Метформин: СКФ'),false);
});

test('W5 integration: confirmed renal result triggers metformin alternative alert',()=>{
 const {extracted,medication}=check('eGFR: 25 mL/min/1.73 m2','metformin');
 assert.equal(extracted.context.egfr,25);
 assert.deepEqual(extracted.hints,[]);
 assert.ok(medication.alternatives[0].organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('Метформин: СКФ')));
});

test('W5 integration: incompatible potassium unit does not become a hyperkalemia fact',()=>{
 const {extracted,medication}=check('K+: 5.9 mg/dL','spironolactone');
 assert.equal(extracted.context.potassium,undefined);
 assert.ok(extracted.issues.length>0);
 assert.ok(medication.alternatives[0].missing.some(s=>s.includes('калий')));
 assert.equal(hasRisk(medication.alternatives[0].organAlerts,'гиперкалиемия'),false);
});

test('W5 integration: confirmed hyperkalemia is assessed in an alternative option',()=>{
 const {medication}=check('K+: 5.9 mmol/L','spironolactone');
 assert.ok(medication.alternatives[0].organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('гиперкалиемия')));
});

test('W5 integration: QTc seconds are not silently treated as milliseconds',()=>{
 const {extracted,medication}=check('QTc: 520 s','moxifloxacin');
 assert.equal(extracted.context.qtcMs,undefined);
 assert.ok(extracted.hints.some(h=>h.field==='qtcMs'&&h.kind==='units'));
 assert.equal(hasRisk(medication.alternatives[0].organAlerts,'QTc'),false);
});

test('W5 integration: confirmed long QTc is assessed for moxifloxacin alternative',()=>{
 const {medication}=check('QTc: 520 ms','moxifloxacin');
 assert.ok(hasRisk(medication.alternatives[0].organAlerts,'QTc'));
});

test('W5 integration: pending bleeding stays unknown, not a false negative',()=>{
 const {extracted,medication}=check('Active bleeding: pending','apixaban');
 assert.equal(extracted.context.activeBleeding,undefined);
 assert.ok(extracted.hints.some(h=>h.field==='activeBleeding'&&h.kind==='uncertain'));
 assert.equal(hasRisk(medication.alternatives[0].organAlerts,'кровотечение'),false);
});

test('W5 integration: explicitly confirmed bleeding is a contraindication in independent anticoagulant alternatives',()=>{
 const {extracted,medication}=check('Active pathological bleeding: yes','apixaban\nrivaroxaban');
 assert.equal(extracted.context.activeBleeding,true);
 assert.equal(medication.alternatives.length,2);
 for(const option of medication.alternatives){
  assert.ok(option.organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('кровотечение')));
 }
 assert.equal(medication.alternatives.some(x=>hasRisk(x.alerts,'Апиксабан и ривароксабан')),false);
});

test('W5 integration: contradictory eGFR values remain unresolved across alternatives',()=>{
 const {extracted,medication}=check('eGFR: 25 mL/min\neGFR: 78 mL/min','metformin\nspironolactone');
 assert.equal(extracted.context.egfr,undefined);
 assert.ok(extracted.hints.some(h=>h.field==='egfr'&&h.kind==='conflict'));
 assert.equal(hasRisk(medication.alternatives[0].organAlerts,'Метформин: СКФ'),false);
 assert.ok(medication.alternatives[0].missing.some(s=>s.includes('СКФ')));
});

test('W5 integration: independently valid potassium still triggers alert when renal and QTc are invalid',()=>{
 const {extracted,medication}=check('K+: 5.8 mmol/L\neGFR: 25 mg/dL\nQTc: 520 s','metformin\nspironolactone\nmoxifloxacin');
 assert.equal(extracted.context.potassium,5.8);
 assert.equal(extracted.context.egfr,undefined);
 assert.equal(extracted.context.qtcMs,undefined);
 assert.equal(hasRisk(medication.alternatives[0].organAlerts,'Метформин: СКФ'),false);
 assert.ok(hasRisk(medication.alternatives[1].organAlerts,'гиперкалиемия'));
 assert.equal(hasRisk(medication.alternatives[2].organAlerts,'QTc'),false);
});

test('W5 integration: hepatic safety warnings stay in their own options',()=>{
 const {medication}=check('Decompensated cirrhosis: yes\nSevere hepatic impairment: yes','simvastatin\napixaban\nmetformin');
 assert.ok(hasRisk(medication.alternatives[0].organAlerts,'циррозе'));
 assert.ok(hasRisk(medication.alternatives[1].organAlerts,'печёночной'));
 assert.equal(hasRisk(medication.alternatives[2].organAlerts,'циррозе'),false);
 assert.equal(hasRisk(medication.alternatives[2].organAlerts,'Апиксабан'),false);
});

test('W5 integration: baseline organ warning is not copied into every alternative',()=>{
 const {medication}=check('eGFR: 22 mL/min\nActive bleeding: yes','apixaban\nrivaroxaban','metformin');
 assert.ok(hasRisk(medication.organAlerts,'Метформин: СКФ'));
 assert.equal(medication.alternatives.length,2);
 for(const option of medication.alternatives){
  assert.equal(hasRisk(option.organAlerts,'Метформин: СКФ'),false);
  assert.ok(hasRisk(option.organAlerts,'кровотечение'));
 }
});

test('W5 integration: stopped baseline medication is not silently co-prescribed with options',()=>{
 const extracted=extractMedicationSafetyContext('Active bleeding: no');
 const result=checkMedicationRegimen({current:'warfarin',stopped:'warfarin',alternatives:'ibuprofen\napixaban',context:extracted.context});
 assert.equal(result.stopped.length,1);
 assert.equal(result.alternatives.some(option=>hasRisk(option.alerts,'Варфарин')),false);
});

test('W5 integration: identical synthetic analysis is deterministic without state leakage',()=>{
 const note='K+: 5.8 mg/dL\nQTc: 520 s\nActive bleeding: pending';
 const a=check(note,'spironolactone\nmoxifloxacin\napixaban');
 const b=check(note,'spironolactone\nmoxifloxacin\napixaban');
 assert.deepEqual(a,b);
 assert.equal(a.extracted.hints.length,3);
});
