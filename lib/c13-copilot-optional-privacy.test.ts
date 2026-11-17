import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {copilotNeedsPrivacyReview} from './copilot-privacy.ts';
import {cleanChatText} from './privacy-chat.ts';
import {copilotRequestedOpen,physicianTaskHref,planPhysicianTask} from './physician-task-router.ts';
import {priceUsd,MODELS} from './cost.ts';

const file=(path:string)=>readFileSync(path,'utf8');

test('C13: routine navigation questions do not require intrusive personal-data review',()=>{
 for(const prompt of [
  'Что умеет Doctor Opus?',
  'Мне нужен Opus Copilot',
  'Как открыть протокол?',
  'У парня одышка, свист и кашель',
  'Где посмотреть ЭКГ?',
  'Show me Gemini Flash and Claude Opus options',
 ])assert.equal(copilotNeedsPrivacyReview(prompt),false,prompt);
 assert.equal(cleanChatText('Что умеет Doctor Opus?').text,'Что умеет Doctor Opus?');
});

test('C13: identifiable patient details and files still trigger the full review',()=>{
 for(const prompt of [
  'ФИО: Петров Иван Иванович. Что делать?',
  'Пациент: Иван Петров, телефон +79991112233',
  'Patient name: John Smith, DOB 2004-01-02',
  'Прикрепляю больничную выписку patient.pdf',
  'Отправь /Users/doctor/Desktop/case.dcm',
 ])assert.equal(copilotNeedsPrivacyReview(prompt),true,prompt);
});

test('C13: physician can open a module explicitly without LLM or diagnostic action',()=>{
 assert.equal(copilotRequestedOpen('Открой специалиста'),'specialist');
 assert.equal(copilotRequestedOpen('Открой консультацию'),'specialist');
 assert.equal(copilotRequestedOpen('Открой ЭКГ'),'ecg');
 assert.equal(copilotRequestedOpen('Перейди в протокол'),'protocol');
 assert.equal(copilotRequestedOpen('Что умеет Doctor Opus?'),null);
 assert.equal(copilotRequestedOpen('У пациента одышка'),null);
 assert.equal(physicianTaskHref('specialist'),'/consult');
 assert.deepEqual(planPhysicianTask('Что умеет Doctor Opus?').steps.map(x=>x.tool).includes('clinical'),true);
});

test('C13: short Gemini Flash answers cost fractions of a cent and model is independent of Copilot name',()=>{
 const one=priceUsd(MODELS.flash,2000,200);
 assert.equal(one,0.00225);
 assert.equal(Math.round(one*50*100000)/100000,0.1125);
});

test('C13: opt-in is a remembered UI preference, not a repeated consent or paid call',()=>{
 const source=file('app/components/physician-task-assistant.tsx');
 assert.match(source,/const COPILOT_PREF='doctor-opus-copilot-enabled-v1'/);
 assert.match(source,/Нужен Opus Copilot\?/);
 assert.match(source,/Включить помощника/);
 assert.match(source,/Отключить Copilot/);
 assert.match(source,/if\(copilotEnabled\)\{void askAi\(\);return\}/);
 assert.match(source,/copilotNeedsPrivacyReview\(utterance\)/);
 assert.match(source,/prepareChatSend\(outgoing,controller.signal\)/);
 assert.match(source,/reviewBeforeSending\(outgoing\)/);
 assert.match(source,/localStorage\.setItem\(COPILOT_PREF/);
 assert.doesNotMatch(source,/localStorage\.setItem\([^\n]*(?:dialogue|transcript|utterance)/);
 assert.match(source,/Показать возможности/);
 assert.match(source,/Сведения о модели и расходах/);
});

test('C13: specialist handoff is a prepared local draft, never an automatic clinical model invocation',()=>{
 const copilot=file('app/components/physician-task-assistant.tsx');
 const specialist=file('app/consult/page.tsx');
 const handoff=file('lib/copilot-consult-handoff.ts');
 assert.match(copilot,/storeCopilotConsultDraft\(draft,Date\.now\(\),\{specialty:target\?\.specialty,caseId\}\)/);
 assert.match(copilot,/router\.push\('\/consult'\)/);
 assert.match(specialist,/consumeCopilotConsultDraft\(\)/);
 assert.match(specialist,/setDrafts\(current=>/);
 assert.match(handoff,/window\.sessionStorage\.removeItem\(KEY\)/);
 assert.match(handoff,/cleanChatText\(question\)/);
 assert.doesNotMatch(handoff,/fetch\(/);
});

test('C13: microphone is opt-in dictation and cannot send text or trigger a clinical action',()=>{
 const source=file('app/components/physician-task-assistant.tsx');
 assert.match(source,/voiceConsent/);
 assert.match(source,/if\(!voiceConsent\)/);
 assert.match(source,/instance\.start\(\)/);
 assert.match(source,/setText\(previous=>/);
 assert.match(source,/Распознавание может выполняться службой браузера/);
 assert.doesNotMatch(source,/MediaRecorder|\/api\/transcribe/);
});
