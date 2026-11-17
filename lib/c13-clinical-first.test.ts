import test from 'node:test';
import assert from 'node:assert/strict';
import {respiratoryPresentation,clinicalFirstResponse,converseWithPhysician} from './physician-agent.ts';
import {planPhysicianTask} from './physician-task-router.ts';
import {MODELS} from './cost.ts';

test('C13: exact physician report "у парня кашель с одышкой" triggers clinical guidance, not protocol',()=>{
 const phrase='у парня кашель с одышкой';
 assert.equal(respiratoryPresentation(phrase),true);
 assert.equal(respiratoryPresentation('[PHYSICIAN]\\n'+phrase),true);
 const free=planPhysicianTask(phrase);
 assert.deepEqual(free.steps.map(x=>x.tool),['specialist','clinical']);
 assert.match(free.message,/SpO₂/);
 assert.match(free.message,/ЧДД/);
 assert.doesNotMatch(free.message,/создать протокол|наши возможности/i);
});

test('C13: a generic marketing/protocol model answer is superseded by clinical triage',()=>{
 const data=clinicalFirstResponse(
 '[PHYSICIAN]\\nУ молодого человека кашель с одышкой','ru',
 {reply:'Наши возможности: можно создать протокол и выбрать модули.',question:null,tools:['protocol','ambient','radiology']}
 );
 assert.deepEqual(data.tools,['clinical','radiology']);
 assert.match(data.reply,/Клинический разбор/);
 assert.match(data.reply,/срочная очная (?:оценка|помощь)/);
 assert.match(data.question??'',/SpO₂/);
 assert.doesNotMatch(data.reply,/наши возможности/i);
});

test('C13: explicit documentation request still permits protocol and does not fabricate clinical data',()=>{
 const request='У парня кашель с одышкой, подготовь протокол приема';
 assert.equal(respiratoryPresentation(request),false);
 const plan=clinicalFirstResponse(request,'ru',{reply:'Внесите проверенные данные в протокол.',question:null,tools:['protocol']});
 assert.deepEqual(plan.tools,['protocol']);
 assert.equal(plan.reply,'Внесите проверенные данные в протокол.');
});

test('C13: English symptom-only encounter prioritizes immediate clinical assessment',()=>{
 const request='Young patient has cough and shortness of breath';
 assert.equal(respiratoryPresentation(request),true);
 const result=clinicalFirstResponse(request,'en',{reply:'We can create a note using our tools.',question:null,tools:['protocol','clinical']});
 assert.deepEqual(result.tools,['clinical']);
 assert.match(result.reply,/Clinical Review/);
 assert.match(result.reply,/urgent/);
 assert.match(result.question??'',/respiratory rate/);
});

test('C13: Global languages are not overwritten with Russian text',()=>{
 const text='Paciente con cough and dyspnea';
 const original='Antes de elegir herramientas, compruebe la saturación y el estado clínico.';
 const result=clinicalFirstResponse(text,'es',{reply:original,question:'¿Cuál es la SpO2?',tools:['protocol','clinical']});
 assert.equal(result.reply,original);
 assert.equal(result.question,'¿Cuál es la SpO2?');
 assert.deepEqual(result.tools,['clinical']);
});

test('C13: simulated cheap LLM that advertises capabilities is clinically corrected with no extra API',async()=>{
 let requests=0;
 const mockFetch:typeof fetch=async(_url,init)=>{
  requests++;
  const body=JSON.parse(String(init?.body));
  assert.equal(body.model,MODELS.flash);
  assert.match(body.messages[0].content,/clinical question/);
  assert.match(body.messages[0].content,/Only propose protocol/);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
   reply:'Возможности приложения: создание протокола, работа с модулями.',
   question:null,tools:['protocol','ambient']
  })}}],usage:{prompt_tokens:240,completion_tokens:86}});
 };
 const response=await converseWithPhysician({
  text:'[PHYSICIAN]\\nУ парня кашель с одышкой',locale:'ru',
 },{...process.env,OPENROUTER_API_KEY:'synthetic-key'},mockFetch);
 assert.equal(requests,1);
 assert.equal(response.usedModel,true);
 assert.deepEqual(response.plan.steps.map(x=>x.tool),['clinical']);
 assert.match(response.message,/Клинический разбор/);
 assert.match(response.question??'',/SpO₂/);
});
