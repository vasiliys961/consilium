import test from 'node:test';
import assert from 'node:assert/strict';
import {specialistTerminologyHint} from './specialist-medical-terminology.ts';
import {LOCALES} from './locale.ts';

test('C13 terminology: selected medical vocabulary only; no complete translator dictionary',()=>{
 const hint=specialistTerminologyHint('Пациент принимает метопролол 50 мг. Одышка отсутствует.','ru');
 assert.match(hint,/metoprolol/);
 assert.match(hint,/метопролол/);
 assert.match(hint,/mg/);
 assert.match(hint,/NOT clinically validated/);
 assert.match(hint,/A symptom is NOT a diagnosis/);
 assert.doesNotMatch(hint,/50 мг|Пациент принимает/);
 assert.ok(hint.length<1400);
});

test('C13 terminology: international and Russian entries with English naming',()=>{
 assert.match(specialistTerminologyHint('Patient takes acetaminophen 500 mg','en'),/paracetamol/);
 const cases=[
  ['es','Paciente toma metoprolol'],
  ['fr','Le patient prend métoprolol'],
  ['ar','المريض يتناول ميتوبرولول'],
  ['hi','रोगी मेटोप्रोलोल लेता है'],
  ['pt-BR','Paciente toma metoprolol'],
  ['zh-CN','患者服用美托洛尔'],
 ] as const;
 for(const [locale,sample] of cases)
  assert.match(specialistTerminologyHint(sample,locale),/metoprolol/,locale);
 for(const {code} of LOCALES)
  assert.match(specialistTerminologyHint('metoprolol',code),/metoprolol/,code);
});

test('C13 terminology: mixed speech language and abbreviations are cautious',()=>{
 assert.match(specialistTerminologyHint('Пациент принимает метопролол','en'),/metoprolol/);
 assert.equal(specialistTerminologyHint('Can you clarify the next appointment?','en'),'');
 const uncertain=specialistTerminologyHint('What does MS mean?','en');
 assert.match(uncertain,/ambiguous abbreviation/);
 assert.doesNotMatch(uncertain,/morphine sulfate|multiple sclerosis/);
 assert.ok(specialistTerminologyHint('metoprolol '+('warfarin ').repeat(30),'ru').length<1400);
});
