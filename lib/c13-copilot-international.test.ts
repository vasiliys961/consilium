import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACE_LANGUAGES} from './workspace-i18n.ts';
import {copilotHasTranslation,COPILOT_UI_KEYS,copilotText,copilotWorkflowMessage,copilotToolTitle} from './copilot-i18n.ts';
import {planPhysicianTask,isCopilotHelpQuery} from './physician-task-router.ts';
import {suggestClinicalDestination} from './copilot-clinical-routing.ts';

test('C13 multilingual: English is the canonical international baseline and Russian remains fully supported',()=>{
 const fallback=planPhysicianTask('A patient has unclear symptoms');
 const en=copilotWorkflowMessage('en',fallback);
 assert.match(en.english,/Suggested next step: Ask a specialist/);
 assert.equal(en.localized,null);
 const ru=copilotWorkflowMessage('ru',fallback);
 assert.match(ru.english,/Suggested next step/);
 assert.match(ru.localized??'',/Предлагаемый следующий шаг/);
 assert.match(copilotText('ru','Клинический разбор'),/Клинический разбор/);
});

test('C13 multilingual: localized clinical fallback is a second line, never mixed with Russian module names',()=>{
 const plan=planPhysicianTask('dolor en el pecho');
 assert.equal(plan.steps[0]?.tool,'specialist');
 const es=copilotWorkflowMessage('es',plan,{specialty:'Кардиология',urgent:true});
 assert.match(es.english,/Suggested next step: Cardiology/);
 assert.match(es.localized??'',/Siguiente paso sugerido: Cardiología/);
 assert.doesNotMatch((es.english+' '+es.localized),/Клинический разбор|Кардиология/);
 const fr=copilotWorkflowMessage('fr',plan,{specialty:'Кардиология'});
 assert.match(fr.localized??'',/Prochaine étape suggérée: Cardiologie/);
 assert.equal(copilotToolTitle('fr','clinical'),'Analyse clinique');
 assert.equal(copilotToolTitle('en','clinical'),'Clinical review');
});

test('C13 multilingual: every Copilot UI label has an explicit English and target-language rendering',()=>{
 assert.ok(COPILOT_UI_KEYS.length>30);
 for(const lang of WORKSPACE_LANGUAGES){
  if(lang.code==='ru')continue;
  for(const key of COPILOT_UI_KEYS){
   assert.ok(copilotHasTranslation(lang.code,key),lang.code+' missing '+key);
   const translation=copilotText(lang.code,key);
   assert.ok(translation.trim()&&translation!==key,lang.code+' leaked '+key);
  }
 }
});

test('C13 multilingual: capability questions are free and recognized beyond Russian',()=>{
 const questions=[
  'What can Doctor Opus do?',
  '¿Qué puede hacer Doctor Opus?',
  'Que peut faire Doctor Opus ?',
  'O que o Doctor Opus pode fazer?',
  'Apa yang bisa dilakukan Doctor Opus?',
  'Doctor Opus neler yapabilir?',
  'Doctor Opus 能做什么？'
 ];
 for(const q of questions){
  assert.equal(isCopilotHelpQuery(q),true,q);
  assert.equal(planPhysicianTask(q).intent,'help',q);
 }
});

test('C13 multilingual: unfamiliar clinical words use General Internal Medicine instead of a diagnosis',()=>{
 const phrases=['Paciente con dolor sin localización','Patient with an unclear clinical concern','Un patient malade'];
 for(const q of phrases){
  const choice=suggestClinicalDestination(q);
  assert.equal(choice?.specialty,'universal',q);
  assert.deepEqual(planPhysicianTask(q).steps.slice(0,2).map(x=>x.tool),['specialist','clinical'],q);
 }
 assert.deepEqual(planPhysicianTask('bana yardım et').steps.map(x=>x.tool),['clinical']);
});

test('C13 multilingual: doctor sees bilingual routing and can choose a different specialist without model action',()=>{
 const ui=readFileSync('app/components/physician-task-assistant.tsx','utf8');
 assert.match(ui,/copilotWorkflowMessage\(language,displayedPlan/);
 assert.match(ui,/<p lang="en">\{workflow\.english\}<\/p>/);
 assert.match(ui,/<p lang=\{language\} dir="auto"/);
 assert.match(ui,/copilotToolTitle\(language,step\.tool\)/);
 assert.match(ui,/Выбрать специальность самостоятельно/);
 assert.match(ui,/manualSpecialist\?null:suggestClinicalDestination\(draft\)/);
 assert.doesNotMatch(ui,/startRecording\(|runConsilium\(/);
});
