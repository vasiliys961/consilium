import test from 'node:test';
import assert from 'node:assert/strict';
import type {ClinicalCase} from './casebook.ts';
import {proposedPrescriptionRegimens,prescriptionPrintText} from './prescription-draft.ts';
const fixture={
 analyses:[{result:{clinicalDraft:'generated',draft:{report:{
  management:[
   {option:'Plan A (if severe congestion)',medications:['furosemide'],conditions:['overloaded'],safetyChecks:['electrolytes'],monitoring:['diuresis']},
   {option:'Plan B (alternative)',medications:['torsemide'],conditions:['alternative to A'],safetyChecks:['kidney function'],monitoring:['weight']},
   {option:'General advice without medicine',medications:[],conditions:[],safetyChecks:[],monitoring:[]}
  ]
 }}}}]
} as ClinicalCase;

test('AI treatment proposals become separate editable draft regimens, without inferred doses or co-administration',()=>{
 const regimens=proposedPrescriptionRegimens(fixture);
 assert.equal(regimens.length,2);
 assert.deepEqual(regimens.map(x=>x.medications[0].drug),['furosemide','torsemide']);
 assert.equal(regimens[0].medications[0].dose,'');
 assert.equal(regimens[0].medications[0].route,'');
 assert.deepEqual(regimens[0].safetyChecks,['electrolytes']);
});
test('the prescription print draft never claims an order was signed or invents missing doses',()=>{
 const record=proposedPrescriptionRegimens(fixture)[0].medications;
 const text=prescriptionPrintText(record,{patient:'',physician:'',organization:''});
 assert.match(text,/ЧЕРНОВИК РЕЦЕПТУРНЫХ НАЗНАЧЕНИЙ/);
 assert.match(text,/доза: не указана/);
 assert.match(text,/путь: не указан/);
 assert.match(text,/предложения ИИ не являются рецептом/);
 assert.doesNotMatch(text,/Rp\.: Furosemidi 40/);
});
test('incomplete AI analysis is never treated as an approved regimen',()=>{
 const failed={...fixture,analyses:[{...fixture.analyses[0],result:{...fixture.analyses[0].result,clinicalDraft:'unavailable'}}]} as ClinicalCase;
 assert.deepEqual(proposedPrescriptionRegimens(failed),[]);
 assert.deepEqual(proposedPrescriptionRegimens(undefined),[]);
});
