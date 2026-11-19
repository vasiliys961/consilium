import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewClaimEvidence} from './clinical-claim-evidence.ts';
import type {Citation} from './literature.ts';
const citation=(extra:Partial<Citation>={}):Citation=>({
 shelf:'world',title:'Example clinical guideline',url:'https://example.org/guideline',
 retrieved:'2026-11-16',license:null,country:null,pmid:'101',
 journal:null,year:'2025',pdf:null,edition:null,chapter:null,page:null,...extra
});
test('bibliography is not read content and cannot be treated as supportive',()=>{
 const x=reviewClaimEvidence('Start treatment with 5 mg',citation());
 assert.deepEqual(x,{level:'bibliography',topicOverlap:false,missingQuantities:['5 mg'],unlocatedPopulation:[],restrictionLanguagePresent:false});
});
test('an abstract is never promoted to a full text paragraph',()=>{
 const x=reviewClaimEvidence('atrial fibrillation management',citation({
  abstract:'This is a review of atrial fibrillation management and outcomes.'}));
 assert.equal(x.level,'abstract');assert.equal(x.topicOverlap,true);
});
test('full text retains paragraph level but thematic match is not a clinical verification',()=>{
 const x=reviewClaimEvidence('Treatment of atrial fibrillation',citation({
  excerpt:'Treatment of atrial fibrillation must consider bleeding risk and renal function.',paragraph:42,chapter:'Recommendations'}));
 assert.equal(x.level,'paragraph');assert.equal(x.topicOverlap,true);
});
test('a claimed numerical regimen absent in the excerpt is flagged without inventing a contradiction',()=>{
 const x=reviewClaimEvidence('Use 20 mg and recheck after 2 weeks',citation({
  excerpt:'Use 5 mg in the selected adult population.',paragraph:1}));
 assert.deepEqual(x.missingQuantities,['20 mg']);
});
test('a matching dose is not reported missing, but scope is still inspected separately',()=>{
 const x=reviewClaimEvidence('Give 5 mg in pregnancy',citation({excerpt:'Consider 5 mg in adults.',paragraph:2}));
 assert.deepEqual(x.missingQuantities,[]);
 assert.deepEqual(x.unlocatedPopulation,['беременность']);
});
test('RU population and renal prerequisites absent from the passage stay unlocated',()=>{
 const x=reviewClaimEvidence('При беременности и снижении СКФ препарат назначить с осторожностью',citation({
  excerpt:'This drug reduces recurrence in selected adults.'}));
 assert.deepEqual(x.unlocatedPopulation,['беременность','функция почек']);
});
test('short claims and another language cannot be falsely marked as topical matches',()=>{
 const x=reviewClaimEvidence('диуретик',citation({abstract:'Loop diuretics have important monitoring requirements.'}));
 assert.equal(x.topicOverlap,false);
});

test('W5 source: 5 mg is not the same amount as 5 mg/kg or 5 mg/kg/day',()=>{
 const source=citation({excerpt:'A selected group received 5 mg once daily; dosing units were recorded.'});
 const result=reviewClaimEvidence('Start 5 mg/kg/day in adults',source);
 assert.deepEqual(result.missingQuantities,['5 mg/kg/day']);
 assert.deepEqual(result.unlocatedPopulation,['взрослые']);
});
test('W5 source: bottle strength is not an administered dose',()=>{
 const result=reviewClaimEvidence('Give 250 mg/5 mL oral formulation',citation({excerpt:'The adult regimen provides 250 mg.'}));
 assert.deepEqual(result.missingQuantities,['250 mg/5 mL']);
});
test('W5 source: D-dimer and troponin unit qualifiers remain visible, no automatic biomarker interpretation',()=>{
 const result=reviewClaimEvidence('D-dimer 780 ng/mL and troponin 55 ng/L',citation({
  excerpt:'D-dimer 780 ng/L; troponin 55 ng/L. Clinical thresholds are assay-dependent.'}));
 assert.deepEqual(result.missingQuantities,['780 ng/mL']);
});
test('W5 source: Russian and English milligrams match only as lexical quantities',()=>{
 const result=reviewClaimEvidence('Назначить 5 мг',citation({excerpt:'The randomized cohort received 5 mg daily.'}));
 assert.deepEqual(result.missingQuantities,[]);
});
test('W5 source: full renal unit with denominator must not match a shortened denominator',()=>{
 const result=reviewClaimEvidence('eGFR 25 ml/min/1.73 m²',citation({
  excerpt:'eGFR 25 ml/min in the participants.'}));
 assert.deepEqual(result.missingQuantities,['25 ml/min/1.73 m²']);
});
test('W5 source: bibliography-only cannot verify pregnancy, renal scope or numeric therapy',()=>{
 const result=reviewClaimEvidence('Give 5 mg/kg in pregnancy with CKD',citation());
 assert.equal(result.level,'bibliography');
 assert.deepEqual(result.missingQuantities,['5 mg/kg']);
 assert.deepEqual(result.unlocatedPopulation,['беременность','функция почек']);
 assert.equal(result.topicOverlap,false);
});
test('W5 source: positive treatment claim plus restrictive wording triggers physician applicability check',()=>{
 const result=reviewClaimEvidence('Start Drug A 5 mg in pregnancy',citation({
  excerpt:'Drug A 5 mg is contraindicated in pregnancy for this population.'}));
 assert.deepEqual(result.missingQuantities,[]);
 assert.deepEqual(result.unlocatedPopulation,[]);
 assert.equal(result.restrictionLanguagePresent,true);
});
test('W5 source: a cautionary claim should not be misclassified as an affirmative prescription',()=>{
 const result=reviewClaimEvidence('Do not start Drug A 5 mg in pregnancy',citation({
  excerpt:'Drug A 5 mg is contraindicated in pregnancy.'}));
 // Restriction warning is only raised for an affirmative instruction; the
 // source itself is still not a substitute for clinical appraisal.
 assert.equal(result.restrictionLanguagePresent,false);
});
test('W5 source: exact quantities or topic match never certify clinical applicability',()=>{
 const result=reviewClaimEvidence('Start Drug A 5 mg',citation({
  excerpt:'Drug A 5 mg is not recommended for treatment of this condition.'}));
 assert.equal(result.restrictionLanguagePresent,true);
 assert.deepEqual(result.missingQuantities,[]);
 assert.equal(result.topicOverlap,true);
});
