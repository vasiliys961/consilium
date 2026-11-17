import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 isCopilotToolDiscoveryQuery,planPhysicianTask,
} from './physician-task-router.ts';
import {
 appendLocalCopilotTurn,composeCopilotSpecialistDraft,
} from './copilot-conversation.ts';
import {suggestClinicalDestination} from './copilot-clinical-routing.ts';

test('W1: searching for a known ECG tool is a free deterministic route',()=>{
 assert.equal(isCopilotToolDiscoveryQuery('Найди инструмент для анализа ЭКГ'),true);
 assert.equal(isCopilotToolDiscoveryQuery('find a tool for ECG'),true);
 assert.equal(isCopilotToolDiscoveryQuery('Боль в груди'),false);
 assert.equal(planPhysicianTask('Найди инструмент для анализа ЭКГ').steps[0]?.tool,'ecg');
 assert.equal(planPhysicianTask('Find a tool for ECG').steps[0]?.tool,'ecg');
 assert.equal(planPhysicianTask('Найди инструмент для ЭКГ у пациента с болью в груди').steps[0]?.tool,'ecg');
 assert.equal(planPhysicianTask('Боль в груди').steps[0]?.tool,'specialist');
});

test('W1: deterministic clinical steps retain context in memory and specialist draft',()=>{
 const first=appendLocalCopilotTurn([],'У пациента появилась боль в груди','Предложена кардиология');
 assert.equal(first.length,2);
 assert.equal(first[0].role,'physician');
 const continued=appendLocalCopilotTurn(first,'SpO₂ 91%, также появилась одышка','Предложена консультация');
 const draft=composeCopilotSpecialistDraft(continued,'SpO₂ 91%, также появилась одышка');
 assert.match(draft,/боль в груди/i);
 assert.match(draft,/SpO₂ 91%/);
 assert.equal((draft.match(/SpO₂ 91%/g)||[]).length,1);
 assert.equal(suggestClinicalDestination(draft)?.specialty,'cardiology');
});

test('W1: platform help and tool commands are not transferred as patient history',()=>{
 let turns=appendLocalCopilotTurn([],'Что умеет Doctor Opus?','Каталог модулей');
 turns=appendLocalCopilotTurn(turns,'Найди инструмент для анализа ЭКГ','Откройте ЭКГ');
 turns=appendLocalCopilotTurn(turns,'У пациента боль в груди','Кардиология');
 const draft=composeCopilotSpecialistDraft(turns,'Открой специалиста');
 assert.equal(draft,'У пациента боль в груди');
 assert.doesNotMatch(draft,/найди инструмент|что умеет/i);
 assert.equal(composeCopilotSpecialistDraft([], 'Открой специалиста'),'');
});

test('W1: UI records local routes, preserves patient context and keeps paid calls separate',()=>{
 const component=readFileSync('app/components/physician-task-assistant.tsx','utf8');
 assert.match(component,/appendLocalCopilotTurn\(previous,utterance,local\.message\)/);
 assert.match(component,/appendLocalCopilotTurn\(previous,phrase,planPhysicianTask\(phrase\)\.message\)/);
 assert.match(component,/composeCopilotSpecialistDraft\(dialogue,/);
 assert.match(component,/isCopilotToolDiscoveryQuery\(utterance\)/);
 assert.match(component,/if\(local\.intent==='help'\|\|suggestClinicalDestination\(utterance\)/);
});
