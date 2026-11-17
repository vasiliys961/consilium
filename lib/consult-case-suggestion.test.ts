import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestClinicalCase} from './consult-case-suggestion.ts';
import {suggestClinicalDestination} from './copilot-clinical-routing.ts';
import {SPECIALIST_PROFILES} from './specialist-profiles.ts';

test('A lengthy physician question offers an OPTIONAL case instead of forcing conversion',()=>{
 assert.equal(suggestClinicalCase('а'.repeat(899),0,false),false);
 assert.equal(suggestClinicalCase('а'.repeat(900),0,false),true);
 assert.equal(suggestClinicalCase('Краткий вопрос',3,false),false);
 assert.equal(suggestClinicalCase('Краткий вопрос',4,false),true);
 assert.equal(suggestClinicalCase('а'.repeat(299),0,true),false);
 assert.equal(suggestClinicalCase('а'.repeat(300),0,true),true);
});
test('A general medical question uses universal internal medicine if specialty unclear',()=>{
 assert.equal(suggestClinicalDestination('у пациента слабость и недомогание')?.specialty,'universal');
 assert.equal(suggestClinicalDestination('непонятны жалобы у пациента')?.specialty,'universal');
 assert.ok(SPECIALIST_PROFILES.some(profile=>profile.id==='universal'));
});
test('Specialist explicitly offers continue dialogue or form a case with a selected button',()=>{
 const page=readFileSync('app/consult/page.tsx','utf8');
 assert.match(page,/suggestClinicalCase\(question,dialogue\.turns\.length,Boolean\(attachmentPreview\)\|\|Boolean\(preparedDocuments\[specialty\]\)\)/);
 assert.match(page,/setPreparedDocuments\(current=>\(\{\.\.\.current,\[specialty\]:true\}\)\)/);
 assert.match(page,/Продолжить диалог/);
 assert.match(page,/Сформировать клинический случай/);
 assert.match(page,/setCasePromptDismissed\(current=>/);
 assert.match(page,/onClick=\{continueInClinicalCase\}/);
 assert.match(page,/Последние реплики — не вся консультация/);
 assert.match(page,/storeSpecialistCaseDraft\(doc,sourceCaseId\)/);
});
test('Manual specialist choice is available even when Copilot suggests a narrow specialty',()=>{
 const page=readFileSync('app/components/physician-task-assistant.tsx','utf8');
 assert.match(page,/Выбрать специальность самостоятельно/);
 assert.match(page,/openTool\('specialist',request,true\)/);
 assert.match(page,/manualSpecialist\?null:suggestClinicalDestination\(draft\)/);
 const specialist=readFileSync('app/consult/page.tsx','utf8');
 assert.match(specialist,/SPECIALIST_PROFILES\.map\(item => <option/);
});
