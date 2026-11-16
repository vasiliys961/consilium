import test from 'node:test';
import assert from 'node:assert/strict';
import {ambientSourceFragments,ambientNumberReview} from './ambient-transcript-review.ts';
test('C14: patient and physician text labels are never considered verified speaker identity',()=>{
 const fragments=ambientSourceFragments('Врач: Вы принимаете варфарин?\nПациент: Нет, не принимаю.');
 assert.equal(fragments.length,2);
 assert.deepEqual(fragments.map(x=>x.speaker),['unverified','unverified']);
 assert.ok(fragments[1].reviewFlags.includes('Отрицание или неопределённость'));
});
test('C14: numeric and medication review flags retain exact original text without invented vitals',()=>{
 const original='Назначение обсуждалось: 5 мг; СКФ 35 мл/мин.\nАД не измеряли.';
 const fragments=ambientSourceFragments(original);
 assert.equal(fragments[0].text,'Назначение обсуждалось: 5 мг; СКФ 35 мл/мин.');
 assert.ok(fragments[0].reviewFlags.includes('Лекарства и дозировки'));
 assert.ok(fragments[0].reviewFlags.includes('Числа или показатели'));
 assert.ok(fragments[1].reviewFlags.includes('Отрицание или неопределённость'));
 assert.deepEqual(ambientNumberReview(original,'Доза 5 мг, СКФ 35. АД 120/80'),['120','80']);
 assert.deepEqual(ambientNumberReview(original,'Нет объективных данных'),[]);
});
test('C14: empty audio transcript cannot acquire fake source fragments',()=>{
 assert.deepEqual(ambientSourceFragments(' \n '),[]);
 assert.deepEqual(ambientNumberReview('','ЧСС 98'),['98']);
});
