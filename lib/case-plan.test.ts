import test from 'node:test';
import assert from 'node:assert/strict';
import { planCase, searchTopic } from './case-plan.ts';
test('generic file reading, clinical reasoning, therapy and evidence have different tool plans',()=>{
 assert.equal(planCase('что здесь',[{name:'ecg2.png'}]).task,'interpret');
 assert.equal(planCase('Нужен дифференциальный диагноз',[]).task,'clinical');
 assert.equal(planCase('Как лечить это состояние?',[]).task,'management');
 assert.equal(planCase('Какие есть доказательства?',[]).search,true);
 assert.equal(planCase('что здесь',[]).needsInput,true);
});
test('explicit current question takes precedence over old treatment mentioned in history',()=>{
 const plan=planCase('Анамнез: ранее обсуждали лечебную тактику.\n\nВопрос врача: Что на ЭКГ?\n\n2026-11-07: запись динамики',[{name:'ecg2.png'}]);
 assert.equal(plan.task,'interpret');assert.equal(plan.search,false);
});
test('literature planning sees the latest follow-up and uploaded findings despite a long clinical history', () => {
 const note = `Вопрос врача: Уточнить лечение\n\n${'Длинный анамнез. '.repeat(200)}\n\n[day 7]T09:00:00.000Z — Динамика: Новый результат лаборатории`;
 const topic = searchTopic(note, 'Извлечённый текст исследования', 'management', true, true);
 assert.match(topic ?? '', /Уточнить лечение\n.*Новый результат лаборатории\nИзвлечённый текст исследования/);
 assert.ok(topic && topic.length < 1200);
});
