import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPhysicianTask,physicianTaskHref} from './physician-task-router.ts';

const source=(path:string)=>readFileSync(path,'utf8');

test('W3: existing Ambient is routed to original protocol, not a second recorder',()=>{
 for(const [locale,expectedEdition] of [['ru','ru'],['en','en'],['fr','en']] as const){
  const href=physicianTaskHref('ambient','synthetic-case-42',locale);
  const url=new URL(href,'http://127.0.0.1:3207');
  assert.equal(url.pathname,'/protocol/case');
  assert.equal(url.searchParams.get('case'),'synthetic-case-42');
  assert.equal(url.searchParams.get('ambient'),'1');
  assert.equal(url.searchParams.get('locale'),locale);
  const bridge=source('app/protocol/case/page.tsx');
  assert.match(bridge,/params\.get\('ambient'\)==='1'/);
  assert.match(bridge,/requested==='ru'\?'ru':'en'/);
  assert.match(bridge,/conciliumAmbient=\$\{ambientRequested\?'1':'0'\}/);
  assert.match(bridge,/persistNativeProtocol\(selected,document,edition,documentLanguage\)/);
  assert.ok(expectedEdition==='ru'||expectedEdition==='en');
 }
 const normal=new URL(physicianTaskHref('protocol','synthetic-case-42','ru'),'http://127.0.0.1:3207');
 assert.equal(normal.searchParams.has('ambient'),false,
  'ordinary native protocol must not be forced into record-encounter mode');
});

test('W3: Copilot explains existing Ambient and does not trigger STT or other paid tools',()=>{
 const task=planPhysicianTask('Записать приём и подготовить черновик протокола');
 assert.ok(task.steps.some(step=>step.tool==='ambient'));
 assert.equal(task.steps.some(step=>step.tool==='protocol'),false);
 const assistant=source('app/components/physician-task-assistant.tsx');
 assert.match(assistant,/physicianTaskHref\(tool,caseId,language\)/);
 assert.doesNotMatch(assistant,/MediaRecorder|navigator\.mediaDevices\.getUserMedia/);
});

test('W3: case-button opens the same Ambient after preserving the selected case',()=>{
 const caseUI=source('app/components/clinical-workspace.tsx');
 assert.match(caseUI,/async function openExistingAmbientFromCase\(\)/);
 assert.match(caseUI,/current\.status!=='active'/);
 assert.match(caseUI,/if\(unsaved && !\(await save\(\)\)\)return/);
 assert.match(caseUI,/await flushDraft\(\)/);
 assert.match(caseUI,/router\.push\(physicianTaskHref\('ambient',current\.id,language\)\)/);
 assert.match(caseUI,/onClick=\{\(\)=>void openExistingAmbientFromCase\(\)\}/);
 assert.doesNotMatch(caseUI,/new MediaRecorder|navigator\.mediaDevices\.getUserMedia/);
});

test('W3: original RU/Global control consent, audio and explicit draft creation',()=>{
 for(const edition of ['ru','en']){
  const page=source('integrations/protocol/'+edition+'/app/protocol/page.tsx');
  const record=source('integrations/protocol/'+edition+'/components/AudioUpload.tsx');
  assert.match(page,/buildDraftFromConversation\(conversationTranscriptText\)/);
  assert.match(page,/draftSourceTranscript!==conversationTranscriptText.trim\(\)/);
  assert.doesNotMatch(page,/autoInsertConversationToProtocol/);
  assert.match(record,/MediaRecorder/);
  assert.match(record,/stopRecording/);
 }
});
