import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPhysicianTask,physicianTaskHref} from './physician-task-router.ts';
import {CONSILIUM_ROLES} from './consilium.ts';
import {MODELS} from './cost.ts';
import {CONSULT_MODELS} from './specialist-options.ts';

const source=(path:string)=>readFileSync(path,'utf8');

test('C13: assistant precedes the collapsed guide without a second homepage hero or metrics',()=>{
 const workspace=source('app/components/clinical-workspace.tsx');
 const assistant=source('app/components/physician-task-assistant.tsx');
 const before=workspace.indexOf('<PhysicianTaskAssistant ');
 const guide=workspace.indexOf('<ProductGuide');
 assert.ok(before>0&&before<guide);
 assert.doesNotMatch(workspace,/styles\.welcome|styles\.metrics/);
 assert.match(workspace,/getElementById\('doctor-opus-assistant'\)/);
 assert.match(workspace,/aria-label=\{t\("Помощник Doctor Opus"\)\}/);
 assert.match(assistant,/id="doctor-opus-assistant"/);
 assert.match(assistant,/Показать возможности/);
 assert.doesNotMatch(assistant,/<details style=\{\{marginTop:12\}\}><summary>\{t\('Примеры задач и возможности'\)\}/);
});
test('C13: visible welcome shortcut offers real modules, not an autonomous paid clinical call',()=>{
 for(const request of ['Что умеет Doctor Opus?','Чем Doctor Opus может помочь?','what can you do']){
  const p=planPhysicianTask(request);
  assert.equal(p.intent,'help',request);
  assert.ok(p.steps.some(s=>s.tool==='clinical'));
  assert.ok(p.steps.some(s=>s.tool==='ambient'));
  assert.ok(p.steps.some(s=>s.tool==='medications'));
  assert.ok(p.steps.some(s=>s.tool==='protocol'));
  assert.equal(p.steps[0].tool,'clinical');
 }
 assert.equal(physicianTaskHref('ambient','synthetic-case','ru'),'/protocol/case?case=synthetic-case&locale=ru&ambient=1');
 const assistant=source('app/components/physician-task-assistant.tsx');
 assert.match(assistant,/fetch\('\/api\/integrations'/);
 assert.doesNotMatch(assistant,/\/api\/v1\/cases|\/api\/specialist-chat/);
});
test('C13: model role guide matches the actually routed models',()=>{
 assert.equal(MODELS.pro,'google/gemini-4-argon');
 assert.equal(CONSILIUM_ROLES.find(r=>r.id==='testChooser')?.model,MODELS.sol);
 assert.equal(CONSILIUM_ROLES.find(r=>r.id==='challenger')?.model,MODELS.opus);
 assert.equal(CONSILIUM_ROLES.find(r=>r.id==='checklist')?.model,MODELS.opus);
 assert.equal(CONSILIUM_ROLES.find(r=>r.id==='stewardship')?.model,MODELS.sonnet);
 assert.ok(CONSULT_MODELS.some(item=>item.id===MODELS.opus));
 assert.ok(CONSULT_MODELS.some(item=>item.id===MODELS.sol));
 const choices=source('app/components/gemini-model-choice.tsx');
 for(const model of ['Claude Opus 5.5','GPT-6.1 Sol','Gemini 4 Argon','Claude Sonnet 5.5'])
  assert.ok(choices.includes(model),model);
 assert.match(choices,/Это разные исполнители для разных клинических задач/);
 assert.match(choices,/Настроить только Gemini/);
 assert.match(choices,/<details aria-label/);
 assert.match(choices,/<a href="\/consult">/);
});
