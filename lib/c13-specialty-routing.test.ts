import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestClinicalDestination} from './copilot-clinical-routing.ts';
import {planPhysicianTask} from './physician-task-router.ts';
import {SPECIALIST_PROFILES} from './specialist-profiles.ts';

test('C13: clinician complaint is matched to existing medical specialist (not diagnostic answer)',()=>{
 const scenarios:[string,string][]=[
  ['болит сердце','cardiology'],
  ['Боль в груди с одышкой','cardiology'],
  ['у парня одышка свист и кашель','pulmonology'],
  ['кашель и хрипы','pulmonology'],
  ['частые мигрени','neurology'],
  ['диабет, высокий гликированный гемоглобин','endocrinology'],
  ['сильная боль в животе','gastroenterology'],
  ['артрит и боли в суставах','rheumatology'],
  ['анемия и снижение гемоглобина','hematology'],
  ['у ребенка высокая температура','pediatrics'],
  ['у ребёнка кашель и одышка','pediatrics'],
  ['у ребёнка боль в груди','pediatrics'],
  ['сыпь на коже','dermatology'],
  ['подозрение на опухоль','oncology'],
  ['перелом после травмы','traumatology'],
  ['беременность','gynecology'],
  ['вопрос к радиологу по заключению','radiology'],
  ['у пациента слабость','universal'],
 ];
 for(const [question,expected] of scenarios){
  const choice=suggestClinicalDestination(question);
  assert.equal(choice?.specialty,expected,question);
  assert.ok(SPECIALIST_PROFILES.some(item=>item.id===choice?.specialty),question);
  const plan=planPhysicianTask(question);
  assert.equal(plan.steps[0]?.tool,'specialist',question);
  assert.equal(plan.steps[1]?.tool,'clinical',question);
 }
});

test('C13: critical chest-pain warning does not diagnose or start treatment',()=>{
 const response=planPhysicianTask('болит сердце');
 assert.match(response.message,/Кардиология/);
 assert.match(response.message,/срочная очная/i);
 assert.doesNotMatch(response.message,/у вас инфаркт|назначьте|примите/i);
});

test('C13: routine app questions and explicit protocol work do not get mistaken for clinical consultations',()=>{
 for(const value of ['Что умеет Doctor Opus?','найди инструмент','покажи возможности']){
  assert.equal(planPhysicianTask(value).intent,'help',value);
  assert.equal(suggestClinicalDestination(value),null,value);
 }
 assert.deepEqual(planPhysicianTask('У пациента одышка, есть КТ и ЭКГ. Хочу комплексный разбор и протокол').steps.map(s=>s.tool),
  ['radiology','ecg','clinical','protocol']);
 assert.equal(suggestClinicalDestination('открой ЭКГ'),null);
 assert.equal(suggestClinicalDestination('расшифруй МРТ'),null);
 assert.deepEqual(planPhysicianTask('расшифруй МРТ').steps.map(s=>s.tool),['radiology']);
});

test('C13: instant local response, visible result, selection and lazy integration check',()=>{
 const component=readFileSync('app/components/physician-task-assistant.tsx','utf8');
 assert.match(component,/local\.intent==='help'/);
 assert.match(component,/suggestClinicalDestination\(utterance\)/);
 assert.match(component,/setRequest\(utterance\);setAgentReply\(null\);setAgentError\(''\);setText\(''\)/);
 assert.match(component,/setRequest\(utterance\);setAgentReply\(null\)/);
 assert.match(component,/id="opus-copilot-result"/);
 assert.match(component,/routeRequested=Boolean\(request\.trim\(\)\)/);
 assert.match(component,/specialty:target\?\.specialty,caseId/);
 assert.match(component,/step\.tool==='specialist'.*suggestClinicalDestination\(request\)/);
});

test('C13: specialist can receive a selected specialty and run voice without Copilot STT',()=>{
 const specialist=readFileSync('app/consult/page.tsx','utf8');
 const handoff=readFileSync('lib/copilot-consult-handoff.ts','utf8');
 const profile=readFileSync('lib/specialist-profiles.ts','utf8');
 assert.match(specialist,/setSpecialty\(received\.specialty\)/);
 assert.match(specialist,/recordConsultQuestion/);
 assert.match(specialist,/Записать голосом/);
 assert.match(handoff,/SPECIALIST_PROFILES\.some/);
 assert.match(profile,/id: 'pulmonology'/);
});

test('C13: local documents are reviewed as text; no silent attachment upload',()=>{
 const specialist=readFileSync('app/consult/page.tsx','utf8');
 assert.match(specialist,/await import\('@\/lib\/case-intake'\)/);
 assert.match(specialist,/file\.size>8\*1024\*1024/);
 assert.match(specialist,/setAttachmentPreview/);
 assert.match(specialist,/cleanChatText\(prepared\.text\)/);
 assert.match(specialist,/Вставить проверенный текст в вопрос/);
 assert.doesNotMatch(specialist,/fetch\('\/api\/upload-document'/);
});

test('C13: explicit handoff to new or selected case is not an automatic medical analysis',()=>{
 const specialist=readFileSync('app/consult/page.tsx','utf8');
 const caseView=readFileSync('app/components/clinical-workspace.tsx','utf8');
 const handoff=readFileSync('lib/copilot-case-handoff.ts','utf8');
 assert.match(specialist,/storeSpecialistCaseDraft\(doc,sourceCaseId\)/);
 assert.match(specialist,/router\.push\(sourceCaseId\?'\/workspace\?case='/);
 assert.match(caseView,/consumeSpecialistCaseDraft\(value\.id\)/);
 assert.match(caseView,/setTab\('analysis'\)/);
 assert.match(handoff,/sessionStorage\.removeItem\(KEY\)/);
 assert.doesNotMatch(handoff,/fetch\(/);
});
