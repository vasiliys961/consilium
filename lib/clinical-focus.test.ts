import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseClinicalFocus, clinicalFocusText } from './clinical-focus.ts';
import { consiliumFocus } from './consilium.ts';

test('cardiorenal dyspnea focuses relevant specialties without creating agents',()=>{
 const note='Мужчина с ортопноэ, прогрессирующей одышкой, повышенным креатинином и сахарным диабетом';
 const selected=chooseClinicalFocus(note,[]);
 assert.deepEqual(selected.map(item=>item.domain),[
  'internal medicine', 'cardiology', 'pulmonology', 'nephrology', 'endocrinology',
 ]);
 assert.equal(consiliumFocus(note,[]),clinicalFocusText(note,[]));
});

test('an ECG alone selects cardiology and an imaging source adds radiology focus',()=>{
 assert.deepEqual(chooseClinicalFocus('Analyze attached measurements',['ecg']).map(item=>item.domain),['internal medicine','cardiology']);
 assert.deepEqual(chooseClinicalFocus('Analyse study',['radiology']).map(item=>item.domain),['internal medicine','radiology and medical imaging']);
 assert.equal(chooseClinicalFocus('Genetic report',['genetics'])[1]?.domain,'clinical genetics');
});

test('infectious, neurological, medication and liver complaints route to matching areas',()=>{
 const selected=chooseClinicalFocus('Лихорадка, кашель, судороги, препарат с побочными эффектами, цирроз',[]);
 const names=selected.map(item=>item.domain);
 assert.ok(names.includes('infectious diseases'));
 assert.ok(names.includes('neurology'));
 assert.ok(names.includes('clinical pharmacology'));
 assert.ok(names.includes('gastroenterology and hepatology'));
 assert.ok(names.includes('pulmonology'));
});

test('bounded routing avoids adding an unlimited number of prompt roles',()=>{
 const selected=chooseClinicalFocus('Сердечная недостаточность, одышка, креатинин, дозировка, сепсис, инсульт, диабет, рентген, генетика',['ecg','radiology','genetics']);
 assert.ok(selected.length<=6);
 assert.equal(selected[0]?.domain,'internal medicine');
 assert.equal(new Set(selected.map(s=>s.domain)).size,selected.length);
});

test('routine question keeps a single internal medicine domain and cannot start extra services',()=>{
 assert.deepEqual(chooseClinicalFocus('Объясни результат консультации',[]),[{domain:'internal medicine',reason:'clinical-text'}]);
});
