import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPatientSafetyFactors,type PatientSafetyInput} from './medication-patient-factors.ts';

const check=(patch:Partial<PatientSafetyInput>)=>reviewPatientSafetyFactors({
 current:'',proposed:'',alternatives:'',stopped:'',allergyStatus:'unknown',
 allergenNames:'',pregnancyStatus:'unknown',...patch,
});
test('W5 allergy: explicit ingredient match in proposed medication is visible',()=>{
 const r=check({allergyStatus:'confirmed',allergenNames:'amoxicillin',proposed:'amoxicillin 500 mg'});
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].kind,'same_ingredient');
 assert.equal(r.findings[0].scope,'proposed');
 assert.equal(r.findings[0].allergen,'amoxicillin');
 assert.equal(r.doseVerificationRequired,true);
});
test('W5 allergy: multilingual ingredient / brand aliases match when explicitly known',()=>{
 const r=check({allergyStatus:'confirmed',allergenNames:'ибупрофен',proposed:'Nurofen 400 mg',current:'metformin'});
 assert.deepEqual(r.findings.map(x=>x.scope),['proposed']);
});
test('W5 allergy: separate alternatives do not produce invented co-administration',()=>{
 const r=check({allergyStatus:'confirmed',allergenNames:'apixaban',alternatives:'warfarin\napixaban\nrivaroxaban'});
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].scope,'alternative');
 assert.equal(r.findings[0].alternative,'apixaban');
});
test('W5 allergy: stopped item is excluded from active and proposed screening',()=>{
 const r=check({allergyStatus:'confirmed',allergenNames:'warfarin',current:'warfarin',proposed:'warfarin',stopped:'warfarin'});
 assert.deepEqual(r.findings,[]);
 assert.equal(r.doseVerificationRequired,false);
});
test('W5 allergy: unknown/allergy absent statuses never imply negative screening coverage',()=>{
 for(const status of ['unknown','none_reported'] as const){
  const r=check({allergyStatus:status,allergenNames:'',proposed:'amoxicillin'});
  assert.equal(r.findings.length,0);
  assert.equal(r.doseVerificationRequired,true);
 }
});
test('W5 allergy: contradictory or missing confirmation is an unresolved issue',()=>{
 assert.ok(check({allergyStatus:'confirmed',allergenNames:'',proposed:'amoxicillin'}).issues.includes('confirmed_allergens_missing'));
 assert.ok(check({allergyStatus:'none_reported',allergenNames:'penicillin',proposed:'amoxicillin'}).issues.includes('allergy_status_conflict'));
});
test('W5 allergy: reported penicillin allergy prompts class review for amoxicillin, not a confirmed contraindication',()=>{
 const r=check({allergyStatus:'confirmed',allergenNames:'penicillin',proposed:'amoxicillin'});
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].kind,'class_review');
 assert.equal(r.findings[0].scope,'proposed');
 assert.equal(r.doseVerificationRequired,true);
});
test('W5 allergy: unsupported narrative names require clarification, never silent absence',()=>{
 const r=check({allergyStatus:'confirmed',allergenNames:'amoxicillin? severe rash',proposed:'amoxicillin'});
 assert.ok(r.issues.includes('allergen_names_unverified'));
 assert.ok(r.unverifiedAllergens.length>0);
 assert.equal(r.findings.length,0);
});
test('W5 pregnancy: confirmed pregnancy creates separate source-review flags for all active proposed alternatives',()=>{
 const r=check({pregnancyStatus:'pregnant',current:'metformin',proposed:'amoxicillin',alternatives:'apixaban\nwarfarin'});
 assert.deepEqual(r.pregnancyReview.map(x=>x.scope),['current','proposed','alternative','alternative']);
 assert.deepEqual(r.pregnancyReview.map(x=>x.drug),['metformin','amoxicillin','apixaban','warfarin']);
});
test('W5 pregnancy: not-pregnant and unknown statuses are not treated as pregnancy confirmed',()=>{
 for(const status of ['unknown','not_pregnant','not_applicable'] as const){
  assert.deepEqual(check({pregnancyStatus:status,proposed:'warfarin'}).pregnancyReview,[]);
 }
});
test('W5 dosage: amount in a drug row never authorizes a patient dose',()=>{
 const r=check({proposed:'metformin 500 mg',allergyStatus:'unknown'});
 assert.equal(r.findings.length,0);
 assert.equal(r.doseVerificationRequired,true);
});
test('W5 factor review: deterministic no-inference and language independent',()=>{
 const a=check({current:'апиксабан 5 мг',allergyStatus:'confirmed',allergenNames:'Eliquis',pregnancyStatus:'pregnant'});
 const b=check({current:'апиксабан 5 мг',allergyStatus:'confirmed',allergenNames:'Eliquis',pregnancyStatus:'pregnant'});
 assert.deepEqual(a,b);assert.equal(a.findings.length,1);assert.equal(a.pregnancyReview.length,1);
});
