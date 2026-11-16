import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMedicationRegimen,knownDrugInteractions,checkProposedMedications} from './drug-interaction-rules.ts';

/** Entirely synthetic C3 acceptance cases; no patient records, API calls or inferred vital signs. */
test('C3 scenario: HFrEF with spironolactone, RAAS blocker, potassium supplement and hyperkalemia',()=>{
 const v=checkMedicationRegimen({current:'лозартан 50 мг + спиронолактон 25 мг + калия хлорид',context:{egfr:27,potassium:5.9}});
 assert.ok(v.alerts.length>=2);
 assert.ok(v.alerts.some(a=>a.risk.includes('гиперкалиемии')));
 assert.ok(v.organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('5,5')));
 assert.ok(v.alerts.every(a=>a.url.startsWith('https://dailymed.nlm.nih.gov/')));
});
test('C3 scenario: renal impairment changes metformin and clarithromycin-colchicine applicability',()=>{
 const v=checkMedicationRegimen({current:'метформин; колхицин',proposed:'кларитромицин',context:{egfr:22,potassium:4.8}});
 assert.ok(v.organAlerts.some(a=>a.drug.includes('метформин')&&a.severity==='contraindicated'));
 assert.ok(v.alerts.some(a=>a.risk.includes('колхицина')&&a.severity==='contraindicated'));
});
test('C3 scenario: atrial fibrillation anticoagulant + NSAID + antibiotic with separate source-backed risks',()=>{
 const v=checkMedicationRegimen({current:'warfarin',proposed:'ibuprofen\nmoxifloxacin',context:{egfr:70}});
 assert.equal(v.alerts.filter(a=>a.first.toLowerCase().includes('warfarin')||a.second.toLowerCase().includes('warfarin')).length,2);
 assert.ok(v.alerts.some(a=>a.monitoring.includes('МНО')));
});
test('C3 scenario: QT combination remains visible with and without measured QTc',()=>{
 const noEcg=checkMedicationRegimen({current:'амидарон',proposed:'moxifloxacin',context:{}});
 // A misspelled ingredient must be displayed as uncovered rather than silently normalized.
 assert.equal(noEcg.alerts.length,0);assert.ok(noEcg.coverage.unrecognized.includes('амидарон'));
 const confirmed=checkMedicationRegimen({current:'амиодарон',proposed:'moxifloxacin',context:{qtcMs:512,ageYears:67}});
 assert.ok(confirmed.alerts.some(a=>a.risk.includes('QT')));
 assert.ok(confirmed.organAlerts.some(a=>a.risk.includes('QTc')));
 assert.ok(confirmed.organAlerts.some(a=>a.risk.includes('сухожилий')));
});
test('C3 scenario: mutually exclusive anticoagulation alternatives are never simulated as combined',()=>{
 const v=checkMedicationRegimen({current:'ibuprofen',alternatives:'варфарин\nапиксабан'});
 assert.equal(v.alerts.length,0);
 assert.equal(v.alternatives[0].alerts.length,1);
 assert.equal(v.alternatives[1].alerts.length,1);
 const afterStopping=checkMedicationRegimen({current:'варфарин + ибупрофен',stopped:'warfarin',proposed:'парацетамол'});
 assert.equal(afterStopping.alerts.length,0);
});
test('C3 scenario: unknown pair is uncovered, not established safe; topical routes do not get systemic warnings',()=>{
 const v=checkMedicationRegimen({current:'baricitinib',proposed:'ivermectin'});
 assert.equal(v.alerts.length,0);
 assert.deepEqual(v.coverage.unrecognized,['baricitinib','ivermectin']);
 assert.equal(knownDrugInteractions('апиксабан','ibuprofen гель').length,0);
 assert.equal(checkProposedMedications('варфарин',['парацетамол']).length,0);
});
test('C3 scenario: hepatic failure changes risk only where actual medicine is present',()=>{
 const v=checkMedicationRegimen({current:'simvastatin + apixaban',context:{decompensatedCirrhosis:true,severeHepaticImpairment:true}});
 assert.ok(v.organAlerts.some(a=>a.drug==='Симвастатин'&&a.severity==='contraindicated'));
 assert.ok(v.organAlerts.some(a=>a.drug==='Апиксабан'&&a.severity==='major'));
 assert.equal(checkMedicationRegimen({current:'apixaban'}).organAlerts.length,0);
});

test('C3 scenario: anticoagulant switching only suppresses concurrent alerts after explicit discontinuation',()=>{
 const before=checkMedicationRegimen({current:'варфарин',proposed:'апиксабан'});
 assert.equal(before.alerts.length,1);
 const after=checkMedicationRegimen({current:'варфарин',proposed:'апиксабан',stopped:'warfarin'});
 assert.equal(after.alerts.length,0);
 const withNsaid=checkMedicationRegimen({current:'варфарин + ибупрофен',proposed:'апиксабан',stopped:'warfarin'});
 assert.equal(withNsaid.alerts.length,1,'Current ibuprofen continues and still interacts with proposed apixaban');
 assert.match(withNsaid.alerts[0].risk,/кровотечения/);
});
