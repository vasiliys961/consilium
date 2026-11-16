import test from 'node:test';
import assert from 'node:assert/strict';
import {planPhysicianTask,physicianTaskHref} from './physician-task-router.ts';

test('C13: dyspnea CT ECG comprehensive review and protocol has a logical physician plan',()=>{
 const plan=planPhysicianTask('У пациента одышка, есть КТ и ЭКГ. Хочу комплексный разбор и протокол');
 assert.deepEqual(plan.steps.map(s=>s.tool),['radiology','ecg','clinical','protocol']);
 assert.equal(plan.intent,'route');
});
test('C13: medicines, kidney function and source requests choose independent tools without diagnosis',()=>{
 const plan=planPhysicianTask('Проверь безопасность лекарств при СКФ 35 и найди рекомендации');
 assert.deepEqual(plan.steps.map(s=>s.tool),['medications','guidelines']);
 assert.doesNotMatch(JSON.stringify(plan),/пациенту назначить/i);
});
test('C13: ambient uses the existing protocol, never auto-starts a microphone or paid STT',()=>{
 const plan=planPhysicianTask('Записать приём и расшифровать беседу, подготовить протокол');
 assert.deepEqual(plan.steps.map(s=>s.tool),['ambient']);
 assert.equal(physicianTaskHref('ambient','11111111-2222-3333-4444-555555555555','ru'),'/protocol/case?case=11111111-2222-3333-4444-555555555555&locale=ru');
});
test('C13: new case and existing case routes remain distinct and encoded',()=>{
 assert.equal(physicianTaskHref('radiology','case with spaces'),'/radiology?case=case+with+spaces');
 assert.equal(physicianTaskHref('radiology'),'/radiology');
 assert.equal(physicianTaskHref('clinical','abc'),'/workspace?case=abc');
 assert.equal(physicianTaskHref('protocol','abc','en'),'/protocol/case?case=abc&locale=en');
});
test('C13: empty/help and open-ended questions are not falsely treated as completed analysis',()=>{
 assert.equal(planPhysicianTask('').intent,'welcome');
 assert.equal(planPhysicianTask('Что умеет Doctor Opus?').intent,'help');
 assert.deepEqual(planPhysicianTask('Как обследовать пациента с лихорадкой?').steps.map(s=>s.tool),['clinical']);
});
